/**
 * Mode Classe — contrôle thématique du cours déposé par l'enseignant.
 *
 * POURQUOI CE MODULE — la chaîne de génération acceptait N'IMPORTE QUEL document
 * et en dérivait des cartes. Déposer un cours de géologie produisait donc des
 * quiz de géologie, catégorisés de force en « business-model » ou « strategie »
 * par `normaliserCategorie` (liste fermée, repli silencieux). Trois dégâts, dans
 * cet ordre de gravité :
 *
 *   1. Le rapport de fin de séance annonce « Marketing : 54 % » sur des questions
 *      qui ne parlent pas de marketing. La statistique devient un mensonge.
 *   2. Le produit est un jeu d'ENTREPRENEURIAT. Un contenu hors-sujet le vide de
 *      sa promesse, et personne ne s'en aperçoit avant que la classe ne joue.
 *   3. L'appel de génération est payé (jusqu'à 16 384 tokens de sortie) pour
 *      fabriquer du contenu qu'il faudra jeter.
 *
 * STRATÉGIE EN DEUX ÉTAGES — un classifieur IA est le seul juge valable du SENS
 * d'un texte, mais c'est un appel réseau facturé. On ne le convoque donc que
 * lorsqu'il est nécessaire :
 *
 *   étage 1 — signaux lexicaux locaux, gratuits et instantanés. Ils ne tranchent
 *             que les cas FRANCS : un cours bourré de vocabulaire entrepreneurial
 *             passe sans appel, un cours qui n'en contient pas une trace est
 *             refusé sans appel.
 *   étage 2 — le classifieur IA pour tout l'entre-deux, qui est le cas réel le
 *             plus fréquent (un chapitre d'économie générale, un cours de gestion
 *             qui frôle le sujet, un texte en partie pertinent).
 *
 * CE MODULE EST PUR ET SANS FIREBASE : il est testable sans émulateur, et
 * l'étage 1 est testable sans réseau. Seul `analyserDocument` sort du module.
 */

import { appelerGeneration } from '@/lib/ai-client';

/** Verdict rendu sur un document déposé. */
export type VerdictThematique = 'entrepreneuriat' | 'hors-sujet' | 'incertain';

/** Résultat complet d'une analyse, destiné autant au code qu'à l'enseignant. */
export interface AnalyseThematique {
  /** Verdict. Seul `hors-sujet` bloque la génération. */
  verdict: VerdictThematique;
  /**
   * Degré de confiance, de 0 à 1.
   *
   * Sert au message rendu à l'enseignant, pas à la décision : la décision est
   * déjà portée par `verdict`. Un seuil supplémentaire ici créerait deux
   * endroits où la règle vit, donc deux endroits à corriger.
   */
  confiance: number;
  /**
   * Thème réellement détecté, en clair et en français (ex. « géologie »).
   *
   * C'est le cœur du feedback utile : « ce document parle de géologie » est
   * actionnable, « document refusé » ne l'est pas.
   */
  theme: string;
  /** Explication d'une phrase, affichable telle quelle. */
  motif: string;
  /** Notions entrepreneuriales repérées — vide si le document est hors-sujet. */
  notions: string[];
  /** `true` quand le verdict vient de l'étage lexical, sans appel au modèle. */
  localement: boolean;
}

/**
 * Vocabulaire entrepreneurial de référence.
 *
 * Choix assumé : des RACINES, pas des mots entiers, pour attraper les formes
 * fléchies sans liste de variantes (« financement / financements / financer »).
 * Les racines sont volontairement longues pour éviter les faux positifs — par
 * exemple `entrepre` et non `entre`, qui matcherait « entre deux » et
 * « entretien ».
 *
 * Cette liste n'est PAS un classifieur : elle ne sert qu'à repérer les cas
 * francs. Sa qualité se mesure à son absence de faux positifs, pas à sa
 * couverture — un oubli envoie simplement le document à l'étage IA, ce qui est
 * le comportement correct.
 *
 * ⚠️ TOUTES LES ENTRÉES SONT SANS ACCENT ET SANS APOSTROPHE, et doivent le
 * rester. `replier()` dépouille le texte ET les racines avant comparaison :
 * ajouter « rentabilité » à côté de « rentabilite » ne gagne aucune détection,
 * puisque les deux matchent les mêmes textes — mais le doublon est compté DEUX
 * FOIS. Il fausserait le seuil d'acceptation (8 racines DISTINCTES) et
 * afficherait « rentabilite · rentabilité » à l'enseignant. Une forme par
 * notion, dépouillée.
 */
const RACINES_ENTREPRENEURIAT = [
  "entrepre", // entrepreneuriat, entreprendre, entrepreneur
  "startup",
  "start-up",
  "business model",
  "business plan",
  "modele economique",
  "proposition de valeur",
  "etude de marche",
  "segment de clientele",
  "chiffre d affaires",
  "rentabilite", // couvre aussi « seuil de rentabilite »
  "levee de fonds",
  "investisseur",
  "capital-risque",
  "capital risque",
  "microfinance",
  "micro-credit",
  "incubateur",
  "accelerateur",
  "pitch",
  "plan d affaires",
  "tresorerie",
  "fonds de roulement",
  "marge commerciale",
  "creation d entreprise",
  "porteur de projet",
  "pme",
  "tpe",
  "commercialisation",
  "strategie commerciale",
  "avantage concurrentiel",
  "concurrence",
  "clientele",
  "fournisseur",
  "statut juridique",
  "immatriculation",
  "formalisation",
  "secteur informel",
  "innovation",
  "prototype",
  "mvp",
  "parts de marche",
  "fonds propres",
  "subvention",
  "credit bancaire",
  "garantie bancaire",
  "comptabilite",
  "facturation",
  "fiscalite",
  "cooperative",
  "gestion d entreprise",
  "ressources humaines",
  "recrutement",
  "marketing",
  "publicite",
  "reseau de distribution",
];

/**
 * Vocabulaire du VOISINAGE : économie, droit, social, technique de projet.
 *
 * Ces mots ne valident rien — un cours d'économie macro n'est pas un cours
 * d'entrepreneuriat. Mais leur présence INTERDIT LE REFUS LOCAL : ce sont des
 * disciplines limitrophes, où le volet entrepreneurial peut être réel sans
 * employer le vocabulaire canonique (« le financement de l'activité » sans
 * jamais écrire « financement »). Trancher ces cas sans lire le sens produirait
 * précisément le faux positif qu'on refuse : un enseignant d'économie bloqué.
 *
 * Un document qui en contient part donc à l'étage IA, qui lui saura juger.
 */
const RACINES_VOISINAGE = [
  'economie',
  'economique',
  'entreprise',
  'societe commerciale',
  'commerce',
  'commercial',
  'marche',
  'client',
  'vente',
  'vendre',
  'achat',
  'prix de vente',
  'cout',
  'benefice',
  'profit',
  'capital',
  'credit',
  'banque',
  'bancaire',
  'epargne',
  'investissement',
  'budget',
  'inflation',
  'offre et demande',
  'valeur ajoutee',
  'salarie',
  'emploi',
  'production',
  'projet',
  'gestion',
  'management',
  'strategie',
  'organisation',
  'contrat',
  'facture',
  'impot',
  'taxe',
  'cooperation',
  'artisan',
  'agriculteur',
  'metier',
];

/**
 * Seuils de l'étage lexical.
 *
 * Calés pour être PRUDENTS dans les deux sens : on ne valide et on ne refuse
 * localement que l'évident, tout le reste monte à l'IA. Déplacer ces seuils vers
 * le centre économiserait des appels au prix de verdicts locaux hasardeux —
 * exactement ce qu'on ne veut pas sur un refus montré à un enseignant.
 *
 * LE 6 EST MESURÉ, PAS DEVINÉ. Calibré sur des cours types : un chapitre
 * d'entrepreneuriat en relève une quinzaine, un cours de gestion commerciale
 * (facturation, marge, trésorerie, comptabilité, clientèle, fournisseur) en
 * relève 7 — il doit passer sans appel, c'est pleinement le domaine. En face, un
 * cours de SVT, un exercice de mathématiques sur des prix et un règlement
 * intérieur en relèvent ZÉRO. L'écart entre 0 et 7 est si net qu'aucun seuil
 * intermédiaire n'est délicat à placer.
 *
 * Le refus, lui, exige ZÉRO notion : un seul indice suffit à envoyer le document
 * à l'IA plutôt qu'à le rejeter. Asymétrie voulue — refuser à tort est la faute
 * la plus coûteuse de ce module.
 */
const SEUIL_ACCEPTATION_LOCALE = 6;
const SEUIL_REFUS_LOCAL = 0;

/**
 * Nombre de caractères envoyés au classifieur.
 *
 * Un extrait suffit à identifier un thème, et on prélève au DÉBUT, au MILIEU et
 * à la FIN plutôt que les 6 000 premiers caractères : une page de garde, un
 * sommaire et des remerciements occupent facilement le début d'un polycopié et
 * ne disent rien de son sujet.
 */
const TAILLE_EXTRAIT = 6000;

/**
 * Longueur minimale pour qu'une analyse ait un sens.
 *
 * En dessous, AUCUN verdict n'est rendu — ni acceptation ni refus. Deux
 * fonctions s'en servent, et ce n'est pas une redondance : chacune garde son
 * propre point d'entrée, `analyserDocument` pour un document trop maigre à
 * juger, `preVerdictLexical` pour que « pas de cours déposé » ne devienne
 * jamais « cours hors sujet ».
 */
const LONGUEUR_MINIMALE = 200;

/**
 * Retire les accents et replie en minuscules, pour comparer du texte saisi
 * librement. `NFD` sépare la lettre de son diacritique, le second est supprimé.
 */
function replier(texte: string): string {
  return (
    texte
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // APOSTROPHES — la typographique (U+2019), la droite et la modificatrice
      // deviennent une espace. « chiffre d’affaires », « chiffre d'affaires » et
      // « chiffre d affaires » se comparent alors à la même racine. Sans ça, la
      // détection dépendrait du traitement de texte de l'enseignant : Word pose
      // U+2019, un export Markdown pose U+0027.
      .replace(/['\u2019\u02bc`]/g, ' ')
      // Espaces insécables puis repli : une césure ou un saut de ligne au milieu
      // d'une expression ne doit pas la masquer.
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
  );
}

/** Tables repliées, calculées une fois. */
const RACINES_REPLIEES = RACINES_ENTREPRENEURIAT.map(replier);
const VOISINAGE_REPLIE = RACINES_VOISINAGE.map(replier);

/**
 * Le document touche-t-il au voisinage économique du sujet ?
 *
 * Exportée pour les tests : c'est ce qui sépare « refusé d'emblée » de « soumis
 * au classifieur », et donc la garantie qu'un cours limitrophe est lu.
 */
export function toucheAuVoisinage(texte: string): boolean {
  const plie = replier(texte);
  return VOISINAGE_REPLIE.some((r) => r.length > 0 && plie.includes(r));
}

/**
 * Compte les racines entrepreneuriales DISTINCTES présentes dans le texte.
 *
 * On compte les racines distinctes et non les occurrences : un cours de biologie
 * citant quinze fois « innovation » dans un paragraphe sur l'innovation génétique
 * obtiendrait un score élevé sur un seul indice. Quinze racines différentes, en
 * revanche, ne se produisent pas par accident.
 *
 * Exportée pour les tests : c'est la seule partie décidable sans réseau.
 */
export function compterIndicesEntrepreneuriat(texte: string): string[] {
  const plie = replier(texte);
  return RACINES_ENTREPRENEURIAT.filter((_, i) => {
    const racine = RACINES_REPLIEES[i];
    return racine !== undefined && racine.length > 0 && plie.includes(racine);
  });
}

/**
 * Prélève un extrait représentatif : début, milieu, fin.
 *
 * Exportée pour les tests.
 */
export function extraireEchantillon(texte: string, taille = TAILLE_EXTRAIT): string {
  if (texte.length <= taille) return texte;

  const tiers = Math.floor(taille / 3);
  const milieu = Math.floor(texte.length / 2 - tiers / 2);
  return [
    texte.slice(0, tiers),
    texte.slice(milieu, milieu + tiers),
    texte.slice(texte.length - tiers),
  ].join('\n[...]\n');
}

/**
 * Pré-verdict lexical, sans aucun appel réseau.
 *
 * Retourne `null` quand les signaux ne suffisent pas à trancher — c'est le cas
 * attendu pour la majorité des documents, et il faut alors l'étage IA.
 *
 * Exportée pour les tests.
 */
export function preVerdictLexical(texte: string): AnalyseThematique | null {
  /*
    UN TEXTE VIDE OU DÉRISOIRE NE SE JUGE PAS.

    Sans cette sortie, un texte vide tomberait dans la branche de refus — zéro
    notion, zéro voisinage — et « aucun cours déposé » deviendrait « cours hors
    sujet ». Le parcours « séance prête », qui génère légitimement sans aucun
    document, s'en trouverait bloqué.

    La garde vit ICI et non chez les appelants : la protection ne doit pas
    dépendre de ce que chaque futur appelant pense à tester avant d'appeler.
  */
  if (texte.trim().length < LONGUEUR_MINIMALE) return null;

  const indices = compterIndicesEntrepreneuriat(texte);

  if (indices.length >= SEUIL_ACCEPTATION_LOCALE) {
    return {
      verdict: 'entrepreneuriat',
      confiance: 0.9,
      theme: 'entrepreneuriat',
      motif: `Vocabulaire entrepreneurial dense : ${indices.length} notions repérées.`,
      notions: indices.slice(0, 8),
      localement: true,
    };
  }

  /*
    REFUS LOCAL — deux conditions, pas une. Aucune notion entrepreneuriale ET
    aucun mot du voisinage économique. Un cours d'économie générale franchit la
    seconde et part donc à l'IA : le refuser sur l'absence de « business model »
    serait un faux positif, la faute la plus coûteuse de ce module.
  */
  if (indices.length <= SEUIL_REFUS_LOCAL && !toucheAuVoisinage(texte)) {
    return {
      verdict: 'hors-sujet',
      confiance: 0.85,
      theme: 'inconnu',
      motif:
        'Aucune notion liée à l’entrepreneuriat, à la gestion ou au financement n’apparaît dans ce document.',
      notions: [],
      localement: true,
    };
  }

  return null;
}

// ===== ÉTAGE IA =====

/** Lit une valeur de champ sur un objet inconnu. */
function champ(source: unknown, cle: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined;
  return (source as Record<string, unknown>)[cle];
}

/** Chaîne nettoyée, ou `''`. */
function texteDe(valeur: unknown): string {
  return typeof valeur === 'string' ? valeur.trim() : '';
}

/**
 * Convertit la réponse du classifieur en verdict typé.
 *
 * TOUT ÉCART EST TRAITÉ COMME `incertain`, jamais comme un refus : un modèle qui
 * répond de travers ne doit pas bloquer le cours d'un enseignant. Le refus est
 * la décision la plus coûteuse pour l'utilisateur, elle exige donc le signal le
 * plus net — ici, un `verdict` explicitement hors-sujet.
 *
 * Exportée pour les tests.
 */
export function lireVerdictModele(brut: unknown): AnalyseThematique {
  const verdictBrut = replier(texteDe(champ(brut, 'verdict')));

  const verdict: VerdictThematique =
    verdictBrut === 'entrepreneuriat' || verdictBrut === 'entrepreneuriat_partiel'
      ? 'entrepreneuriat'
      : verdictBrut === 'hors-sujet' || verdictBrut === 'hors_sujet'
        ? 'hors-sujet'
        : 'incertain';

  const confianceBrute = Number(champ(brut, 'confiance'));
  const confiance = Number.isFinite(confianceBrute)
    ? Math.min(Math.max(confianceBrute, 0), 1)
    : 0.5;

  const notionsBrutes = champ(brut, 'notions');
  const notions = Array.isArray(notionsBrutes)
    ? notionsBrutes.map(texteDe).filter(Boolean).slice(0, 8)
    : [];

  return {
    verdict,
    confiance,
    theme: texteDe(champ(brut, 'theme')) || 'indéterminé',
    motif: texteDe(champ(brut, 'motif')) || 'Analyse du contenu non concluante.',
    notions,
    localement: false,
  };
}

/**
 * Analyse le thème d'un document : lexical d'abord, IA si nécessaire.
 *
 * Ne lève JAMAIS. Une panne du classifieur (quota, réseau, clé absente) rend
 * `incertain` : le contrôle thématique est une garde de qualité, pas un contrôle
 * d'accès, et une garde de qualité en panne ne doit pas empêcher un enseignant
 * de travailler. Le seul refus possible est un refus MOTIVÉ.
 *
 * @param texte Texte extrait du document.
 */
export async function analyserDocument(texte: string): Promise<AnalyseThematique> {
  const propre = texte.trim();

  if (propre.length < LONGUEUR_MINIMALE) {
    return {
      verdict: 'incertain',
      confiance: 0.3,
      theme: 'indéterminé',
      motif: `Document trop court pour être analysé (${propre.length} caractères).`,
      notions: [],
      localement: true,
    };
  }

  const local = preVerdictLexical(propre);
  if (local) return local;

  try {
    const res = await appelerGeneration({
      type: 'analyse_thematique',
      context: { extrait: extraireEchantillon(propre), longueur: propre.length },
    });
    const json = await res.json();
    if (!res.ok || json.error || json.data === undefined || json.data === null) {
      return {
        verdict: 'incertain',
        confiance: 0.3,
        theme: 'indéterminé',
        motif: 'Analyse thématique indisponible — le document est accepté sans contrôle.',
        notions: [],
        localement: false,
      };
    }
    return lireVerdictModele(json.data);
  } catch {
    return {
      verdict: 'incertain',
      confiance: 0.3,
      theme: 'indéterminé',
      motif: 'Analyse thématique indisponible — le document est accepté sans contrôle.',
      notions: [],
      localement: false,
    };
  }
}

/**
 * Erreur levée quand un document est refusé pour hors-sujet.
 *
 * Une classe propre et non un `Error` nu : l'écran a besoin de l'analyse
 * COMPLÈTE pour afficher le thème détecté et les conseils, et un message aplati
 * perdrait tout ça. `instanceof` permet aussi de distinguer ce refus — attendu,
 * explicable — d'une panne d'extraction.
 */
export class ErreurHorsSujet extends Error {
  /** Analyse ayant motivé le refus. */
  readonly analyse: AnalyseThematique;

  constructor(analyse: AnalyseThematique) {
    super(messageRefus(analyse));
    this.name = 'ErreurHorsSujet';
    this.analyse = analyse;
  }
}

/**
 * Compose le message de refus montré à l'enseignant.
 *
 * Trois obligations, apprises des refus produits ailleurs dans ce back-office :
 * NOMMER ce qui a été détecté, RAPPELER ce qui est attendu, et DIRE quoi faire.
 * Un refus qui ne fait pas les trois se traduit par un ticket de support.
 *
 * Exportée pour les tests : c'est le texte que l'enseignant lit, il mérite
 * d'être vérifié comme du code.
 */
export function messageRefus(analyse: AnalyseThematique): string {
  const theme =
    analyse.theme && analyse.theme !== 'inconnu' && analyse.theme !== 'indéterminé'
      ? ` Ce document porte plutôt sur : ${analyse.theme}.`
      : '';

  return (
    `Ce document ne traite pas d’entrepreneuriat.${theme} ` +
    'Startup Ludo génère des quiz sur la création d’entreprise, le financement, ' +
    'le marketing, la gestion ou la stratégie. Déposez un cours couvrant ces ' +
    'notions, ou lancez une séance sur une édition existante sans déposer de document.'
  );
}
