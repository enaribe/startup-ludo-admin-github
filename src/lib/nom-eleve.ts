/**
 * Traitement du nom SAISI par l'élève lors de son auto-inscription.
 *
 * POURQUOI CE MODULE — depuis que l'élève tape son nom lui-même (et non plus le
 * choisit dans une liste préparée par l'enseignant), ce nom est une entrée
 * libre : il part dans le rapport de séance, dans les cumuls annuels et sur les
 * certificats nominatifs. Trois exigences, dans cet ordre :
 *
 *   1. LISIBLE PAR L'ENSEIGNANT dans la salle d'attente, qui doit reconnaître
 *      ses élèves d'un coup d'œil pour écarter un intrus. « fatou   DIOP » et
 *      « Fatou Diop » doivent s'afficher pareil.
 *   2. SANS CONTENU HOSTILE. Un nom s'affiche au tableau devant la classe : les
 *      insultes évidentes et les caractères de contrôle n'y ont pas leur place.
 *   3. SANS PERTE. Les noms d'Afrique de l'Ouest portent des apostrophes
 *      (N'Diaye), des tirets (Ba-Diallo), des particules (Ba Sow) et des
 *      accents (Thiès). Les filtrer serait refuser à des élèves d'écrire leur
 *      propre nom — faute bien plus grave qu'un pseudo qui passe.
 *
 * Ce module est PUR : aucun accès Firestore, aucun réseau. Il est donc testable
 * exhaustivement, et c'est nécessaire — c'est lui qui décide ce qui s'affiche
 * devant une classe.
 */

/** Longueur minimale d'un nom exploitable. */
const LONGUEUR_MIN = 2;

/**
 * Longueur maximale conservée.
 *
 * Généreux à dessein : certains noms composés ouest-africains dépassent
 * largement 40 caractères avec les particules. La borne existe pour empêcher
 * qu'un nom casse l'affichage de la salle d'attente, pas pour juger de sa
 * longueur légitime.
 */
const LONGUEUR_MAX = 60;

/**
 * Caractères ACCEPTÉS dans un nom, après dépouillement des espaces.
 *
 * Construit en liste blanche et non en liste noire : une liste noire laisse
 * passer tout ce qu'on n'a pas prévu (emoji, idéogrammes, caractères de
 * contrôle invisibles, marques de direction bidirectionnelle qui retournent
 * l'affichage d'une ligne entière).
 *
 * `\p{L}` couvre toutes les lettres Unicode, accents compris, donc aussi les
 * alphabets non latins — un établissement arabophone doit pouvoir inscrire ses
 * élèves. `\p{M}` couvre les diacritiques combinants (un « é » écrit en deux
 * codets). Suivent l'espace, l'apostrophe (droite ET typographique), le tiret
 * et le point (initiales : « A. Diop »).
 */
const CARACTERES_AUTORISES = /^[\p{L}\p{M}\s'’\-.]+$/u;

/** Caractères à retirer silencieusement avant toute validation. */
const CARACTERES_INVISIBLES =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/gu;

/**
 * Mots dont la présence fait rejeter le nom.
 *
 * ⚠️ CE N'EST PAS UN FILTRE D'INSULTES, et ça ne prétend pas l'être. Un tel
 * filtre est impossible à tenir (variantes, langues locales, contournements par
 * caractères proches) et sa vraie place est l'arbitrage de l'enseignant dans la
 * salle d'attente — qui, lui, voit le nom et connaît sa classe.
 *
 * Cette liste n'attrape que les cas les plus grossiers et les tentatives
 * d'usurpation d'autorité (« prof », « admin »), qui sont le vrai risque : un
 * élève affiché « Professeur » brouille la lecture de la salle d'attente.
 * Tout le reste est laissé à l'enseignant, c'est assumé.
 */
const MOTS_INTERDITS = [
  'admin',
  'administrateur',
  'moderateur',
  'professeur',
  'enseignant',
  'directeur',
  'surveillant',
  'startup ludo',
  'startupludo',
  'connard',
  'connasse',
  'salope',
  'enculé',
  'encule',
  'pute',
  'putain',
  'merde',
  'nique',
  'niquer',
  'fuck',
  'bitch',
  'nigger',
  'negre',
];

/** Replie une chaîne pour comparaison : minuscules, sans accents. */
function replier(texte: string): string {
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Met une majuscule initiale à chaque fragment d'un nom.
 *
 * Traite les fragments séparés par une espace, un tiret OU une apostrophe, car
 * les trois marquent une frontière de nom : « ba-diallo » → « Ba-Diallo »,
 * « n'diaye » → « N'Diaye ». Une simple majuscule en tête de mot donnerait
 * « N'diaye », que la personne concernée ne reconnaît pas comme son nom.
 *
 * Le reste du fragment est MIS EN MINUSCULES : un élève qui tape tout en
 * capitales (fréquent sur mobile, le clavier s'en charge) obtiendrait sinon
 * « FATOU DIOP » hurlant dans la salle d'attente.
 */
function capitaliser(texte: string): string {
  return texte.replace(/\p{L}[\p{L}\p{M}]*/gu, (mot) => {
    const premier = mot.slice(0, 1).toLocaleUpperCase('fr');
    return premier + mot.slice(1).toLocaleLowerCase('fr');
  });
}

/**
 * Nettoie un nom saisi, ou renvoie `null` s'il est inexploitable.
 *
 * Renvoie `null` plutôt que de lever : l'appelant (la route d'inscription) a
 * besoin de répondre un 400 avec un message, pas d'attraper une exception.
 *
 * ORDRE DES OPÉRATIONS, qui compte : on retire d'abord l'invisible, puis on
 * replie les espaces, puis on valide. Valider avant de nettoyer rejetterait un
 * nom à cause d'un caractère que l'on aurait de toute façon supprimé — par
 * exemple l'espace insécable que colle un copier-coller.
 */
export function normaliserNomSaisi(brut: string): string | null {
  if (typeof brut !== 'string') return null;

  const sansInvisibles = brut.replace(CARACTERES_INVISIBLES, '');
  // Toute espèce d'espace (insécable, fine, tabulation) devient une espace
  // simple, et les répétitions sont repliées.
  const espacesNormalises = sansInvisibles.replace(/\s+/gu, ' ').trim();
  if (!espacesNormalises) return null;

  // Tronqué AVANT validation : un nom trop long n'est pas une faute de
  // l'élève, on garde ce qui tient plutôt que de le renvoyer à sa saisie.
  const borne = espacesNormalises.slice(0, LONGUEUR_MAX).trim();

  if (!CARACTERES_AUTORISES.test(borne)) return null;

  // Au moins deux LETTRES : « -- », « .. » ou « ' » passeraient la liste
  // blanche sans être un nom.
  const lettres = borne.match(/[\p{L}]/gu)?.length ?? 0;
  if (lettres < LONGUEUR_MIN) return null;

  const plie = replier(borne);
  // Frontières de mot sur les interdits : sans elles, « negre » rejetterait
  // « Negrete » et « nique » rejetterait un nom le contenant par hasard.
  const interdit = MOTS_INTERDITS.some((mot) =>
    new RegExp(`(^|[^\\p{L}])${replier(mot).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}])`, 'u').test(plie)
  );
  if (interdit) return null;

  return capitaliser(borne);
}

/**
 * Découpe un nom complet en prénom + nom de famille.
 *
 * CONVENTION : le PREMIER fragment est le prénom, tout le reste est le nom de
 * famille. C'est le sens de lecture naturel de « Fatou Diop », et c'est aussi ce
 * qui préserve les noms composés : « Marie Claire Ba Sow » donne prénom
 * « Marie », nom « Claire Ba Sow ». Imparfait, mais le découpage exact d'un nom
 * est indécidable sans demander deux champs — ce qu'on refuse pour garder la
 * saisie à une seule ligne.
 *
 * CONSÉQUENCE ASSUMÉE : un élève qui ne tape qu'un seul mot (« Fatou ») n'a pas
 * de nom de famille, et son affichage sera « Fatou » sans initiale. C'est
 * acceptable — l'enseignant le reconnaît, et lui demandera de préciser si deux
 * Fatou se présentent.
 */
export function decouperNom(nomComplet: string): { firstName: string; lastName: string } {
  const fragments = nomComplet.trim().split(/\s+/u).filter(Boolean);
  if (fragments.length === 0) return { firstName: '', lastName: '' };
  if (fragments.length === 1) return { firstName: fragments[0]!, lastName: '' };
  return { firstName: fragments[0]!, lastName: fragments.slice(1).join(' ') };
}

/**
 * « Fatou », « Diop » → « Fatou D. »
 *
 * Projection MINIMALE, et c'est une exigence de protection des données, pas une
 * préférence d'affichage : il s'agit de mineurs, et ce nom est exposé par les
 * routes publiques de résolution de code. Un curieux qui obtiendrait un code
 * pendant une séance ne doit pas repartir avec l'état civil complet d'une
 * classe.
 *
 * Reprise à l'identique des deux routes `join` — les trois portes doivent
 * projeter exactement la même chose, sans quoi l'une devient la faille des
 * autres.
 */
export function nomAffiche(prenom: string, nom: string): string {
  const p = prenom.trim();
  const initiale = nom.trim().charAt(0).toLocaleUpperCase('fr');
  if (!p) return initiale ? `${initiale}.` : 'Élève';
  return initiale ? `${p} ${initiale}.` : p;
}
