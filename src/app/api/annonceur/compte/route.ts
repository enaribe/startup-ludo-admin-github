/**
 * Comptes annonceurs — les trois gestes d'argent, tous CONCREE (lot 6).
 *
 *  - `cloture`       : fige la consommation d'un mois en factures FAC et
 *                      débite les soldes. IDEMPOTENTE par refus : un mois déjà
 *                      clôturé pour un compte n'est jamais recalculé — une
 *                      facture émise doit rester reproductible, pas mouvante.
 *  - `topup`         : enregistre une alimentation (Orange Money, Wave,
 *                      virement) constatée HORS plateforme — v1 déclarative,
 *                      choix du plan (§ lot 6) : pas d'intégration PSP.
 *  - `facture-payee` : marque une facture réglée.
 *
 * Périmètre v1 assumé : la clôture porte sur les CAMPAGNES (nouveau modèle,
 * vues × CPV + clics × CPC, grille figée par campagne). Le sponsoring
 * d'édition historique reste sur le circuit devis manuel — le documenter vaut
 * mieux que facturer deux fois la même vue pendant la transition.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifierAppelant } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/firebase';
import type { Campaign } from '@/types';

/** Ligne d'une facture — ce que le PDF et l'écran affichent. */
export interface LigneFacture {
  campaignId: string;
  titre: string;
  vues: number;
  clics: number;
  perView: number;
  perClick: number;
  montantFcfa: number;
}

export async function POST(request: NextRequest) {
  const appelant = await verifierAppelant(request);
  if (!appelant?.isSuper) {
    return NextResponse.json({ error: 'Réservé à l’équipe CONCREE.' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const action = String(body.action ?? '');
  const db = getAdminFirestore();

  // ═══ Alimentation du compte ═══
  if (action === 'topup') {
    const ownerUid = String(body.ownerUid ?? '').trim();
    const montant = Math.round(Number(body.montant ?? 0));
    const canal = String(body.canal ?? '').trim() || 'virement';
    const reference = String(body.reference ?? '').trim();
    if (!ownerUid || montant <= 0) {
      return NextResponse.json({ error: 'Compte et montant positif requis.' }, { status: 400 });
    }
    const maintenant = Date.now();
    const ref = db.collection(COLLECTIONS.advertisers).doc(ownerUid);
    await ref.set(
      { balanceFcfa: FieldValue.increment(montant), updatedAt: maintenant },
      { merge: true }
    );
    await ref.collection('topUps').add({ montantFcfa: montant, canal, reference, createdAt: maintenant });
    return NextResponse.json({ ok: true });
  }

  // ═══ Facture réglée ═══
  if (action === 'facture-payee') {
    const invoiceId = String(body.invoiceId ?? '').trim();
    if (!invoiceId) return NextResponse.json({ error: 'Facture requise.' }, { status: 400 });
    await db.collection(COLLECTIONS.invoices).doc(invoiceId).update({
      status: 'paid',
      paidAt: Date.now(),
    });
    return NextResponse.json({ ok: true });
  }

  // ═══ Clôture mensuelle ═══
  if (action === 'cloture') {
    // Par défaut : le mois PRÉCÉDENT (on ne clôture jamais un mois en cours).
    const parDefaut = new Date();
    parDefaut.setDate(1);
    parDefaut.setMonth(parDefaut.getMonth() - 1);
    const mois =
      String(body.mois ?? '').match(/^\d{4}-\d{2}$/)?.[0] ??
      `${parDefaut.getFullYear()}-${String(parDefaut.getMonth() + 1).padStart(2, '0')}`;

    // Campagnes ayant pu diffuser (tout sauf brouillon/refusée/en modération).
    const snap = await db
      .collection(COLLECTIONS.campaigns)
      .where('status', 'in', ['active', 'paused', 'ended'])
      .get();

    const parCompte = new Map<string, LigneFacture[]>();
    for (const docSnap of snap.docs) {
      const c = { ...(docSnap.data() as Campaign), id: docSnap.id };
      // Consommation du mois : somme des buckets quotidiens de la campagne.
      const daily = await db
        .collection(COLLECTIONS.sponsorMetrics)
        .doc(c.id)
        .collection('daily')
        .where('date', '>=', `${mois}-01`)
        .where('date', '<=', `${mois}-31`)
        .get();
      let vues = 0;
      let clics = 0;
      for (const jour of daily.docs) {
        const totals = (jour.data().totals ?? {}) as Record<string, unknown>;
        vues += typeof totals.views === 'number' ? totals.views : 0;
        clics += typeof totals.clicks === 'number' ? totals.clicks : 0;
      }
      if (vues === 0 && clics === 0) continue;

      const perView = c.pricing?.perView ?? 15;
      const perClick = c.pricing?.perClick ?? 100;
      const ligne: LigneFacture = {
        campaignId: c.id,
        titre: c.card?.rectoText?.slice(0, 80) || `Édition ${c.editionSkin?.editionId ?? ''}`,
        vues,
        clics,
        perView,
        perClick,
        montantFcfa: vues * perView + clics * perClick,
      };
      const existantes = parCompte.get(c.ownerUid) ?? [];
      existantes.push(ligne);
      parCompte.set(c.ownerUid, existantes);
    }

    const maintenant = Date.now();
    const emises: string[] = [];
    const dejaClotures: string[] = [];
    for (const [ownerUid, lignes] of parCompte) {
      const invoiceId = `${ownerUid}_${mois}`;
      const ref = db.collection(COLLECTIONS.invoices).doc(invoiceId);
      if ((await ref.get()).exists) {
        dejaClotures.push(invoiceId);
        continue; // Une facture émise ne se recalcule JAMAIS.
      }
      const total = lignes.reduce((somme, l) => somme + l.montantFcfa, 0);
      await ref.set({
        ownerUid,
        reference: `FAC-${mois}`,
        period: mois,
        lines: lignes,
        totalFcfa: total,
        status: 'due',
        createdAt: maintenant,
      });
      // Le montant n'est prélevé sur le solde qu'à la clôture (spec §6).
      await db
        .collection(COLLECTIONS.advertisers)
        .doc(ownerUid)
        .set({ balanceFcfa: FieldValue.increment(-total), updatedAt: maintenant }, { merge: true });
      emises.push(invoiceId);
    }

    return NextResponse.json({ ok: true, mois, emises, dejaClotures });
  }

  return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
}
