/**
 * Décision de modération sur une campagne — CONCREE uniquement.
 *
 * C'est L'UNIQUE chemin vers `active` (et ses suites `paused`/`ended`) : les
 * règles Firestore interdisent au sponsor de sortir de `draft`/`in_review`.
 * Chaque décision REPUBLIE le feed mobile en entier (reconstruction
 * idempotente) — le jeu est donc toujours aligné sur l'état décidé, jamais sur
 * un état intermédiaire.
 *
 * Le lot 5 (file de modération) apportera l'interface ; cette route est déjà
 * son contrat : valider ici, l'écran ne fera qu'appeler.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifierAppelant } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/firebase';
import { publierFeed } from '@/lib/sponsor-feed';
import type { Campaign, CampaignStatus } from '@/types';

type Decision = 'activate' | 'reject' | 'pause' | 'resume' | 'end';

/** Transitions autorisées — tout le reste est une erreur d'état, pas de droit. */
const TRANSITIONS: Record<Decision, { depuis: CampaignStatus[]; vers: CampaignStatus }> = {
  activate: { depuis: ['in_review', 'paused'], vers: 'active' },
  reject: { depuis: ['in_review'], vers: 'rejected' },
  pause: { depuis: ['active'], vers: 'paused' },
  resume: { depuis: ['paused'], vers: 'active' },
  end: { depuis: ['active', 'paused'], vers: 'ended' },
};

export async function POST(request: NextRequest) {
  const appelant = await verifierAppelant(request);
  if (!appelant) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }
  if (!appelant.isSuper) {
    return NextResponse.json({ error: 'Réservé à l’équipe CONCREE.' }, { status: 403 });
  }

  let campaignId = '';
  let decision: Decision | '' = '';
  let motif = '';
  try {
    const body = (await request.json()) as {
      campaignId?: unknown;
      decision?: unknown;
      motif?: unknown;
    };
    campaignId = String(body.campaignId ?? '').trim();
    decision = String(body.decision ?? '') as Decision;
    motif = String(body.motif ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const transition = TRANSITIONS[decision as Decision];
  if (!campaignId || !transition) {
    return NextResponse.json({ error: 'Campagne et décision valides requises.' }, { status: 400 });
  }
  if (decision === 'reject' && !motif) {
    // Un refus sans motif est un mur : la spec impose « retour motivé ».
    return NextResponse.json({ error: 'Un refus doit porter son motif.' }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection(COLLECTIONS.campaigns).doc(campaignId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Campagne introuvable.' }, { status: 404 });
  }
  const campagne = snap.data() as Campaign;
  if (!transition.depuis.includes(campagne.status)) {
    return NextResponse.json(
      { error: `Impossible : la campagne est « ${campagne.status} ».` },
      { status: 409 }
    );
  }

  const maintenant = Date.now();
  await ref.update({
    status: transition.vers,
    review: {
      reviewedAt: maintenant,
      ...(decision === 'reject' ? { motifRefus: motif } : {}),
    },
    updatedAt: maintenant,
  });

  // ═══ CAMPAGNE ÉDITION : l'habillage suit la décision ═══
  // C'est le geste qui manquait au lot 4 : à l'activation, l'écran sponsor de
  // l'édition est installé depuis le skin de la campagne ; pause/reprise/fin
  // pilotent `paused`/`enabled`. On ne touche JAMAIS aux cartes historiques
  // (`opportunities`/`fundings`) de l'édition — merge ciblé champ par champ.
  if (campagne.format === 'edition' && campagne.editionSkin?.editionId) {
    const skin = campagne.editionSkin;
    const editionRef = db.collection(COLLECTIONS.editions).doc(skin.editionId);
    if (transition.vers === 'active') {
      await editionRef.set(
        {
          sponsor: {
            enabled: true,
            paused: false,
            name: skin.structure || '',
            imageUrl: skin.photoUrl || '',
            logoUrl: skin.logoUrl || '',
            linkUrl: skin.linkUrl || '',
            viewsGoal: campagne.viewsGoal ?? 0,
            pricePerView: campagne.pricing?.perView ?? 25,
            budgetCapFcfa: campagne.budgetCapFcfa ?? 0,
          },
        },
        { merge: true }
      );
    } else if (transition.vers === 'paused') {
      await editionRef.set({ sponsor: { paused: true } }, { merge: true });
    } else if (transition.vers === 'ended' || transition.vers === 'rejected') {
      await editionRef.set({ sponsor: { enabled: false, paused: true } }, { merge: true });
    }
  }

  // Feed toujours reconstruit — y compris sur reject/pause/end : une carte qui
  // sort du feed est exactement le but de ces décisions.
  const cartesPubliees = await publierFeed(db);

  return NextResponse.json({ ok: true, status: transition.vers, cartesPubliees });
}
