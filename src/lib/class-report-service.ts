/**
 * Service Mode Classe — SUIVI EN DIRECT et RAPPORT PÉDAGOGIQUE (lot 6).
 *
 * Séparé de `class-session-service.ts` pour une raison précise : ce fichier
 * contient les seules fonctions PURES du Mode Classe. L'agrégation des notions
 * est la partie du produit qui sera lue par une direction d'établissement pour
 * décider d'un renouvellement — elle doit être testable sans Firestore, sans
 * React et sans horloge. Elle l'est : tout ce qui suit `ecouterParticipants` ne
 * prend que des données en entrée et n'appelle ni le réseau ni `Date.now()`.
 *
 * ═══ LE SEUIL DES 3 QUESTIONS ═══
 *
 * Une notion n'est chiffrée que si AU MOINS 3 questions ont été posées dans la
 * séance, toutes réponses d'élèves confondues. En dessous, elle est listée sans
 * pourcentage sous « Notions trop peu évaluées ».
 *
 * Ce n'est pas un raffinement statistique, c'est une protection contre une
 * affirmation fausse : l'audit du contenu a montré que l'édition Classique
 * compte 8 catégories ne portant qu'UNE seule question. Sur une telle base, un
 * seul élève ayant répondu de travers produit « Networking : 0 % » — une phrase
 * indéfendable devant un conseil pédagogique, et statistiquement vide.
 *
 * Le seuil porte sur le NOMBRE DE RÉPONSES, pas sur le nombre d'élèves : trois
 * réponses d'un même élève sur trois quiz distincts d'une notion en disent plus
 * long qu'une réponse unique répétée par trois élèves — et c'est bien le volume
 * de mesure, non l'effectif, qui rend un taux publiable.
 */

import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { firestore, COLLECTIONS } from './firebase';
import type {
  ClassSession,
  ClassSessionParticipant,
  ClassParticipantAnswer,
  Learner,
} from '@/types';

// ═══════════════════════════════════════════════════════════════════════════
// 1. LECTURE FIRESTORE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Nombre minimal de réponses pour qu'une notion soit chiffrée dans le rapport.
 * Exporté pour que l'interface puisse l'expliquer à l'enseignant sans le
 * réécrire en dur — et pour que les tests portent sur la vraie constante.
 */
export const SEUIL_QUESTIONS_NOTION = 3;

/**
 * Convertit un document Firestore en participant, en neutralisant ce que la
 * base peut légitimement contenir de bancal.
 *
 * `answers` est filtré ici et nulle part ailleurs : c'est un tableau construit
 * par `arrayUnion` depuis des dizaines d'appareils, sur plusieurs versions de
 * l'app. Une entrée sans `category` (quiz ancien, champ oublié) ne doit pas
 * créer une notion fantôme intitulée « undefined » dans le rapport d'une
 * direction. On la laisse tomber à l'entrée plutôt que de s'en défendre dans
 * chaque calcul en aval.
 */
function versParticipant(id: string, data: Record<string, unknown>): ClassSessionParticipant {
  const brut = data as Partial<ClassSessionParticipant>;
  const reponses = Array.isArray(brut.answers) ? brut.answers : [];

  return {
    ...brut,
    learnerId: brut.learnerId || id,
    answers: reponses.filter(
      (r): r is ClassParticipantAnswer =>
        !!r && typeof r === 'object' && typeof r.category === 'string' && r.category.trim() !== ''
    ),
  };
}

/**
 * Écoute en temps réel les participants d'UNE séance.
 *
 * ⚠️ PREMIER `onSnapshot` DU BACK-OFFICE — et volontairement le seul. Le coût
 * est borné par construction : une seule sous-collection, d'une seule séance,
 * plafonnée à l'effectif d'une classe (~30 documents). Firestore facture la
 * lecture initiale de ces ~30 documents, puis UNE lecture par document modifié.
 * Le mobile écrivant sous throttle de 10 s, le pire cas d'une séance de 45 min
 * à 30 élèves reste de l'ordre de quelques milliers de lectures — le prix d'un
 * rafraîchissement manuel toutes les 30 secondes, sans le rafraîchissement.
 *
 * Ce qui serait coûteux, et n'est pas fait : écouter la collection racine
 * `classSessions`, ou une `collectionGroup` sur `participants`.
 *
 * @param sessionId Séance observée.
 * @param callback  Appelé à chaque changement avec la liste complète.
 * @param onError   Appelé si l'écoute est refusée (permissions) ou rompue.
 * @returns Fonction de désabonnement — À APPELER au démontage du composant,
 *          sans quoi l'écoute survit à la navigation et continue de facturer.
 */
export function ecouterParticipants(
  sessionId: string,
  callback: (participants: ClassSessionParticipant[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (!sessionId) return () => {};

  return onSnapshot(
    collection(firestore, COLLECTIONS.classSessionParticipants(sessionId)),
    (snap) => callback(snap.docs.map((d) => versParticipant(d.id, d.data()))),
    (error) => onError?.(error)
  );
}

/**
 * Lecture unique des participants — utilisée par le RAPPORT d'une séance
 * terminée, dont les données ne bougent plus.
 *
 * Garder `onSnapshot` sur une séance `ended` reviendrait à payer une écoute
 * ouverte sur des documents figés, potentiellement des heures durant si
 * l'enseignant laisse l'onglet ouvert.
 */
export async function getParticipants(sessionId: string): Promise<ClassSessionParticipant[]> {
  if (!sessionId) return [];
  const snap = await getDocs(collection(firestore, COLLECTIONS.classSessionParticipants(sessionId)));
  return snap.docs.map((d) => versParticipant(d.id, d.data()));
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. CROISEMENT ÉLÈVES × PARTICIPANTS (fonctions pures)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * État d'un élève tel que l'enseignant le lit pendant la séance.
 * `absent` n'existe pas côté mobile : il se déduit de l'ABSENCE de document
 * participant, et c'est l'information la plus utile du suivi — c'est elle qui
 * dit au prof quel élève relancer.
 */
export type EtatEleve = 'absent' | 'en-jeu' | 'termine';

/** Une ligne du suivi : un élève de la classe, avec sa participation éventuelle. */
export interface LigneSuivi {
  /** Identifiant du learner dans la classe. */
  learnerId: string;
  /** Nom affiché, reconstruit depuis la classe (source nominative de référence). */
  nom: string;
  /** État consolidé. */
  etat: EtatEleve;
  /** Case atteinte sur le plateau, 0 si l'élève n'a pas commencé. */
  cellIndex: number;
  /** Cartes jouées, 0 par défaut. */
  cardsPlayed: number;
  /** Score (jetons), 0 par défaut. */
  score: number;
  /** Nombre de réponses de quiz enregistrées. */
  nbReponses: number;
  /** Réponses correctes. */
  nbCorrectes: number;
  /** Dernier signe de vie, en millisecondes epoch (0 si jamais connecté). */
  lastSeenAt: number;
  /** Dernier événement notable remonté par le mobile (flux live, lot M4). */
  lastEvent?: { kind: 'quiz_ok' | 'quiz_ko'; label?: string; at: number };
}

/** Nom affichable d'un élève de la classe. */
function nomEleve(eleve: Learner): string {
  const nom = `${eleve.firstName ?? ''} ${eleve.lastName ?? ''}`.trim();
  return nom || 'Élève sans nom';
}

/**
 * Croise la liste nominative de la classe avec les documents de participation.
 *
 * ═══ POURQUOI LA CLASSE EST LA LISTE DE RÉFÉRENCE, ET NON LES PARTICIPANTS ═══
 *
 * Un suivi construit sur la seule sous-collection `participants` n'afficherait
 * QUE les élèves connectés — c'est-à-dire précisément ceux dont l'enseignant
 * n'a pas à s'occuper. La liste part donc des élèves ACTIFS de la classe, et
 * les documents de participation viennent s'y accrocher.
 *
 * Les élèves retirés (`isActive === false`) sont exclus : ils ne sont plus dans
 * la salle. Mais un participant SANS élève correspondant (retiré de la classe
 * après avoir joué, ou incohérence) est tout de même ajouté en fin de liste :
 * sa contribution existe en base, la masquer donnerait un rapport dont les
 * totaux ne se recoupent pas.
 *
 * TRI : les « pas connecté » d'abord — c'est la demande du terrain, ce sont eux
 * qui appellent une action immédiate. Les autres par progression décroissante.
 *
 * @param eleves       Élèves de la classe (`getLearners`).
 * @param participants Documents de participation de la séance.
 */
export function construireSuivi(
  eleves: Learner[],
  participants: ClassSessionParticipant[]
): LigneSuivi[] {
  const parLearnerId = new Map<string, ClassSessionParticipant>();
  for (const p of participants) {
    if (p.learnerId) parLearnerId.set(p.learnerId, p);
  }

  const lignes: LigneSuivi[] = [];
  const consommes = new Set<string>();

  for (const eleve of eleves) {
    if (eleve.isActive === false) continue;
    const p = parLearnerId.get(eleve.id);
    if (p) consommes.add(eleve.id);
    lignes.push(ligneDepuis(eleve.id, nomEleve(eleve), p));
  }

  // Participants orphelins : jamais silencieux, sinon les totaux du rapport
  // (participation, score moyen) ne correspondraient plus au détail affiché.
  for (const p of participants) {
    if (!p.learnerId || consommes.has(p.learnerId)) continue;
    if (eleves.some((e) => e.id === p.learnerId)) continue;
    lignes.push(ligneDepuis(p.learnerId, p.displayName?.trim() || 'Élève retiré de la classe', p));
  }

  return trierSuivi(lignes);
}

/** Fabrique une ligne de suivi à partir d'un élève et de sa participation. */
function ligneDepuis(
  learnerId: string,
  nom: string,
  p: ClassSessionParticipant | undefined
): LigneSuivi {
  if (!p) {
    return {
      learnerId,
      nom,
      etat: 'absent',
      cellIndex: 0,
      cardsPlayed: 0,
      score: 0,
      nbReponses: 0,
      nbCorrectes: 0,
      lastSeenAt: 0,
    };
  }

  const reponses = p.answers ?? [];
  return {
    learnerId,
    nom,
    // `abandoned` est présenté comme terminé : l'élève a quitté la partie, le
    // prof n'a rien à en faire de plus, et le distinguer ferait passer un
    // départ anticipé pour un incident technique.
    etat: p.status === 'finished' || p.status === 'abandoned' ? 'termine' : 'en-jeu',
    cellIndex: p.progress?.cellIndex ?? 0,
    cardsPlayed: p.progress?.cardsPlayed ?? 0,
    score: p.score ?? p.progress?.tokens ?? 0,
    nbReponses: reponses.length,
    nbCorrectes: reponses.filter((r) => r.correct).length,
    lastSeenAt: p.lastSeenAt ?? p.joinedAt ?? 0,
    ...(p.lastEvent ? { lastEvent: p.lastEvent } : {}),
  };
}

/** Absents en tête, puis progression décroissante, puis score, puis nom. */
function trierSuivi(lignes: LigneSuivi[]): LigneSuivi[] {
  const rang: Record<EtatEleve, number> = { absent: 0, 'en-jeu': 1, termine: 2 };
  return [...lignes].sort((a, b) => {
    if (rang[a.etat] !== rang[b.etat]) return rang[a.etat] - rang[b.etat];
    if (a.etat === 'absent') return a.nom.localeCompare(b.nom, 'fr');
    if (b.cellIndex !== a.cellIndex) return b.cellIndex - a.cellIndex;
    if (b.score !== a.score) return b.score - a.score;
    return a.nom.localeCompare(b.nom, 'fr');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. INDICATEURS DE SÉANCE (fonction pure)
// ═══════════════════════════════════════════════════════════════════════════

/** Chiffres d'en-tête du rapport. */
export interface IndicateursSeance {
  /** Élèves actifs inscrits dans la classe. */
  effectifClasse: number;
  /** Élèves ayant réellement joué (document de participation présent). */
  nbParticipants: number;
  /** Participants ayant terminé leur partie. */
  nbTermines: number;
  /** Score moyen des PARTICIPANTS, arrondi à l'entier. */
  scoreMoyen: number;
  /** Total des cartes jouées, tous participants confondus. */
  cartesJouees: number;
  /** Nombre total de réponses de quiz enregistrées. */
  nbReponses: number;
  /** Réponses correctes, tous participants confondus. */
  nbCorrectes: number;
  /** Taux de réussite global en pourcentage entier, `null` sans aucune réponse. */
  tauxGlobal: number | null;
  /** Durée réelle de la séance en minutes, `null` si les horodatages manquent. */
  dureeReelleMinutes: number | null;
}

/**
 * Calcule les indicateurs d'en-tête.
 *
 * ⚠️ LE SCORE MOYEN PORTE SUR LES PARTICIPANTS, PAS SUR LA CLASSE. Diviser par
 * l'effectif ferait chuter la moyenne à chaque absent, et présenterait comme un
 * résultat pédagogique ce qui n'est qu'un taux de connexion — les deux sont
 * affichés séparément, précisément pour qu'on ne les confonde pas.
 *
 * `dureeReelleMinutes` vient des horodatages de la séance et non de
 * `durationMinutes`, qui n'est qu'une intention de l'enseignant.
 *
 * @param eleves       Élèves de la classe.
 * @param participants Documents de participation.
 * @param seance       Séance, pour ses horodatages (facultative).
 */
export function calculerIndicateurs(
  eleves: Learner[],
  participants: ClassSessionParticipant[],
  seance?: Pick<ClassSession, 'startedAt' | 'endedAt'> | null
): IndicateursSeance {
  const actifs = eleves.filter((e) => e.isActive !== false);
  const reels = participants.filter((p) => !!p.learnerId);

  let cartes = 0;
  let scoreTotal = 0;
  let reponses = 0;
  let correctes = 0;
  let termines = 0;

  for (const p of reels) {
    cartes += p.progress?.cardsPlayed ?? 0;
    scoreTotal += p.score ?? p.progress?.tokens ?? 0;
    if (p.status === 'finished' || p.status === 'abandoned') termines += 1;
    for (const r of p.answers ?? []) {
      reponses += 1;
      if (r.correct) correctes += 1;
    }
  }

  return {
    effectifClasse: actifs.length,
    nbParticipants: reels.length,
    nbTermines: termines,
    scoreMoyen: reels.length > 0 ? Math.round(scoreTotal / reels.length) : 0,
    cartesJouees: cartes,
    nbReponses: reponses,
    nbCorrectes: correctes,
    // `null` et non `0` : « aucune donnée » et « tout est faux » sont deux
    // messages opposés, et l'écran doit pouvoir les distinguer.
    tauxGlobal: reponses > 0 ? Math.round((correctes / reponses) * 100) : null,
    dureeReelleMinutes: dureeReelle(seance),
  };
}

/** Durée effective en minutes entre l'ouverture et la clôture de la séance. */
function dureeReelle(seance?: Pick<ClassSession, 'startedAt' | 'endedAt'> | null): number | null {
  const debut = seance?.startedAt ?? 0;
  const fin = seance?.endedAt ?? 0;
  if (!debut || !fin || fin <= debut) return null;
  return Math.max(1, Math.round((fin - debut) / 60_000));
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. NOTIONS MAÎTRISÉES (fonction pure) — le cœur du rapport
// ═══════════════════════════════════════════════════════════════════════════

/** Verdict pédagogique attaché à un taux de réussite. */
export type NiveauNotion = 'reussi' | 'a-consolider' | 'a-retravailler';

/** Une notion mesurée dans la séance. */
export interface NotionAgregee {
  /** Clé brute de la catégorie, telle qu'écrite sur le quiz. */
  category: string;
  /** Libellé lisible. */
  libelle: string;
  /** Nombre de réponses enregistrées sur cette notion. */
  total: number;
  /** Réponses correctes. */
  correct: number;
  /** Taux de réussite en pourcentage entier (0–100). */
  taux: number;
  /** Verdict associé au taux. */
  niveau: NiveauNotion;
}

/** Une notion écartée du chiffrage, faute de mesure suffisante. */
export interface NotionSousEchantillonnee {
  /** Clé brute de la catégorie. */
  category: string;
  /** Libellé lisible. */
  libelle: string;
  /** Nombre de réponses (1 ou 2 par construction). */
  total: number;
}

/** Résultat complet de l'agrégation des notions. */
export interface AgregationNotions {
  /** Notions chiffrables, triées par taux CROISSANT (la plus faible d'abord). */
  notions: NotionAgregee[];
  /** Notions sous le seuil, triées par libellé — jamais de pourcentage. */
  sousEchantillonnees: NotionSousEchantillonnee[];
  /** Notion la plus faible parmi les chiffrables, base de la suggestion. */
  notionLaPlusFaible: NotionAgregee | null;
  /** Nombre total de réponses agrégées, toutes notions confondues. */
  totalReponses: number;
}

/** Seuils du code couleur, en pourcentage. */
const SEUIL_REUSSI = 70;
const SEUIL_A_CONSOLIDER = 40;

/** Verdict correspondant à un taux de réussite. */
export function niveauDeTaux(taux: number): NiveauNotion {
  if (taux >= SEUIL_REUSSI) return 'reussi';
  if (taux >= SEUIL_A_CONSOLIDER) return 'a-consolider';
  return 'a-retravailler';
}

/**
 * Libellé lisible d'une catégorie de quiz.
 *
 * Les catégories générées par l'IA viennent d'une liste FERMÉE et normalisée
 * (`business-model`, `financement`… cf. `ai-prompts.ts`) ; le contenu ancien,
 * lui, porte des catégories libres. On traduit ce qu'on connaît et on rend le
 * reste présentable plutôt que de l'afficher en `kebab-case` brut.
 */
export function libelleNotion(category: string): string {
  const connues: Record<string, string> = {
    'business-model': 'Business model',
    financement: 'Financement',
    marketing: 'Marketing',
    legal: 'Juridique',
    management: 'Management',
    tech: 'Technique',
    pitch: 'Pitch',
    strategie: 'Stratégie',
    'aspects-techniques': 'Aspects techniques',
  };
  const cle = category.trim().toLowerCase();
  if (connues[cle]) return connues[cle];
  const lisible = cle.replace(/[-_]+/g, ' ').trim();
  if (!lisible) return 'Notion sans catégorie';
  return lisible.charAt(0).toUpperCase() + lisible.slice(1);
}

/**
 * Agrège toutes les réponses de tous les participants par catégorie.
 *
 * ═══ LA FORMULE ═══
 *
 *   Pour chaque catégorie C :
 *     total(C)   = nombre de réponses de TOUS les élèves portant sur C
 *     correct(C) = celles dont `correct === true`
 *     taux(C)    = round(100 × correct(C) / total(C))
 *
 *   Puis la partition, seule règle d'affichage qui compte :
 *     total(C) >= 3  → notion chiffrée, avec son taux et son effectif
 *     total(C) <  3  → « trop peu évaluée », citée SANS pourcentage
 *
 * Chaque réponse pèse le même poids, quel que soit l'élève qui l'a donnée : le
 * rapport mesure ce que la CLASSE maîtrise, pas la moyenne des élèves. Pondérer
 * par élève donnerait un poids démesuré à celui qui n'a répondu qu'une fois.
 *
 * TRI CROISSANT : la notion la moins maîtrisée arrive en premier. Un rapport
 * pédagogique se lit pour savoir quoi reprendre, pas pour se féliciter.
 *
 * Un participant sans réponse ne contribue à RIEN ici — il compte dans la
 * participation, mais n'ajoute ni numérateur ni dénominateur. C'est ce qui
 * évite qu'une classe où la moitié des élèves n'a pas eu le temps de jouer
 * affiche des notions artificiellement basses.
 */
export function agregerNotions(participants: ClassSessionParticipant[]): AgregationNotions {
  // Le comptage est la SEULE chose faite ici. Le seuil, le tri croissant et le
  // code couleur vivent dans `agregerCompteurs`, partagé avec la fiche élève
  // annuelle (lot 7) — deux implémentations du seuil finiraient par diverger.
  let compteurs: CompteursMaitrise = {};
  for (const p of participants) {
    compteurs = fusionnerCompteurs(compteurs, compteursDepuisReponses(p.answers ?? []));
  }
  return agregerCompteurs(compteurs);
}

/**
 * Phrase de suggestion pour la séance suivante, ou `null` si aucune notion n'est
 * chiffrable.
 *
 * Renvoyer `null` plutôt qu'une phrase creuse est délibéré : une recommandation
 * fondée sur deux réponses vaut moins que pas de recommandation du tout, et
 * l'écran doit pouvoir choisir de se taire.
 */
export function suggestionSeanceSuivante(agregation: AgregationNotions): string | null {
  const faible = agregation.notionLaPlusFaible;
  if (!faible) return null;

  if (faible.niveau === 'reussi') {
    return `Toutes les notions évaluées sont acquises ; la plus fragile reste ${faible.libelle} (${faible.taux} % sur ${faible.total} question${faible.total > 1 ? 's' : ''}). Vous pouvez avancer dans le programme.`;
  }
  return `La notion la moins maîtrisée est ${faible.libelle} (${faible.taux} % sur ${faible.total} question${faible.total > 1 ? 's' : ''}) : prévoyez-la en ouverture du prochain cours.`;
}

/**
 * Agrège des compteurs DÉJÀ CUMULÉS (`masteryByCategory`) selon exactement les
 * mêmes règles que `agregerNotions` — seuil des 3 questions compris.
 *
 * ═══ POURQUOI DEUX PORTES D'ENTRÉE ET UN SEUL CALCUL ═══
 *
 * Le rapport de séance part de réponses individuelles (`answers[]`) ; la fiche
 * élève part de compteurs annuels (`{ [category]: { correct, total } }`). Ce
 * sont deux formes de la même donnée, et il aurait été tentant d'écrire deux
 * fois le tri, le seuil et le code couleur. C'eût été la garantie qu'ils
 * divergent : le jour où le seuil passe à 4, un des deux écrans resterait à 3,
 * et l'établissement lirait deux verdicts contradictoires sur le même élève.
 *
 * `agregerNotions` se contente donc désormais de compter les réponses, puis
 * délègue ICI. Le seuil, le tri croissant et le code couleur n'existent qu'à un
 * seul endroit.
 *
 * ⚠️ LE SEUIL S'APPLIQUE AU CUMUL ANNUEL, PAS PAR SÉANCE. Une notion vue une
 * fois dans trois séances différentes totalise 3 réponses sur l'année : elle est
 * chiffrable sur la fiche élève alors qu'elle ne l'était dans aucun des trois
 * rapports de séance. C'est le comportement voulu — le cumul existe précisément
 * pour dépasser l'échantillon d'une heure de cours.
 *
 * @param compteurs Compteurs par catégorie, tels qu'écrits sur le learner.
 */
export function agregerCompteurs(
  compteurs: Record<string, { correct: number; total: number }>
): AgregationNotions {
  const notions: NotionAgregee[] = [];
  const sousEchantillonnees: NotionSousEchantillonnee[] = [];
  let totalReponses = 0;

  for (const [cle, brut] of Object.entries(compteurs)) {
    // Une base construite par additions successives peut porter des valeurs
    // aberrantes (champ écrasé à la main, écriture partielle). On les neutralise
    // ici plutôt que de laisser un `NaN %` s'afficher sur un certificat.
    const total = Math.max(0, Math.floor(Number(brut?.total ?? 0)) || 0);
    const correct = Math.min(total, Math.max(0, Math.floor(Number(brut?.correct ?? 0)) || 0));
    if (total <= 0) continue;

    totalReponses += total;
    const libelle = libelleNotion(cle);

    if (total < SEUIL_QUESTIONS_NOTION) {
      sousEchantillonnees.push({ category: cle, libelle, total });
      continue;
    }
    const taux = Math.round((correct / total) * 100);
    notions.push({ category: cle, libelle, total, correct, taux, niveau: niveauDeTaux(taux) });
  }

  notions.sort((a, b) => {
    if (a.taux !== b.taux) return a.taux - b.taux;
    if (a.total !== b.total) return b.total - a.total;
    return a.libelle.localeCompare(b.libelle, 'fr');
  });
  sousEchantillonnees.sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'));

  return {
    notions,
    sousEchantillonnees,
    notionLaPlusFaible: notions[0] ?? null,
    totalReponses,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. CUMUL PAR ÉLÈVE (fonctions pures) — lot 7
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compteurs de maîtrise, forme stockée sur `learners/{id}.masteryByCategory`.
 * Alias local de `Record<string, LearnerCategoryMastery>` pour que les fonctions
 * pures de ce fichier restent lisibles sans importer le type d'écran.
 */
export type CompteursMaitrise = Record<string, { correct: number; total: number }>;

/**
 * Réduit les réponses d'UN participant en compteurs par catégorie.
 *
 * C'est l'unité d'intégration du cumul : ce que la séance ajoute au dossier
 * annuel d'un élève. La normalisation (trim + minuscules) est la même que celle
 * d'`agregerNotions`, sans quoi « Financement » et « financement » vivraient
 * comme deux notions distinctes dans la base — l'une venant du contenu ancien,
 * l'autre de la liste fermée de l'IA.
 */
export function compteursDepuisReponses(reponses: ClassParticipantAnswer[]): CompteursMaitrise {
  const compteurs: CompteursMaitrise = {};
  for (const reponse of reponses ?? []) {
    const categorie = typeof reponse?.category === 'string' ? reponse.category.trim() : '';
    if (!categorie) continue;
    const cle = categorie.toLowerCase();
    const courant = compteurs[cle] ?? { correct: 0, total: 0 };
    courant.total += 1;
    if (reponse.correct === true) courant.correct += 1;
    compteurs[cle] = courant;
  }
  return compteurs;
}

/**
 * Additionne deux jeux de compteurs, sans muter ni l'un ni l'autre.
 *
 * FONCTION PURE ET ASSOCIATIVE : c'est ce qui rend le « Recalculer les cumuls »
 * exactement équivalent à la suite des intégrations séance par séance. Un
 * recalcul qui donnerait un autre résultat que la somme des clôtures serait pire
 * qu'inutile — il ferait douter des deux chiffres.
 */
export function fusionnerCompteurs(
  base: CompteursMaitrise | undefined | null,
  ajout: CompteursMaitrise | undefined | null
): CompteursMaitrise {
  const sortie: CompteursMaitrise = {};
  for (const [cle, valeur] of Object.entries(base ?? {})) {
    const total = Math.max(0, Math.floor(Number(valeur?.total ?? 0)) || 0);
    const correct = Math.max(0, Math.floor(Number(valeur?.correct ?? 0)) || 0);
    if (total > 0) sortie[cle] = { correct: Math.min(correct, total), total };
  }
  for (const [cle, valeur] of Object.entries(ajout ?? {})) {
    const total = Math.max(0, Math.floor(Number(valeur?.total ?? 0)) || 0);
    const correct = Math.max(0, Math.floor(Number(valeur?.correct ?? 0)) || 0);
    if (total <= 0) continue;
    const courant = sortie[cle] ?? { correct: 0, total: 0 };
    sortie[cle] = {
      correct: courant.correct + Math.min(correct, total),
      total: courant.total + total,
    };
  }
  return sortie;
}

/**
 * État cumulé d'un élève, tel qu'il sera écrit sur son document.
 * Volontairement limité aux quatre champs d'agrégat : le cumul ne touche jamais
 * à l'identité de l'élève ni à son rattachement.
 */
export interface CumulEleve {
  /** Compteurs de maîtrise cumulés sur l'année. */
  masteryByCategory: CompteursMaitrise;
  /** Nombre de séances comptabilisées. */
  totalSessions: number;
  /** Dernière activité, en millisecondes epoch (`null` si jamais joué). */
  lastPlayedAt: number | null;
  /**
   * Séances DÉJÀ intégrées — le garde-fou de l'idempotence.
   * Trié et sans doublon, pour qu'une comparaison d'états soit stable.
   */
  countedSessionIds: string[];
}

/**
 * Intègre UNE séance dans le cumul d'un élève — la fonction centrale du lot 7.
 *
 * ═══ IDEMPOTENCE : COMMENT ELLE EST GARANTIE ═══
 *
 * `countedSessionIds[]` porte la liste des séances déjà comptabilisées. Si
 * `sessionId` s'y trouve déjà, la fonction renvoie l'état d'entrée **inchangé,
 * à l'identité de référence près** — l'appelant peut donc détecter qu'il n'y a
 * rien à écrire et s'épargner un aller-retour Firestore.
 *
 * Pourquoi un tableau sur le learner, et non une sous-collection
 * `learners/{lid}/countedSessions/{sid}` :
 *   - le document du learner est DÉJÀ lu et écrit par la clôture ; le marqueur
 *     voyage donc dans la même écriture que les compteurs, ce qui rend le
 *     couple « compteurs + marqueur » atomique par construction. Avec une
 *     sous-collection, une panne entre les deux écritures laisserait soit un
 *     cumul non marqué (doublé au prochain clic), soit un marqueur sans cumul
 *     (séance définitivement perdue) ;
 *   - le volume est borné par l'usage réel : une séance par semaine et par
 *     classe fait ~30 identifiants sur une année scolaire, quelques centaines
 *     d'octets — très loin de la limite de 1 Mo par document.
 *
 * Ce que ce choix coûte, et qui est assumé : au-delà de plusieurs milliers de
 * séances pour un même élève, le tableau devrait migrer en sous-collection.
 * Cela suppose ~100 séances par an pendant 20 ans sur le même document d'élève.
 *
 * ⚠️ L'idempotence ne repose PAS sur `status === 'ended'` ni sur un horodatage :
 * une clôture peut être rejouée, une séance peut être recalculée après coup, et
 * deux onglets ouverts peuvent cliquer « Terminer » en même temps. Seul un
 * marqueur persistant, écrit avec les compteurs, tient dans tous ces cas.
 *
 * @param etat      Cumul actuel de l'élève (état lu sur son document).
 * @param sessionId Séance à intégrer.
 * @param reponses  Réponses de l'élève DANS cette séance.
 * @param joueLe    Horodatage de la séance (fin, à défaut début) en ms epoch.
 * @returns Le nouvel état, ou l'objet `etat` LUI-MÊME si la séance était déjà
 *          comptabilisée (comparaison par référence possible).
 */
export function integrerSeance(
  etat: CumulEleve,
  sessionId: string,
  reponses: ClassParticipantAnswer[],
  joueLe: number | null
): CumulEleve {
  if (!sessionId) return etat;
  if (etat.countedSessionIds.includes(sessionId)) return etat;

  return {
    masteryByCategory: fusionnerCompteurs(
      etat.masteryByCategory,
      compteursDepuisReponses(reponses)
    ),
    // `totalSessions` compte les séances JOUÉES, y compris celles où l'élève
    // n'a répondu à aucun quiz : il a bien participé, et l'effacer de son
    // compteur donnerait une fiche élève en contradiction avec l'historique des
    // séances affiché juste en dessous.
    totalSessions: Math.max(0, Math.floor(etat.totalSessions || 0)) + 1,
    // On garde le MAXIMUM et non la dernière valeur reçue : un recalcul parcourt
    // les séances dans un ordre quelconque, et « dernière activité » ne doit
    // jamais reculer.
    lastPlayedAt: Math.max(etat.lastPlayedAt ?? 0, joueLe ?? 0) || null,
    countedSessionIds: [...etat.countedSessionIds, sessionId].sort(),
  };
}

/** Cumul vide — point de départ d'un recalcul complet. */
export function cumulVide(): CumulEleve {
  return { masteryByCategory: {}, totalSessions: 0, lastPlayedAt: null, countedSessionIds: [] };
}

/**
 * Lit l'état cumulé porté par un document d'élève, en neutralisant ce que la
 * base peut contenir de bancal (champs absents pour un élève créé avant le
 * lot 7, tableau remplacé par une chaîne à la main…).
 */
export function cumulDepuisLearner(eleve: Pick<Learner,
  'masteryByCategory' | 'totalSessions' | 'lastPlayedAt' | 'countedSessionIds'>): CumulEleve {
  const compteurs = fusionnerCompteurs(eleve.masteryByCategory ?? {}, {});
  const dejaComptees = Array.isArray(eleve.countedSessionIds)
    ? eleve.countedSessionIds.filter((id): id is string => typeof id === 'string' && id !== '')
    : [];

  return {
    masteryByCategory: compteurs,
    totalSessions: Math.max(0, Math.floor(Number(eleve.totalSessions ?? 0)) || 0),
    lastPlayedAt: Number(eleve.lastPlayedAt ?? 0) || null,
    countedSessionIds: [...new Set(dejaComptees)].sort(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. EXPORT CSV (fonction pure)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Construit le CSV du détail par élève.
 *
 * Sans dépendance, sur le patron maison de `leads/page.tsx` : chaque cellule
 * est encadrée de guillemets et ses guillemets internes doublés — un nom
 * composé contenant une virgule ne décale donc pas les colonnes.
 *
 * Les élèves non connectés FIGURENT dans l'export, à zéro : un fichier remis à
 * une direction doit refléter la classe entière, pas seulement les présents.
 */
export function construireCsvRapport(lignes: LigneSuivi[]): string {
  const entetes = [
    'Élève',
    'État',
    'Score',
    'Case atteinte',
    'Cartes jouées',
    'Réponses',
    'Correctes',
    'Taux de réussite (%)',
  ];

  const etats: Record<EtatEleve, string> = {
    absent: 'Pas connecté',
    'en-jeu': 'En jeu',
    termine: 'Terminé',
  };

  const rows: string[][] = [
    entetes,
    ...lignes.map((l) => [
      l.nom,
      etats[l.etat],
      String(l.score),
      String(l.cellIndex),
      String(l.cardsPlayed),
      String(l.nbReponses),
      String(l.nbCorrectes),
      l.nbReponses > 0 ? String(Math.round((l.nbCorrectes / l.nbReponses) * 100)) : '',
    ]),
  ];

  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// NIVEAU N1-N4 DE L'APPRENANT (lot M5, arbitrage D2 du 13/08)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Niveau de PROGRESSION d'un apprenant, dérivé de son cumul annuel — jamais
 * d'une seule séance. RÈGLE (proposée, affichée à l'écran pour être
 * contestable) :
 *   N1 — moins de 10 questions cumulées : il découvre.
 *   N2 — ≥ 10 questions : il pratique.
 *   N3 — ≥ 25 questions ET ≥ 60 % de réussite : il maîtrise les bases.
 *   N4 — ≥ 50 questions ET ≥ 70 % de réussite : il est autonome.
 * Le volume PRIME sur le taux (un taux parfait sur 3 questions ne dit rien) —
 * même philosophie que le seuil des 3 questions du rapport.
 */
export function niveauApprenant(learner: {
  masteryByCategory?: Record<string, { correct: number; total: number }>;
}): { niveau: 1 | 2 | 3 | 4; questions: number; tauxPct: number | null } {
  const compteurs = Object.values(learner.masteryByCategory ?? {});
  const questions = compteurs.reduce((somme, c) => somme + (c.total ?? 0), 0);
  const correctes = compteurs.reduce((somme, c) => somme + (c.correct ?? 0), 0);
  const tauxPct = questions > 0 ? Math.round((correctes / questions) * 100) : null;

  let niveau: 1 | 2 | 3 | 4 = 1;
  if (questions >= 10) niveau = 2;
  if (questions >= 25 && (tauxPct ?? 0) >= 60) niveau = 3;
  if (questions >= 50 && (tauxPct ?? 0) >= 70) niveau = 4;
  return { niveau, questions, tauxPct };
}
