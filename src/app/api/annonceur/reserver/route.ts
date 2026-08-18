/**
 * Réservation d'exclusivité d'une édition + soumission de la campagne.
 *
 * POURQUOI une transaction serveur : « deux structures ne peuvent jamais
 * sponsoriser la même édition sur la même période » (spec §4.3) est une
 * PROMESSE COMMERCIALE. Deux annonceurs qui cliquent au même instant sur le
 * même mois doivent être départagés par quelque chose de plus fort qu'une
 * vérification côté client — la transaction Firestore garantit qu'un seul des
 * deux `create` passe, l'autre reçoit un conflit lisible.
 *
 * La soumission (`in_review`) est posée DANS la même transaction : une
 * campagne soumise sans ses mois, ou des mois posés sans campagne soumise,
 * seraient deux états incohérents qu'il faudrait réparer à la main.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifierAppelant } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/firebase';
import type { Campaign } from '@/types';

/** AAAA-MM strict. */
const MOIS_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function POST(request: NextRequest) {
  const appelant = await verifierAppelant(request);
  if (!appelant) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }
  if (!appelant.isSponsor && !appelant.isSuper) {
    return NextResponse.json({ error: 'Réservé aux comptes annonceurs.' }, { status: 403 });
  }

  let campaignId = '';
  let editionId = '';
  let months: string[] = [];
  try {
    const body = (await request.json()) as {
      campaignId?: unknown;
      editionId?: unknown;
      months?: unknown;
    };
    campaignId = String(body.campaignId ?? '').trim();
    editionId = String(body.editionId ?? '').trim();
    months = Array.isArray(body.months) ? body.months.map((m) => String(m).trim()) : [];
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  if (!campaignId || !editionId || months.length === 0) {
    return NextResponse.json(
      { error: 'Campagne, édition et mois à réserver sont requis.' },
      { status: 400 }
    );
  }
  if (months.length > 12 || months.some((m) => !MOIS_RE.test(m))) {
    return NextResponse.json({ error: 'Mois invalides (AAAA-MM, 12 max).' }, { status: 400 });
  }

  const db = getAdminFirestore();

  try {
    await db.runTransaction(async (tx) => {
      // ── La campagne : au demandeur, au format édition, pas encore décidée ──
      const campRef = db.collection(COLLECTIONS.campaigns).doc(campaignId);
      const campSnap = await tx.get(campRef);
      if (!campSnap.exists) throw new ErreurLisible('Campagne introuvable.');
      const campagne = campSnap.data() as Campaign;
      if (campagne.ownerUid !== appelant.uid && !appelant.isSuper) {
        throw new ErreurLisible('Cette campagne ne vous appartient pas.');
      }
      if (campagne.format !== 'edition') {
        throw new ErreurLisible('Seule une campagne édition se réserve au calendrier.');
      }
      if (campagne.status !== 'draft') {
        throw new ErreurLisible('Cette campagne a déjà été soumise.');
      }

      // ── L'édition existe ──
      const editionSnap = await tx.get(db.collection(COLLECTIONS.editions).doc(editionId));
      if (!editionSnap.exists) throw new ErreurLisible('Édition introuvable.');

      // ── Tous les mois demandés sont LIBRES (lectures dans la transaction) ──
      for (const mois of months) {
        const resRef = db
          .collection(COLLECTIONS.editionReservations)
          .doc(`${editionId}_${mois}`);
        const resSnap = await tx.get(resRef);
        if (resSnap.exists) {
          const par = (resSnap.data()?.structure as string) || 'une autre structure';
          throw new ErreurLisible(
            `Le mois ${mois} vient d'être réservé par ${par}. Choisissez un autre créneau.`
          );
        }
      }

      // ── Écritures : réservations + soumission, atomiques ──
      const maintenant = Date.now();
      const structure = campagne.editionSkin?.structure || campagne.ownerEmail || 'Annonceur';
      for (const mois of months) {
        tx.set(db.collection(COLLECTIONS.editionReservations).doc(`${editionId}_${mois}`), {
          editionId,
          month: mois,
          campaignId,
          ownerUid: campagne.ownerUid,
          structure,
          createdAt: maintenant,
        });
      }
      tx.update(campRef, {
        status: 'in_review',
        reservationMonths: months.slice().sort(),
        'editionSkin.editionId': editionId,
        submittedAt: maintenant,
        consentAt: maintenant,
        updatedAt: maintenant,
      });
    });
  } catch (error) {
    if (error instanceof ErreurLisible) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Réservation annonceur :', error);
    return NextResponse.json({ error: 'Réservation impossible — réessayez.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Erreur destinée à l'annonceur, affichable telle quelle. */
class ErreurLisible extends Error {}
