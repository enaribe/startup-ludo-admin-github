/**
 * Cycle de vie des réservations d'exclusivité d'édition.
 *
 * POURQUOI CE MODULE : une réservation était créée et ne l'était JAMAIS
 * défaite. Une campagne refusée en modération gardait ses mois bloqués pour
 * toujours — le créneau devenait perdu pour tout le monde, y compris pour
 * l'annonceur refusé, alors que plus personne ne le payait.
 *
 * PRINCIPE : on libère quand la contrepartie commerciale disparaît (refus,
 * arrêt définitif, brouillon abandonné) ; on ne libère JAMAIS pour cause de
 * temps qui passe. Un mois écoulé reste en base : « qui sponsorisait
 * l'édition Agriculture en mars ? » doit rester une question qui a une
 * réponse. Le calendrier n'affichant que les 12 mois à venir, une réservation
 * passée n'encombre de toute façon plus rien.
 */

import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/firebase';

/**
 * Libère, DANS une transaction en cours, les mois réservés par une campagne.
 *
 * Passe par les identifiants déterministes `{editionId}_{mois}` plutôt que par
 * une requête : une transaction Firestore ne peut pas lancer de requête, et
 * ces identifiants sont précisément conçus pour ça.
 *
 * Chaque suppression est vérifiée : on ne supprime que si la réservation
 * appartient bien à CETTE campagne. Deux campagnes ne peuvent pas détenir le
 * même mois, mais si un état incohérent existait, effacer la réservation d'un
 * concurrent serait bien pire que de laisser un créneau bloqué.
 */
export async function libererReservations(
  db: Firestore,
  tx: Transaction,
  params: { campaignId: string; editionId?: string; months?: string[] }
): Promise<number> {
  const { campaignId, editionId, months } = params;
  if (!editionId || !months?.length) return 0;

  const refs = months.map((mois) =>
    db.collection(COLLECTIONS.editionReservations).doc(`${editionId}_${mois}`)
  );
  // Toutes les lectures AVANT toute écriture : Firestore l'impose dans une
  // transaction, et un `tx.get` après un `tx.delete` lèverait.
  const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));

  let liberees = 0;
  snaps.forEach((snap, i) => {
    if (!snap.exists) return;
    if (snap.data()?.campaignId !== campaignId) return;
    tx.delete(refs[i]);
    liberees += 1;
  });
  return liberees;
}

/**
 * Les décisions qui rendent les mois au calendrier.
 *
 * `rejected` : la campagne ne diffusera jamais, rien ne justifie de retenir le
 *   créneau.
 * `ended` : arrêt définitif. Décision produit assumée — l'exclusivité restante
 *   est rendue au marché plutôt que gelée jusqu'au terme prévu ; une campagne
 *   arrêtée en septembre ne doit pas bloquer décembre.
 *
 * `paused` et `suspended` n'y figurent PAS : ce sont des états réversibles.
 * Libérer les mois d'une campagne simplement suspendue pour solde permettrait
 * à un concurrent de rafler le créneau pendant que l'annonceur recharge son
 * compte — il perdrait son exclusivité pour un retard de paiement de deux jours.
 */
export const DECISIONS_LIBERATRICES = new Set(['rejected', 'ended']);

// ═══════════════════════════════════════════════════════════════════════════
// ÉCHÉANCE D'UNE RÉSERVATION
// ═══════════════════════════════════════════════════════════════════════════

/** Dernier instant du mois `AAAA-MM` (23:59:59.999 local). */
export function finDeMois(mois: string): number {
  const [annee, m] = mois.split('-').map(Number);
  // Jour 0 du mois SUIVANT = dernier jour de celui-ci, sans table de longueurs
  // ni cas particulier pour février ou les bissextiles.
  return new Date(annee, m, 0, 23, 59, 59, 999).getTime();
}

/**
 * Fin d'exclusivité d'une campagne édition : dernier instant du DERNIER mois
 * réservé. `null` si la campagne n'a pas de mois (format carte, ou brouillon).
 *
 * POURQUOI CETTE FONCTION EXISTE : `period.endAt` n'est renseigné que pour le
 * format `card` — pour une édition il vaut `undefined`. L'entretien testait
 * donc une échéance qui n'existait pas, et une campagne édition ne s'arrêtait
 * JAMAIS à la fin des mois payés : elle diffusait jusqu'à épuisement du
 * plafond ou du solde, bien au-delà de ce que l'annonceur avait acheté — et
 * en bloquant le créneau pour le suivant.
 */
export function finExclusivite(months?: string[]): number | null {
  if (!months?.length) return null;
  const dernier = months.slice().sort().at(-1);
  return dernier ? finDeMois(dernier) : null;
}

/**
 * Jours restants avant la fin de l'exclusivité, arrondis au SUPÉRIEUR : le
 * dernier jour compte tant qu'il n'est pas écoulé. `null` si pas d'échéance,
 * `0` si elle est passée.
 */
export function joursRestants(finMs: number | null, maintenant = Date.now()): number | null {
  if (finMs === null) return null;
  if (finMs <= maintenant) return 0;
  return Math.ceil((finMs - maintenant) / 86_400_000);
}
