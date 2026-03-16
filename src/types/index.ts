/**
 * Types for the Admin Dashboard
 * ALIGNED with mobile app types (src/data/types.ts)
 * The mobile types are the source of truth.
 */

// ===== Editions =====

export type EditionId = 'classic' | 'agriculture' | 'education' | 'sante' | 'tourisme' | 'culture';

export type DifficultyLevel = 'facile' | 'moyen' | 'difficile';

// Quiz — matches mobile Quiz interface
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
}

// Funding — matches mobile Funding interface
export interface Funding {
  id: string;
  title: string;
  description: string;
  tokens: number;
  source?: string;
  sectorId?: string;
}

// Opportunity — matches mobile Opportunity interface
export interface Opportunity {
  id: string;
  title: string;
  description: string;
  tokens: number;
  sectorId?: string;
}

// Challenge Event — matches mobile Challenge interface (in-game event, NOT program)
export interface ChallengeEvent {
  id: string;
  title: string;
  description: string;
  tokens: number;
  sectorId?: string;
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
  levels: ChallengeLevel[];
  sectors: ChallengeSector[];
  finalQuiz?: Quiz[];
  enabled: boolean;
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
