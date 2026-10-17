/**
 * Défi de la semaine — modèle partagé mobile / back-office.
 *
 * ⚠️ COPIE SYNCHRONE de `startup-ludo/src/types/weeklyChallenge.ts`. Les deux
 * dépôts sont séparés et ne partagent aucun paquet : toute modification ici
 * doit être reportée là-bas, et inversement. Le modèle décrit des documents
 * Firestore communs aux deux — une divergence se traduirait par des champs lus
 * mais jamais écrits, sans erreur de compilation d'aucun côté.
 *
 * Un thème entrepreneurial par semaine, ouvert le lundi et clos le dimanche à
 * 23:00 UTC. Les parties jouées SUR le défi alimentent un classement propre au
 * défi, d'où sort le champion de la semaine.
 *
 * ⚠️ NE PAS CONFONDRE avec les trois autres « challenges » du projet :
 *   - `challenges` / `ChallengeEnrollment` : l'ancien parcours YEAH à niveaux,
 *     avec livrables et secteurs (`src/types/challenge.ts`). Sans rapport.
 *   - `challengeEvents` : les cartes de jeu à jetons négatifs.
 *   - celui-ci : `weeklyChallenges`, un thème hebdomadaire.
 * Le nom `weeklyChallenges` est verbeux exprès — `challenges` est déjà pris, et
 * une collision ici serait silencieuse et coûteuse.
 */

/**
 * Statut d'un défi.
 *
 * `brouillon` → invisible du mobile. `ouvert` → joué et classé.
 * `clos` → visible en lecture (palmarès), plus de score accepté.
 *
 * La règle Firestore ne distingue pas ces statuts : c'est la requête du mobile
 * qui filtre sur `ouvert`. Un défi en brouillon est donc techniquement lisible
 * par un client curieux — il ne contient rien de sensible, juste un thème non
 * encore annoncé.
 */
export type StatutDefi = 'brouillon' | 'ouvert' | 'clos';

/**
 * Contenu de jeu d'un défi — miroir EXACT de `GameContentPack`
 * (`src/services/game/EventManager.ts`) et de `ClassSessionContent`.
 *
 * Les types sont volontairement `unknown[]` ici plutôt que `Quiz[]`, `Duel[]`…
 *
 * Raison : ce fichier est une COPIE SYNCHRONE partagée avec le back-office, qui
 * n'a pas les types de cartes du moteur de jeu. Les importer rendrait la copie
 * impossible à compiler là-bas. Côté mobile, `defiService` recoerce vers
 * `GameContentPack` au moment de l'injection — c'est là que la forme est
 * vérifiée, et c'est le seul endroit qui en a besoin.
 */
export interface DefiContenu {
  quizzes: unknown[];
  duels: unknown[];
  fundings: unknown[];
  opportunities: unknown[];
  challengeEvents: unknown[];
}

/** Métadonnées du document déposé — le texte, lui, vit en sous-collection. */
export interface DefiSource {
  /** Nom du fichier original, affiché au back-office. */
  nom: string;
  /** Nombre de pages extraites. 0 si l'extracteur ne l'a pas renseigné. */
  pages: number;
  /** Taille du texte extrait, en caractères — indique la richesse disponible. */
  caracteres: number;
  deposeAt: number;
}

/** Quantités de cartes à générer, par type. */
export interface MixDefi {
  quiz: number;
  duel: number;
  funding: number;
  opportunity: number;
  challenge: number;
}

/**
 * Mix par défaut d'un défi.
 *
 * Plus court qu'une séance de classe (8 quiz) : un défi se joue en quelques
 * minutes, seul, et doit pouvoir être rejoué dans la semaine. Un contenu trop
 * long ferait abandonner avant la fin, et le score ne refléterait alors que la
 * patience du joueur. Ces valeurs sont un point de départ : le back-office les
 * laisse ajuster selon la richesse du document.
 */
export const MIX_DEFI_DEFAUT: MixDefi = {
  quiz: 6,
  duel: 2,
  funding: 2,
  opportunity: 2,
  challenge: 2,
};

/** Le contenu a-t-il au moins une carte ? Un défi vide ne doit pas s'ouvrir. */
export function contenuNonVide(contenu: DefiContenu | null | undefined): boolean {
  if (!contenu) return false;
  return (
    contenu.quizzes.length +
      contenu.duels.length +
      contenu.fundings.length +
      contenu.opportunities.length +
      contenu.challengeEvents.length >
    0
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DÉFI DE LA SEMAINE — CYCLE HEBDOMADAIRE PAR ZONE
//
// Ajouts du lot 2. Tout est OPTIONNEL sur `WeeklyChallenge` : une version de
// l'app déjà installée ignore ces champs, et un défi créé avant eux reste
// lisible. C'est la contrainte n°4 de la spec — les anciennes versions ne
// doivent rien casser.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Zone d'un défi : un pays.
 *
 * ⚠️ À NE PAS CONFONDRE AVEC `profile.region`, qui existe déjà et désigne une
 * région INTERNE servant au ciblage des campagnes sponsors (Dakar, Thiès…).
 * La zone est le pays, et c'est elle qui découpe les classements.
 *
 * Les déclinaisons (`nom`, `avecArticle`) évitent de recomposer les phrases à
 * la main : « 1 240 joueurs au Sénégal » n'est pas « 1 240 joueurs Sénégal ».
 */
export interface ZoneDefi {
  /** ISO 3166-1 alpha-2, en majuscules : « SN ». */
  code: string;
  /** « Sénégal ». */
  nom: string;
  /** « le Sénégal » — pour « … au Sénégal ». */
  avecArticle: string;
  /** Emoji drapeau, affiché sur la pastille de la carte d'accueil. */
  drapeau?: string;
}

/**
 * État d'un défi dans son cycle, du point de vue du client.
 *
 * Distinct de `StatutDefi` (`brouillon` | `ouvert` | `clos`), qui reste le
 * statut ÉDITORIAL piloté depuis le back-office. Celui-ci se DÉDUIT des dates
 * et du statut : il n'est pas stocké, pour qu'un défi ne puisse pas rester
 * « ouvert » en base après sa date de clôture.
 *
 * - `a_venir`   : publié, avant l'ouverture.
 * - `ouvert`    : on joue, on marque des points.
 * - `en_calcul` : clôturé, note de qualité et classement en cours.
 * - `resultats` : résultats publiés, jusqu'à l'ouverture du défi suivant.
 */
export type EtatDefi = 'a_venir' | 'ouvert' | 'en_calcul' | 'resultats';

/**
 * Un chiffre d'impact affiché sur la présentation (« 40 000 ménages touchés »).
 *
 * ⚠️ `source` EST OBLIGATOIRE, et c'est délibéré. La spec interdit à Adia de
 * citer un chiffre non vérifié, et l'écran affiche la source sous les trois
 * chiffres. Un champ facultatif aurait laissé passer des chiffres orphelins
 * dans une application qui s'adresse à des enseignants et à des élèves.
 */
export interface ChiffreDefi {
  /** « 40 000 », « ×2 », « 3 mois ». Une chaîne : l'unité fait partie du sens. */
  valeur: string;
  /** « ménages touchés ». */
  libelle: string;
  /** D'où vient ce chiffre. Vide = le chiffre n'est pas affiché. */
  source: string;
}

/** Vidéo de présentation du défi, facultative. */
export interface VideoDefi {
  /** URL du fichier. Absente, le bloc vidéo n'est pas affiché. */
  url: string;
  /** Image affichée avant lecture — jamais de lecture automatique. */
  posterUrl?: string;
  /** Durée en secondes, annoncée au joueur. */
  dureeS?: number;
  /** Poids en Mo, annoncé : le réseau se paie, ici. */
  poidsMo?: number;
  /** Piste de sous-titres WebVTT. La vidéo doit se comprendre sans le son. */
  sousTitresUrl?: string;
}

/**
 * Les listes d'idéation, propres à CE défi.
 *
 * Trois tours de choix guidés — angle, cible, mission — puis génération de
 * trois pistes. Remplace les questions ouvertes du lot précédent : des
 * réponses libres donnaient des idées qui se ressemblaient d'un joueur à
 * l'autre, là où des angles écrits pour le thème ancrent les propositions.
 *
 * `pistesExpress` est le FILET : si le modèle ne répond pas (quota, réseau,
 * clé absente), ces pistes écrites à la main prennent le relais. Sans elles,
 * une panne d'API laisserait le joueur sans aucune idée à choisir.
 */
export interface IdeationDefi {
  /** « Prévenir », « Assainir »… Six environ, affichés en cartes. */
  angles: string[];
  /** « Ménages », « Écoles »… Affichés en pastilles. */
  cibles: string[];
  /** « Protéger la santé », « Réduire les coûts »… */
  missions: string[];
  /** Repli hors-ligne, et secours en cas de panne du modèle. */
  pistesExpress?: PisteDefi[];
}

/** Une proposition d'idée : par Adia, ou écrite d'avance pour le repli. */
export interface PisteDefi {
  id: string;
  /** Nom de marque, court. */
  nom: string;
  /** Ce que fait l'entreprise, en une phrase. */
  description: string;
  /** « Ménages des quartiers inondés ». */
  pourQui: string;
  /**
   * Pourquoi cette piste tient : « La demande revient à chaque hivernage ».
   * C'est ce qui distingue une proposition d'une liste de noms.
   */
  interet?: string;
}

/** Le lot promis au podium, configurable par défi. */
export interface LotDefi {
  /** « lot + accompagnement CONCREE » — tient sur une ligne. */
  court: string;
  /** « Kit de démarrage + 3 mois d'accompagnement CONCREE ». */
  long?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// L'IDÉE DU JOUEUR, ET SES BRIQUES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Les cinq parties d'une idée, dans l'ordre où elles se posent.
 *
 * Ordre FIXE et identique pour tous les défis : une partie terminée pose la
 * brique suivante, sans que le joueur ait à choisir laquelle. Le choix
 * ajouterait une décision à un moment — la fin de partie — où le joueur veut
 * voir son score, pas remplir un formulaire.
 */
export const BRIQUES_IDEE = [
  'probleme',
  'cible',
  'solution',
  'revenu',
  'convaincre',
] as const;

export type TypeBrique = (typeof BRIQUES_IDEE)[number];

/** Nombre de briques d'une idée complète. Dérivé, jamais écrit en dur. */
export const NOMBRE_BRIQUES = BRIQUES_IDEE.length;

/**
 * Une brique posée à la fin d'une partie.
 *
 * `texteAdia` est conservé À CÔTÉ de `texteFinal` : si le joueur corrige, on
 * garde ce que le modèle avait proposé. C'est la seule façon de mesurer plus
 * tard si Adia écrit juste — en comparant ce qu'elle propose à ce que les
 * joueurs gardent.
 */
export interface BriqueIdee {
  type: TypeBrique;
  /** Rédigé par Adia, 160 caractères au plus. */
  texteAdia: string;
  /** Ce que le joueur a validé. Égal à `texteAdia` s'il n'a rien touché. */
  texteFinal: string;
  /** Vrai si le joueur a réécrit la brique. */
  corrigee: boolean;
  /** Partie qui l'a posée — trace, et garde-fou contre un double comptage. */
  gameId: string;
  poseeAt: number;
}

/** D'où vient l'idée : une piste proposée, ou le joueur lui-même. */
export type OrigineIdee = 'piste' | 'personnelle';

/**
 * L'idée de solution d'un joueur pour un défi.
 *
 * UNE SEULE idée active par joueur et par défi. Changer d'idée désactive la
 * précédente sans la supprimer : les briques déjà payées restent, et c'est ce
 * qui permet de ne pas repayer les mêmes points (décision D3 de la spec).
 */
export interface IdeeDefi {
  /** `{defiId}_{userId}` — un document par joueur et par défi. */
  id: string;
  defiId: string;
  userId: string;
  /** Zone FIGÉE à la création : déménager en cours de semaine ne doit pas
   *  déplacer un joueur d'un classement à l'autre en milieu de défi. */
  zoneCode: string;

  nom: string;
  description: string;
  pourQui: string;

  /** Les trois choix de l'idéation, conservés pour la note de qualité. */
  angle?: string;
  cible?: string;
  mission?: string;

  origine: OrigineIdee;
  /** Fausse pour une idée remplacée. On ne supprime jamais. */
  active: boolean;

  briques: BriqueIdee[];

  creeAt: number;
  majAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// BARÈME
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Points du défi.
 *
 * ⚠️ ÉCART ASSUMÉ AVEC LA SPEC, qui proposait 20 / 30. Dans le reste du jeu,
 * gagner rapporte 50 XP contre 10 pour une partie jouée : la victoire vaut
 * cinq fois la participation. Appliquer 20 / 30 aurait fait du défi le seul
 * endroit où gagner ne compte presque pas — sur un jeu de plateau, c'est dire
 * au joueur que sa partie est un prétexte.
 *
 * Une brique vaut autant qu'une victoire, pas davantage : avancer son idée et
 * bien jouer sont deux façons également valables de monter au classement.
 */
export const POINTS_DEFI = {
  /** Partie terminée, gagnée ou non. */
  partie: 20,
  /** Partie gagnée, en plus de la participation. */
  victoire: 60,
  /** Brique posée. Cinq au total sur la semaine. */
  brique: 60,
  /** Note de qualité d'Adia à la clôture, de 0 à ce plafond. */
  qualiteMax: 200,
} as const;

/**
 * Parties COMPTÉES par jour.
 *
 * Au-delà, on peut continuer de jouer — la partie se déroule normalement et
 * les XP ordinaires sont gagnés — mais elle ne rapporte plus de points de
 * défi. L'écran doit l'annoncer AVANT la partie : découvrir après coup que
 * rien n'a compté est la pire façon de l'apprendre.
 *
 * Pas de durée minimale de partie, contrairement à la spec : deux garde-fous
 * suffisent (une partie abandonnée ne pose pas de brique, et ce plafond borne
 * le gain quotidien). Un seuil de durée mal calibré punirait un joueur rapide,
 * et il ne comprendrait pas pourquoi.
 */
export const PARTIES_COMPTEES_PAR_JOUR = 3;

export interface WeeklyChallenge {
  /** Id du document. Convention : `AAAA-Sxx` (ex. `2026-S42`), lisible en base. */
  id: string;
  /** Thème affiché, court : « Trouver ses premiers clients ». */
  titre: string;
  /** Une à deux phrases. Ce que le joueur doit retenir du thème. */
  description: string;

  /**
   * Image de fond de la carte d'accueil, en pleine largeur.
   *
   * Même rôle que `bannerUrl` d'un `ProgramPartner`, et la carte du défi suit
   * le même patron visuel (`PartnerHomeCard`). `null` ou absent : la carte
   * retombe sur un fond dégradé, elle reste donc lisible sans image — un défi
   * créé à la hâte ne doit pas produire une carte vide.
   *
   * ⚠️ OPTIONNEL AVEC `?`, pas seulement `| null` : les défis créés avant
   * l'ajout du champ n'ont PAS la clé en base, et Firestore ne la matérialise
   * pas à `null`. Un type non optionnel mentirait sur ce que le mobile reçoit.
   */
  bannerUrl?: string | null;

  statut: StatutDefi;

  /**
   * Document source du défi — la matière première du contenu.
   *
   * ⚠️ LE TEXTE EXTRAIT N'EST PAS STOCKÉ ICI. Seules ses métadonnées le sont
   * (nom du fichier, nombre de pages) : le texte d'un document peut peser
   * plusieurs centaines de kilo-octets, et un document Firestore plafonne à
   * 1 Mo — un défi lu à chaque ouverture de l'accueil n'a pas à le transporter.
   *
   * Le texte vit dans la sous-collection `weeklyChallenges/{id}/sourceDocs`,
   * sur le modèle de `classSessions/{sid}/sourceDocs`. Seul le back-office le
   * lit, au moment de générer.
   *
   * `null` quand aucun document n'a été déposé.
   */
  source: DefiSource | null;

  /**
   * Contenu de jeu du défi, généré UNE FOIS et figé.
   *
   * ═══ POURQUOI LE DÉFI PORTE SON PROPRE CONTENU ═══
   *
   * Sans lui, « jouer le défi » lançait une partie ordinaire et le thème
   * n'était qu'une étiquette : le joueur voyait les mêmes cartes qu'en partie
   * libre, et seul le comptage des XP changeait. La promesse « le défi de la
   * semaine sur les premiers clients » n'était pas tenue.
   *
   * Même forme que `ClassSessionContent` et `GameContentPack` : c'est ce qui
   * permet de l'injecter avec `eventManager.setContentPack()` SANS toucher au
   * moteur de jeu.
   *
   * ═══ LE CONTENU EST INDÉPENDANT DES ÉDITIONS ═══
   *
   * Il vient d'un document fourni avec le défi, pas d'une édition du jeu. Le
   * moteur a besoin d'une édition pour le plateau (cases, secteurs affichés),
   * mais AUCUNE de ses cartes n'est tirée : le pack du défi les remplace toutes.
   * L'édition utilisée est donc un détail technique, choisi par le mobile et
   * invisible du back-office — cf. `EDITION_PLATEAU_DEFI`.
   *
   * ⚠️ `null` tant que le contenu n'a pas été généré. Un défi sans contenu NE
   * DOIT PAS être ouvert — le back-office l'en empêche. Ouvrir un défi vide
   * ferait tirer les cartes ordinaires de l'édition, c'est-à-dire exactement le
   * problème que ce champ corrige, mais en silence.
   */
  contenu: DefiContenu | null;

  // ─── Cycle hebdomadaire par zone (lot 2) ───
  // Tous optionnels : un défi créé avant ces champs reste lisible, et une
  // version de l'app déjà installée les ignore.

  /** Pays du défi. Absent = défi hérité, traité comme sans zone. */
  zone?: ZoneDefi;
  /** Numéro de semaine ISO, affiché (« SEMAINE 43 »). */
  semaine?: number;
  /** IANA, pour que J-n et le plafond quotidien se calculent chez le joueur. */
  fuseau?: string;
  /** Publication des résultats, en ms epoch. Après la clôture. */
  resultatsAt?: number;

  /** Déclinaisons du thème, pour composer les textes sans les réécrire. */
  themeAvecArticle?: string;
  /** « aux inondations » — pour « des solutions aux inondations ». */
  themeAvecDe?: string;
  /** « les quartiers inondés ». */
  beneficiaires?: string;

  /** Contexte donné à Adia. Jamais affiché tel quel au joueur. */
  problemePourAdia?: string;
  /**
   * Faits VÉRIFIÉS qu'Adia peut citer. Vide, elle n'en cite aucun : mieux vaut
   * une réponse sans chiffre qu'un chiffre inventé.
   */
  faitsPourAdia?: string[];

  /** Trois chiffres d'impact, chacun avec sa source. */
  chiffres?: ChiffreDefi[];
  /** Vidéo de 30 s. Absente, le bloc n'est pas affiché. */
  video?: VideoDefi;
  /** Angles, cibles, missions et pistes de repli. */
  ideation?: IdeationDefi;
  /** Lot du podium. */
  lot?: LotDefi;

  /** Ouverture, en millisecondes epoch (UTC). */
  debutAt: number;
  /** Clôture, en millisecondes epoch. Dimanche 23:00 UTC. */
  finAt: number;

  /**
   * Champion désigné à la clôture, figé.
   *
   * Écrit UNE FOIS par la Cloud Function de clôture, puis jamais relu depuis
   * `defiScores` : un classement recalculé après coup pourrait changer d'avis
   * (un score arrivé en retard, un compte supprimé) et déposséder le champion
   * annoncé. Ce qui est annoncé est figé.
   */
  champion: ChampionDefi | null;

  /** Nombre de joueurs ayant marqué au moins un point. Figé à la clôture. */
  participants: number;

  creeAt: number;
  majAt: number;
}

export interface ChampionDefi {
  userId: string;
  /** Copié à la clôture : le joueur peut renommer son compte ensuite. */
  displayName: string;
  xp: number;
}

/**
 * Score d'un joueur sur UN défi (`defiScores/{defiId}_{uid}`).
 *
 * Collection séparée, et non un champ `defiXP` dans `userStats`, pour trois
 * raisons :
 *   - aucun reset hebdomadaire à faire — chaque défi a ses propres documents,
 *     là où un champ unique devrait être vidé chaque lundi ;
 *   - l'historique survit : le palmarès des défis passés reste consultable ;
 *   - `weeklyXP` continue de mesurer l'activité de la semaine, ce qui est son
 *     rôle. Mélanger les deux ferait du « classement du défi » un classement
 *     d'activité, et la promesse du thème n'aurait plus de sens.
 *
 * L'id est composé (`{defiId}_{uid}`) et non auto-généré : il rend l'écriture
 * idempotente. Deux parties terminées en même temps mettent à jour le même
 * document au lieu d'en créer deux, et l'incrément se fait en transaction.
 */
export interface DefiScore {
  /** `{defiId}_{userId}` */
  id: string;
  defiId: string;
  userId: string;
  /** Dénormalisé pour afficher le classement sans N lectures de `users`. */
  displayName: string;
  /** Avatar dénormalisé, même raison. `null` si le joueur n'en a pas. */
  avatarUrl: string | null;

  /** XP cumulés sur ce défi uniquement. */
  xp: number;
  /** Parties jouées sur ce défi. Sert à départager à XP égal. */
  parties: number;

  /**
   * Jour (AAAA-MM-JJ, fuseau du défi) des parties comptées ci-dessous.
   *
   * Stocké en clair plutôt qu'en horodatage : la comparaison est une égalité
   * de chaînes, sans calcul de fuseau à chaque lecture. C'est le fuseau du
   * DÉFI qui fait foi — un joueur en déplacement ne doit pas gagner un
   * quatrième créneau en changeant d'heure locale.
   */
  jourCompte?: string;
  /**
   * Parties déjà comptées ce jour-là.
   *
   * Au-delà du plafond, on peut continuer de jouer : la partie se déroule
   * normalement et les XP ordinaires sont gagnés, mais elle ne rapporte plus
   * de points de défi. L'écran l'annonce AVANT — découvrir après coup que
   * rien n'a compté est la pire façon de l'apprendre.
   */
  partiesDuJour?: number;

  majAt: number;
}

/** Id de document d'un score, à utiliser partout plutôt que de concaténer à la main. */
export function idDefiScore(defiId: string, userId: string): string {
  return `${defiId}_${userId}`;
}

/**
 * Le défi est-il ouvert aux scores, à l'instant donné ?
 *
 * Vérifie le statut ET la fenêtre de temps. Les deux, parce qu'ils peuvent
 * diverger : la Cloud Function de clôture peut avoir du retard (démarrage à
 * froid, relance), et une partie terminée à 23:01 ne doit pas compter même si
 * `statut` est encore `ouvert`.
 */
export function defiAccepteDesScores(defi: WeeklyChallenge, maintenant = Date.now()): boolean {
  return defi.statut === 'ouvert' && maintenant >= defi.debutAt && maintenant < defi.finAt;
}

/**
 * Contexte d'une partie jouée SUR le défi.
 *
 * Même forme que `ProgramGameContext` et `ClassGameContext` : un discriminant
 * `origin` que `initGame` teste pour router le contexte.
 *
 * ⚠️ `origin: 'defi'` DOIT être testé dans `useGameStore.initGame` AVANT le
 * repli qui déduit `challengeContext` par élimination. Ce repli capture tout
 * contexte dont l'`origin` n'est pas reconnu : un contexte de défi y tomberait
 * et le store irait chercher un sous-niveau du parcours YEAH qui n'existe pas.
 * Le même bug s'est produit avec le Mode Classe — c'est écrit dans le
 * commentaire de `initGame`.
 *
 * Le défi ne porte PAS de contenu de jeu dédié : il définit un thème, pas un
 * pack de cartes. Une partie sur le défi se joue avec le contenu ordinaire de
 * son édition ; seul le score compte à part.
 */
export interface DefiGameContext {
  origin: 'defi';
  /** Id du défi (`AAAA-Sxx`), clé de `defiScores/{defiId}_{uid}`. */
  defiId: string;
  /** Recopié pour l'affichage en fin de partie, sans relire le défi. */
  titre: string;
  /**
   * Clôture du défi, en ms.
   *
   * Portée dans le contexte pour que la fin de partie puisse décider SANS
   * relire Firestore : une partie commencée avant la clôture et finie après ne
   * doit pas compter — le champion est déjà figé.
   */
  finAt: number;
}
