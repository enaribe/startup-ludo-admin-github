/**
 * Entretien des campagnes actives — le CONTRÔLE CONTINU de la spec (§7.2).
 *
 * Quatre vérifications, dans l'ordre du moindre coût :
 *   1. DATE LIMITE dépassée (verso) → campagne terminée. « Retrait automatique
 *      le lendemain de la date limite » : une carte qui promeut un appel clos
 *      abîme l'annonceur autant que le jeu.
 *   2. FIN DE PÉRIODE dépassée → campagne terminée.
 *   3. SIGNALEMENTS joueurs ≥ 3 → retour en modération (`in_review`) : trois
 *      joueurs différents valent une revérification humaine, pas une sanction
 *      automatique.
 *   4. LIEN MORT (HEAD sur le CTA, timeout 6 s) → pause + motif consigné. En
 *      PAUSE et non terminée : un site qui redémarre demain ne doit pas coûter
 *      sa campagne à l'annonceur — la reprise est une décision humaine.
 *   5. PLAFOND BUDGÉTAIRE atteint → `suspended`. `budgetCapFcfa` était saisi,
 *      affiché en modération et cumulé sur l'écran de facturation, mais lu par
 *      AUCUN garde-fou : le mobile n'arrête la diffusion que sur `paused` et
 *      `viewsGoal`. Un plafond de 50 000 F avec la grille premium (55 F/vue)
 *      et un objectif de 5 000 vues laissait passer 275 000 F de vues, plus
 *      les clics, que rien ne plafonnait. C'était un engagement affiché à
 *      l'annonceur et non tenu.
 *
 * PORTÉE DU PLAFOND (5) : la suspension passe par le STATUT, pas par le
 * mobile. `publierFeed()` ne projette que les campagnes `active` : sortir la
 * campagne de ce statut la retire du feed au prochain snapshot, sans aucune
 * modification de l'app ni déploiement store.
 *
 * LATENCE ASSUMÉE : l'entretien est déclenché à la main en v1 (bouton de
 * modération), par un cron plus tard. Le dépassement possible est donc d'un
 * cycle. Un plafond au FCFA près exigerait une lecture Firestore à chaque
 * tirage de carte en partie — le coût ne le justifie pas ; c'est aux CGU de
 * dire « plafond vérifié périodiquement » plutôt que de promettre l'exactitude.
 *
 * Déclenchée par le bouton « Lancer l'entretien » de l'écran de modération en
 * v1 (geste hebdomadaire) ; un cron l'appellera plus tard, la route est déjà
 * idempotente. Le feed est republié UNE fois si quelque chose a changé.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifierAppelant } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/firebase';
import { publierFeed } from '@/lib/sponsor-feed';
import type { Advertiser, Campaign } from '@/types';
import { envoyerEmail, gabaritEmail } from '@/lib/email-service';
import { autonomieEnJours, SEUIL_ALERTE_SOLDE_JOURS } from '@/lib/sponsor-pricing';

/** Nombre de signalements distincts qui déclenchent une revérification. */
const SEUIL_SIGNALEMENTS = 3;

/**
 * Consommation cumulée d'une campagne, en FCFA, depuis les buckets quotidiens.
 *
 * Même source que la clôture mensuelle — c'est la condition pour que le
 * plafond et la facture parlent du même argent. Les totaux cumulés ne sont pas
 * utilisés : ils ne savent pas dater, et la grille appliquée doit être celle
 * FIGÉE sur la campagne, pas le tarif public du jour.
 */
async function consommationCumulee(
  db: FirebaseFirestore.Firestore,
  campagne: Campaign
): Promise<number> {
  const daily = await db
    .collection(COLLECTIONS.sponsorMetrics)
    .doc(campagne.id)
    .collection('daily')
    .get();
  let vues = 0;
  let clics = 0;
  for (const jour of daily.docs) {
    const totals = (jour.data().totals ?? {}) as Record<string, unknown>;
    vues += typeof totals.views === 'number' ? totals.views : 0;
    clics += typeof totals.clicks === 'number' ? totals.clicks : 0;
  }
  const perView = campagne.pricing?.perView ?? 15;
  const perClick = campagne.pricing?.perClick ?? 100;
  return vues * perView + clics * perClick;
}

/** HEAD avec timeout — un lien lent n'est pas un lien mort. */
async function lienVivant(url: string): Promise<boolean> {
  try {
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), 6000);
    const reponse = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controleur.signal });
    clearTimeout(minuteur);
    // Certains serveurs refusent HEAD (405) : on retente en GET léger.
    if (reponse.status === 405) {
      const get = await fetch(url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(6000) });
      return get.ok;
    }
    return reponse.ok;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const appelant = await verifierAppelant(request);
  if (!appelant?.isSuper) {
    return NextResponse.json({ error: 'Réservé à l’équipe CONCREE.' }, { status: 403 });
  }

  const db = getAdminFirestore();
  const snap = await db.collection(COLLECTIONS.campaigns).where('status', '==', 'active').get();

  const maintenant = Date.now();
  const hier = new Date();
  hier.setDate(hier.getDate() - 1);
  const bilan = {
    verifiees: snap.size,
    terminees: [] as string[],
    enRevision: [] as string[],
    liensMorts: [] as string[],
    suspendues: [] as string[],
    alertesSolde: [] as string[],
  };
  let changement = false;
  /** Consommé calculé pendant la boucle, réutilisé par l'alerte de solde. */
  const spentParCampagne = new Map<string, number>();

  for (const docSnap of snap.docs) {
    const campagne = { ...(docSnap.data() as Campaign), id: docSnap.id };
    const ref = docSnap.ref;

    // ── 1. Date limite du verso (retrait le lendemain) ──
    const dateLimite = campagne.card?.verso?.dateLimite;
    if (dateLimite && new Date(`${dateLimite}T23:59:59`).getTime() < hier.getTime()) {
      await ref.update({
        status: 'ended',
        review: { reviewedAt: maintenant, motifRefus: 'Date limite du dispositif dépassée (retrait automatique).' },
        updatedAt: maintenant,
      });
      bilan.terminees.push(campagne.id);
      changement = true;
      continue;
    }

    // ── 2. Fin de période ──
    if (campagne.period?.endAt && campagne.period.endAt < maintenant) {
      await ref.update({ status: 'ended', updatedAt: maintenant });
      bilan.terminees.push(campagne.id);
      changement = true;
      continue;
    }

    // ── 3. Signalements joueurs ──
    const votes = await db
      .collection(COLLECTIONS.sponsorReports)
      .doc(campagne.id)
      .collection('votes')
      .count()
      .get();
    if (votes.data().count >= SEUIL_SIGNALEMENTS) {
      await ref.update({
        status: 'in_review',
        review: {
          reviewedAt: maintenant,
          motifRefus: `${votes.data().count} signalements joueurs — revérification requise.`,
        },
        updatedAt: maintenant,
      });
      bilan.enRevision.push(campagne.id);
      changement = true;
      continue;
    }

    // ── 4. Lien du CTA ──
    const url = campagne.card?.cta?.url || campagne.editionSkin?.linkUrl;
    if (url && !(await lienVivant(url))) {
      await ref.update({
        status: 'paused',
        review: { reviewedAt: maintenant, motifRefus: 'Lien de destination injoignable (pause automatique).' },
        updatedAt: maintenant,
      });
      bilan.liensMorts.push(campagne.id);
      changement = true;
      continue;
    }

    // ── 5. Plafond budgétaire ──
    // Le consommé est recalculé puis MÉMORISÉ sur la campagne (`spentFcfa`) :
    // l'écran de facturation et la modération peuvent l'afficher sans relire
    // l'historique complet des buckets.
    const consomme = await consommationCumulee(db, campagne);
    spentParCampagne.set(campagne.id, consomme);
    const plafond = campagne.budgetCapFcfa ?? 0;
    if (plafond > 0 && consomme >= plafond) {
      await ref.update({
        status: 'suspended',
        suspension: { motif: 'plafond-atteint', suspendedAt: maintenant },
        spentFcfa: consomme,
        spentUpdatedAt: maintenant,
        updatedAt: maintenant,
      });
      // Le format ÉDITION ne passe pas par le feed : son habillage vit dans
      // `editions/{id}.sponsor`, que le mobile lit directement. Changer le seul
      // statut de la campagne l'aurait laissé diffuser malgré la suspension —
      // le plafond n'aurait bloqué que les cartes. Même geste que la mise en
      // pause côté décision, merge ciblé pour ne pas toucher au reste.
      if (campagne.format === 'edition' && campagne.editionSkin?.editionId) {
        await db
          .collection(COLLECTIONS.editions)
          .doc(campagne.editionSkin.editionId)
          .set({ sponsor: { paused: true } }, { merge: true });
      }
      bilan.suspendues.push(campagne.id);
      changement = true;
      continue;
    }
    // Campagne saine : on ne consigne que le consommé, sans toucher au statut.
    if (consomme !== (campagne.spentFcfa ?? 0)) {
      await ref.update({ spentFcfa: consomme, spentUpdatedAt: maintenant });
    }
  }

  if (changement) await publierFeed(db);

  // ══════════════════════════════════════════════════════════════════════════
  // ALERTE DE SOLDE — prévue par la spec (§ lot 6, point 4), jamais écrite.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Sans elle, un compte prépayé découvre qu'il n'a plus de solde en voyant sa
  // diffusion s'arrêter. Sept jours d'autonomie laissent le temps d'un
  // virement.
  //
  // Ne concerne QUE les comptes `prepaid` : un compte en facturation différée
  // (institutionnels réglant par virement) a un solde négatif par construction
  // — l'alerter reviendrait à lui réclamer une avance qu'il ne doit pas.
  //
  // Le consommé vient d'être recalculé campagne par campagne : on le réutilise
  // plutôt que de relire les buckets une deuxième fois.
  //
  // PRÉCISION ASSUMÉE : une campagne arrêtée plus haut dans cette même passe
  // (date limite, signalements, lien mort) n'a pas été chiffrée, donc son
  // historique manque au rythme. L'autonomie calculée est alors un peu
  // GÉNÉREUSE — jamais alarmiste à tort. C'est le bon sens de l'erreur pour
  // une alerte : mieux vaut manquer un avertissement que d'en envoyer un faux,
  // qui apprendrait à l'annonceur à les ignorer. Et cette campagne ne diffuse
  // plus, donc elle ne consommera plus : le rythme se corrige au passage
  // suivant.
  const consommeParCompte = new Map<string, number>();
  const emailParCompte = new Map<string, string>();
  for (const docSnap of snap.docs) {
    const c = docSnap.data() as Campaign;
    consommeParCompte.set(c.ownerUid, (consommeParCompte.get(c.ownerUid) ?? 0) + (spentParCampagne.get(docSnap.id) ?? 0));
    if (c.ownerEmail && !emailParCompte.has(c.ownerUid)) emailParCompte.set(c.ownerUid, c.ownerEmail);
  }

  for (const [ownerUid, consomme] of consommeParCompte) {
    const compteRef = db.collection(COLLECTIONS.advertisers).doc(ownerUid);
    const compte = (await compteRef.get()).data() as Advertiser | undefined;
    if (!compte) continue;
    // Absent = `prepaid` : un compte sans mode déclaré ne doit pas hériter du
    // régime le plus permissif par accident.
    if ((compte.billingMode ?? 'prepaid') !== 'prepaid') continue;

    // La consommation cumulée sert de proxy de rythme sur la durée de vie des
    // campagnes ; faute de date de début fiable pour toutes, on retient la
    // fenêtre de 30 jours, la même que le tableau de bord.
    const jours = autonomieEnJours({
      soldeFcfa: compte.balanceFcfa,
      consommationFcfa: consomme,
      fenetreJours: 30,
    });
    if (jours === null || jours > SEUIL_ALERTE_SOLDE_JOURS) continue;

    // Anti-répétition : une alerte tous les 7 jours au plus. L'entretien peut
    // être relancé plusieurs fois par jour ; sans ce garde-fou, l'annonceur
    // recevrait un e-mail par clic et cesserait de les lire.
    const derniere = typeof compte.soldeAlerteLe === 'number' ? compte.soldeAlerteLe : 0;
    if (maintenant - derniere < 7 * 24 * 3600 * 1000) continue;

    // E-mail de facturation s'il est renseigné, sinon celui du compte qui a
    // créé la campagne : une alerte de solde ne doit pas se perdre parce que
    // le formulaire de facturation n'a pas été rempli.
    const email = compte.billingInfo?.email || emailParCompte.get(ownerUid);
    if (!email) continue;

    void envoyerEmail({
      to: email,
      subject: 'Startup Ludo — votre solde annonceur arrive à son terme',
      html: gabaritEmail(
        'Solde bientôt épuisé',
        `Au rythme de diffusion actuel, votre solde couvre encore environ <strong>${jours} jour${jours > 1 ? 's' : ''}</strong>. ` +
          `Passé ce délai, vos campagnes seront suspendues automatiquement jusqu'à la prochaine alimentation. ` +
          `Pour recharger votre compte, contactez-nous à annonceurs@concree.com.`
      ),
    });
    await compteRef.set({ soldeAlerteLe: maintenant }, { merge: true });
    bilan.alertesSolde.push(ownerUid);
  }

  return NextResponse.json({ ok: true, ...bilan, feedRepublie: changement });
}
