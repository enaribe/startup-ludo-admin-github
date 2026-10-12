/**
 * Import d'un contenu de défi fourni en JSON.
 *
 * ═══ POURQUOI UN VALIDATEUR DISTINCT DE `normaliserContenu` ═══
 *
 * `normaliserContenu()` (class-session-generation.ts) traite la sortie d'un
 * MODÈLE : elle écarte silencieusement les cartes inexploitables et répare les
 * champs douteux. C'est le bon comportement là-bas — on ne renvoie pas l'IA à
 * sa copie, et l'aperçu ne doit pas afficher du ménage à faire.
 *
 * C'est le MAUVAIS comportement pour un fichier écrit à la main. Un auteur qui
 * dépose 12 quiz et en voit arriver 9 n'a aucun moyen de savoir lesquels sont
 * tombés ni pourquoi. Ici on RAPPORTE, avec la position exacte dans le fichier.
 *
 * ═══ BLOQUANT vs CORRIGÉ ═══
 *
 * Deux catégories, et la distinction n'est pas cosmétique :
 *
 *   - ERREUR : la carte n'est pas jouable (pas de question, moins de 2 options,
 *     `correctAnswer` hors bornes). Rien n'est importé tant qu'il en reste une.
 *     Importer partiellement donnerait un défi silencieusement amputé.
 *
 *   - CORRECTION : un champ optionnel absent ou un signe de jetons à l'envers.
 *     Appliquée et SIGNALÉE. Un `challengeEvents` à +3 jetons ne plante pas :
 *     il offre un cadeau là où le moteur attend une pénalité. Le défaut est
 *     invisible en partie, donc il doit être visible à l'import.
 *
 * ═══ LES IDS SONT RÉÉCRITS ═══
 *
 * Les ids du fichier sont ignorés et remplacés par `<type>_<seed>_<i>`, comme
 * à la génération. Deux cartes partageant un id casseraient le suivi des
 * événements déjà tirés dans `EventManager` (il déduplique par id) : une seule
 * des deux serait jouée. Un fichier écrit à la main en contient tôt ou tard.
 */
import { normaliserCategorie, normaliserDifficulte } from '@/lib/contenu-normalisation';
import type {
  ChallengeEvent,
  ClassSessionContent,
  Duel,
  Funding,
  Opportunity,
  Quiz,
} from '@/types';

/** Les cinq listes attendues, dans l'ordre de `ClassSessionContent`. */
export const LISTES_CONTENU = [
  'quizzes',
  'duels',
  'fundings',
  'opportunities',
  'challengeEvents',
] as const;

export type ListeContenu = (typeof LISTES_CONTENU)[number];

/** Libellés français des listes, pour les messages d'erreur. */
const LIBELLES: Record<ListeContenu, string> = {
  quizzes: 'Quiz',
  duels: 'Duel',
  fundings: 'Financement',
  opportunities: 'Opportunité',
  challengeEvents: 'Challenge',
};

/** Un problème relevé sur une carte, situé pour être retrouvé dans le fichier. */
export interface AnomalieImport {
  /** `true` si la carte est injouable : l'import entier est refusé. */
  bloquant: boolean;
  /** Ex. « Quiz #4 » — l'index est celui du FICHIER, 1-based pour l'auteur. */
  ou: string;
  message: string;
}

export interface ResultatImport {
  /** Le contenu prêt à enregistrer, ou `null` si une erreur bloquante reste. */
  contenu: ClassSessionContent | null;
  anomalies: AnomalieImport[];
  /** Nombre de cartes retenues par liste (vide si refusé). */
  comptes: Record<ListeContenu, number>;
}

// ═══════════════════════════════════════════════════════════════════════════
// LECTURE DE CHAMPS
// ═══════════════════════════════════════════════════════════════════════════

function champ(source: unknown, cle: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined;
  return (source as Record<string, unknown>)[cle];
}

function texte(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

/** Nombre fini, ou `null` — pour distinguer « absent » de « zéro ». */
function nombreOuNull(valeur: unknown): number | null {
  if (valeur === null || valeur === undefined || valeur === '') return null;
  const n = typeof valeur === 'number' ? valeur : Number(valeur);
  return Number.isFinite(n) ? n : null;
}

/**
 * Les options d'un quiz, acceptées sous deux formes.
 *
 * Un auteur écrit naturellement `["a","b","c"]`, mais celui qui a vu un duel
 * écrira `[{text:"a"}]` par mimétisme. Accepter les deux évite une erreur dont
 * la cause serait difficile à deviner depuis le message.
 */
function optionsTexte(valeur: unknown): string[] {
  if (!Array.isArray(valeur)) return [];
  return valeur
    .map((o) => (typeof o === 'string' ? o.trim() : texte(champ(o, 'text'))))
    .filter(Boolean);
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convertit un JSON quelconque en contenu de jeu, en rapportant tout écart.
 *
 * Accepte trois enveloppes : les cinq listes à la racine, ou sous `contenu`,
 * ou sous `content`. Un export de ce même écran se réimporte donc tel quel.
 *
 * @param seed Suffixe d'ids. Horodaté par l'appelant : réimporter ne doit pas
 *   recréer les ids du contenu précédent, que des parties en cours ont déjà vus.
 */
export function importerContenuJson(brut: unknown, seed: string): ResultatImport {
  const anomalies: AnomalieImport[] = [];
  const comptes: Record<ListeContenu, number> = {
    quizzes: 0,
    duels: 0,
    fundings: 0,
    opportunities: 0,
    challengeEvents: 0,
  };

  const refus = (message: string): ResultatImport => ({
    contenu: null,
    anomalies: [{ bloquant: true, ou: 'Fichier', message }],
    comptes,
  });

  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) {
    return refus(
      'Le fichier doit contenir un objet JSON avec les listes quizzes, duels, fundings, opportunities, challengeEvents.'
    );
  }

  // L'enveloppe : racine, ou `contenu`/`content` (forme de l'export).
  const racine = (() => {
    for (const cle of ['contenu', 'content']) {
      const interne = champ(brut, cle);
      if (typeof interne === 'object' && interne !== null && !Array.isArray(interne)) {
        // On ne descend que si l'enveloppe porte VRAIMENT des listes connues :
        // sinon un champ `content` textuel ferait perdre les listes de la racine.
        if (LISTES_CONTENU.some((l) => Array.isArray(champ(interne, l)))) return interne;
      }
    }
    return brut;
  })();

  const presentes = LISTES_CONTENU.filter((l) => Array.isArray(champ(racine, l)));
  if (presentes.length === 0) {
    return refus(
      'Aucune liste reconnue. Attendu au moins une de : quizzes, duels, fundings, opportunities, challengeEvents.'
    );
  }

  /* Une clé mal orthographiée serait sinon ignorée en silence et l'auteur
     chercherait longtemps pourquoi ses 10 quiz n'arrivent pas. */
  for (const cle of Object.keys(racine as Record<string, unknown>)) {
    if ((LISTES_CONTENU as readonly string[]).includes(cle)) continue;
    if (!Array.isArray(champ(racine, cle))) continue;
    anomalies.push({
      bloquant: false,
      ou: 'Fichier',
      message: `La liste « ${cle} » est ignorée : ce n'est pas un type de carte reconnu.`,
    });
  }

  const liste = (cle: ListeContenu): unknown[] => {
    const v = champ(racine, cle);
    return Array.isArray(v) ? v : [];
  };

  /** Position lisible par l'auteur : 1-based, comme il compte ses entrées. */
  const ou = (cle: ListeContenu, i: number): string => `${LIBELLES[cle]} #${i + 1}`;

  // ─── Quiz ───
  const quizzes: Quiz[] = [];
  liste('quizzes').forEach((q, i) => {
    const place = ou('quizzes', i);
    const question = texte(champ(q, 'question'));
    const options = optionsTexte(champ(q, 'options'));

    if (!question) {
      anomalies.push({ bloquant: true, ou: place, message: 'Champ « question » manquant ou vide.' });
      return;
    }
    if (options.length < 2) {
      anomalies.push({
        bloquant: true,
        ou: place,
        message: `Il faut au moins 2 options (${options.length} trouvée${options.length > 1 ? 's' : ''}).`,
      });
      return;
    }

    /*
      `correctAnswer` est un INDEX dans `options`, 0-based. C'est l'erreur la
      plus coûteuse du format : un index hors bornes rend la question
      ingagnable, et un décalage de 1 (l'auteur compte à partir de 1) valide
      systématiquement la mauvaise réponse. Aucune des deux ne se voit à la
      relecture du texte — donc on refuse au lieu de borner.
    */
    const index = nombreOuNull(champ(q, 'correctAnswer'));
    if (index === null) {
      anomalies.push({
        bloquant: true,
        ou: place,
        message: 'Champ « correctAnswer » manquant : index de la bonne réponse, à partir de 0.',
      });
      return;
    }
    if (!Number.isInteger(index) || index < 0 || index >= options.length) {
      anomalies.push({
        bloquant: true,
        ou: place,
        message: `« correctAnswer » vaut ${index} : attendu un entier entre 0 et ${options.length - 1} (index dans « options », le premier étant 0).`,
      });
      return;
    }

    const categorieBrute = texte(champ(q, 'category'));
    const categorie = normaliserCategorie(categorieBrute);
    if (categorieBrute && categorieBrute !== categorie) {
      anomalies.push({
        bloquant: false,
        ou: place,
        message: `Catégorie « ${categorieBrute} » ramenée à « ${categorie} ».`,
      });
    } else if (!categorieBrute) {
      anomalies.push({
        bloquant: false,
        ou: place,
        message: `Catégorie absente : « ${categorie} » par défaut.`,
      });
    }

    quizzes.push({
      id: `quiz_${seed}_${i}`,
      question,
      options,
      correctAnswer: index,
      category: categorie,
      difficulty: normaliserDifficulte(champ(q, 'difficulty')),
      explanation: texte(champ(q, 'explanation')) || undefined,
    });
  });

  // ─── Duels ───
  const duels: Duel[] = [];
  liste('duels').forEach((d, i) => {
    const place = ou('duels', i);
    const question = texte(champ(d, 'question'));
    if (!question) {
      anomalies.push({ bloquant: true, ou: place, message: 'Champ « question » manquant ou vide.' });
      return;
    }

    /*
      Un duel n'a pas d'options textuelles : chacune porte des POINTS (30 / 20 /
      10). C'est la différence de forme la plus facile à rater — un auteur qui a
      écrit ses quiz juste avant produira `["a","b","c"]` par réflexe. On le dit
      explicitement plutôt que d'inventer des points.
    */
    const brutOptions = champ(d, 'options');
    if (!Array.isArray(brutOptions) || brutOptions.length < 2) {
      anomalies.push({
        bloquant: true,
        ou: place,
        message: 'Il faut au moins 2 options, chacune de la forme { "text": "…", "points": 30 }.',
      });
      return;
    }
    if (brutOptions.some((o) => typeof o === 'string')) {
      anomalies.push({
        bloquant: true,
        ou: place,
        message:
          'Les options d’un duel ne sont pas du texte simple : chacune s’écrit { "text": "…", "points": 30 } — 30 pour la meilleure réponse, 20 pour une bonne, 10 pour une acceptable.',
      });
      return;
    }

    const options = brutOptions.map((o) => ({
      text: texte(champ(o, 'text')),
      points: nombreOuNull(champ(o, 'points')),
    }));
    const sansTexte = options.findIndex((o) => !o.text);
    if (sansTexte >= 0) {
      anomalies.push({
        bloquant: true,
        ou: place,
        message: `Option ${sansTexte + 1} sans « text ».`,
      });
      return;
    }
    const sansPoints = options.findIndex((o) => o.points === null);
    if (sansPoints >= 0) {
      anomalies.push({
        bloquant: true,
        ou: place,
        message: `Option ${sansPoints + 1} sans « points » : 30 (meilleure), 20 (bonne) ou 10 (acceptable).`,
      });
      return;
    }

    duels.push({
      id: `duel_${seed}_${i}`,
      question,
      options: options.map((o) => ({ text: o.text, points: Math.round(o.points as number) })),
      category: normaliserCategorie(champ(d, 'category')),
    });
  });

  /**
   * Les trois listes titre + description + jetons, de forme identique.
   *
   * `signe` vaut +1 pour financements et opportunités, -1 pour les challenges.
   * Le moteur de jeu n'inspecte pas le type de la carte : il ADDITIONNE
   * `tokens`. Un challenge à +3 offrirait donc des jetons. On force le signe et
   * on le signale, parce que rien ne révélerait l'erreur en partie.
   */
  const lireTitreDesc = (
    cle: Extract<ListeContenu, 'fundings' | 'opportunities' | 'challengeEvents'>,
    prefixe: string,
    signe: 1 | -1,
    defautJetons: number
  ) => {
    const sortie: { id: string; title: string; description: string; tokens: number; source?: string }[] = [];
    liste(cle).forEach((c, i) => {
      const place = ou(cle, i);
      const title = texte(champ(c, 'title'));
      if (!title) {
        anomalies.push({ bloquant: true, ou: place, message: 'Champ « title » manquant ou vide.' });
        return;
      }
      const description = texte(champ(c, 'description'));
      if (!description) {
        anomalies.push({
          bloquant: false,
          ou: place,
          message: 'Description absente : la carte s’affichera avec son seul titre.',
        });
      }

      const brutJetons = nombreOuNull(champ(c, 'tokens'));
      if (brutJetons === null) {
        anomalies.push({
          bloquant: false,
          ou: place,
          message: `Jetons absents : ${signe * defautJetons} par défaut.`,
        });
      }
      const magnitude = Math.max(1, Math.abs(Math.round(brutJetons ?? defautJetons)));
      const tokens = signe * magnitude;
      if (brutJetons !== null && Math.sign(brutJetons) !== 0 && Math.sign(brutJetons) !== signe) {
        anomalies.push({
          bloquant: false,
          ou: place,
          message:
            signe === -1
              ? `Jetons ${brutJetons} → ${tokens} : un challenge COÛTE des jetons, le signe a été corrigé.`
              : `Jetons ${brutJetons} → ${tokens} : cette carte RAPPORTE des jetons, le signe a été corrigé.`,
        });
      }

      const entree: { id: string; title: string; description: string; tokens: number; source?: string } = {
        id: `${prefixe}_${seed}_${i}`,
        title,
        description,
        tokens,
      };
      if (cle === 'fundings') {
        const source = texte(champ(c, 'source'));
        if (source) entree.source = source;
      }
      sortie.push(entree);
    });
    return sortie;
  };

  const fundings = lireTitreDesc('fundings', 'fund', 1, 3) as Funding[];
  const opportunities = lireTitreDesc('opportunities', 'opp', 1, 2) as Opportunity[];
  const challengeEvents = lireTitreDesc('challengeEvents', 'chal', -1, 2) as ChallengeEvent[];

  comptes.quizzes = quizzes.length;
  comptes.duels = duels.length;
  comptes.fundings = fundings.length;
  comptes.opportunities = opportunities.length;
  comptes.challengeEvents = challengeEvents.length;

  /*
    RIEN n'est importé s'il reste une erreur bloquante. Importer les cartes
    valides et taire les autres livrerait un défi amputé sans que l'auteur le
    sache — et il n'y a pas de « moitié de défi » acceptable : le classement
    compare des joueurs sur la même épreuve.
  */
  if (anomalies.some((a) => a.bloquant)) {
    return { contenu: null, anomalies, comptes };
  }

  const total = quizzes.length + duels.length + fundings.length + opportunities.length + challengeEvents.length;
  if (total === 0) {
    return {
      contenu: null,
      anomalies: [
        ...anomalies,
        { bloquant: true, ou: 'Fichier', message: 'Aucune carte à importer : toutes les listes sont vides.' },
      ],
      comptes,
    };
  }

  return {
    contenu: { quizzes, duels, fundings, opportunities, challengeEvents, generatedAt: Date.now() },
    anomalies,
    comptes,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MODÈLE DE FICHIER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Un exemple complet des cinq types de cartes, à télécharger depuis l'écran.
 *
 * ═══ POURQUOI UN MODÈLE PLUTÔT QU'UNE DOCUMENTATION ═══
 *
 * Le format a trois subtilités qu'aucune liste de champs ne fait retenir :
 * `correctAnswer` est un index à partir de 0, les options d'un duel portent des
 * points (et ne sont donc pas du texte simple), et les jetons d'un challenge
 * sont négatifs. Un fichier qu'on duplique et qu'on remplit évite les trois,
 * là où une page d'aide serait lue après le premier échec.
 *
 * Il est VALIDE tel quel : le télécharger et le réimporter sans rien changer
 * doit fonctionner, sinon le modèle mentirait sur le format qu'il illustre.
 * Le test `modele-json` le vérifie.
 */
export const MODELE_CONTENU_JSON = {
  quizzes: [
    {
      question: 'Quel document présente le modèle économique sur une seule page ?',
      options: ['Le Business Model Canvas', 'Le bilan comptable', 'Le registre de commerce'],
      // Index de la bonne réponse DANS `options`, le premier valant 0.
      correctAnswer: 0,
      category: 'business-model',
      difficulty: 'facile',
      explanation: 'Le Business Model Canvas tient sur une page et couvre neuf blocs.',
    },
  ],
  duels: [
    {
      question: 'Comment valider une idée avant de produire ?',
      // Chaque option porte des POINTS : 30 la meilleure, 20 une bonne, 10 une acceptable.
      options: [
        { text: 'Interroger vingt clients potentiels', points: 30 },
        { text: 'Lancer un sondage en ligne', points: 20 },
        { text: 'Demander à ses proches', points: 10 },
      ],
      category: 'strategie',
    },
  ],
  fundings: [
    {
      title: 'Tontine du quartier',
      description: 'Le groupe d’épargne vous avance la mise de départ.',
      // Positif : un financement RAPPORTE des jetons.
      tokens: 4,
      source: 'Tontine',
    },
  ],
  opportunities: [
    {
      title: 'Commande inattendue',
      description: 'Un commerçant voisin passe une grosse commande.',
      tokens: 3,
    },
  ],
  challengeEvents: [
    {
      title: 'Coupure d’électricité',
      description: 'Deux jours d’activité perdus.',
      // NÉGATIF : un challenge COÛTE des jetons. Le signe est corrigé à
      // l'import s'il est à l'envers, mais autant l'écrire juste.
      tokens: -2,
    },
  ],
};

/** Le modèle, indenté, prêt à télécharger. */
export function modeleContenuJson(): string {
  return JSON.stringify(MODELE_CONTENU_JSON, null, 2);
}
