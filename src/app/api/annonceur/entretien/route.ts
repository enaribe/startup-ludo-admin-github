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
import type { Advertiser, Campaign, PaymentIntent } from '@/types';
import { confirmerFacture, paydunyaConfigure } from '@/lib/paydunya';
import { crediterIntention } from '@/lib/paiement-credit';
import { finExclusivite, joursRestants, libererReservations } from '@/lib/reservations';
import { envoyerEmail, gabaritEmail } from '@/lib/email-service';
import { autonomieEnJours, SEUIL_ALERTE_SOLDE_JOURS } from '@/lib/sponsor-pricing';

/** Nombre de signalements distincts qui déclenchent une revérification. */
const SEUIL_SIGNALEMENTS = 3;

/** Préavis de fin d'exclusivité, en jours — le temps de décider d'un renouvellement. */
const PREAVIS_FIN_JOURS = 15;

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
    paiementsRattrapes: [] as string[],
    preavisFin: [] as string[],
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
    // Deux échéances distinctes selon le format :
    //   - CARTE   : `period.endAt`, la date choisie par l'annonceur ;
    //   - ÉDITION : la fin du DERNIER mois réservé — `period` n'est jamais
    //     renseigné pour ce format, si bien que le seul test de `period.endAt`
    //     laissait une campagne édition diffuser INDÉFINIMENT, bien au-delà des
    //     mois payés, tout en gardant le créneau bloqué pour le suivant.
    const finExclu = finExclusivite(campagne.reservationMonths);
    const echeance = campagne.period?.endAt ?? finExclu;
    if (echeance && echeance < maintenant) {
      await ref.update({ status: 'ended', updatedAt: maintenant });
      // L'habillage d'édition ne passe pas par le feed : il faut l'éteindre
      // explicitement, sinon le mobile continuerait de l'afficher.
      if (campagne.format === 'edition' && campagne.editionSkin?.editionId) {
        await db
          .collection(COLLECTIONS.editions)
          .doc(campagne.editionSkin.editionId)
          .set({ sponsor: { enabled: false, paused: true } }, { merge: true });
      }
      // Les mois sont rendus au calendrier : l'exclusivité est consommée.
      if (campagne.reservationMonths?.length && campagne.editionSkin?.editionId) {
        await db.runTransaction((tx) =>
          libererReservations(db, tx, {
            campaignId: campagne.id,
            editionId: campagne.editionSkin?.editionId,
            months: campagne.reservationMonths,
          })
        );
      }
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

    // ── 4 bis. Exclusivité bientôt terminée ──
    // Prévenir AVANT l'arrêt : découvrir que sa campagne s'est arrêtée est la
    // pire façon d'apprendre qu'elle arrivait à son terme, et c'est aussi le
    // moment où le renouvellement se décide — un créneau libéré part vite.
    const finProche = campagne.period?.endAt ?? finExclusivite(campagne.reservationMonths);
    const joursAvantFin = joursRestants(finProche, maintenant);
    if (
      joursAvantFin !== null &&
      joursAvantFin > 0 &&
      joursAvantFin <= PREAVIS_FIN_JOURS &&
      !campagne.preavisFinEnvoyeLe
    ) {
      const destinataire = campagne.ownerEmail;
      if (destinataire) {
        void envoyerEmail({
          to: destinataire,
          subject: `Startup Ludo — votre campagne se termine dans ${joursAvantFin} jour${joursAvantFin > 1 ? 's' : ''}`,
          html: gabaritEmail(
            'Fin de diffusion proche',
            `Votre campagne s'arrêtera le <strong>${new Date(finProche as number).toLocaleDateString('fr-FR')}</strong>, ` +
              `au terme de la période réservée. Passé cette date, le créneau redevient disponible pour d'autres annonceurs. ` +
              `Pour prolonger, réservez de nouveaux mois depuis votre espace.`
          ),
        });
      }
      // Marqueur d'envoi : l'entretien peut être relancé plusieurs fois par
      // jour, l'annonceur ne doit pas recevoir un e-mail par clic.
      await ref.update({ preavisFinEnvoyeLe: maintenant });
      bilan.preavisFin.push(campagne.id);
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
  /** Une suspension pour solde épuisé impose de republier le feed à son tour. */
  let changementSolde = false;

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

    // ── Solde épuisé : suspension de TOUTES les campagnes du compte ──
    // Le solde est global au compte alors que la diffusion est par campagne :
    // rien ne permet de désigner « la » campagne fautive, donc on les arrête
    // toutes. En laisser diffuser une creuserait une dette sur un compte
    // prépayé, ce que ce modèle existe précisément pour empêcher.
    //
    // LE SOLDE DISPONIBLE, PAS LE SOLDE BRUT : la consommation du mois n'est
    // prélevée qu'à la clôture (spec §6). Comparer `balanceFcfa` seul laissait
    // diffuser un compte à 100 F ayant déjà consommé 5 000 F — la clôture le
    // passait alors à −4 900 F, soit exactement la dette que le prépayé existe
    // pour empêcher. On retranche donc ce qui est engagé mais pas encore
    // facturé.
    const soldeDisponible = (compte.balanceFcfa ?? 0) - consomme;
    const soldeEpuise = soldeDisponible <= 0;
    if (soldeEpuise) {
      for (const docSnap of snap.docs) {
        const c = { ...(docSnap.data() as Campaign), id: docSnap.id };
        // `status` est relu depuis le snapshot initial : une campagne déjà
        // arrêtée plus haut dans cette passe n'est pas re-suspendue.
        if (c.ownerUid !== ownerUid || c.status !== 'active') continue;
        await docSnap.ref.update({
          status: 'suspended',
          suspension: { motif: 'solde-epuise', suspendedAt: maintenant },
          updatedAt: maintenant,
        });
        // Le format édition ne passe pas par le feed : son habillage doit être
        // éteint séparément, comme pour le plafond.
        if (c.format === 'edition' && c.editionSkin?.editionId) {
          await db
            .collection(COLLECTIONS.editions)
            .doc(c.editionSkin.editionId)
            .set({ sponsor: { paused: true } }, { merge: true });
        }
        bilan.suspendues.push(c.id);
        changementSolde = true;
      }
    }

    // La consommation cumulée sert de proxy de rythme sur la durée de vie des
    // campagnes ; faute de date de début fiable pour toutes, on retient la
    // fenêtre de 30 jours, la même que le tableau de bord.
    // Même base que la suspension : l'autonomie se calcule sur ce qui reste
    // VRAIMENT, sinon elle annonce des jours de diffusion déjà consommés.
    const jours = autonomieEnJours({
      soldeFcfa: soldeDisponible,
      consommationFcfa: consomme,
      fenetreJours: 30,
    });
    // Un compte suspendu est TOUJOURS averti, même si le rythme est inconnu
    // (`jours === null`) : la suspension est un fait, pas une projection.
    if (!soldeEpuise && (jours === null || jours > SEUIL_ALERTE_SOLDE_JOURS)) continue;

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

    // Deux messages distincts : annoncer « votre solde arrive à son terme » à
    // un compte DÉJÀ suspendu serait faux, et lui cacherait que sa diffusion
    // est arrêtée — l'information la plus utile qu'on ait à lui donner.
    void envoyerEmail({
      to: email,
      subject: soldeEpuise
        ? 'Startup Ludo — vos campagnes sont suspendues (solde épuisé)'
        : 'Startup Ludo — votre solde annonceur arrive à son terme',
      html: soldeEpuise
        ? gabaritEmail(
            'Diffusion suspendue',
            'Votre solde est épuisé : vos campagnes ont été suspendues et ne sont plus diffusées. ' +
              'Elles repartiront dès que votre compte sera réalimenté. ' +
              'Pour recharger, rendez-vous sur votre espace Facturation ou écrivez-nous à annonceurs@concree.com.'
          )
        : gabaritEmail(
            'Solde bientôt épuisé',
              `Au rythme de diffusion actuel, votre solde couvre encore environ <strong>${jours ?? 0} jour${(jours ?? 0) > 1 ? 's' : ''}</strong>. ` +
              `Passé ce délai, vos campagnes seront suspendues automatiquement jusqu'à la prochaine alimentation. ` +
              `Pour recharger votre compte, rendez-vous sur votre espace Facturation.`
          ),
    });
    await compteRef.set({ soldeAlerteLe: maintenant }, { merge: true });
    bilan.alertesSolde.push(ownerUid);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RÉCONCILIATION DES PAIEMENTS (lot B, § B6)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // Un IPN peut se perdre : coupure réseau, déploiement en cours, incident chez
  // le prestataire. Sans rattrapage, un annonceur qui a PAYÉ voit son solde
  // inchangé et le seul recours est un traitement manuel — l'exact contraire
  // de ce qu'on attend d'un paiement en ligne.
  //
  // On relit donc chez PayDunya les intentions restées `pending` depuis plus de
  // 30 minutes (en deçà, l'annonceur est probablement encore sur la page de
  // paiement) et on crédite celles qui se révèlent réglées.
  //
  // Le crédit passe par la MÊME transaction idempotente que le webhook : si
  // l'IPN finit par arriver après coup, il trouvera l'intention `settled` et
  // ne créditera pas une seconde fois.
  if (paydunyaConfigure()) {
    const limite = maintenant - 30 * 60 * 1000;
    const enAttente = await db
      .collection(COLLECTIONS.paymentIntents)
      .where('status', '==', 'pending')
      .where('createdAt', '<', limite)
      .limit(50)
      .get();

    for (const docSnap of enAttente.docs) {
      const intent = { ...(docSnap.data() as PaymentIntent), id: docSnap.id };
      if (!intent.providerToken) continue; // création interrompue avant PayDunya
      try {
        const confirme = await confirmerFacture(intent.providerToken);
        if (confirme.statut === 'completed' && confirme.montantFcfa > 0) {
          const credite = await crediterIntention(db, docSnap.ref, intent, confirme.montantFcfa);
          if (credite) bilan.paiementsRattrapes.push(intent.id);
        } else if (confirme.statut === 'cancelled' || confirme.statut === 'failed') {
          await docSnap.ref.update({ status: 'failed', echec: `PayDunya : ${confirme.statut}` });
        }
        // `pending` chez PayDunya : on laisse tel quel, l'annonceur paie peut-être encore.
      } catch (error) {
        // Une intention non confirmable reste `pending` : elle sera retentée au
        // passage suivant plutôt que fermée à tort.
        console.error(`[entretien] Réconciliation de ${intent.id} impossible :`, error);
      }
    }
  }

  // Les suspensions pour solde ont lieu après la première publication : il
  // faut republier, sinon les cartes resteraient dans le feed jusqu'au passage
  // suivant — un compte à zéro continuerait de diffuser.
  if (changementSolde) await publierFeed(db);

  return NextResponse.json({
    ok: true,
    ...bilan,
    feedRepublie: changement || changementSolde,
  });
}
