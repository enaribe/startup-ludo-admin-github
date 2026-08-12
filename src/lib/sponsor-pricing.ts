/**
 * Tarification et estimation de diffusion du sponsoring.
 *
 * POURQUOI ce module : le sponsoring devient payant, facturé au volume de vues.
 * Un partenaire qui achète 50 000 vues doit comprendre AVANT de signer combien
 * de parties cela représente et en combien de temps ce sera livré. Sans ce
 * calcul affiché, l'objectif de vues est un chiffre arbitraire et le sponsor
 * découvre après coup que sa campagne durera six mois.
 *
 * Le calcul reproduit la mécanique RÉELLE du jeu, pas une approximation
 * marketing. Les hypothèses sont regroupées ici, documentées et exportées, pour
 * que l'écran puisse les afficher au sponsor : une estimation dont on ne peut
 * pas expliquer la provenance n'est pas vendable.
 *
 * SOURCES (vérifiées dans le repo mobile startup-ludo) :
 *  - `SPONSOR_EVENT_CHANCE = 0.25` dans src/services/game/EventManager.ts
 *  - anti-doublon par partie via `usedSponsorCardIds` (même fichier)
 *  - tirage uniforme parmi les cartes non vues du type concerné
 *  - plateau : `CIRCUIT_EVENTS` dans src/config/boardConfig.ts (44 cases)
 *
 * RÉPARTITION DES CASES — d'où viennent les vues facturées.
 * Le circuit compte 4 cases `funding` (7, 18, 29, 40) et 6 cases `event`.
 * Aucune case n'est typée `opportunity` : les opportunités sont tirées par les
 * cases `event`, qui choisissent entre opportunité et imprévu (50/50 quand les
 * deux pools sont fournis).
 *
 * Historique à connaître : `generateRandomEvent()` n'appelait pas
 * `pickSponsorCard()`, si bien qu'une carte opportunité sponsor n'était JAMAIS
 * tirée. Corrigé côté mobile (EventManager.generateRandomEvent passe désormais
 * par generateOpportunityEvent avant de retomber sur le contenu normal), donc
 * les deux types de cartes sont réellement diffusés et facturables.
 */

// ═══════════════════════════════════════════════════════════════════════════
// PARAMÈTRES TARIFAIRES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Prix public par vue de carte sponsor, en FCFA.
 * Une « vue » = une carte sponsor réellement affichée à un joueur en partie
 * (c'est l'événement compté par `trackSponsorCardView` côté mobile).
 * Modifier cette constante ne change PAS les campagnes déjà validées : le prix
 * appliqué est figé dans `EditionSponsor.pricePerView` à la validation.
 */
export const PRIX_PAR_VUE_FCFA = 15;

/** Bornes de l'objectif de vues proposées dans l'UI (curseur + saisie). */
export const OBJECTIF_VUES_MIN = 1_000;
export const OBJECTIF_VUES_MAX = 200_000;
export const OBJECTIF_VUES_PAS = 1_000;

// ═══════════════════════════════════════════════════════════════════════════
// HYPOTHÈSES DE LA MÉCANIQUE DE JEU
// ═══════════════════════════════════════════════════════════════════════════

/** Probabilité qu'une case opportunité/financement tire une carte SPONSOR. */
export const CHANCE_CARTE_SPONSOR = 0.25;

/**
 * Nombre moyen de cases de CHAQUE type sur lesquelles un joueur s'arrête au
 * cours d'une partie.
 *
 * D'où viennent ces chiffres : le circuit fait 44 cases et un joueur avance de
 * 1 à 6 par lancer (espérance 3,5), donc il ne s'arrête que sur ~1 case sur
 * 3,5 → ~12,6 arrêts par tour de plateau. Une partie demande 8 jetons, soit
 * ~1,5 tour de plateau en pratique → ~19 arrêts par joueur.
 *  - `funding` : 4 cases sur 44 → 19 × 4/44 ≈ 1,7. On retient 1,5, prudent.
 *  - `opportunity` : 6 cases `event` sur 44 → 19 × 6/44 ≈ 2,6, mais une case
 *    `event` ne donne une opportunité qu'une fois sur deux (l'autre moitié
 *    tire un imprévu) → ≈ 1,3. On retient 1,2, prudent.
 *
 * Prudence assumée : mieux vaut annoncer une durée un peu longue et la battre
 * que promettre une livraison qui n'arrivera pas.
 */
export const CASES_PAR_TYPE_PAR_PARTIE: Record<'opportunity' | 'funding', number> = {
  opportunity: 1.2,
  funding: 1.5,
};

/** Nombre de joueurs par partie retenu pour l'estimation (parties à 4 = cas courant). */
export const JOUEURS_PAR_PARTIE = 4;

/** Parties jouées par jour sur une édition — hypothèse de rythme, ajustable. */
export const PARTIES_PAR_JOUR = 40;

// ═══════════════════════════════════════════════════════════════════════════
// FORMATAGE
// ═══════════════════════════════════════════════════════════════════════════

/** Espace fine insécable (U+202F) — séparateur de milliers de l'écosystème. */
const ESPACE_FINE = ' ';

/** « 1 234 567 » avec espace fine insécable. */
export function formatNombre(valeur: number): string {
  return Math.round(valeur)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_FINE);
}

/** « 1 234 567 FCFA » — montant + devise, séparés d'une fine insécable. */
export function formatFcfa(valeur: number): string {
  return `${formatNombre(valeur)}${ESPACE_FINE}FCFA`;
}

/** Durée lisible à partir d'un nombre de jours (« 3 semaines », « 2 mois »). */
export function formatDuree(jours: number): string {
  if (!Number.isFinite(jours) || jours <= 0) return '—';
  const arrondi = Math.ceil(jours);
  if (arrondi <= 1) return 'moins d’un jour';
  if (arrondi < 14) return `${arrondi} jours`;
  if (arrondi < 60) {
    const semaines = Math.round(arrondi / 7);
    return `${semaines} semaine${semaines > 1 ? 's' : ''}`;
  }
  const mois = Math.round(arrondi / 30);
  return `${mois} mois`;
}

// ═══════════════════════════════════════════════════════════════════════════
// ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ParametresEstimation {
  /** Objectif de vues acheté par le sponsor. */
  objectifVues: number;
  /** Nombre de cartes opportunité exploitables (avec texte). */
  nbOpportunites: number;
  /** Nombre de cartes financement exploitables (avec texte). */
  nbFinancements: number;
  /** Prix unitaire par vue en FCFA (défaut : tarif public). */
  prixParVue?: number;
}

export interface ResultatEstimation {
  /** Vues générées en moyenne par UNE partie, toutes cartes confondues. */
  vuesParPartie: number;
  /** Nombre de parties nécessaires pour atteindre l'objectif. */
  partiesNecessaires: number;
  /** Durée estimée en jours, au rythme de `PARTIES_PAR_JOUR`. */
  joursEstimes: number;
  /** Coût total de l'objectif, en FCFA. */
  coutTotal: number;
  /** Vrai si aucune carte exploitable : rien ne peut être diffusé. */
  aucuneCarte: boolean;
  /**
   * Garde-fou : vrai si le sponsor a créé des cartes opportunité alors que le
   * plateau ne peut pas les diffuser. Faux depuis la correction de
   * `generateRandomEvent()` côté mobile ; conservé pour que l'UI avertisse
   * automatiquement si la répartition des cases venait à changer.
   */
  opportunitesNonDiffusables: boolean;
}

/**
 * Estime le volume de diffusion d'une campagne.
 *
 * FORMULE, type par type (opportunité et financement sont indépendants) :
 *
 *   vues_type_par_joueur = min(nb_cartes_du_type,
 *                              cases_du_type × CHANCE_CARTE_SPONSOR)
 *
 * Le `min` traduit l'anti-doublon : un joueur ne peut pas voir plus de cartes
 * qu'il n'en existe dans le type, même s'il s'arrête souvent sur ces cases.
 * Le tirage uniforme parmi les cartes non vues n'apparaît pas dans la formule :
 * il répartit les vues ENTRE les cartes d'un même type mais ne change pas leur
 * total — c'est bien pour cela que les cartes d'un même type se partagent les
 * tirages plutôt que de les cumuler.
 *
 *   vues_par_partie = (vues_opp_par_joueur + vues_fin_par_joueur) × joueurs
 *   parties_nécessaires = objectif / vues_par_partie
 *   durée = parties_nécessaires / parties_par_jour
 *   coût = objectif × prix_par_vue
 *
 * Le coût est assis sur l'objectif, PAS sur l'estimation : le sponsor paie les
 * vues qu'il achète, et la diffusion s'arrête à `viewsGoal`.
 */
export function estimerDiffusion({
  objectifVues,
  nbOpportunites,
  nbFinancements,
  prixParVue = PRIX_PAR_VUE_FCFA,
}: ParametresEstimation): ResultatEstimation {
  const vuesOpportunites = Math.min(
    nbOpportunites,
    CASES_PAR_TYPE_PAR_PARTIE.opportunity * CHANCE_CARTE_SPONSOR
  );
  const vuesFinancements = Math.min(
    nbFinancements,
    CASES_PAR_TYPE_PAR_PARTIE.funding * CHANCE_CARTE_SPONSOR
  );
  const vuesParPartie = (vuesOpportunites + vuesFinancements) * JOUEURS_PAR_PARTIE;

  const aucuneCarte = vuesParPartie <= 0;
  const partiesNecessaires = aucuneCarte ? 0 : Math.ceil(objectifVues / vuesParPartie);
  const joursEstimes = aucuneCarte ? 0 : partiesNecessaires / PARTIES_PAR_JOUR;

  return {
    vuesParPartie,
    partiesNecessaires,
    joursEstimes,
    coutTotal: Math.max(0, Math.round(objectifVues * prixParVue)),
    aucuneCarte,
    opportunitesNonDiffusables:
      nbOpportunites > 0 && CASES_PAR_TYPE_PAR_PARTIE.opportunity === 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAT DE DIFFUSION
// ═══════════════════════════════════════════════════════════════════════════

/** État de diffusion d'une campagne, tel qu'affiché en badge. */
export type EtatDiffusion = 'inactif' | 'diffusion' | 'pause' | 'objectif-atteint';

export const ETAT_DIFFUSION_META: Record<
  EtatDiffusion,
  { label: string; badgeClass: string }
> = {
  inactif: { label: 'Non publié', badgeClass: 'badge-info' },
  diffusion: { label: 'En diffusion', badgeClass: 'badge-success' },
  pause: { label: 'En pause', badgeClass: 'badge-warning' },
  'objectif-atteint': { label: 'Objectif atteint', badgeClass: 'badge-primary' },
};

/**
 * Détermine l'état de diffusion à partir des mêmes règles que le mobile :
 * une édition désactivée ne diffuse rien, une campagne en pause non plus, et
 * l'objectif atteint arrête le tirage même si tout le reste est actif.
 */
export function calculerEtatDiffusion(params: {
  enabled: boolean;
  paused?: boolean;
  viewsGoal?: number;
  vuesActuelles: number;
}): EtatDiffusion {
  if (!params.enabled) return 'inactif';
  if (params.viewsGoal && params.vuesActuelles >= params.viewsGoal) return 'objectif-atteint';
  if (params.paused) return 'pause';
  return 'diffusion';
}
