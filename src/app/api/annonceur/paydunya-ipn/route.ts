/**
 * Webhook PayDunya (IPN) — le seul endroit du projet où de l'argent est crédité.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POURQUOI CETTE ROUTE N'A PAS D'AUTHENTIFICATION FIREBASE
 * ═══════════════════════════════════════════════════════════════════════════
 * PayDunya appelle depuis ses propres serveurs et ne possède aucun jeton
 * Firebase : `verifierAppelant()` refuserait systématiquement. C'est la seule
 * route publique de l'application, et elle compense par trois barrières.
 *
 * BARRIÈRE 1 — le hash du callback (`sha512(master_key)`).
 *   Filtre le bruit et les appels anonymes. RIEN DE PLUS : ce hash est une
 *   constante, identique à chaque webhook, qui ne couvre ni le montant ni le
 *   jeton. Le tenir pour une signature serait une faute — voir l'avertissement
 *   en tête de `lib/paydunya.ts`.
 *
 * BARRIÈRE 2 — la confirmation serveur à serveur.
 *   Le montant et l'issue du paiement sont RELUS chez PayDunya, authentifiés
 *   par les trois clés. Le corps du webhook n'est qu'une notification : il dit
 *   « va voir », jamais « voici combien ». C'est ce qui rend inoffensif un
 *   faux callback annonçant 10 000 000 F.
 *
 * BARRIÈRE 3 — l'idempotence transactionnelle.
 *   PayDunya rejoue ses IPN (et une double livraison suffit). Le passage
 *   `pending` → `settled` se fait DANS la transaction qui crédite : un rejeu
 *   trouve l'intention déjà réglée et ne crédite rien.
 *
 * La route répond toujours 200 dès lors que le hash est bon : un code d'erreur
 * ferait rejouer PayDunya en boucle pour un problème qui n'est pas le sien.
 * L'anomalie est journalisée et l'intention porte son motif d'échec.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';
import { confirmerFacture, hashCallbackValide } from '@/lib/paydunya';
import { crediterIntention } from '@/lib/paiement-credit';
import type { PaymentIntent } from '@/types';

/** PayDunya poste en `application/x-www-form-urlencoded`, clés en `data[...]`. */
async function lireCallback(request: NextRequest): Promise<Record<string, string>> {
  const brut = await request.text();
  const params = new URLSearchParams(brut);
  const plat: Record<string, string> = {};
  for (const [cle, valeur] of params) plat[cle] = valeur;
  return plat;
}

export async function POST(request: NextRequest) {
  try {
    return await traiterCallback(request);
  } catch (error) {
    // Filet de sécurité : AUCUNE exception ne doit sortir d'ici. Un 500 fait
    // rejouer PayDunya en boucle sur un problème qui n'est pas le sien, et le
    // rejeu ne répare rien. On journalise et on acquitte.
    console.error('[paydunya-ipn] Erreur non gérée :', error);
    return NextResponse.json({ ok: true });
  }
}

async function traiterCallback(request: NextRequest) {
  const donnees = await lireCallback(request);

  // ── Barrière 1 : le hash ──
  if (!(await hashCallbackValide(donnees['data[hash]'] ?? ''))) {
    console.warn('[paydunya-ipn] Callback rejeté : hash invalide.');
    return NextResponse.json({ error: 'Refusé.' }, { status: 401 });
  }

  const token = donnees['data[invoice][token]'] ?? donnees['data[token]'] ?? '';
  if (!token) {
    console.warn('[paydunya-ipn] Callback sans jeton de facture.');
    return NextResponse.json({ ok: true });
  }

  const db = getAdminFirestore();

  // ── Barrière 2 : on relit le paiement CHEZ PayDunya ──
  let confirme;
  try {
    confirme = await confirmerFacture(token);
  } catch (error) {
    console.error('[paydunya-ipn] Confirmation impossible :', error);
    // 200 volontaire : rejouer ne réparerait rien, la réconciliation reprendra
    // cette intention au prochain entretien.
    return NextResponse.json({ ok: true });
  }

  // L'intention vient de `custom_data`, jamais d'une recherche par montant.
  const intentId = confirme.intentId;
  if (!intentId) {
    console.error('[paydunya-ipn] Aucun intentId dans custom_data — paiement non rattachable.');
    return NextResponse.json({ ok: true });
  }
  const refIntent = db.collection(COLLECTIONS.paymentIntents).doc(intentId);

  if (confirme.statut !== 'completed') {
    // Un paiement annulé ou échoué clôt l'intention ; « pending » la laisse
    // ouverte, le client n'ayant pas fini de payer.
    if (confirme.statut === 'cancelled' || confirme.statut === 'failed') {
      await refIntent.set(
        { status: 'failed', echec: `PayDunya : ${confirme.statut}` },
        { merge: true }
      );
    }
    return NextResponse.json({ ok: true });
  }

  // ── Barrière 3 : crédit idempotent ──
  // La transaction vit dans `lib/paiement-credit.ts`, partagée avec la
  // réconciliation : le seul geste du système qui crée de l'argent ne doit
  // exister qu'en un exemplaire.
  try {
    const snap = await refIntent.get();
    const intent = snap.data() as PaymentIntent | undefined;
    if (!snap.exists || !intent) {
      console.error(`[paydunya-ipn] Intention ${intentId} introuvable.`);
      return NextResponse.json({ ok: true });
    }
    await crediterIntention(db, refIntent, intent, confirme.montantFcfa);
  } catch (error) {
    console.error('[paydunya-ipn] Crédit impossible :', error);
  }

  return NextResponse.json({ ok: true });
}
