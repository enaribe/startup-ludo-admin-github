/**
 * Studio de contenu — représentation unifiée des cartes pour l'éditeur 3 colonnes.
 *
 * Le contenu d'un programme est éclaté en 5 listes typées (quizzes, duels, fundings,
 * opportunities, challengeEvents) réparties dans des contentPacks. Pour la vue Studio
 * (liste à gauche / éditeur au centre), on aplatit tout en une liste de `StudioCard`
 * portant son origine (packIndex + type + index) afin de pouvoir ré-écrire la modif
 * au bon endroit dans le PartnerProgram.
 */

import type {
  PartnerProgram, ProgramContentPack, ProgramLevelTier,
  Quiz, Duel, Funding, Opportunity, ChallengeEvent,
} from '@/types';

export type StudioCardType = 'quiz' | 'duel' | 'funding' | 'opportunity' | 'challenge';

/** Métadonnées d'affichage par type (couleur, libellé, filtre court). */
export const CARD_META: Record<StudioCardType, { label: string; short: string; color: string }> = {
  opportunity: { label: 'Opportunité', short: 'Opp.', color: '#3FAE6B' },
  challenge: { label: 'Challenge', short: 'Chal.', color: '#E5484D' },
  funding: { label: 'Financement', short: 'Fin.', color: '#F5A623' },
  quiz: { label: 'Quiz', short: 'Quiz', color: '#5B8DEF' },
  duel: { label: 'Duel', short: 'Duel', color: '#9B59B6' },
};

/** Ordre d'affichage des filtres (cf. maquette : Opp · Chal · Fin · Quiz · Duel). */
export const CARD_TYPE_ORDER: StudioCardType[] = ['opportunity', 'challenge', 'funding', 'quiz', 'duel'];

const TIER_LABEL: Record<ProgramLevelTier, string> = {
  idea: 'Idée', preparation: 'Préparation', launch: 'Lancement', development: 'Développement',
};
const TIER_NUM: Record<ProgramLevelTier, number> = { idea: 1, preparation: 2, launch: 3, development: 4 };

/** Localisation d'une carte dans le programme (pour réécrire après édition). */
export interface CardRef {
  packIndex: number;
  type: StudioCardType;
  index: number;
}

/** Carte unifiée affichée dans la liste / l'éditeur. */
export interface StudioCard {
  ref: CardRef;
  id: string;
  type: StudioCardType;
  /** Titre/question affiché dans la liste et l'éditeur. */
  title: string;
  /** Effet jetons (tokens) — pour funding/opportunity/challenge. undefined pour quiz/duel. */
  tokens?: number;
  /** Numéro de niveau (1–4) déduit du levelTier du pack, ou null. */
  levelNum: number | null;
  levelLabel: string | null;
  /** Données brutes typées (pour l'éditeur détaillé). */
  data: Quiz | Duel | Funding | Opportunity | ChallengeEvent;
}

const TYPE_TO_LIST: Record<StudioCardType, keyof Pick<ProgramContentPack, 'quizzes' | 'duels' | 'fundings' | 'opportunities' | 'challengeEvents'>> = {
  quiz: 'quizzes', duel: 'duels', funding: 'fundings', opportunity: 'opportunities', challenge: 'challengeEvents',
};

function titleOf(type: StudioCardType, data: Quiz | Duel | Funding | Opportunity | ChallengeEvent): string {
  if (type === 'quiz' || type === 'duel') return (data as Quiz | Duel).question || 'Sans titre';
  return (data as Funding | Opportunity | ChallengeEvent).title || 'Sans titre';
}

/** Aplatit tous les contentPacks d'un programme en une liste de StudioCard. */
export function flattenCards(packs: ProgramContentPack[]): StudioCard[] {
  const out: StudioCard[] = [];
  packs.forEach((pack, packIndex) => {
    const levelNum = pack.levelTier ? TIER_NUM[pack.levelTier] : null;
    const levelLabel = pack.levelTier ? TIER_LABEL[pack.levelTier] : null;
    (CARD_TYPE_ORDER).forEach((type) => {
      const list = pack[TYPE_TO_LIST[type]] as (Quiz | Duel | Funding | Opportunity | ChallengeEvent)[];
      list.forEach((data, index) => {
        const tokens = (type === 'funding' || type === 'opportunity' || type === 'challenge')
          ? (data as Funding | Opportunity | ChallengeEvent).tokens
          : undefined;
        out.push({
          ref: { packIndex, type, index },
          id: data.id,
          type,
          title: titleOf(type, data),
          tokens,
          levelNum,
          levelLabel,
          data,
        });
      });
    });
  });
  return out;
}

/** Total de cartes dans tous les packs. */
export function totalCards(packs: ProgramContentPack[]): number {
  return packs.reduce((s, p) =>
    s + p.quizzes.length + p.duels.length + p.fundings.length + p.opportunities.length + p.challengeEvents.length, 0);
}

/** Réécrit une carte éditée dans les contentPacks (immutable). */
export function updateCardInPacks(
  packs: ProgramContentPack[],
  ref: CardRef,
  data: Quiz | Duel | Funding | Opportunity | ChallengeEvent,
): ProgramContentPack[] {
  const listKey = TYPE_TO_LIST[ref.type];
  return packs.map((pack, pi) => {
    if (pi !== ref.packIndex) return pack;
    const list = [...(pack[listKey] as unknown[])];
    list[ref.index] = data;
    return { ...pack, [listKey]: list };
  });
}

/** Supprime une carte des contentPacks (immutable). */
export function removeCardFromPacks(packs: ProgramContentPack[], ref: CardRef): ProgramContentPack[] {
  const listKey = TYPE_TO_LIST[ref.type];
  return packs.map((pack, pi) => {
    if (pi !== ref.packIndex) return pack;
    const list = (pack[listKey] as unknown[]).filter((_, i) => i !== ref.index);
    return { ...pack, [listKey]: list };
  });
}

export { TIER_LABEL };
export type ProgramPacks = PartnerProgram['contentPacks'];
