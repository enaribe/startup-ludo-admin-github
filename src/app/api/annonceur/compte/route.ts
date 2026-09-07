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
import type { Campaign, Invoice, InvoiceLine, TopUp } from '@/types';

/**
 * Ligne d'une facture — ce que le PDF et l'écran affichent.
 * Alias de `InvoiceLine` : la forme est définie une seule fois dans `@/types`,
 * pour que le PDF et l'écran ne puissent plus en avoir une version divergente.
 */
export type LigneFacture = InvoiceLine;

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
    const alimentation: TopUp = { montantFcfa: montant, canal, reference, createdAt: maintenant };
    await ref.collection('topUps').add(alimentation);
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

    // Bornes du mois, EXPLICITES. La version précédente comparait à
    // `${mois}-31` : sur les chaînes `AAAA-MM-JJ` la comparaison est
    // lexicographique, donc « 2026-02-31 » fonctionnait par accident. Une borne
    // haute EXCLUSIVE sur le 1er du mois suivant n'a, elle, aucun cas
    // particulier — ni février, ni les mois de 30 jours, ni les bissextiles.
    const [annee, moisNum] = mois.split('-').map(Number);
    const premierJour = `${mois}-01`;
    const moisSuivant = moisNum === 12 ? `${annee + 1}-01-01` : `${annee}-${String(moisNum + 1).padStart(2, '0')}-01`;

    // Campagnes ayant pu diffuser (tout sauf brouillon/refusée/en modération).
    // `suspended` en fait partie : une campagne arrêtée en cours de mois pour
    // plafond ou solde a bel et bien consommé jusque-là, et cette consommation
    // se facture — l'omettre reviendrait à offrir la diffusion précédant l'arrêt.
    const snap = await db
      .collection(COLLECTIONS.campaigns)
      .where('status', 'in', ['active', 'paused', 'ended', 'suspended'])
      .get();

    /** Consommation d'une campagne sur le mois, lue depuis les buckets quotidiens. */
    async function ligneDuMois(docSnap: FirebaseFirestore.QueryDocumentSnapshot): Promise<{ ownerUid: string; ligne: LigneFacture } | null> {
      const c = { ...(docSnap.data() as Campaign), id: docSnap.id };
      const daily = await db
        .collection(COLLECTIONS.sponsorMetrics)
        .doc(c.id)
        .collection('daily')
        .where('date', '>=', premierJour)
        .where('date', '<', moisSuivant)
        .get();
      let vues = 0;
      let clics = 0;
      for (const jour of daily.docs) {
        const totals = (jour.data().totals ?? {}) as Record<string, unknown>;
        vues += typeof totals.views === 'number' ? totals.views : 0;
        clics += typeof totals.clicks === 'number' ? totals.clicks : 0;
      }
      if (vues === 0 && clics === 0) return null;

      const perView = c.pricing?.perView ?? 15;
      const perClick = c.pricing?.perClick ?? 100;
      return {
        ownerUid: c.ownerUid,
        ligne: {
          campaignId: c.id,
          titre: c.card?.rectoText?.slice(0, 80) || `Édition ${c.editionSkin?.editionId ?? ''}`,
          vues,
          clics,
          perView,
          perClick,
          montantFcfa: vues * perView + clics * perClick,
        },
      };
    }

    // Lecture PAR LOTS, pas en série. La boucle `await` d'origine faisait une
    // requête Firestore par campagne, attendue une par une : à 200 campagnes,
    // 200 allers-retours séquentiels dans une seule requête HTTP, donc un
    // timeout serverless garanti. Le lot borne aussi la concurrence — tout
    // lancer d'un coup saturerait le pool de connexions.
    const TAILLE_LOT = 25;
    const parCompte = new Map<string, LigneFacture[]>();
    for (let debut = 0; debut < snap.docs.length; debut += TAILLE_LOT) {
      const lot = snap.docs.slice(debut, debut + TAILLE_LOT);
      const resultats = await Promise.all(lot.map(ligneDuMois));
      for (const resultat of resultats) {
        if (!resultat) continue;
        const existantes = parCompte.get(resultat.ownerUid) ?? [];
        existantes.push(resultat.ligne);
        parCompte.set(resultat.ownerUid, existantes);
      }
    }

    const maintenant = Date.now();
    const emises: string[] = [];
    const dejaClotures: string[] = [];
    for (const [ownerUid, lignes] of parCompte) {
      const invoiceId = `${ownerUid}_${mois}`;
      const refFacture = db.collection(COLLECTIONS.invoices).doc(invoiceId);
      const refCompte = db.collection(COLLECTIONS.advertisers).doc(ownerUid);
      const total = lignes.reduce((somme, l) => somme + l.montantFcfa, 0);

      // TRANSACTION : l'émission de la facture et le débit du solde forment un
      // seul geste. Auparavant c'étaient deux écritures indépendantes — un
      // plantage entre les deux laissait une facture émise et un solde non
      // débité, et comme la clôture refuse de recalculer un mois déjà facturé,
      // l'écart était DÉFINITIF.
      //
      // Le contrôle d'idempotence est fait DANS la transaction : le lire avant
      // laissait deux clôtures concurrentes émettre la même facture deux fois.
      const dejaFait = await db.runTransaction(async (tx) => {
        if ((await tx.get(refFacture)).exists) return true;
        const facture: Omit<Invoice, 'id'> = {
          ownerUid,
          reference: `FAC-${mois}`,
          period: mois,
          lines: lignes,
          totalFcfa: total,
          status: 'due',
          createdAt: maintenant,
        };
        tx.set(refFacture, facture);
        // Le montant n'est prélevé sur le solde qu'à la clôture (spec §6).
        tx.set(refCompte, { balanceFcfa: FieldValue.increment(-total), updatedAt: maintenant }, { merge: true });
        return false;
      });

      if (dejaFait) dejaClotures.push(invoiceId); // Une facture émise ne se recalcule JAMAIS.
      else emises.push(invoiceId);
    }

    return NextResponse.json({ ok: true, mois, emises, dejaClotures });
  }

  return NextResponse.json({ error: 'Action inconnue.' }, { status: 400 });
}
