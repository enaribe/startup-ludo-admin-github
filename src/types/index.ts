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
  /** Image de fond de la carte partenaire sur l'accueil (visuel vertical avec bouton PARTICIPER). */
  bannerUrl?: string | null;
  /** PNG détouré (fond transparent) affiché à droite du header de l'écran partenaire, par-dessus le dégradé. */
  heroImageUrl?: string | null;
  primaryColor: string;
  secondaryColor: string;
  isActive: boolean;
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

export interface ProgramFormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
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
  /** uid de l'admin propriétaire de ce programme (multi-tenant). Vide = géré par le super admin seul. */
  ownerId?: string | null;
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

export interface DefaultProject {
  id: string;
  name: string;
  description: string;
  sector: string;
  target: string;
  mission: string;
  initialBudget?: number;
  icon?: string;
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
