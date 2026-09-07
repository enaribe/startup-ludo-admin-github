/**
 * Le crédit d'une intention de paiement — transaction UNIQUE, partagée.
 *
 * POURQUOI CE MODULE : deux chemins mènent au crédit d'un compte, le webhook
 * PayDunya et la réconciliation périodique. Les écrire deux fois garantissait
 * qu'ils divergent un jour, sur le seul geste du système qui crée de l'argent.
 *
 * L'IDEMPOTENCE tient dans une seule ligne : la lecture de `status` et son
 * passage à `settled` ont lieu DANS la transaction. Deux appels simultanés —
 * un IPN rejoué et la réconciliation, par exemple — se sérialisent, et le
 * second constate que l'intention n'est plus `pending`. Sans transaction, la
 * fenêtre entre le test et l'écriture suffirait à créditer deux fois.
 */

import { FieldValue, type Firestore, type DocumentReference } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/firebase';
import type { PaymentIntent, TopUp } from '@/types';

/**
 * Crédite une intention si elle est encore en attente.
 *
 * @param montantConfirme montant RELU chez le prestataire — jamais celui
 *   annoncé par un webhook ni celui demandé à la création.
 * @returns `true` si ce appel a effectivement crédité, `false` si l'intention
 *   était déjà traitée (rejeu) ou introuvable.
 */
export async function crediterIntention(
  db: Firestore,
  refIntent: DocumentReference,
  intent: PaymentIntent,
  montantConfirme: number
): Promise<boolean> {
  if (montantConfirme <= 0) return false;

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(refIntent);
    const courant = snap.data() as PaymentIntent | undefined;
    if (!snap.exists || !courant) return false;
    // Le garde-fou du rejeu : tout ce qui n'est plus `pending` est déjà traité.
    if (courant.status !== 'pending') return false;

    const maintenant = Date.now();
    tx.update(refIntent, {
      status: 'settled',
      montantConfirmeFcfa: montantConfirme,
      settledAt: maintenant,
    });

    if (courant.kind === 'invoice' && courant.invoiceId) {
      tx.update(db.collection(COLLECTIONS.invoices).doc(courant.invoiceId), {
        status: 'paid',
        paidAt: maintenant,
      });
      return true;
    }

    const refCompte = db.collection(COLLECTIONS.advertisers).doc(courant.ownerUid);
    // FRAIS ABSORBÉS PAR CONCREE : le solde monte du montant réglé, sans
    // retenue de commission. Décision produit assumée, pas un calcul manquant.
    tx.set(
      refCompte,
      { balanceFcfa: FieldValue.increment(montantConfirme), updatedAt: maintenant },
      { merge: true }
    );
    const alimentation: TopUp = {
      montantFcfa: montantConfirme,
      canal: 'paydunya',
      reference: courant.providerToken,
      createdAt: maintenant,
    };
    // L'id du top-up EST celui de l'intention : même si deux chemins
    // parvenaient à écrire, ils écriraient le même document, pas deux lignes.
    tx.set(refCompte.collection('topUps').doc(refIntent.id), alimentation);
    return true;
  });
}
