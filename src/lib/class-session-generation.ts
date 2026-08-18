/**
 * Mode Classe — génération du contenu d'une séance depuis le cours de l'enseignant.
 *
 * Pont entre le wizard de séance et la chaîne IA **déjà opérationnelle** pour les
 * programmes partenaires. Aucune brique nouvelle n'est inventée :
 *
 *   dépôt du cours (PDF/DOCX/MD/TXT, 25 Mo)
 *     └─ POST /api/extract            → mammoth (DOCX) / pdf-parse (PDF)
 *         └─ saveSessionSourceDoc()   → classSessions/{id}/sourceDocs
 *             └─ getSessionSourceText() injecté comme `sourceText` dans le prompt
 *                 └─ POST /api/generate (type `class_session_content`)
 *                     └─ quiz, duels, financements, opportunités ancrés sur SON cours
 *
 * NORMALISATION — ce module refuse de faire confiance à la sortie du modèle. Les
 * catégories sont ramenées de force dans la liste fermée et la difficulté est
 * comblée si elle manque, sans quoi le rapport par notion du lot 6 aurait des
 * trous ou des catégories fantômes. Ce n'est pas de la défiance gratuite : c'est
 * la même précaution que `assignIds` dans `studio-generation.ts`.
 */

import { appelerExtraction, appelerGeneration } from '@/lib/ai-client';
import { CATEGORIES_QUIZ, type CategorieQuiz } from '@/lib/ai-prompts';
import {
  getSessionSourceText,
  saveSessionSourceDoc,
  type SeanceSourceDoc,
} from '@/lib/class-session-service';
import type {
  ChallengeEvent,
  ClassSessionContent,
  DifficultyLevel,
  Duel,
  Funding,
  Opportunity,
  Quiz,
} from '@/types';

/** Nombre de cartes demandées par type. */
export interface MixSeance {
  /** Nombre de quiz. */
  quiz: number;
  /** Nombre de duels. */
  duel: number;
  /** Nombre de financements. */
  funding: number;
  /** Nombre d'opportunités. */
  opportunity: number;
  /** Nombre de défis. */
  challenge: number;
}

/**
 * Mix par défaut, calé sur une séance de 30 minutes.
 *
 * Le quiz domine volontairement : c'est le seul type qui porte une `category` et
 * une `difficulty`, donc le seul qui alimente le rapport de notions maîtrisées.
 * Une séance riche en événements et pauvre en quiz produirait un rapport vide.
 */
export const MIX_SEANCE_DEFAUT: MixSeance = {
  quiz: 8,
  duel: 3,
  funding: 3,
  opportunity: 3,
  challenge: 3,
};

/**
 * Adapte le mix à la durée de la séance.
 *
 * Règle simple et assumée : ~1 quiz toutes les 3 minutes de jeu, les événements
 * restant stables (ils ponctuent la partie, ils ne la rythment pas). Mieux vaut
 * une règle lisible qu'un modèle de charge cognitive invérifiable.
 */
export function mixPourDuree(durationMinutes: number): MixSeance {
  const quiz = Math.max(5, Math.min(15, Math.round(durationMinutes / 3)));
  return { ...MIX_SEANCE_DEFAUT, quiz };
}

/** Contexte passé au prompt pour ancrer le contenu sur la séance. */
export interface ContexteGeneration {
  /** Nom de la classe (ex. « Terminale S2 »). */
  className?: string;
  /** Niveau d'enseignement, en clair (ex. « Lycée »). */
  schoolLevel?: string;
  /** Durée de la séance, en minutes. */
  durationMinutes?: number;
  /** Intitulé donné par l'enseignant. */
  sessionTitle?: string;
}

/**
 * Dépose un cours sur une séance : extraction du texte puis stockage.
 *
 * Le fichier ORIGINAL n'est pas uploadé dans Storage ici, contrairement à l'écran
 * des programmes. Raison : le cours d'un enseignant n'a pas à être re-consulté
 * depuis le back-office, seul son texte sert à la génération — et ne pas le
 * stocker réduit d'autant la surface de données scolaires conservées. Un
 * enseignant qui veut joindre le document aux élèves passe par `attachmentUrls`.
 *
 * @throws Error si l'extraction échoue (format non supporté, PDF scanné, 401…).
 */
export async function deposerCours(sessionId: string, file: File): Promise<SeanceSourceDoc> {
  const res = await appelerExtraction(file);
  const extrait = await res.json();
  if (!res.ok || extrait.error) {
    throw new Error(extrait.error || "Extraction impossible : vérifiez le format du fichier.");
  }

  const docId = `src_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return saveSessionSourceDoc(
    sessionId,
    docId,
    { name: file.name, pages: extrait.pages ?? 0 },
    extrait.text as string
  );
}

/**
 * Génère le contenu d'une séance à partir des cours déjà déposés.
 *
 * @param sessionId  Séance dont on lit les `sourceDocs`.
 * @param consignes  Instructions libres de l'enseignant (peut être vide).
 * @param mix        Quantités demandées par type.
 * @param contexte   Classe, niveau, durée — injectés dans le prompt.
 * @throws Error si l'API échoue ou renvoie autre chose qu'un objet.
 */
export async function genererContenuSeance(
  sessionId: string,
  consignes: string,
  mix: MixSeance,
  contexte: ContexteGeneration
): Promise<ClassSessionContent> {
  const sourceText = await getSessionSourceText(sessionId).catch(() => '');

  const res = await appelerGeneration({
    type: 'class_session_content',
    prompt: consignes,
    context: { ...contexte, mix, sourceText },
  });

  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || 'Génération impossible.');

  return normaliserContenu(json.data, `s${Date.now().toString(36)}`);
}

/**
 * Génère un COMPLÉMENT de contenu et le fusionne à l'existant.
 *
 * Pas de collision d'ids possible : chaque appel de génération pose son propre
 * seed horodaté (`s<epoch36>`), le complément vit donc dans un espace d'ids
 * disjoint de l'existant.
 *
 * Deux garde-fous propres à l'AJOUT :
 *   - les questions déjà présentes sont citées au modèle avec interdiction de
 *     les reproduire — sans ça, le même cours redonne à peu près les mêmes
 *     quiz, et « ajouter 5 quiz » fabriquerait surtout des doublons de sens ;
 *   - chaque type est TRONQUÉ à la quantité demandée : un mix partiel (que des
 *     quiz, zéro duel) doit produire exactement ça, même si le modèle déborde.
 */
export async function genererContenuSupplementaire(
  sessionId: string,
  consignes: string,
  mix: MixSeance,
  contexte: ContexteGeneration,
  existant: ClassSessionContent
): Promise<ClassSessionContent> {
  const dejaPosees = [
    ...existant.quizzes.map((q) => q.question),
    ...existant.duels.map((d) => d.question),
  ].filter(Boolean);

  const consignesEnrichies = dejaPosees.length
    ? `${consignes ? `${consignes}\n\n` : ''}Ne génère AUCUNE question identique ou proche de celles-ci, déjà posées dans cette séance :\n- ${dejaPosees.join('\n- ')}`
    : consignes;

  const complement = await genererContenuSeance(sessionId, consignesEnrichies, mix, contexte);

  return {
    ...existant,
    quizzes: [...existant.quizzes, ...complement.quizzes.slice(0, Math.max(0, mix.quiz))],
    duels: [...existant.duels, ...complement.duels.slice(0, Math.max(0, mix.duel))],
    fundings: [...existant.fundings, ...complement.fundings.slice(0, Math.max(0, mix.funding))],
    opportunities: [
      ...existant.opportunities,
      ...complement.opportunities.slice(0, Math.max(0, mix.opportunity)),
    ],
    challengeEvents: [
      ...existant.challengeEvents,
      ...complement.challengeEvents.slice(0, Math.max(0, mix.challenge)),
    ],
  };
}

// ===== NORMALISATION DE LA SORTIE DU MODÈLE =====

/** Lit une valeur de champ sur un objet inconnu. */
function champ(source: unknown, cle: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined;
  return (source as Record<string, unknown>)[cle];
}

/** Retourne le tableau porté par `cle`, ou un tableau vide. */
function tableau(source: unknown, cle: string): unknown[] {
  const valeur = champ(source, cle);
  return Array.isArray(valeur) ? valeur : [];
}

/** Chaîne nettoyée, ou `''`. */
function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

/** Nombre fini, ou la valeur par défaut. */
function nombre(valeur: unknown, defaut: number): number {
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  return Number.isFinite(n) ? n : defaut;
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
    .replace(/[\u0300-\u036f]/g, '');
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

/**
 * Convertit la réponse brute du modèle en `ClassSessionContent` typé et sûr.
 *
 * Les éléments inexploitables sont ÉCARTÉS plutôt que réparés : un quiz sans
 * question ou sans options n'est pas jouable, l'afficher à l'enseignant dans
 * l'aperçu ne ferait que lui donner du ménage à faire.
 */
export function normaliserContenu(brut: unknown, seed: string): ClassSessionContent {
  const quizzes: Quiz[] = tableau(brut, 'quizzes')
    .map((q, i): Quiz | null => {
      const question = texte(champ(q, 'question'));
      const options = tableau(q, 'options').map(texte).filter(Boolean);
      if (!question || options.length < 2) return null;
      const index = Math.round(nombre(champ(q, 'correctAnswer'), 0));
      return {
        id: `quiz_${seed}_${i}`,
        question,
        options,
        // Un index hors bornes rendrait la question ingagnable : on le borne.
        correctAnswer: Math.min(Math.max(index, 0), options.length - 1),
        category: normaliserCategorie(champ(q, 'category')),
        difficulty: normaliserDifficulte(champ(q, 'difficulty')),
        explanation: texte(champ(q, 'explanation')) || undefined,
      };
    })
    .filter((q): q is Quiz => q !== null);

  const duels: Duel[] = tableau(brut, 'duels')
    .map((d, i): Duel | null => {
      const question = texte(champ(d, 'question'));
      const options = tableau(d, 'options')
        .map((o) => ({ text: texte(champ(o, 'text')), points: Math.round(nombre(champ(o, 'points'), 10)) }))
        .filter((o) => o.text);
      if (!question || options.length < 2) return null;
      return {
        id: `duel_${seed}_${i}`,
        question,
        options,
        category: normaliserCategorie(champ(d, 'category')),
      };
    })
    .filter((d): d is Duel => d !== null);

  const fundings: Funding[] = tableau(brut, 'fundings')
    .map((f, i): Funding | null => {
      const title = texte(champ(f, 'title'));
      if (!title) return null;
      return {
        id: `fund_${seed}_${i}`,
        title,
        description: texte(champ(f, 'description')),
        // Un financement à jetons négatifs se comporterait comme un défi :
        // on force le signe attendu par le moteur de jeu.
        tokens: Math.max(1, Math.abs(Math.round(nombre(champ(f, 'tokens'), 3)))),
        source: texte(champ(f, 'source')) || undefined,
      };
    })
    .filter((f): f is Funding => f !== null);

  const opportunities: Opportunity[] = tableau(brut, 'opportunities')
    .map((o, i): Opportunity | null => {
      const title = texte(champ(o, 'title'));
      if (!title) return null;
      return {
        id: `opp_${seed}_${i}`,
        title,
        description: texte(champ(o, 'description')),
        tokens: Math.max(1, Math.abs(Math.round(nombre(champ(o, 'tokens'), 2)))),
      };
    })
    .filter((o): o is Opportunity => o !== null);

  const challengeEvents: ChallengeEvent[] = tableau(brut, 'challengeEvents')
    .map((c, i): ChallengeEvent | null => {
      const title = texte(champ(c, 'title'));
      if (!title) return null;
      return {
        id: `chal_${seed}_${i}`,
        title,
        description: texte(champ(c, 'description')),
        // Symétrique des financements : un défi doit coûter des jetons.
        tokens: -Math.max(1, Math.abs(Math.round(nombre(champ(c, 'tokens'), 2)))),
      };
    })
    .filter((c): c is ChallengeEvent => c !== null);

  return { quizzes, duels, fundings, opportunities, challengeEvents, generatedAt: Date.now() };
}
