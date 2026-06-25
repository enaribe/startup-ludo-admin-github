/**
 * Studio de contenu — génération IA réelle et publication dans les parties (contentPacks).
 *
 * Pont entre le Studio (brief + mix par niveau) et l'onglet Structure d'un programme :
 *  1. generateLevelContent() appelle /api/generate (type sublevel_content_import) pour
 *     produire les cartes d'UN niveau, à partir du brief pédagogique + du mix demandé.
 *  2. publishToProgram() injecte ces cartes dans les contentPacks du PartnerProgram,
 *     en mappant chaque niveau Studio (Niv.1–4) sur le levelTier correspondant.
 *
 * Niv.1 → idea · Niv.2 → preparation · Niv.3 → launch · Niv.4 → development
 */

import type {
  Quiz, Duel, Funding, Opportunity, ChallengeEvent,
  ProgramContentPack, ProgramLevelTier, PartnerProgram,
} from '@/types';

export interface GeneratedContent {
  quizzes: Quiz[];
  duels: Duel[];
  fundings: Funding[];
  opportunities: Opportunity[];
  challengeEvents: ChallengeEvent[];
}

/** Cartes générées pour un niveau précis du Studio (0 = Niv.1 … 3 = Niv.4). */
export interface GeneratedLevel {
  levelIndex: number;
  levelTier: ProgramLevelTier;
  levelLabel: string;
  content: GeneratedContent;
}

/** Mapping niveau Studio (index 0–3) → levelTier de la partie. */
export const LEVEL_TIERS: { tier: ProgramLevelTier; label: string }[] = [
  { tier: 'idea', label: 'Idée' },
  { tier: 'preparation', label: 'Préparation' },
  { tier: 'launch', label: 'Lancement' },
  { tier: 'development', label: 'Développement' },
];

/** Brief pédagogique du Studio, partagé pour piloter la génération. */
export interface StudioBrief {
  objective: string;          // Sensibilisation | Qualification | Pré-incubation | Accélération
  topicsKeep: string[];       // sujets à valoriser
  topicsAvoid: string[];      // sujets à éviter
  programName?: string;
}

/** Compte des cartes par type pour un niveau (indexé sur les 5 types Studio). */
export interface LevelMix {
  opportunity: number;
  challenge: number;
  funding: number;
  quiz: number;
  duel: number;
}

const EMPTY: GeneratedContent = { quizzes: [], duels: [], fundings: [], opportunities: [], challengeEvents: [] };

/** Total de cartes attendues pour un niveau. */
export function mixTotal(mix: LevelMix): number {
  return mix.opportunity + mix.challenge + mix.funding + mix.quiz + mix.duel;
}

/** Assigne des IDs uniques aux cartes (même schéma que ImportContentModal). */
function assignIds(content: Partial<GeneratedContent>, seed: string): GeneratedContent {
  return {
    quizzes: (content.quizzes || []).map((q, i) => ({ ...q, id: `quiz_${seed}_${i}` })),
    duels: (content.duels || []).map((d, i) => ({ ...d, id: `duel_${seed}_${i}` })),
    fundings: (content.fundings || []).map((f, i) => ({ ...f, id: `fund_${seed}_${i}` })),
    opportunities: (content.opportunities || []).map((o, i) => ({ ...o, id: `opp_${seed}_${i}` })),
    challengeEvents: (content.challengeEvents || []).map((c, i) => ({ ...c, id: `chal_${seed}_${i}` })),
  };
}

/** Construit le brief textuel envoyé à l'IA pour générer les cartes d'un niveau. */
function buildPrompt(brief: StudioBrief, levelLabel: string, mix: LevelMix): string {
  const lines: string[] = [];
  lines.push(`Génère le contenu de jeu pour le niveau « ${levelLabel} » d'un parcours entrepreneurial.`);
  lines.push(`Objectif pédagogique : ${brief.objective}.`);
  if (brief.topicsKeep.length) lines.push(`Sujets à valoriser : ${brief.topicsKeep.join(', ')}.`);
  if (brief.topicsAvoid.length) lines.push(`Sujets à éviter absolument : ${brief.topicsAvoid.join(', ')}.`);
  lines.push('');
  lines.push('Quantités EXACTES à produire pour ce niveau :');
  if (mix.quiz) lines.push(`- ${mix.quiz} quiz`);
  if (mix.duel) lines.push(`- ${mix.duel} duels`);
  if (mix.funding) lines.push(`- ${mix.funding} financements (fundings, tokens positifs)`);
  if (mix.opportunity) lines.push(`- ${mix.opportunity} opportunités (tokens positifs)`);
  if (mix.challenge) lines.push(`- ${mix.challenge} défis (challengeEvents, tokens négatifs)`);
  lines.push('');
  lines.push('Adapte la difficulté et le ton au niveau indiqué. Contenu réaliste, ancré dans le contexte entrepreneurial africain/sénégalais.');
  return lines.join('\n');
}

/**
 * Génère les cartes d'UN niveau via /api/generate.
 * Retourne le contenu typé (avec IDs), ou lève une erreur en cas d'échec API.
 */
export async function generateLevelContent(
  brief: StudioBrief,
  levelIndex: number,
  mix: LevelMix,
): Promise<GeneratedLevel> {
  const { tier, label } = LEVEL_TIERS[levelIndex];
  if (mixTotal(mix) === 0) {
    return { levelIndex, levelTier: tier, levelLabel: label, content: { ...EMPTY } };
  }

  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'sublevel_content_import',
      prompt: buildPrompt(brief, label, mix),
      context: {
        subLevelTitle: label,
        levelTitle: label,
        programName: brief.programName || '',
      },
    }),
  });

  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `Génération échouée (niveau ${label})`);

  const seed = `${levelIndex}_${Date.now()}`;
  const content = assignIds(json.data as Partial<GeneratedContent>, seed);
  return { levelIndex, levelTier: tier, levelLabel: label, content };
}

/** Total de cartes réellement présentes dans un GeneratedContent. */
export function countContent(c: GeneratedContent): number {
  return c.quizzes.length + c.duels.length + c.fundings.length + c.opportunities.length + c.challengeEvents.length;
}

/**
 * Publie les niveaux générés dans les contentPacks d'un programme.
 * - Pour chaque niveau : si une partie a déjà ce levelTier, on y AJOUTE les cartes ;
 *   sinon on crée une nouvelle partie portant ce levelTier.
 * Retourne le programme mis à jour (à enregistrer via saveProgram).
 */
export function publishToProgram(
  program: Omit<PartnerProgram, 'id'>,
  programId: string,
  levels: GeneratedLevel[],
): Omit<PartnerProgram, 'id'> {
  const packs: ProgramContentPack[] = [...(program.contentPacks ?? [])];

  for (const lvl of levels) {
    if (countContent(lvl.content) === 0) continue;

    let pack = packs.find((p) => p.levelTier === lvl.levelTier);
    if (!pack) {
      pack = {
        id: `pack_${lvl.levelTier}_${Date.now()}`,
        programId,
        name: lvl.levelLabel,
        title: lvl.levelLabel,
        description: '',
        levelTier: lvl.levelTier,
        quizzes: [], duels: [], fundings: [], opportunities: [], challengeEvents: [],
      };
      packs.push(pack);
    }
    // Append (ne remplace pas l'existant édité manuellement dans l'onglet Structure).
    pack.quizzes = [...pack.quizzes, ...lvl.content.quizzes];
    pack.duels = [...pack.duels, ...lvl.content.duels];
    pack.fundings = [...pack.fundings, ...lvl.content.fundings];
    pack.opportunities = [...pack.opportunities, ...lvl.content.opportunities];
    pack.challengeEvents = [...pack.challengeEvents, ...lvl.content.challengeEvents];
  }

  return { ...program, contentPacks: packs };
}
