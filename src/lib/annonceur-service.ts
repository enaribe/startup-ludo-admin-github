/**
 * Espace Annonceur — assemblage des « mises en visibilité » (lot 3).
 *
 * UNE MISE EN VISIBILITÉ = ce que l'annonceur a acheté et suit : soit UNE carte
 * (opportunité ou financement) diffusée en partie, soit l'habillage d'une
 * ÉDITION (écran sponsor plein cadre). Le modèle de données sous-jacent reste
 * celui d'aujourd'hui — cartes et habillage vivent dans `editions/{id}.sponsor`
 * — ce module ne fait que le PROJETER dans le vocabulaire de l'Espace
 * Annonceur. Quand le modèle `campaigns` arrivera (lot 4), seul ce module
 * changera de source : les écrans consomment ses types, pas Firestore.
 *
 * FACTURATION AFFICHÉE : seules les VUES DE CARTES sont facturées
 * (`totals.views` × `pricePerView` figé sur l'édition). L'habillage d'édition
 * n'a pas de grille propre dans le modèle actuel : sa dépense est `null` et
 * l'UI affiche « — » — afficher 0 FCFA laisserait croire à une gratuité
 * contractuelle, ne rien afficher est honnête.
 */

import type { EditionData, EditionSponsor, SponsorEventCard } from '@/types';
import { PRIX_PAR_VUE_FCFA } from './sponsor-pricing';
import {
  getSponsorDailyMetrics,
  getSponsorMetrics,
  jourLocal,
  type SponsorDailyMetrics,
  type SponsorMetricsDocument,
} from './sponsor-metrics-service';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type StatutVisibilite = 'active' | 'en_pause' | 'objectif_atteint';

export interface MiseEnVisibilite {
  /** Identifiant de route : `edition~card~cardId` ou `edition~edition`. */
  id: string;
  format: 'carte' | 'edition';
  editionId: string;
  editionName: string;
  /** Type de carte (format carte uniquement). */
  kind?: 'opportunity' | 'funding';
  /** Texte de la carte, ou nom de l'habillage d'édition. */
  titre: string;
  /** Nom de la structure annonceuse (sponsor.name). */
  structure: string;
  statut: StatutVisibilite;
  /** Carte : vues de LA carte. Édition : impressions de l'écran sponsor. */
  vues: number;
  /** Objectif de vues (partagé par toutes les cartes d'une édition) ; null pour l'habillage. */
  objectifVues: number | null;
  clics: number;
  saves: number;
  flips: number;
  /** Prix par vue figé (cartes) ; null pour l'habillage (non facturé aujourd'hui). */
  pricePerView: number | null;
  /** Dépense engagée en FCFA ; null = non facturé (habillage). */
  depenseFcfa: number | null;
  /**
   * Période de diffusion souhaitée (`sponsor.startDate` / `endDate`), en ms.
   *
   * ⚠️ INFORMATIVE, ET C'EST IMPORTANT : le jeu ne l'applique pas — seul
   * `paused` et l'objectif de vues arrêtent réellement la diffusion. L'écran
   * doit donc parler de « réservation », jamais promettre un arrêt automatique
   * à l'échéance. `null` quand l'annonceur n'a pas renseigné de dates.
   */
  debutMs: number | null;
  finMs: number | null;
  /** La carte elle-même (format carte). */
  card?: SponsorEventCard;
  sponsor: EditionSponsor;
}

export interface SyntheseAnnonceur {
  actives: number;
  total: number;
  vues30j: number;
  /** Tendance vs 30 jours précédents, en % (null si aucune base de comparaison). */
  tendancePct: number | null;
  clics30j: number;
  /** CTR moyen sur 30 jours, en % (null si aucune vue). */
  ctrMoyenPct: number | null;
  depenseMoisFcfa: number;
}

export interface EspaceAnnonceur {
  visibilites: MiseEnVisibilite[];
  /** Métriques totales par édition (null = jamais diffusée). */
  metriques: Record<string, SponsorMetricsDocument | null>;
  /** Séries quotidiennes 60 jours par édition (synthèse + courbes). */
  quotidien: Record<string, SponsorDailyMetrics[]>;
  synthese: SyntheseAnnonceur;
}

// ═══════════════════════════════════════════════════════════════════════════
// LIBELLÉS D'ATTRIBUTION (slugs mobiles → texte)
// ═══════════════════════════════════════════════════════════════════════════

/** Régions déclarées côté mobile (PLAYER_REGIONS) — mêmes ids, libellés admin. */
const REGION_LABELS: Record<string, string> = {
  dakar: 'Dakar',
  diourbel: 'Diourbel',
  fatick: 'Fatick',
  kaffrine: 'Kaffrine',
  kaolack: 'Kaolack',
  kedougou: 'Kédougou',
  kolda: 'Kolda',
  louga: 'Louga',
  matam: 'Matam',
  'saint-louis': 'Saint-Louis',
  sedhiou: 'Sédhiou',
  tambacounda: 'Tambacounda',
  thies: 'Thiès',
  ziguinchor: 'Ziguinchor',
  diaspora: 'Diaspora',
  'non-renseigne': 'Non renseignée',
};

/** Libellé lisible d'une clé d'attribution (région connue, sinon slug capitalisé). */
export function libelleAttribution(slug: string): string {
  if (REGION_LABELS[slug]) return REGION_LABELS[slug];
  const mots = slug.replace(/-/g, ' ').trim();
  return mots.charAt(0).toUpperCase() + mots.slice(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// IDENTIFIANTS DE ROUTE
// ═══════════════════════════════════════════════════════════════════════════

/** Sépare edition/carte dans l'URL. `~` : absent des ids d'édition et de carte. */
const SEP = '~';

export function idVisibiliteCarte(editionId: string, cardId: string): string {
  return `${editionId}${SEP}card${SEP}${cardId}`;
}

export function idVisibiliteEdition(editionId: string): string {
  return `${editionId}${SEP}edition`;
}

export function parseIdVisibilite(
  id: string
): { editionId: string; type: 'card'; cardId: string } | { editionId: string; type: 'edition' } | null {
  const parts = id.split(SEP);
  if (parts.length === 2 && parts[1] === 'edition') {
    return { editionId: parts[0], type: 'edition' };
  }
  if (parts.length >= 3 && parts[1] === 'card') {
    // Un id de carte pourrait un jour contenir le séparateur : on rejoint.
    return { editionId: parts[0], type: 'card', cardId: parts.slice(2).join(SEP) };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ASSEMBLAGE
// ═══════════════════════════════════════════════════════════════════════════

/** Statut d'une mise en visibilité, à l'échelle de son édition. */
function statutEdition(sponsor: EditionSponsor, vuesEdition: number): StatutVisibilite {
  if (sponsor.paused === true) return 'en_pause';
  if (
    typeof sponsor.viewsGoal === 'number' &&
    sponsor.viewsGoal > 0 &&
    vuesEdition >= sponsor.viewsGoal
  ) {
    return 'objectif_atteint';
  }
  return 'active';
}

/**
 * Construit l'espace annonceur pour un jeu d'éditions (celles du claim
 * `editionIds` du sponsor, ou toutes pour le super admin).
 *
 * COÛT : 1 lecture de totaux + ~60 buckets par édition sponsorisée. Un sponsor
 * gère 1 à 3 éditions — l'écran s'ouvre en une salve de lectures bornée.
 */
export async function chargerEspaceAnnonceur(editions: EditionData[]): Promise<EspaceAnnonceur> {
  const sponsorisees = editions.filter((e) => e.sponsor?.enabled);

  const metriques: Record<string, SponsorMetricsDocument | null> = {};
  const quotidien: Record<string, SponsorDailyMetrics[]> = {};
  await Promise.all(
    sponsorisees.map(async (e) => {
      const [totaux, serie] = await Promise.all([
        getSponsorMetrics(e.id),
        getSponsorDailyMetrics(e.id, 60),
      ]);
      metriques[e.id] = totaux;
      quotidien[e.id] = serie;
    })
  );

  const visibilites: MiseEnVisibilite[] = [];
  for (const edition of sponsorisees) {
    const sponsor = edition.sponsor as EditionSponsor;
    const m = metriques[edition.id];
    const vuesEdition = m?.totals.views ?? 0;
    const statut = statutEdition(sponsor, vuesEdition);
    const prix = sponsor.pricePerView ?? PRIX_PAR_VUE_FCFA;

    // ── L'habillage d'édition (écran sponsor plein cadre) ──
    //
    // FACTURÉ AU MÊME PRIX QUE LES CARTES : l'écran sponsor est une vue
    // sponsorisée comme une autre, et l'annonceur doit voir ce qu'il engage.
    // Le laisser à `null` affichait un espace vide là où il attend un montant.
    const vuesEcran = m?.totals.editionPopupViews ?? 0;
    const debutMs = typeof sponsor.startDate === 'number' ? sponsor.startDate : null;
    const finMs = typeof sponsor.endDate === 'number' ? sponsor.endDate : null;

    visibilites.push({
      id: idVisibiliteEdition(edition.id),
      format: 'edition',
      editionId: edition.id,
      editionName: edition.name || edition.id,
      titre: `Édition ${edition.name || edition.id}`,
      structure: sponsor.name || '—',
      statut,
      vues: vuesEcran,
      objectifVues: sponsor.viewsGoal ?? null,
      clics: 0,
      saves: 0,
      flips: 0,
      pricePerView: prix,
      depenseFcfa: vuesEcran * prix,
      debutMs,
      finMs,
      sponsor,
    });

    // ── Les cartes ──
    const cartes: Array<{ kind: 'opportunity' | 'funding'; card: SponsorEventCard }> = [
      ...(sponsor.opportunities ?? []).map((card) => ({ kind: 'opportunity' as const, card })),
      ...(sponsor.fundings ?? []).map((card) => ({ kind: 'funding' as const, card })),
    ];
    for (const { kind, card } of cartes) {
      if (!card.text?.trim()) continue; // brouillon vide : rien à mesurer
      const cm = m?.cards[card.id];
      visibilites.push({
        id: idVisibiliteCarte(edition.id, card.id),
        format: 'carte',
        editionId: edition.id,
        editionName: edition.name || edition.id,
        kind,
        titre: card.text,
        structure: sponsor.name || '—',
        statut,
        vues: cm?.views ?? 0,
        objectifVues: typeof sponsor.viewsGoal === 'number' ? sponsor.viewsGoal : null,
        clics: cm?.clicks ?? 0,
        saves: cm?.saves ?? 0,
        flips: cm?.flips ?? 0,
        pricePerView: prix,
        depenseFcfa: (cm?.views ?? 0) * prix,
        // Les dates vivent sur le SPONSOR, pas sur la carte : toutes les cartes
        // d'une même édition partagent donc la période de réservation.
        debutMs,
        finMs,
        card,
        sponsor,
      });
    }
  }

  return { visibilites, metriques, quotidien, synthese: calculerSynthese(visibilites, quotidien, editionsPrix(sponsorisees)) };
}

/** Prix par vue figé de chaque édition (pour la dépense du mois). */
function editionsPrix(editions: EditionData[]): Record<string, number> {
  const prix: Record<string, number> = {};
  for (const e of editions) {
    prix[e.id] = e.sponsor?.pricePerView ?? PRIX_PAR_VUE_FCFA;
  }
  return prix;
}

/**
 * Tuiles de synthèse de la liste. Tout est calculé depuis les buckets
 * quotidiens : c'est la seule source qui sait dire « ces 30 derniers jours »
 * — les totaux cumulés ne savent pas.
 */
export function calculerSynthese(
  visibilites: MiseEnVisibilite[],
  quotidien: Record<string, SponsorDailyMetrics[]>,
  prixParEdition: Record<string, number>
): SyntheseAnnonceur {
  let vues30 = 0;
  let vues30Prec = 0;
  let clics30 = 0;
  let depenseMois = 0;

  const j30 = jourLocal(-29);
  const moisCourant = jourLocal(0).slice(0, 7); // AAAA-MM

  for (const [editionId, serie] of Object.entries(quotidien)) {
    const prix = prixParEdition[editionId] ?? PRIX_PAR_VUE_FCFA;
    for (const jour of serie) {
      if (jour.date >= j30) {
        vues30 += jour.totals.views;
        clics30 += jour.totals.clicks;
      } else {
        vues30Prec += jour.totals.views;
      }
      if (jour.date.startsWith(moisCourant)) {
        depenseMois += jour.totals.views * prix;
      }
    }
  }

  const cartes = visibilites.filter((v) => v.format === 'carte');
  return {
    actives: cartes.filter((v) => v.statut === 'active').length,
    total: cartes.length,
    vues30j: vues30,
    tendancePct: vues30Prec > 0 ? Math.round(((vues30 - vues30Prec) / vues30Prec) * 100) : null,
    clics30j: clics30,
    ctrMoyenPct: vues30 > 0 ? Math.round((clics30 / vues30) * 1000) / 10 : null,
    depenseMoisFcfa: depenseMois,
  };
}

/** Format FCFA avec séparateurs d'espace (« 2 145 500 FCFA »). */
export function fcfa(montant: number): string {
  return `${montant.toLocaleString('fr-FR')} FCFA`;
}
