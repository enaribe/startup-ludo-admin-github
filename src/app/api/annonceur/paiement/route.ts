/**
 * Ouverture d'un paiement PayDunya (lot B).
 *
 * Deux usages, un seul circuit :
 *   - `topup`   : l'annonceur alimente son solde (modèle prépayé) ;
 *   - `invoice` : il règle une facture émise (comptes en facturation différée).
 *
 * La route ne touche JAMAIS au solde : elle enregistre une intention et rend
 * une URL de paiement. Le crédit n'a lieu qu'au retour du webhook, après
 * confirmation serveur à serveur — c'est la seule façon de ne pas créditer sur
 * la foi d'un client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifierAppelant } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/firebase';
import { creerFacture, paydunyaConfigure, RECHARGE_MIN_FCFA } from '@/lib/paydunya';
import type { Invoice, PaymentIntent } from '@/types';

export async function POST(request: NextRequest) {
  const appelant = await verifierAppelant(request);
  // Un compte en attente d'activation n'a aucun claim : `verifierAppelant`
  // rend `null` et la route s'arrête ici — il ne peut pas ouvrir de paiement.
  if (!appelant?.isSponsor) {
    return NextResponse.json({ error: 'Réservé aux comptes annonceurs.' }, { status: 403 });
  }
  if (!paydunyaConfigure()) {
    return NextResponse.json(
      { error: 'Le paiement en ligne n’est pas encore activé. Contactez annonceurs@concree.com.' },
      { status: 503 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const kind = body.kind === 'invoice' ? 'invoice' : 'topup';
  const db = getAdminFirestore();
  const maintenant = Date.now();

  let montant: number;
  let description: string;
  let invoiceId: string | undefined;

  if (kind === 'invoice') {
    invoiceId = String(body.invoiceId ?? '').trim();
    if (!invoiceId) {
      return NextResponse.json({ error: 'Facture requise.' }, { status: 400 });
    }
    const snap = await db.collection(COLLECTIONS.invoices).doc(invoiceId).get();
    const facture = snap.data() as Invoice | undefined;
    // La facture doit exister, appartenir à l'appelant et rester due : sans ces
    // trois contrôles, on pourrait régler la facture d'un autre compte, ou
    // repayer une facture déjà soldée.
    if (!snap.exists || !facture || facture.ownerUid !== appelant.uid) {
      return NextResponse.json({ error: 'Facture introuvable.' }, { status: 404 });
    }
    if (facture.status !== 'due') {
      return NextResponse.json({ error: 'Cette facture n’est plus à régler.' }, { status: 409 });
    }
    // Le montant vient de la FACTURE, jamais du corps de la requête : accepter
    // un montant client permettrait de solder une facture de 500 000 F en
    // payant 100 F.
    montant = facture.totalFcfa;
    description = `Facture ${facture.reference} — Startup Ludo`;
  } else {
    montant = Math.round(Number(body.montant ?? 0));
    if (!Number.isFinite(montant) || montant < RECHARGE_MIN_FCFA) {
      return NextResponse.json(
        { error: `Le montant minimum de recharge est de ${RECHARGE_MIN_FCFA.toLocaleString('fr-FR')} FCFA.` },
        { status: 400 }
      );
    }
    description = 'Alimentation du compte annonceur — Startup Ludo';
  }

  // L'intention est créée AVANT l'appel au prestataire : si PayDunya répond et
  // que nous plantons ensuite, la réconciliation retrouvera l'intention. Dans
  // l'ordre inverse, un paiement réussi n'aurait aucune trace chez nous.
  const ref = db.collection(COLLECTIONS.paymentIntents).doc();
  const base: Omit<PaymentIntent, 'id' | 'providerToken'> = {
    ownerUid: appelant.uid,
    kind,
    montantFcfa: montant,
    ...(invoiceId ? { invoiceId } : {}),
    status: 'pending',
    provider: 'paydunya',
    createdAt: maintenant,
  };
  await ref.set({ ...base, providerToken: '' });

  const origine =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || request.nextUrl.origin;

  try {
    const facture = await creerFacture({
      montantFcfa: montant,
      description,
      intentId: ref.id,
      callbackUrl: `${origine}/api/annonceur/paydunya-ipn`,
      retourUrl: `${origine}/annonceur/facturation?paiement=retour`,
      annulationUrl: `${origine}/annonceur/facturation?paiement=annule`,
    });
    await ref.update({ providerToken: facture.token });
    return NextResponse.json({ ok: true, urlPaiement: facture.urlPaiement, intentId: ref.id });
  } catch (error) {
    // L'intention est marquée en échec plutôt que supprimée : une trace
    // d'échec se diagnostique, une absence de trace ne dit rien.
    await ref.update({
      status: 'failed',
      echec: error instanceof Error ? error.message : 'Erreur inconnue',
    });
    console.error('Ouverture de paiement PayDunya :', error);
    return NextResponse.json(
      { error: 'Le paiement n’a pas pu être ouvert. Réessayez dans un instant.' },
      { status: 502 }
    );
  }
}
