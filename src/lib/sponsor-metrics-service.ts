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
 *   totals: { views, saves, clicks, editionPopupViews,
 *             flips, uniqueViews, gamesPlayed, playSeconds },   // télémétrie v2
 *   cards: { [cardId]: { views, saves, clicks, flips, lastSeenAt } },
 *   bySector: { [slug]: number },   // vues ventilées par secteur du joueur
 *   byRegion: { [slug]: number },   // vues ventilées par région déclarée
 *   updatedAt: number
 * }
 * Sous-collection `daily/{AAAA-MM-JJ}` : mêmes compteurs, PAR JOUR — la matière
 * première de la courbe « vues et clics par jour » de l'Espace Annonceur.
 *
 * Absence de document = campagne jamais diffusée. On retourne `null` (et non un
 * document à zéro) pour que l'UI puisse afficher un état vide honnête plutôt
 * que des « 0 vues » qui laisseraient croire à un échec de diffusion.
 */

import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { firestore, COLLECTIONS } from './firebase';

/** Métriques d'une carte sponsor individuelle. */
export interface SponsorCardMetrics {
  views: number;
  saves: number;
  clicks: number;
  /** Retournements de la carte (verso) — 0 tant que la carte recto/verso n'existe pas côté mobile. */
  flips: number;
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
  // ===== Télémétrie v2 (Espace Annonceur, lot 1 mobile) =====
  /** Retournements de carte, tous supports confondus. */
  flips: number;
  /** JOUEURS DIFFÉRENTS touchés (marqueur create-only par uid — infalsifiable côté client). */
  uniqueViews: number;
  /** Parties lancées dans l'édition sponsorisée. */
  gamesPlayed: number;
  /** Secondes de jeu cumulées dans l'édition (durée d'exposition de la marque). */
  playSeconds: number;
}

/** Document `sponsorMetrics/{editionId}` normalisé pour l'admin. */
export interface SponsorMetricsDocument {
  editionId: string;
  totals: SponsorMetricsTotals;
  cards: Record<string, SponsorCardMetrics>;
  /** Vues ventilées par secteur du projet du joueur (clés en slug, `non-renseigne` inclus). */
  bySector: Record<string, number>;
  /** Vues ventilées par région déclarée du joueur. */
  byRegion: Record<string, number>;
  /** Timestamp (ms) de la dernière écriture par le mobile. */
  updatedAt: number;
}

/** Bucket quotidien `sponsorMetrics/{editionId}/daily/{AAAA-MM-JJ}` normalisé. */
export interface SponsorDailyMetrics {
  /** Jour local du joueur, au format AAAA-MM-JJ. */
  date: string;
  totals: SponsorMetricsTotals;
  cards: Record<string, SponsorCardMetrics>;
}

/** Compteurs d'une carte jamais vue — évite de disséminer des `?? 0` dans l'UI. */
export const EMPTY_CARD_METRICS: SponsorCardMetrics = {
  views: 0,
  saves: 0,
  clicks: 0,
  flips: 0,
  lastSeenAt: 0,
};

/** Totaux à zéro — pour les jours sans bucket dans une série continue. */
export const EMPTY_TOTALS: SponsorMetricsTotals = {
  views: 0,
  saves: 0,
  clicks: 0,
  editionPopupViews: 0,
  flips: 0,
  uniqueViews: 0,
  gamesPlayed: 0,
  playSeconds: 0,
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
      flips: toNumber(card.flips),
      lastSeenAt: toNumber(card.lastSeenAt),
    };
  }
  return cards;
}

/** Normalise une map d'attribution `{ slug: nombre }`. */
function normalizeAttribution(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const result: Record<string, number> = {};
  for (const [cle, valeur] of Object.entries(raw as Record<string, unknown>)) {
    const n = toNumber(valeur);
    if (n > 0) result[cle] = n;
  }
  return result;
}

/** Normalise un bloc `totals` brut. */
function normalizeTotals(raw: unknown): SponsorMetricsTotals {
  const totals = (raw ?? {}) as Record<string, unknown>;
  return {
    views: toNumber(totals.views),
    saves: toNumber(totals.saves),
    clicks: toNumber(totals.clicks),
    editionPopupViews: toNumber(totals.editionPopupViews),
    flips: toNumber(totals.flips),
    uniqueViews: toNumber(totals.uniqueViews),
    gamesPlayed: toNumber(totals.gamesPlayed),
    playSeconds: toNumber(totals.playSeconds),
  };
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

    return {
      editionId,
      totals: normalizeTotals(data.totals),
      cards: normalizeCards(data.cards),
      bySector: normalizeAttribution(data.bySector),
      byRegion: normalizeAttribution(data.byRegion),
      updatedAt: toNumber(data.updatedAt),
    };
  } catch (error) {
    console.error('getSponsorMetrics error:', error);
    return null;
  }
}

/** Jour local au format AAAA-MM-JJ, décalé de `deltaJours` par rapport à aujourd'hui. */
export function jourLocal(deltaJours = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + deltaJours);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Série quotidienne CONTINUE des `jours` derniers jours (aujourd'hui inclus),
 * un point par jour, les jours sans écriture à zéro — une courbe à trous se
 * lirait comme une panne de mesure alors que c'est simplement un jour sans vue.
 *
 * Le filtre porte sur le champ `date` (égal à l'id du document) : requête à
 * borne unique, pas d'index composite, au plus `jours` documents lus.
 */
export async function getSponsorDailyMetrics(
  editionId: string,
  jours = 14
): Promise<SponsorDailyMetrics[]> {
  const debut = jourLocal(-(jours - 1));
  let lus = new Map<string, SponsorDailyMetrics>();
  try {
    const snap = await getDocs(
      query(
        collection(firestore, COLLECTIONS.sponsorMetrics, editionId, 'daily'),
        where('date', '>=', debut),
        orderBy('date')
      )
    );
    lus = new Map(
      snap.docs.map((d) => {
        const data = d.data();
        const date = typeof data.date === 'string' ? data.date : d.id;
        return [
          date,
          { date, totals: normalizeTotals(data.totals), cards: normalizeCards(data.cards) },
        ];
      })
    );
  } catch (error) {
    console.error('getSponsorDailyMetrics error:', error);
  }

  // Série continue : chaque jour existe, à zéro si aucune écriture.
  const serie: SponsorDailyMetrics[] = [];
  for (let i = jours - 1; i >= 0; i -= 1) {
    const date = jourLocal(-i);
    serie.push(lus.get(date) ?? { date, totals: { ...EMPTY_TOTALS }, cards: {} });
  }
  return serie;
}
