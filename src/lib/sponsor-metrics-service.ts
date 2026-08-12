/**
 * Lecture des métriques de sponsoring — `sponsorMetrics/{editionId}`.
 *
 * POURQUOI un fichier séparé de `firestore-service.ts` : cette collection a un
 * régime d'accès différent de toutes les autres. Elle est écrite EXCLUSIVEMENT
 * par l'app mobile (incréments `FieldValue.increment` au moment où une carte
 * s'affiche) et l'admin n'y a QUE le droit de lecture — ces compteurs servent de
 * base de facturation, un back-office ne doit pas pouvoir les retoucher.
 * Isoler le module rend cette règle évidente à la lecture : il n'y a pas une
 * seule fonction d'écriture ici, et il ne doit jamais y en avoir.
 *
 * Contrat du document (partagé avec le mobile, cf.
 * startup-ludo/src/services/firebase/sponsorMetricsService.ts) :
 * {
 *   editionId: string,
 *   totals: { views, saves, clicks, editionPopupViews },
 *   cards: { [cardId]: { views, saves, clicks, lastSeenAt } },
 *   updatedAt: number
 * }
 *
 * Absence de document = campagne jamais diffusée. On retourne `null` (et non un
 * document à zéro) pour que l'UI puisse afficher un état vide honnête plutôt
 * que des « 0 vues » qui laisseraient croire à un échec de diffusion.
 */

import { doc, getDoc } from 'firebase/firestore';
import { firestore, COLLECTIONS } from './firebase';

/** Métriques d'une carte sponsor individuelle. */
export interface SponsorCardMetrics {
  views: number;
  saves: number;
  clicks: number;
  /** Timestamp (ms) du dernier affichage constaté de la carte. */
  lastSeenAt: number;
}

/** Totaux agrégés d'une édition sponsorisée. */
export interface SponsorMetricsTotals {
  /** Vues de cartes sponsor en partie — c'est CE compteur qui est facturé. */
  views: number;
  saves: number;
  clicks: number;
  /**
   * Impressions du popup affiché au choix de l'édition. Compté à part des
   * `views` : c'est une exposition de marque, pas une vue de carte achetée.
   */
  editionPopupViews: number;
}

/** Document `sponsorMetrics/{editionId}` normalisé pour l'admin. */
export interface SponsorMetricsDocument {
  editionId: string;
  totals: SponsorMetricsTotals;
  cards: Record<string, SponsorCardMetrics>;
  /** Timestamp (ms) de la dernière écriture par le mobile. */
  updatedAt: number;
}

/** Compteurs d'une carte jamais vue — évite de disséminer des `?? 0` dans l'UI. */
export const EMPTY_CARD_METRICS: SponsorCardMetrics = {
  views: 0,
  saves: 0,
  clicks: 0,
  lastSeenAt: 0,
};

/** Coercition défensive : le mobile peut écrire un champ manquant sur un doc jeune. */
function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Normalise la map `cards` en ignorant toute entrée mal formée. */
function normalizeCards(raw: unknown): Record<string, SponsorCardMetrics> {
  if (!raw || typeof raw !== 'object') return {};
  const entries = Object.entries(raw as Record<string, unknown>);
  const cards: Record<string, SponsorCardMetrics> = {};
  for (const [cardId, value] of entries) {
    if (!value || typeof value !== 'object') continue;
    const card = value as Record<string, unknown>;
    cards[cardId] = {
      views: toNumber(card.views),
      saves: toNumber(card.saves),
      clicks: toNumber(card.clicks),
      lastSeenAt: toNumber(card.lastSeenAt),
    };
  }
  return cards;
}

/**
 * Lit les métriques d'une édition. Retourne `null` si le document n'existe pas
 * encore — c'est le cas normal tant qu'aucune partie n'a affiché de carte.
 *
 * N'échoue pas sur une erreur de lecture (droits, réseau) : les métriques sont
 * un enrichissement de l'écran, jamais une condition de son affichage. Le
 * sponsor doit pouvoir éditer ses cartes même si les stats sont indisponibles.
 */
export async function getSponsorMetrics(
  editionId: string
): Promise<SponsorMetricsDocument | null> {
  try {
    const snap = await getDoc(doc(firestore, COLLECTIONS.sponsorMetrics, editionId));
    if (!snap.exists()) return null;

    const data = snap.data();
    const totals = (data.totals ?? {}) as Record<string, unknown>;

    return {
      editionId,
      totals: {
        views: toNumber(totals.views),
        saves: toNumber(totals.saves),
        clicks: toNumber(totals.clicks),
        editionPopupViews: toNumber(totals.editionPopupViews),
      },
      cards: normalizeCards(data.cards),
      updatedAt: toNumber(data.updatedAt),
    };
  } catch (error) {
    console.error('getSponsorMetrics error:', error);
    return null;
  }
}
