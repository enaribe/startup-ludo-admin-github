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

/**
 * Une question du questionnaire d'idéation, posée avant de créer son entreprise.
 *
 * ═══ OUVERTE, PAS À CHOIX MULTIPLES ═══
 *
 * Le joueur ÉCRIT sa réponse. Des choix fermés produiraient des combinaisons
 * finies, donc des idées qui se répètent d'un joueur à l'autre : sur un même
 * défi, trois joueurs sur quatre repartiraient avec la même. Une réponse
 * libre porte le vocabulaire du joueur, et c'est elle qui fait que les trois
 * idées proposées lui ressemblent.
 *
 * C'est aussi ce qui rend l'étape formatrice : formuler soi-même le problème
 * qu'on veut résoudre est le premier geste de l'entrepreneur.
 */
export interface QuestionIdeation {
  /** Stable, pour suivre les réponses sans dépendre de l'ordre d'affichage. */
  id: string;
  /** La question, telle que le joueur la lit. */
  texte: string;
  /**
   * Exemple affiché en gris dans le champ. Il n'est pas décoratif : devant une
   * question ouverte, un joueur ne sait pas quelle longueur ni quel niveau de
   * détail on attend, et répond « oui » ou laisse vide.
   */
  exemple?: string;
}

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

  /**
   * Questions ouvertes posées au joueur avant qu'il crée son entreprise.
   *
   * Leurs réponses nourrissent la génération des trois idées proposées : ce
   * sont elles qui ancrent les propositions dans le thème de la semaine plutôt
   * que dans l'entrepreneuriat en général.
   *
   * VIDE OU ABSENT : le mobile se rabat sur les cartes d'idéation génériques
   * (cible / mission / secteur). Un défi publié sans questionnaire reste donc
   * jouable — le parcours ne doit pas dépendre d'un champ facultatif.
   */
  questionsIdeation?: QuestionIdeation[];

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
