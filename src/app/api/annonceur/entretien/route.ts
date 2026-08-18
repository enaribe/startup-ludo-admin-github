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
import type { Campaign } from '@/types';

/** Nombre de signalements distincts qui déclenchent une revérification. */
const SEUIL_SIGNALEMENTS = 3;

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
  };
  let changement = false;

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
    }
  }

  if (changement) await publierFeed(db);

  return NextResponse.json({ ok: true, ...bilan, feedRepublie: changement });
}
