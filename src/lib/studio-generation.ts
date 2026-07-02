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

/** Contexte d'un persona ciblé par la génération (adapte le contenu à ce profil). */
export interface ProfileContext {
  name: string;
  age?: number;
  description?: string;
  location?: string;
  sector?: string;
  status?: string;
}

/** Brief pédagogique du Studio, partagé pour piloter la génération. */
export interface StudioBrief {
  objective: string;          // Sensibilisation | Qualification | Pré-incubation | Accélération
  topicsKeep: string[];       // sujets à valoriser
  topicsAvoid: string[];      // sujets à éviter
  programName?: string;
  /** Texte concaténé des documents sources, utilisé comme base de connaissances. */
  sourceText?: string;
  /** Si présent, le contenu est généré POUR ce persona (adapté à son profil). */
  profileContext?: ProfileContext;
}

/**
 * Limite de caractères du texte source injecté dans le prompt.
 * ~60k caractères ≈ ~15k tokens : large marge sous la fenêtre de contexte du modèle,
 * tout en laissant de la place pour la sortie JSON.
 */
const MAX_SOURCE_CHARS = 60_000;

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

  // Persona ciblé : le contenu doit être adapté à ce profil précis.
  const pc = brief.profileContext;
  if (pc) {
    const bits = [
      pc.name && `${pc.name}`,
      pc.age && `${pc.age} ans`,
      pc.sector && `secteur ${pc.sector}`,
      pc.status && `statut ${pc.status}`,
      pc.location && `à ${pc.location}`,
    ].filter(Boolean).join(', ');
    lines.push('');
    lines.push(`PERSONA CIBLE : ce contenu s'adresse à un joueur qui incarne ${bits}.`);
    if (pc.description) lines.push(`Profil : ${pc.description}`);
    lines.push('Adapte IMPÉRATIVEMENT le vocabulaire, les montants, les situations, les obstacles et les opportunités à ce profil précis (son secteur, son niveau de maturité, son contexte local).');
  }

  // Base de connaissances : documents sources du programme.
  const source = (brief.sourceText ?? '').trim();
  if (source) {
    const truncated = source.length > MAX_SOURCE_CHARS;
    const body = truncated ? source.slice(0, MAX_SOURCE_CHARS) : source;
    lines.push('');
    lines.push('BASE DE CONNAISSANCES (documents fournis par le programme) :');
    lines.push('Appuie-toi PRIORITAIREMENT sur ce contenu pour les faits, chiffres, vocabulaire et exemples.');
    lines.push('Ne contredis jamais ces documents ; reste fidèle à leur terminologie.');
    lines.push('"""');
    lines.push(body);
    if (truncated) lines.push('… [document tronqué]');
    lines.push('"""');
  }

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

/** Mode d'écriture quand un pack existe déjà pour le niveau ciblé. */
export type PublishMode = 'append' | 'replace';

/**
 * Publie les niveaux générés dans un TABLEAU de contentPacks (commun ou persona).
 * - append : ajoute aux cartes existantes du pack du niveau.
 * - replace : remplace le contenu du pack du niveau par les cartes générées.
 * Retourne un NOUVEAU tableau de packs (immutable).
 */
export function publishIntoPacks(
  existingPacks: ProgramContentPack[] | undefined,
  programId: string,
  levels: GeneratedLevel[],
  mode: PublishMode = 'append',
): ProgramContentPack[] {
  const packs: ProgramContentPack[] = (existingPacks ?? []).map((p) => ({ ...p }));

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
    const base = mode === 'replace'
      ? { quizzes: [], duels: [], fundings: [], opportunities: [], challengeEvents: [] }
      : pack;
    pack.quizzes = [...base.quizzes, ...lvl.content.quizzes];
    pack.duels = [...base.duels, ...lvl.content.duels];
    pack.fundings = [...base.fundings, ...lvl.content.fundings];
    pack.opportunities = [...base.opportunities, ...lvl.content.opportunities];
    pack.challengeEvents = [...base.challengeEvents, ...lvl.content.challengeEvents];
  }

  return packs;
}

/**
 * Publie les niveaux générés dans les contentPacks COMMUNS d'un programme.
 * (Wrapper de publishIntoPacks, conservé pour compatibilité.)
 */
export function publishToProgram(
  program: Omit<PartnerProgram, 'id'>,
  programId: string,
  levels: GeneratedLevel[],
  mode: PublishMode = 'append',
): Omit<PartnerProgram, 'id'> {
  return { ...program, contentPacks: publishIntoPacks(program.contentPacks, programId, levels, mode) };
}

/**
 * Publie les niveaux générés dans les contentPacks d'un PERSONA précis du programme.
 * Retourne le programme mis à jour (profiles[profileId].contentPacks alimenté).
 */
export function publishToProfile(
  program: Omit<PartnerProgram, 'id'>,
  programId: string,
  profileId: string,
  levels: GeneratedLevel[],
  mode: PublishMode = 'append',
): Omit<PartnerProgram, 'id'> {
  const profiles = (program.profiles ?? []).map((p) =>
    p.id === profileId
      ? { ...p, contentPacks: publishIntoPacks(p.contentPacks, programId, levels, mode) }
      : p
  );
  return { ...program, profiles };
}

/**
 * Indique si une cible (commun ou persona) a DÉJÀ du contenu pour au moins un des
 * niveaux à générer — pour proposer Ajouter / Remplacer / Annuler.
 */
export function targetHasContentForLevels(
  packs: ProgramContentPack[] | undefined,
  levelTiers: ProgramLevelTier[],
): boolean {
  return (packs ?? []).some(
    (p) => p.levelTier && levelTiers.includes(p.levelTier) && countContent(p) > 0
  );
}
