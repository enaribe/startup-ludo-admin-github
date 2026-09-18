/**
 * Modification de la PÉRIODE DE DIFFUSION d'une campagne — CONCREE seul.
 *
 * Une campagne activée est verrouillée : les règles Firestore n'autorisent
 * l'écriture que sur `draft` / `in_review`. C'est délibéré — le contenu diffusé
 * ne doit pas changer après validation. Mais les DATES, elles, doivent pouvoir
 * être corrigées : un annonceur qui s'est trompé de mois voyait sa campagne
 * active sans jamais rien diffuser, et la seule issue était de tout refaire.
 *
 * RÉSERVÉ À CONCREE, et pas seulement par prudence : la période détermine ce
 * qui est facturé, et pour une édition elle borne l'exclusivité du créneau.
 * La laisser à l'annonceur permettrait de prolonger une réservation sans
 * repasser par le calendrier — donc d'occuper des mois vendus à un autre.
 */
import { NextResponse, type NextRequest } from 'next/server';

import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifierAppelant } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/firebase';
import { publierFeed } from '@/lib/sponsor-feed';
import type { Campaign } from '@/types';

export async function POST(request: NextRequest) {
  const appelant = await verifierAppelant(request);
  if (!appelant) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }
  if (!appelant.isSuper) {
    return NextResponse.json({ error: 'Réservé à l’équipe CONCREE.' }, { status: 403 });
  }

  let campaignId = '';
  let debut: number | null = null;
  let fin: number | null = null;
  try {
    const body = (await request.json()) as { campaignId?: unknown; startAt?: unknown; endAt?: unknown };
    campaignId = String(body.campaignId ?? '').trim();
    debut = body.startAt == null || body.startAt === '' ? null : Number(body.startAt);
    fin = body.endAt == null || body.endAt === '' ? null : Number(body.endAt);
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  if (!campaignId) {
    return NextResponse.json({ error: 'Campagne requise.' }, { status: 400 });
  }
  if ((debut != null && !Number.isFinite(debut)) || (fin != null && !Number.isFinite(fin))) {
    return NextResponse.json({ error: 'Dates invalides.' }, { status: 400 });
  }
  // Une fin avant le début ne diffuserait jamais : c'est une erreur de saisie,
  // pas une intention.
  if (debut != null && fin != null && fin < debut) {
    return NextResponse.json(
      { error: 'La fin ne peut pas précéder le début.' },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const ref = db.collection(COLLECTIONS.campaigns).doc(campaignId);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Campagne introuvable.' }, { status: 404 });
  }
  const campagne = snap.data() as Campaign;

  await ref.update({ period: { startAt: debut, endAt: fin }, updatedAt: Date.now() });

  // Le feed porte les bornes lues par le jeu : sans republication, la nouvelle
  // période ne serait appliquée qu'à la prochaine publication, déclenchée par
  // une tout autre décision.
  const cartesPubliees = campagne.format === 'card' ? await publierFeed(db) : 0;

  return NextResponse.json({ ok: true, startAt: debut, endAt: fin, cartesPubliees });
}
