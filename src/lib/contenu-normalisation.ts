/**
 * Normalisation des champs énumérés d'une carte de jeu — fonctions PURES.
 *
 * ═══ POURQUOI UN MODULE À PART ═══
 *
 * Ces deux fonctions vivaient dans `class-session-generation.ts`, qui importe
 * `class-session-service` et donc le SDK Firestore. Tout module voulant
 * normaliser une catégorie héritait de cette dépendance : impossible à tester
 * sans talon réseau, et chargée pour rien dans le bundle.
 *
 * Rien ici ne touche au réseau ni à l'état. `class-session-generation.ts` les
 * réexporte, les appelants existants n'ont pas changé.
 */
import { CATEGORIES_QUIZ, type CategorieQuiz } from '@/lib/ai-prompts';
import type { DifficultyLevel } from '@/types';

/** Chaîne nettoyée, ou `''`. */
function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

/**
 * Ramène une catégorie dans la liste fermée.
 *
 * Le modèle respecte la consigne la plupart du temps, mais pas toujours : il
 * produit « Business Model », « Financement des startups », ou une catégorie
 * inédite. Sans ce filet, une seule dérive suffit à recréer le foisonnement que
 * la liste fermée existe précisément pour empêcher — et le rapport du lot 6
 * afficherait deux lignes pour la même notion.
 *
 * Repli sur `strategie` : c'est la catégorie la plus large, et il vaut mieux une
 * question mal rangée qu'une catégorie hors liste dans les statistiques.
 */
export function normaliserCategorie(valeur: unknown): CategorieQuiz {
  const brut = texte(valeur)
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    // Retire les accents : « stratégie » doit tomber sur « strategie ».
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const exact = CATEGORIES_QUIZ.find((c) => c === brut);
  if (exact) return exact;
  // Correspondance partielle : « business-model-canvas » → « business-model ».
  // Le seuil de 3 caractères évite qu'une catégorie absente ou d'une lettre
  // tombe sur la première de la liste par simple inclusion de sous-chaîne.
  const partiel =
    brut.length >= 3
      ? CATEGORIES_QUIZ.find((c) => brut.includes(c) || c.includes(brut))
      : undefined;
  return partiel ?? 'strategie';
}

/** Difficultés acceptées. */
const DIFFICULTES: DifficultyLevel[] = ['facile', 'moyen', 'difficile'];

/**
 * Ramène une difficulté dans les trois valeurs acceptées.
 *
 * Repli sur `moyen` quand le champ est absent : le laisser vide priverait le lot 6
 * de la dérivation du niveau N1–N4 sur cette question, ce qui est exactement le
 * défaut constaté sur les 130 quiz historiques.
 */
export function normaliserDifficulte(valeur: unknown): DifficultyLevel {
  const brut = texte(valeur).toLowerCase();
  return DIFFICULTES.find((d) => d === brut) ?? 'moyen';
}
