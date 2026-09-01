/**
 * Types for the Admin Dashboard
 * ALIGNED with mobile app types (src/data/types.ts)
 * The mobile types are the source of truth.
 */

// ===== Editions =====

export type EditionId = 'classic' | 'agriculture' | 'education' | 'sante' | 'tourisme' | 'culture';

export type DifficultyLevel = 'facile' | 'moyen' | 'difficile';

// Quiz — matches mobile Quiz interface
export interface QuizTranslation { question: string; options: string[]; explanation?: string }
export interface DuelTranslation { question: string; options: string[] }
export interface TitleDescTranslation { title: string; description: string }

export interface Quiz {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  category: string;
  difficulty?: DifficultyLevel;
  explanation?: string;
  rewardTokens?: number;
  penaltyTokens?: number;
  timeLimit?: number;
  sectorId?: string;
  translations?: Record<string, QuizTranslation>;
}

// DuelOption — option de reponse pour un duel (toutes "correctes" mais points differents)
export interface DuelOption {
  text: string;
  points: number; // 30 (meilleure), 20, ou 10
}

// Duel — matches mobile DuelQuestion interface
// Format : question + 3 options avec points differents (30/20/10)
// En jeu : chaque joueur repond a 3 questions, le meilleur score gagne
export interface Duel {
  id: string;
  question: string;
  options: DuelOption[];
  category: string;
  sectorId?: string;
  translations?: Record<string, DuelTranslation>;
}

// Funding — matches mobile Funding interface
export interface Funding {
  id: string;
  title: string;
  description: string;
  tokens: number;
  source?: string;
  sectorId?: string;
  translations?: Record<string, TitleDescTranslation>;
}

// Opportunity — matches mobile Opportunity interface
export interface Opportunity {
  id: string;
  title: string;
  description: string;
  tokens: number;
  sectorId?: string;
  translations?: Record<string, TitleDescTranslation>;
}

// Challenge Event — matches mobile Challenge interface (in-game event, NOT program)
export interface ChallengeEvent {
  id: string;
  title: string;
  description: string;
  tokens: number;
  sectorId?: string;
  translations?: Record<string, TitleDescTranslation>;
}

// StartupIdea — matches mobile StartupIdea interface
export interface StartupIdea {
  id: string;
  name: string;
  sector: string;
  description: string;
  problemSolved?: string;
  targetMarket?: string;
  revenueModel?: string;
}

// EditionData — matches mobile Edition interface + admin extras (sectors, enabled)
// ═══════════════════════════════════════════════════════════════════════════
// ESPACE ANNONCEUR — MODÈLE CAMPAGNES (lot 4)
//
// Une CAMPAGNE (« mise en visibilité ») est l'objet que l'annonceur crée en
// self-service : soit une CARTE co-brandée diffusée dans TOUTES les parties
// (elle ne vit plus dans une édition), soit l'habillage exclusif d'une ÉDITION
// réservée mois par mois. Cycle de vie :
//   draft → in_review → active | rejected, puis active → paused | ended.
// Le sponsor n'écrit que draft ⇄ in_review ; active/rejected/ended sont posés
// par la modération CONCREE (Admin SDK), qui publie aussi le FEED lu par le
// mobile — le jeu ne lit jamais cette collection.
// ═══════════════════════════════════════════════════════════════════════════

export type CampaignFormat = 'card' | 'edition';
export type CampaignStatus = 'draft' | 'in_review' | 'active' | 'paused' | 'rejected' | 'ended';
/** Bandeau de la carte, déterminé par l'objectif choisi à l'étape 1. */
export type CampaignCardKind = 'financement' | 'opportunite' | 'evenement';
/** Objectif métier de l'étape 1 (4 cartes cliquables de la maquette). */
export type CampaignObjectif =
  | 'offre_financement'
  | 'appel_candidatures'
  | 'programme_accompagnement'
  | 'evenement_formation';

export interface CampaignCardVerso {
  /** Description détaillée du dispositif. */
  description: string;
  /** Montant ou avantage (ex. « jusqu'à 1 500 000 FCFA »). */
  avantage?: string;
  /** Critères d'éligibilité. */
  criteres?: string;
  /** Date limite de candidature (AAAA-MM-JJ) — le retrait auto s'y adosse. */
  dateLimite?: string;
}

export interface CampaignCardCta {
  type: 'candidature' | 'formulaire' | 'site' | 'video';
  url: string;
  /** Libellé du bouton du verso (34 caractères max). */
  libelle: string;
}

export interface CampaignCard {
  kind: CampaignCardKind;
  objectif: CampaignObjectif;
  /** Nom de la structure affiché sur la carte. */
  structure: string;
  logoUrl?: string;
  /** Message recto (~120 caractères), écrit comme un événement du jeu. */
  rectoText: string;
  verso: CampaignCardVerso;
  cta: CampaignCardCta;
}

export interface CampaignEditionSkin {
  editionId: string;
  structure: string;
  logoUrl?: string;
  /** Photo plein cadre 4:5 de l'écran sponsor. */
  photoUrl?: string;
  /** Texte court (90 caractères max). */
  shortText: string;
  linkUrl?: string;
  /** Type de destination du « en savoir plus » — consultatif, affiché au récapitulatif. */
  linkType?: 'candidature' | 'formulaire' | 'site' | 'video';
}

export interface CampaignTargeting {
  /** Secteurs visés (slugs) — vide = tous. */
  sectors: string[];
  /** Régions visées (ids PLAYER_REGIONS) — vide = tout le monde. */
  regions: string[];
  /** Contextes de diffusion : cases opportunité / financement. Vide = selon le type. */
  contexts: string[];
  /** Zone choisie à l'étape ciblage (le mobile ne lit que `regions`, dérivé). */
  zone?: 'tous' | 'regions' | 'diaspora';
  /** Tranche d'âge visée ('toutes' par défaut) — consultatif en v1. */
  ageRange?: string;
  /** Situations visées (etudiant / entrepreneur / porteur) — consultatif en v1. */
  situations?: string[];
}

export interface Campaign {
  id: string;
  /** Compte annonceur propriétaire — la frontière de lecture des règles. */
  ownerUid: string;
  ownerEmail?: string;
  format: CampaignFormat;
  status: CampaignStatus;
  card?: CampaignCard;
  editionSkin?: CampaignEditionSkin;
  targeting: CampaignTargeting;
  /** Objectif de personnes touchées (vues). */
  viewsGoal: number;
  /** Plafond budgétaire en FCFA — la diffusion s'arrête d'elle-même. */
  budgetCapFcfa: number;
  /** Grille figée à la soumission (une facture émise doit rester reproductible). */
  pricing: { perView: number; perClick: number; grid: 'standard' | 'edition' | 'premium' };
  /** Période de diffusion (cartes) — null = en continu. */
  period?: { startAt: number | null; endAt: number | null };
  /** Mois réservés (AAAA-MM) — éditions uniquement, posés par la transaction serveur. */
  reservationMonths?: string[];
  /** Consentement aux règles de contenu (étape 5). */
  consentAt?: number;
  submittedAt?: number;
  review?: { reviewedAt?: number; motifRefus?: string };
  createdAt: number;
  updatedAt: number;
}

/** Réservation d'exclusivité : un document par édition × mois, écrit par le seul Admin SDK. */
export interface EditionReservation {
  editionId: string;
  /** AAAA-MM. */
  month: string;
  campaignId: string;
  ownerUid: string;
  /** Nom de la structure — affiché sur le calendrier (« Réservée par X jusqu'au… »). */
  structure: string;
  createdAt: number;
}

/**
 * Carte d'événement sponsor (opportunité ou financement) injectée en partie
 * côté mobile (~25 % de chance sur une case opportunité/financement).
 */
export interface SponsorEventCard {
  id: string;
  /** Texte affiché dans la carte. */
  text: string;
  /** Jetons gagnés (défaut : 2 pour une opportunité, 4 pour un financement). */
  tokens?: number;
  /** Logo affiché dans la carte (peut différer du visuel de l'édition, ex. DER, Orange Bank). */
  logoUrl?: string;
  /** Lien externe de l'opportunité réelle — permet au joueur de la sauvegarder et de l'ouvrir depuis son profil. */
  linkUrl?: string;
}

/**
 * Sponsoring d'une édition : quand `enabled`, le mobile affiche un popup
 * sponsor au choix de l'édition (badge « Sponsorisé », visuel, lien).
 */
export interface EditionSponsor {
  enabled: boolean;
  /** Nom du sponsor affiché dans le texte (ex. "Mastercard Foundation"). */
  name: string;
  /** Visuel plein cadre du popup (affiche/photo de la thématique). */
  imageUrl: string;
  /** Logo du sponsor affiché dans l'encart « En partenariat avec » (optionnel). */
  logoUrl?: string;
  /** Lien « en savoir plus » (optionnel). */
  linkUrl?: string;
  /** Description longue affichée sur l'écran « en savoir plus » (optionnel). */
  description?: string;
  /** Opportunités sponsor injectées en partie. */
  opportunities?: SponsorEventCard[];
  /** Financements sponsor injectés en partie. */
  fundings?: SponsorEventCard[];

  // ===== Sponsoring payant (facturé au volume de vues) =====
  // `viewsGoal` et `paused` sont le contrat PARTAGÉ avec le mobile : le jeu les
  // lit pour arrêter le tirage des cartes. Les champs suivants sont purement
  // administratifs (devis / facturation) et ignorés par le jeu.

  /** Volume de vues acheté par le sponsor ; au-delà, les cartes ne sont plus tirées. */
  viewsGoal?: number;
  /** Diffusion suspendue (manuellement ou budget épuisé). */
  paused?: boolean;
  /**
   * Prix facturé par vue, en FCFA. Stocké sur l'édition plutôt que déduit d'une
   * constante globale : une grille négociée avec un partenaire doit rester
   * vraie même si le tarif public change ensuite — sinon une facture émise
   * hier ne serait plus reproductible aujourd'hui.
   */
  pricePerView?: number;
  /**
   * Plafond de dépense en FCFA, calculé à la validation (`viewsGoal ×
   * pricePerView`). Conservé tel quel : c'est le montant contractuel engagé,
   * indépendant d'un éventuel recalcul ultérieur.
   */
  budgetCap?: number;
  /** Début souhaité de la diffusion (timestamp ms) — informatif, non appliqué par le jeu. */
  startDate?: number;
  /** Fin souhaitée de la diffusion (timestamp ms) — informatif, non appliqué par le jeu. */
  endDate?: number;
}

export interface EditionData {
  id: EditionId;
  name: string;
  description: string;
  icon: string;
  color: string;
  sectors: string[];
  quizzes: Quiz[];
  duels: Duel[];
  fundings: Funding[];
  opportunities: Opportunity[];
  challenges: ChallengeEvent[];
  startupIdeas?: StartupIdea[];
  defaultProjects?: DefaultProject[];
  enabled: boolean;
  /** Traductions des métadonnées de l'édition (nom / description). FR = racine. */
  translations?: Record<string, { name?: string; description?: string }>;
  /** Sponsoring de l'édition (popup côté mobile). */
  sponsor?: EditionSponsor | null;
  updatedAt?: number;
}

// ===== Challenges (YEAH Program) =====

export type CardCategory = 'quiz' | 'duel' | 'opportunity' | 'funding' | 'challenge';

export interface ChallengeDeliverable {
  id: string;
  title: string;
  description: string;
  type: 'text' | 'file' | 'link' | 'quiz';
  required: boolean;
}

export interface ChallengeSubLevel {
  id: string;
  title: string;
  description: string;
  order: number;
  deliverables: ChallengeDeliverable[];
  xpReward: number;
  cardCategories: CardCategory[];
  quizzes: Quiz[];
  duels: Duel[];
  fundings: Funding[];
  opportunities: Opportunity[];
  challengeEvents: ChallengeEvent[];
}

export interface ChallengeLevel {
  id: string;
  title: string;
  description: string;
  order: number;
  subLevels: ChallengeSubLevel[];
  icon?: string;
}

export interface ChallengeSector {
  id: string;
  name: string;
  description: string;
  icon: string;
}

export interface ChallengeProgram {
  id: string;
  name: string;
  description: string;
  logoUrl?: string;
  bannerUrl?: string;
  levels: ChallengeLevel[];
  sectors: ChallengeSector[];
  finalQuiz?: Quiz[];
  enabled: boolean;
  updatedAt?: number;
}

// ===== Partner Programs (nouveau modèle "Programmes partenaires") =====
// ALIGNED with mobile app src/types/program.ts (the mobile types are the source of truth).

export interface ProgramPartner {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  description: string;
  logoUrl?: string | null;
  /** Logo secondaire affiché en haut à gauche de la carte partenaire de l'accueil (ex. co-partenaire). */
  secondaryLogoUrl?: string | null;
  /** Image de fond de la carte partenaire sur l'accueil (visuel vertical avec bouton PARTICIPER). */
  bannerUrl?: string | null;
  /** PNG détouré (fond transparent) affiché à droite du header de l'écran partenaire, par-dessus le dégradé. */
  heroImageUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  isActive: boolean;
  updatedAt?: number;
}

/**
 * Configuration de version de l'app mobile (document Firestore `appConfig/version`).
 * Pilote le popup de mise à jour obligatoire côté mobile.
 */
export interface AppVersionConfig {
  /** Version minimale supportée (ex: "2.2.0"). En dessous → mise à jour obligatoire. */
  minSupportedVersion: string;
  /** Lien Play Store (Android). */
  androidStoreUrl?: string;
  /** Lien App Store (iOS). */
  iosStoreUrl?: string;
  /** Message optionnel affiché dans le popup (remplace le texte par défaut). */
  message?: string;
  updatedAt?: number;
}

export interface ProgramAudience {
  ageRange?: string;
  locations: string[];
  sector: string;
  profile: string;
}

// Le contenu d'un pack a EXACTEMENT la même forme que celui d'un sous-niveau challenge,
// ce qui permet de réutiliser les éditeurs d'événements et ImportContentModal tels quels.
/** Niveau entrepreneurial couvert par une partie. */
export type ProgramLevelTier = 'idea' | 'preparation' | 'launch' | 'development';

export interface ProgramContentPack {
  id: string;
  programId: string;
  name: string;
  description?: string;
  /** Titre affiché de la partie (ex: « Validation du problème »). */
  title?: string;
  /** Niveau entrepreneurial de la partie. */
  levelTier?: ProgramLevelTier;
  quizzes: Quiz[];
  duels: Duel[];
  fundings: Funding[];
  opportunities: Opportunity[];
  challengeEvents: ChallengeEvent[];
}

export type ProgramGameMode = 'solo' | 'duel' | 'tournament';
export type ProgramLanguage = 'fr' | 'en' | 'wo';

export interface ProgramEligibility {
  ageMin?: number;
  ageMax?: number;
  regions: string[];
  sectors: string[];
  audienceProfiles: string[];
}

export interface ProgramAdvancedSettings {
  rule7030: boolean;
  concreeValidationRequired: boolean;
  frequencyCap: boolean;
  publicPreview: boolean;
}

// ===== Base de contenu (source de génération IA, partagée Config ↔ Studio) =====

/** Document source ingéré (vectorisé pour la génération RAG). */
export interface ProgramSourceDoc {
  id: string;
  name: string;
  /** Taille lisible (ex: "2.4 Mo"). */
  size?: string;
  pages?: number;
  /** URL du fichier dans le storage (optionnel tant que l'upload réel n'est pas branché). */
  url?: string;
}

/**
 * Base de contenu d'un programme : documents sources + brief de génération.
 * Saisie UNE fois dans la Configuration (onglet « Informations »), puis réutilisée
 * par le Studio de contenu à chaque génération (plus besoin de re-fournir un document).
 */
export interface ProgramContentSource {
  documents: ProgramSourceDoc[];
  /** Objectif pédagogique principal (Sensibilisation | Qualification | Pré-incubation | Accélération). */
  objective?: string;
  /** Sujets à valoriser dans la génération. */
  topicsKeep: string[];
  /** Sujets à éviter dans la génération. */
  topicsAvoid: string[];
}

// ===== Formulaire de fin (form builder) =====

export type FormFieldType =
  | 'short_text'
  | 'long_text'
  | 'phone'
  | 'email'
  | 'select'
  | 'multi_select'
  | 'radio'
  | 'checkbox'
  | 'slider'
  | 'date'
  | 'file';

/** Groupe d'options pour les champs liste : un titre (grande liste) + ses sous-items. */
export interface ProgramFormOptionGroup {
  /** Titre du groupe (grand titre). Vide/absent = items sans en-tête. */
  title?: string;
  /** Sous-items sélectionnables de ce groupe. */
  items: string[];
}

export interface ProgramFormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  /** Liste PLATE de tous les items sélectionnables (source de vérité pour sélection/filtres). */
  options?: string[];
  /** Structure hiérarchique (titres + sous-items) pour l'affichage. Dérivée d'options. */
  optionGroups?: ProgramFormOptionGroup[];
  min?: number;
  max?: number;
  maxLength?: number;
}

export interface ProgramFormConsent {
  id: string;
  label: string;
  required: boolean;
  enabled: boolean;
}

export interface ProgramEndForm {
  fields: ProgramFormField[];
  consents: ProgramFormConsent[];
}

// ===== Leads / candidats (back-office) =====

export type ProfileMatch = 'yes' | 'no' | 'partial';
export type ProgramLeadStatus = 'new' | 'contacted' | 'converted' | 'rejected';
export type EntrepreneurProfile = 'strategist' | 'goer' | 'cautious' | 'creative' | 'builder';

export interface ProgramEnrollmentFormData {
  fullName: string;
  phone: string;
  email: string;
  city: string;
  professionalStatus: string;
  profileMatch: ProfileMatch | null;
  applicationIntent: number;
  consentDataProcessing: boolean;
  consentContact: boolean;
  newsletterOptIn: boolean;
  customResponses?: Record<string, string | string[] | number | boolean>;
  customConsents?: Record<string, boolean>;
}

export interface ProgramEnrollment {
  id: string;
  userId: string;
  partnerId: string;
  programId: string;
  status: 'active' | 'completed' | 'paused';
  formData: ProgramEnrollmentFormData | null;
  totalSessions: number;
  totalWins: number;
  totalXp: number;
  currentLevel: number;
  completedLevels: number;
  profileId?: string | null;
  profileName?: string | null;
  entrepreneurProfile?: EntrepreneurProfile | null;
  leadStatus?: ProgramLeadStatus;
  enrolledAt: number;
  lastPlayedAt: number | null;
  completedAt: number | null;
}

/** Session de jeu d'un programme (côté back-office, pour le funnel). */
export interface ProgramSessionDoc {
  id: string;
  userId: string;
  partnerId: string;
  programId: string;
  gameId: string;
  isTrial: boolean;
  levelIndex: number;
  won: boolean | null;
  xpGained: number;
  tokensEarned: number;
  startedAt: number;
  completedAt: number | null;
}

/** Profil-personnage que le joueur incarne pendant le parcours (« VOTRE PROFIL »). */
export interface ProgramProfile {
  id: string;
  name: string;
  age: number;
  description: string;
  location: string;
  sector: string;
  avatarUrl?: string | null;
  /** Statut entrepreneurial (Informel, Formalisé, En croissance, Idée...). */
  status?: string;
  /** Nombre de jetons de départ. */
  tokens?: number;
  /** Persona activé (jouable). Défaut: true. */
  enabled?: boolean;
  /** Brouillon non publié. */
  isDraft?: boolean;
  /**
   * Contenu de jeu propre à ce persona, par niveau (même structure que program.contentPacks).
   * Un joueur qui incarne ce persona joue CE contenu au niveau concerné ; à défaut, le
   * contenu commun du programme (program.contentPacks) est utilisé (remplace + fallback).
   */
  contentPacks?: ProgramContentPack[];
}

export interface PartnerProgram {
  id: string;
  slug: string;
  /** Partenaire principal (porteur du programme). */
  partnerId: string;
  /** Co-partenaires affichés en « En partenariat avec » (ex: YEAH x Mastercard Foundation). */
  coPartnerIds?: string[];
  name: string;
  subtitle?: string;
  description: string;
  /** Image de fond de la carte programme (photo plein cadre derrière le titre). */
  heroImageUrl?: string | null;
  /** Logo d'un co-partenaire affiché en haut-droite de la carte (« En partenariat avec »), uploadé directement sur le programme. */
  bannerUrl?: string | null;
  /** Logo du programme (ex: logo YEAH), affiché au milieu-gauche de la carte. */
  logoUrl?: string | null;
  playerCount: number;
  sessionCount: number;
  audience: ProgramAudience;
  tags: string[];
  primaryColor: string;
  secondaryColor: string;
  contentPacks: ProgramContentPack[];
  /** Profils que le joueur peut incarner pendant le parcours. */
  profiles?: ProgramProfile[];
  /** Langue du parcours. */
  language?: ProgramLanguage;
  /** Modes de jeu autorisés (Solo toujours inclus). */
  allowedModes?: ProgramGameMode[];
  /** Mode recommandé côté joueur. */
  recommendedMode?: ProgramGameMode;
  /** Critères d'éligibilité étendus. */
  eligibility?: ProgramEligibility;
  /** Réglages avancés (règle 70/30, validation, frequency cap, preview). */
  advancedSettings?: ProgramAdvancedSettings;
  /** Base de contenu (documents sources + brief) réutilisée par le Studio de génération. */
  contentSource?: ProgramContentSource;
  /** Formulaire de fin de parcours configurable (form builder). */
  endForm?: ProgramEndForm;
  /** @deprecated uid de l'unique admin propriétaire (ancien modèle). Conservé pour
   *  rétrocompat/lecture ; la source de vérité est désormais `ownerIds`. */
  ownerId?: string | null;
  /** uids des admins qui gèrent ce programme (multi-admin). Vide = géré par le super admin seul. */
  ownerIds?: string[];
  /** Token secret de partage public (lecture seule des leads). Null/absent = partage désactivé. */
  shareToken?: string | null;
  isActive: boolean;
  sortOrder: number;
  updatedAt?: number;
}

// ===== Ideation Cards =====

export interface IdeationCard {
  id: string;
  type: 'target' | 'mission' | 'sector';
  text: string;
  icon?: string;
  category?: string;
  xpMultiplier?: number;
  rarity?: 'common' | 'rare' | 'legendary';
}

export interface IdeationDeck {
  id: string;
  name: string;
  cards: IdeationCard[];
  updatedAt?: number;
}

// ===== Default Projects =====

export interface DefaultProjectTranslation {
  name?: string;
  description?: string;
  target?: string;
  mission?: string;
}

export interface DefaultProject {
  id: string;
  name: string;
  description: string;
  sector: string;
  target: string;
  mission: string;
  initialBudget?: number;
  icon?: string;
  /** Traductions par langue (ex: translations.en). Seuls les champs textuels. */
  translations?: Record<string, DefaultProjectTranslation>;
}

// ===== Achievements =====

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'games' | 'social' | 'challenge' | 'collection' | 'special';
  condition: {
    type: string;
    target: number;
    param?: string;
  };
  xpReward: number;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  enabled: boolean;
}

// ===== Progression =====

export interface RankConfig {
  id: string;
  name: string;
  minXP: number;
  maxXP: number;
  icon: string;
  color: string;
  order: number;
}

export interface XPRewardConfig {
  action: string;
  label: string;
  xp: number;
}

export interface ProgressionConfig {
  ranks: RankConfig[];
  xpRewards: XPRewardConfig[];
  challengeXPRewards: XPRewardConfig[];
  updatedAt?: number;
}

// ===== Board Config =====

export type CellType = 'start' | 'quiz' | 'funding' | 'duel' | 'opportunity' | 'challenge' | 'safe' | 'finish';

export interface BoardCell {
  id: number;
  type: CellType;
  label?: string;
}

export interface BoardConfig {
  cells: BoardCell[];
  updatedAt?: number;
}

// ===== Stats =====

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  totalGames: number;
  totalChallengeEnrollments: number;
  editionsCount: number;
}

// ===== Mode Classe =====
// Modèle exact de SPEC-MODE-CLASSE §2.1. Les collections concernées sont
// `establishments`, `classes` et la sous-collection `classes/{id}/learners`.

/** Niveau d'enseignement d'un établissement ou d'une classe. */
export type SchoolLevel = 'college' | 'lycee' | 'universite' | 'formation';

/** Libellés d'affichage des niveaux, dans l'ordre attendu à l'écran. */
export const SCHOOL_LEVEL_LABELS: Record<SchoolLevel, string> = {
  college: 'Collège',
  lycee: 'Lycée',
  universite: 'Université',
  formation: 'Formation',
};

/** Liste ordonnée des niveaux, pour les sélecteurs et les filtres. */
export const SCHOOL_LEVELS: SchoolLevel[] = ['college', 'lycee', 'universite', 'formation'];

/**
 * Établissement scolaire client (collection `establishments`).
 * Un document par établissement ; c'est le périmètre d'un `establishment_admin`.
 */
export interface Establishment {
  /** Identifiant du document (ex. `ism-dakar`). */
  id: string;
  /** Raison sociale affichée partout (ex. « ISM Dakar »). */
  name: string;
  /** Niveau d'enseignement dominant de l'établissement. */
  level: SchoolLevel;
  /** Ville du site principal. */
  city: string;
  /** Pays du site principal. */
  country: string;
  /** Code de licence commercial (ex. « EST-ISM-2026 »). */
  licenseCode: string;
  /**
   * Fin de validité de la licence, en millisecondes epoch.
   * ⚠️ APPLIQUÉ au lot 4 : au-delà, le lancement d'une séance est bloqué.
   */
  licenseValidUntil?: number | null;
  /** Quota de comptes enseignants. 0 = illimité. */
  maxTeachers: number;
  /** Quota d'élèves, tous niveaux confondus. 0 = illimité. */
  maxLearners: number;
  /** False = établissement suspendu (impayé, fin de contrat). */
  isActive: boolean;
  /** Date de création, en millisecondes epoch. */
  createdAt?: number;
  /** Date de dernière modification, en millisecondes epoch. */
  updatedAt?: number;
}

/**
 * Classe d'un établissement (collection `classes`).
 * Une classe consomme les programmes ; ce n'est PAS un `PartnerProgram`
 * (cf. SPEC §2.3).
 */
export interface SchoolClass {
  /** Identifiant du document (ex. `tle-s2`). */
  id: string;
  /** Établissement propriétaire — borne du périmètre, jamais modifiable. */
  establishmentId: string;
  /** Nom affiché de la classe (ex. « Terminale S2 »). */
  name: string;
  /** Niveau d'enseignement de la classe. */
  level: SchoolLevel;
  /**
   * Enseignants affectés (uid des comptes).
   * Relation inverse de `AdminUser.teachingClassIds` — les deux doivent rester
   * cohérentes ; l'écriture est faite par `/api/admins` au lot 3.
   */
  teacherIds: string[];
  /**
   * Nombre d'élèves actifs, dénormalisé pour l'affichage en grille (évite de
   * lire la sous-collection `learners` de chaque classe).
   */
  learnerCount: number;
  /**
   * Code de rattachement à 6 caractères, `null` quand la fenêtre est fermée.
   * ⚠️ LOT 4 : déclaré ici pour figer le modèle, non utilisé par le lot 2.
   */
  joinCode?: string | null;
  /**
   * Expiration de la fenêtre de rattachement, en millisecondes epoch.
   * ⚠️ LOT 4 : déclaré ici pour figer le modèle, non utilisé par le lot 2.
   */
  joinCodeExpiresAt?: number | null;
  /** Date de création, en millisecondes epoch. */
  createdAt?: number;
  /** Date de dernière modification, en millisecondes epoch. */
  updatedAt?: number;
}

/**
 * Agrégat de maîtrise d'une notion pour un élève : réponses justes sur total.
 * Alimenté en fin de séance (lot 6).
 */
export interface LearnerCategoryMastery {
  /** Nombre de réponses correctes cumulées sur cette catégorie. */
  correct: number;
  /** Nombre total de questions posées sur cette catégorie. */
  total: number;
}

/**
 * Élève d'une classe (sous-collection `classes/{classId}/learners`).
 *
 * ⚠️ Un élève n'est JAMAIS supprimé : un retrait pose `isActive: false` et
 * libère `linkedUid`. Sans quoi les séances passées et le bilan de classe
 * deviendraient faux (cf. SPEC « Mouvements d'élèves »).
 */
export interface Learner {
  /** Identifiant du document dans la sous-collection. */
  id: string;
  /** Prénom de l'élève. */
  firstName: string;
  /** Nom de famille de l'élève. */
  lastName: string;
  /** Numéro d'élève de l'établissement, optionnel. */
  externalId?: string;
  /**
   * Compte de l'élève (uid Firebase), posé au rattachement et permanent.
   * `null` tant que l'élève n'a pas lié son compte, ou après un retrait.
   */
  linkedUid?: string | null;
  /** Date du rattachement du compte, en millisecondes epoch. */
  linkedAt?: number | null;
  /** False = l'élève a quitté la classe ; on garde l'historique. */
  isActive: boolean;
  /** Nombre de séances auxquelles l'élève a participé (agrégat, écrit au lot 7). */
  totalSessions?: number;
  /** Dernière activité de l'élève, en millisecondes epoch (agrégat, écrit au lot 7). */
  lastPlayedAt?: number | null;
  /** Maîtrise cumulée par catégorie de quiz (agrégat, écrit au lot 7). */
  masteryByCategory?: Record<string, LearnerCategoryMastery>;
  /**
   * Séances DÉJÀ intégrées au cumul (lot 7) — le garde-fou de l'idempotence.
   *
   * Sans ce marqueur, cliquer deux fois « Terminer la séance » (ou relancer un
   * recalcul) additionnerait deux fois les mêmes réponses, et la fiche annuelle
   * de l'élève afficherait un effectif de questions supérieur au nombre réel.
   *
   * Il vit sur le document du learner, et non dans une sous-collection, pour
   * être écrit dans la MÊME opération que `masteryByCategory` : une panne entre
   * les deux écritures laisserait sinon un cumul non marqué (donc doublé au
   * prochain clic) ou un marqueur sans cumul (séance définitivement perdue).
   *
   * Volume : ~30 identifiants sur une année scolaire, quelques centaines
   * d'octets — très loin de la limite Firestore de 1 Mo par document.
   */
  countedSessionIds?: string[];
  /** Date de création, en millisecondes epoch. */
  createdAt?: number;
  /** Date de dernière modification, en millisecondes epoch. */
  updatedAt?: number;
}

/**
 * État d'une séance de classe.
 *  - `scheduled` : créée et programmée, pas encore ouverte aux élèves ;
 *  - `running`   : en cours — c'est le SEUL état où l'élève voit la séance et
 *                  peut y écrire (cf. règles Firestore `classSessions`) ;
 *  - `ended`     : terminée, base du rapport de séance (lot 6).
 */
export type ClassSessionStatus = 'scheduled' | 'running' | 'ended';

/**
 * Séance de classe (collection `classSessions`) — modèle exact de SPEC §2.1.
 *
 * ⚠️ PAS DE CHAMP `code`, et c'est structurant : le code à 6 caractères vit sur
 * la CLASSE (`joinCode` / `joinCodeExpiresAt`, lot 4a) et ne sert qu'au
 * rattachement d'un compte élève à son nom, une fois dans l'année. Les élèves
 * déjà rattachés voient la séance depuis leur profil, sans rien saisir.
 * Confondre les deux ferait ressaisir un code à chaque séance et rendrait le
 * code permanent — donc partageable hors de la classe (cf. SPEC §1).
 *
 * Une séance n'est PAS une `programSession` : cette dernière est une trace
 * individuelle a posteriori qui alimente les analytics commerciales, y injecter
 * du scolaire polluerait le funnel de conversion (SPEC §2.3).
 */
export interface ClassSession {
  /** Identifiant du document. */
  id: string;
  /** Établissement propriétaire — borne de lecture du directeur. */
  establishmentId: string;
  /** Classe visée. Doit appartenir au claim `classIds` de l'enseignant. */
  classId: string;
  /** Enseignant qui a créé la séance (uid) — seul habilité à la modifier. */
  teacherId: string;
  /** État de la séance. */
  status: ClassSessionStatus;
  /** Édition dont le contenu est imposé à tous les élèves de la séance. */
  editionId: string;
  /** Programme partenaire d'origine du contenu, si la séance en réutilise un. */
  programId?: string;
  /** Pack de contenu retenu à l'intérieur du programme, le cas échéant. */
  contentPackId?: string;
  /** Index du niveau ciblé dans le programme (0 = Niv.1), le cas échéant. */
  levelIndex?: number;
  /** Durée prévue de la séance, en minutes (20 à 45, cf. SPEC §3.2). */
  durationMinutes: number;
  /** Date/heure programmée, en millisecondes epoch. Absent = lancement immédiat. */
  scheduledAt?: number;
  /** Début effectif, en millisecondes epoch (posé au passage en `running`). */
  startedAt?: number;
  /** Fin effective, en millisecondes epoch (posée au passage en `ended`). */
  endedAt?: number;
  /**
   * Code d'entrée à 6 caractères de la SALLE D'ATTENTE, `null` hors séance
   * ouverte. Même alphabet que `SchoolClass.joinCode` (sans O/0 ni I/1) et
   * unique à travers les DEUX collections : l'élève saisit les deux dans le
   * même champ, un doublon l'enverrait dans la mauvaise porte.
   *
   * ⚠️ IL NE DONNE AUCUN DROIT PAR LUI-MÊME. Il désigne la séance ; c'est la
   * règle Firestore `estCetEleve()` qui vérifie ensuite que l'appelant est bien
   * rattaché à LA classe de cette séance. Un élève d'une autre classe qui
   * scanne le QR est refusé par la base, pas seulement par l'interface.
   */
  joinCode?: string | null;
  /**
   * Expiration du code, en millisecondes epoch. Couvre la durée prévue plus une
   * marge pour les retardataires ; remise à `null` à la clôture — un code de
   * séance terminée ne vaut plus rien.
   */
  joinCodeExpiresAt?: number | null;
  /**
   * Instant où l'enseignant a cliqué « Démarrer la partie », en ms epoch.
   *
   * ═══ POURQUOI UN CHAMP ET NON UN QUATRIÈME `status` ═══
   *
   * Entre l'ouverture de la salle d'attente et le début du jeu, la séance est
   * DÉJÀ `running` : c'est ce qui rend le code valide et laisse les élèves
   * rejoindre. Ajouter un état `waiting` aurait obligé à réviser chaque règle
   * Firestore, chaque requête et chaque écran qui teste `status === 'running'`
   * — pour une information que ce seul horodatage porte aussi bien.
   *
   * Absent = salle d'attente, les élèves s'accumulent sans jouer.
   * Présent = la partie a commencé.
   */
  startedPlayingAt?: number;
  /** URLs des documents de cours joints (Storage). */
  attachmentUrls: string[];
  /**
   * Prolongement après la session (spec v2.1 §4.2) : un quiz que les élèves
   * font à leur rythme sur l'app, avant la date limite. Le taux de complétion
   * remonte au rapport. Absent = pas de prolongement.
   */
  prolongement?: { actif: boolean; dateLimite?: string };
  /** Date de création, en millisecondes epoch. */
  createdAt?: number;
  /**
   * Titre donné par l'enseignant, pour retrouver la séance dans son historique
   * et la réutiliser. Hors SPEC §2.1 mais sans lui, la voie « réutiliser une
   * séance déjà générée » du wizard n'affiche qu'une liste de dates.
   */
  title?: string;
  /**
   * True si le contenu de la séance a été généré par l'IA depuis le cours de
   * l'enseignant. Sert de filtre à la voie (b) du wizard, et signale au rapport
   * (lot 6) que les catégories proviennent de la liste fermée du prompt.
   */
  hasGeneratedContent?: boolean;
  /** Date de dernière modification, en millisecondes epoch. */
  updatedAt?: number;
}

/**
 * Contenu pédagogique d'une séance, généré par l'IA depuis le cours déposé.
 *
 * STOCKÉ EN SOUS-DOCUMENT `classSessions/{id}/content/generated`, jamais dans le
 * document de séance : un pack complet (quiz + duels + financements +
 * opportunités + défis) approche vite la limite Firestore de 1 Mo par document,
 * et la séance elle-même est lue à chaque affichage de liste. Même raisonnement
 * que `programs/{id}/sourceDocs` pour le texte source.
 */
export interface ClassSessionContent {
  /** Quiz — porteurs de `category` et `difficulty`, base du rapport du lot 6. */
  quizzes: Quiz[];
  /** Duels (3 options pondérées 30/20/10). */
  duels: Duel[];
  /** Financements (jetons positifs). */
  fundings: Funding[];
  /** Opportunités (jetons positifs). */
  opportunities: Opportunity[];
  /** Défis (jetons négatifs). */
  challengeEvents: ChallengeEvent[];
  /** Date de génération, en millisecondes epoch. */
  generatedAt?: number;
  /** Date de la dernière correction par l'enseignant, en millisecondes epoch. */
  reviewedAt?: number;
}

/**
 * État d'un élève dans une séance, écrit par le MOBILE au fil de la partie.
 *
 * `abandoned` existe côté mobile (`terminerSeance({ abandoned: true })`) : il
 * doit être typé ici même si le suivi le présente comme « terminé », sinon un
 * document légitime tomberait dans une branche `never` à la lecture.
 */
export type ClassParticipantStatus = 'joined' | 'playing' | 'finished' | 'abandoned';

/** Position de l'élève sur le plateau, remontée sous throttle (~10 s). */
export interface ClassParticipantProgress {
  /** Case atteinte sur le circuit. */
  cellIndex: number;
  /** Jetons détenus — c'est aussi la base du score. */
  tokens: number;
  /** Nombre de cartes jouées depuis le début de la partie. */
  cardsPlayed: number;
}

/**
 * Une réponse de quiz — LA donnée du rapport pédagogique.
 *
 * Poussée par le mobile avec `arrayUnion` : le tableau est additif et sans
 * doublon, mais son ORDRE n'est pas garanti et un même `quizId` peut apparaître
 * deux fois s'il a été joué avec deux résultats différents. L'agrégation ne
 * suppose donc ni ordre ni unicité.
 */
export interface ClassParticipantAnswer {
  /** Identifiant du quiz joué. */
  quizId: string;
  /** Catégorie du quiz — la « notion » agrégée par le rapport. */
  category: string;
  /** True si l'élève a répondu juste. */
  correct: boolean;
  /** Instant de la réponse, en millisecondes epoch (posé côté élève). */
  answeredAt: number;
}

/**
 * Participation d'un élève à une séance
 * (`classSessions/{sessionId}/participants/{learnerId}`).
 *
 * ⚠️ TOUS LES CHAMPS SAUF `learnerId` SONT OPTIONNELS, et ce n'est pas de la
 * prudence excessive : le document est construit par écritures `merge`
 * successives depuis le mobile, dont chacune peut se perdre ou arriver hors
 * ligne. Un élève qui rejoint puis quitte l'application sans jouer laisse un
 * document sans `progress`, sans `score` et sans `answers`. Le rapport doit
 * l'afficher, pas planter dessus.
 *
 * `displayName` n'est écrit que si le mobile le fournit : le back-office ne s'y
 * fie jamais seul et retombe sur la liste `learners` de la classe, qui est la
 * source nominative de référence.
 */
export interface ClassSessionParticipant {
  /** Identifiant du learner — égal à l'id du document. */
  learnerId: string;
  /** Nom recopié par le mobile, souvent absent. */
  displayName?: string;
  /** Entrée en séance, en millisecondes epoch. */
  joinedAt?: number;
  /** Dernière écriture reçue, en millisecondes epoch. */
  lastSeenAt?: number;
  /** État de la participation. */
  status?: ClassParticipantStatus;
  /**
   * Dernier événement notable (flux « ce qui se passe », lot M4). Écrit par le
   * mobile dans la MÊME écriture que la réponse de quiz — aucun débit ajouté.
   */
  lastEvent?: { kind: 'quiz_ok' | 'quiz_ko'; label?: string; at: number };
  /** Position sur le plateau. */
  progress?: ClassParticipantProgress;
  /** Score de l'élève (jetons). */
  score?: number;
  /** Réponses aux quiz, poussées une par une en `arrayUnion`. */
  answers?: ClassParticipantAnswer[];
  /** Fin de partie, en millisecondes epoch. */
  finishedAt?: number;
}
