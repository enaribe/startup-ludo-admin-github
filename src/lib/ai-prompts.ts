/**
 * AI Generation Prompts - Templates for each content type
 * ALIGNED with mobile app data structures
 */

export type GenerationType =
  | 'edition_quiz'
  | 'edition_duels'
  | 'edition_fundings'
  | 'edition_opportunities'
  | 'edition_challenges'
  | 'edition_full'
  | 'challenge_levels'
  | 'challenge_sectors'
  | 'challenge_full'
  | 'ideation_targets'
  | 'ideation_missions'
  | 'ideation_sectors'
  | 'sublevel_content'
  | 'sublevel_content_import'
  | 'achievements'
  | 'default_projects'
  | 'edition_projects_import'
  | 'personas'
  | 'program_eligibility';

interface PromptConfig {
  systemPrompt: string;
  buildUserPrompt: (userInput: string, context?: Record<string, unknown>) => string;
  label: string;
  placeholder: string;
  description: string;
}

const BASE_SYSTEM = `Tu es un assistant specialise dans la creation de contenu pour "Startup Ludo", un jeu de plateau educatif sur l'entrepreneuriat en Afrique. Le jeu enseigne la creation de startups, le financement, la strategie business, etc.

REGLES IMPORTANTES:
- Reponds UNIQUEMENT avec du JSON valide, sans markdown ni texte avant/apres
- Le contenu doit etre educatif, pertinent au contexte africain
- Les questions doivent avoir exactement 3 options de reponse
- Les descriptions doivent etre concises (1-2 phrases max)
- Genere du contenu en francais`;

export const PROMPTS: Record<GenerationType, PromptConfig> = {
  edition_quiz: {
    label: 'Quiz',
    placeholder: 'Ex: 10 questions sur le financement des startups en Afrique de l\'Ouest',
    description: 'Genere des questions de quiz avec 3 options et la bonne reponse',
    systemPrompt: `${BASE_SYSTEM}

Genere un tableau JSON de questions de quiz. Format:
[
  {
    "id": "quiz_1",
    "question": "La question...",
    "options": ["Option A", "Option B", "Option C"],
    "correctAnswer": 0,
    "category": "financement",
    "difficulty": "facile",
    "explanation": "Explication courte"
  }
]
correctAnswer est l'index (0, 1, ou 2) de la bonne reponse.
category: une des valeurs "business-model", "financement", "marketing", "legal", "management", "tech", "pitch", "strategie", "aspects-techniques".
difficulty: "facile", "moyen", ou "difficile".`,
    buildUserPrompt: (input, ctx) =>
      `Edition: ${ctx?.editionName || 'generale'}. Secteurs: ${ctx?.sectors || 'multi-secteurs'}.\n\nDemande: ${input}`,
  },

  edition_duels: {
    label: 'Duels',
    placeholder: 'Ex: 12 questions de duel sur l\'entrepreneuriat en Afrique',
    description: 'Genere des questions de duel (3 reponses avec points differents)',
    systemPrompt: `${BASE_SYSTEM}

Genere un tableau JSON de questions de duel. En jeu, 2 joueurs repondent aux memes 3 questions. Chaque question a 3 reponses, toutes valides mais avec des points differents (30 = meilleure, 20 = bonne, 10 = acceptable). Le joueur avec le plus de points gagne le duel.

Format:
[
  {
    "id": "duel_1",
    "question": "La question sur l'entrepreneuriat...",
    "options": [
      { "text": "La meilleure reponse", "points": 30 },
      { "text": "Une bonne reponse", "points": 20 },
      { "text": "Une reponse acceptable", "points": 10 }
    ],
    "category": "business"
  }
]

IMPORTANT: Melange l'ordre des options (la meilleure reponse ne doit PAS toujours etre en premier).
Categories possibles: business, financement, pitch, marketing, strategie, management, tech, recrutement, pricing, validation, metriques.`,
    buildUserPrompt: (input, ctx) =>
      `Edition: ${ctx?.editionName || 'generale'}.\n\nDemande: ${input}`,
  },

  edition_fundings: {
    label: 'Fundings',
    placeholder: 'Ex: 6 evenements de financement realistes pour des startups tech',
    description: 'Genere des evenements de financement (levee de fonds, subventions...)',
    systemPrompt: `${BASE_SYSTEM}

Genere un tableau JSON d'evenements de financement. Format:
[
  {
    "id": "fund_1",
    "title": "Titre court",
    "description": "Description de l'evenement (1-2 phrases)",
    "tokens": 3,
    "source": "Tontine"
  }
]
tokens: nombre de jetons gagnes (1-10 typiquement).
source: type de financement (ex: "Tontine", "Microcredit", "Investisseur providentiel", "Subvention gouvernementale", "Crowdfunding").`,
    buildUserPrompt: (input, ctx) =>
      `Edition: ${ctx?.editionName || 'generale'}.\n\nDemande: ${input}`,
  },

  edition_opportunities: {
    label: 'Opportunites',
    placeholder: 'Ex: 15 opportunites positives pour les startups africaines',
    description: 'Genere des cartes opportunite (evenements positifs)',
    systemPrompt: `${BASE_SYSTEM}

Genere un tableau JSON de cartes opportunite. Les opportunites sont TOUJOURS positives. Format:
[
  {
    "id": "opp_1",
    "title": "Titre court",
    "description": "Ce qui se passe... Gagnez X jetons.",
    "tokens": 3
  }
]
tokens: nombre de jetons gagnes (toujours positif, 1-5 typiquement).`,
    buildUserPrompt: (input, ctx) =>
      `Edition: ${ctx?.editionName || 'generale'}.\n\nDemande: ${input}`,
  },

  edition_challenges: {
    label: 'Challenges en jeu',
    placeholder: 'Ex: 10 defis/obstacles pour les startups',
    description: 'Genere des challenges (evenements negatifs) pour le plateau',
    systemPrompt: `${BASE_SYSTEM}

Genere un tableau JSON de challenges de plateau. Les challenges sont des evenements NEGATIFS (obstacles, difficultes). Format:
[
  {
    "id": "chal_1",
    "title": "Titre du defi",
    "description": "Ce qui arrive au joueur. Perdez X jetons.",
    "tokens": -3
  }
]
tokens: nombre de jetons perdus (toujours NEGATIF, ex: -2, -3, -5).`,
    buildUserPrompt: (input, ctx) =>
      `Edition: ${ctx?.editionName || 'generale'}.\n\nDemande: ${input}`,
  },

  edition_full: {
    label: 'Edition complete',
    placeholder: 'Ex: Edition complete sur les energies renouvelables en Afrique',
    description: 'Genere TOUT le contenu d\'une edition d\'un coup',
    systemPrompt: `${BASE_SYSTEM}

Genere un objet JSON complet pour une edition du jeu. Format:
{
  "name": "Nom de l'edition",
  "description": "Description courte",
  "icon": "nom-icone-ionicons",
  "color": "#HEXCOLOR",
  "sectors": ["secteur1", "secteur2"],
  "quizzes": [
    { "id": "quiz_1", "question": "...", "options": ["A","B","C"], "correctAnswer": 0, "category": "financement", "difficulty": "facile", "explanation": "..." }
  ],
  "duels": [
    { "id": "duel_1", "question": "...", "options": [{"text": "Meilleure", "points": 30}, {"text": "Bonne", "points": 20}, {"text": "Acceptable", "points": 10}], "category": "business" }
  ],
  "fundings": [
    { "id": "fund_1", "title": "...", "description": "...", "tokens": 3, "source": "Tontine" }
  ],
  "opportunities": [
    { "id": "opp_1", "title": "...", "description": "...", "tokens": 3 }
  ],
  "challenges": [
    { "id": "chal_1", "title": "...", "description": "...", "tokens": -3 }
  ],
  "defaultProjects": [
    { "id": "proj_1", "name": "Nom de la startup", "description": "Pitch court (2-3 phrases)", "sector": "secteur_correspondant", "target": "Cible client", "mission": "Mission/vision de la startup", "initialBudget": 100000 }
  ],
  "enabled": true
}

Genere au minimum: 15 quiz, 10 duels, 8 fundings, 15 opportunites, 10 challenges, 4 defaultProjects. Plus si demande. IMPORTANT: genere le MAXIMUM de contenu possible, ne te limite pas aux minimums.

Pour les defaultProjects:
- Chaque projet doit avoir un id unique (slug, ex: "agritech-smart-irrigation")
- Le nom doit sonner africain et moderne
- La description doit etre un pitch realiste et concis (2-3 phrases max)
- Le secteur doit correspondre a un des secteurs de l'edition
- La cible doit decrire qui sont les clients
- La mission doit exprimer la vision de la startup
- initialBudget est optionnel, entre 50000 et 200000`,
    buildUserPrompt: (input) => input,
  },

  challenge_levels: {
    label: 'Niveaux de challenge',
    placeholder: 'Ex: 4 niveaux progressifs (ideation, validation, lancement, croissance) avec 4 sous-niveaux chacun',
    description: 'Genere des niveaux et sous-niveaux pour un programme de challenges',
    systemPrompt: `${BASE_SYSTEM}

Genere un tableau JSON de niveaux pour un programme de challenge entrepreneurial. Format:
[
  {
    "id": "lvl_1",
    "title": "Nom du niveau",
    "description": "Description",
    "order": 1,
    "subLevels": [
      {
        "id": "sub_1_1",
        "title": "Nom du sous-niveau",
        "description": "Ce que l'entrepreneur doit accomplir",
        "order": 1,
        "deliverables": [],
        "xpReward": 50
      }
    ]
  }
]`,
    buildUserPrompt: (input, ctx) =>
      `Programme: ${ctx?.programName || 'Challenge Entrepreneurial'}.\n\nDemande: ${input}`,
  },

  challenge_sectors: {
    label: 'Secteurs',
    placeholder: 'Ex: 6 secteurs porteurs pour les startups africaines',
    description: 'Genere des secteurs pour un programme de challenges',
    systemPrompt: `${BASE_SYSTEM}

Genere un tableau JSON de secteurs. Format:
[
  {
    "id": "sec_1",
    "name": "Nom du secteur",
    "description": "Description courte du secteur",
    "icon": "nom-icone-ionicons"
  }
]
Utilise des noms d'icones Ionicons valides (ex: leaf-outline, medical-outline, school-outline, etc.)`,
    buildUserPrompt: (input) => input,
  },

  challenge_full: {
    label: 'Programme complet',
    placeholder: 'Instructions supplementaires pour la generation du programme...',
    description: 'Genere un programme de challenge complet (niveaux + sous-niveaux + secteurs)',
    systemPrompt: `${BASE_SYSTEM}

Genere un objet JSON complet pour un programme de challenge entrepreneurial. Format:
{
  "name": "Nom du programme",
  "description": "Description du programme (2-3 phrases)",
  "levels": [
    {
      "id": "lvl_1",
      "title": "Nom du niveau",
      "description": "Description du niveau et ses objectifs",
      "order": 1,
      "subLevels": [
        {
          "id": "sub_1_1",
          "title": "Nom du sous-niveau",
          "description": "Ce que l'entrepreneur doit accomplir a cette etape",
          "order": 1,
          "deliverables": [],
          "xpReward": 50,
          "cardCategories": ["quiz", "opportunity", "funding"]
        }
      ]
    }
  ],
  "sectors": [
    {
      "id": "sec_1",
      "name": "Nom du secteur",
      "description": "Description courte du secteur",
      "icon": "nom-icone-ionicons"
    }
  ],
  "enabled": true
}

REGLES:
- Les niveaux doivent etre progressifs (du plus simple au plus avance)
- Exemples de progression: Ideation -> Validation -> Lancement -> Croissance
- Chaque sous-niveau doit avoir un objectif clair et actionnable
- xpReward augmente avec la difficulte (50-200 pour les premiers niveaux, 200-500 pour les avances)
- Les secteurs doivent etre pertinents au contexte africain
- Utilise des icones Ionicons valides (ex: bulb-outline, rocket-outline, people-outline, leaf-outline, medical-outline, school-outline, cart-outline, globe-outline)
- Les IDs doivent etre uniques: lvl_1, lvl_2... et sub_1_1, sub_1_2, sub_2_1...
- Chaque sous-niveau doit avoir un champ "cardCategories" : tableau parmi ["quiz", "duel", "opportunity", "funding", "challenge"]
- Progression des cardCategories: niveaux debut = ["quiz", "opportunity", "funding"] (positif), niveaux milieu = ["quiz", "challenge", "opportunity", "duel"] (mixte), niveaux avances = ["quiz", "duel", "challenge", "funding"] (difficile)`,
    buildUserPrompt: (input, ctx) => {
      const parts: string[] = [];
      parts.push('=== BRIEFING DU PROGRAMME ===');
      if (ctx?.programName) parts.push(`Nom: ${ctx.programName}`);
      if (ctx?.organization) parts.push(`Organisation: ${ctx.organization}`);
      if (ctx?.thematic) parts.push(`Thematique/domaine: ${ctx.thematic}`);
      if (ctx?.targetAudience) parts.push(`Public cible: ${ctx.targetAudience}`);
      if (ctx?.levelCount) parts.push(`Nombre de niveaux: ${ctx.levelCount}`);
      if (ctx?.subLevelCount) parts.push(`Sous-niveaux par niveau: ${ctx.subLevelCount}`);
      if (ctx?.sectorCount) parts.push(`Nombre de secteurs: ${ctx.sectorCount}`);
      if (input.trim()) parts.push(`\nInstructions supplementaires: ${input}`);
      return parts.join('\n');
    },
  },

  ideation_targets: {
    label: 'Cartes Cibles',
    placeholder: 'Ex: 20 cibles de marche variees pour des startups africaines',
    description: 'Genere des cartes "cible" pour l\'ideation (qui est le client?)',
    systemPrompt: `${BASE_SYSTEM}

Genere un tableau JSON de cartes d'ideation de type "cible" (target audience). Format:
[
  { "id": "card_1", "type": "target", "text": "Description de la cible de marche" }
]
Chaque carte decrit un segment de marche ou un type de client potentiel.`,
    buildUserPrompt: (input) => input,
  },

  ideation_missions: {
    label: 'Cartes Missions',
    placeholder: 'Ex: 25 missions/problemes a resoudre dans le contexte africain',
    description: 'Genere des cartes "mission" (quel probleme resoudre?)',
    systemPrompt: `${BASE_SYSTEM}

Genere un tableau JSON de cartes d'ideation de type "mission". Format:
[
  { "id": "card_1", "type": "mission", "text": "La mission/le probleme a resoudre" }
]
Chaque carte decrit un probleme concret ou une mission entrepreneuriale.`,
    buildUserPrompt: (input) => input,
  },

  ideation_sectors: {
    label: 'Cartes Secteurs',
    placeholder: 'Ex: 15 secteurs d\'activite innovants',
    description: 'Genere des cartes "secteur" (dans quel domaine?)',
    systemPrompt: `${BASE_SYSTEM}

Genere un tableau JSON de cartes d'ideation de type "secteur". Format:
[
  { "id": "card_1", "type": "sector", "text": "Nom du secteur d'activite" }
]`,
    buildUserPrompt: (input) => input,
  },

  sublevel_content: {
    label: 'Contenu du sous-niveau',
    placeholder: 'Instructions supplementaires (optionnel)',
    description: 'Genere le pack de contenu (quiz, duels, etc.) pour un sous-niveau',
    systemPrompt: `${BASE_SYSTEM}

Genere un objet JSON de contenu educatif pour un sous-niveau de challenge. Le contenu doit etre SPECIFIQUE au theme du sous-niveau et du programme.

Selon les "cardCategories" demandees, genere UNIQUEMENT les types correspondants:

{
  "quizzes": [
    { "id": "quiz_1", "question": "...", "options": ["A","B","C"], "correctAnswer": 0, "category": "...", "difficulty": "facile|moyen|difficile", "explanation": "..." }
  ],
  "duels": [
    { "id": "duel_1", "question": "...", "options": [{"text": "Meilleure", "points": 30}, {"text": "Bonne", "points": 20}, {"text": "Acceptable", "points": 10}], "category": "..." }
  ],
  "fundings": [
    { "id": "fund_1", "title": "...", "description": "...", "tokens": 3, "source": "..." }
  ],
  "opportunities": [
    { "id": "opp_1", "title": "...", "description": "...", "tokens": 3 }
  ],
  "challengeEvents": [
    { "id": "chal_1", "title": "...", "description": "...", "tokens": -3 }
  ]
}

REGLES:
- Genere ~5 quiz, ~3 duels, ~3 fundings, ~3 opportunites, ~3 challengeEvents (seulement les types demandes)
- Les questions de quiz DOIVENT etre en rapport direct avec le theme du sous-niveau
- Les duels doivent melanger l'ordre des options (meilleure reponse pas toujours en premier)
- Les fundings ont des tokens positifs (1-10), les challengeEvents ont des tokens NEGATIFS (-1 a -5)
- Ne genere QUE les types listes dans cardCategories
- Le contenu doit etre educatif et pertinent au contexte africain`,
    buildUserPrompt: (input, ctx) => {
      const parts: string[] = [];
      parts.push(`=== CONTEXTE ===`);
      if (ctx?.programName) parts.push(`Programme: ${ctx.programName}`);
      if (ctx?.programDescription) parts.push(`Description: ${ctx.programDescription}`);
      if (ctx?.levelTitle) parts.push(`Niveau: ${ctx.levelTitle}`);
      if (ctx?.levelDescription) parts.push(`Description du niveau: ${ctx.levelDescription}`);
      if (ctx?.subLevelTitle) parts.push(`Sous-niveau: ${ctx.subLevelTitle}`);
      if (ctx?.subLevelDescription) parts.push(`Description du sous-niveau: ${ctx.subLevelDescription}`);
      if (ctx?.sectorName) parts.push(`\n=== SECTEUR CIBLE ===\nSecteur: ${ctx.sectorName}${ctx.sectorDescription ? `\nDescription du secteur: ${ctx.sectorDescription}` : ''}\nIMPORTANT: Tout le contenu genere doit etre SPECIFIQUE a ce secteur. Les questions, scenarios et exemples doivent etre contextualises pour le secteur "${ctx.sectorName}".`);
      if (ctx?.cardCategories) parts.push(`\nTypes de contenu a generer: ${(ctx.cardCategories as string[]).join(', ')}`);
      if (input.trim()) parts.push(`\nInstructions supplementaires: ${input}`);
      return parts.join('\n');
    },
  },

  sublevel_content_import: {
    label: 'Import texte brut',
    placeholder: 'Colle ici ton texte contenant les quiz, duels, opportunites, financements, defis...',
    description: 'Analyse un texte brut et extrait le contenu structuré (quiz, duels, etc.)',
    systemPrompt: `${BASE_SYSTEM}

Tu reçois un texte brut (notes, document, copier-coller) contenant des informations sur des quiz, duels, financements, opportunités ou défis entrepreneuriaux.

Analyse ce texte et extrais le contenu pour le transformer en JSON valide selon ce format:

{
  "quizzes": [
    { "id": "quiz_1", "question": "...", "options": ["A","B","C"], "correctAnswer": 0, "category": "financement", "difficulty": "facile|moyen|difficile", "explanation": "..." }
  ],
  "duels": [
    { "id": "duel_1", "question": "...", "options": [{"text": "Meilleure reponse", "points": 30}, {"text": "Bonne reponse", "points": 20}, {"text": "Reponse acceptable", "points": 10}], "category": "business" }
  ],
  "fundings": [
    { "id": "fund_1", "title": "...", "description": "...", "tokens": 3, "source": "..." }
  ],
  "opportunities": [
    { "id": "opp_1", "title": "...", "description": "...", "tokens": 3 }
  ],
  "challengeEvents": [
    { "id": "chal_1", "title": "...", "description": "...", "tokens": -2 }
  ]
}

REGLES D'EXTRACTION:
- Si le texte contient des questions avec des reponses numerotees ou lettrees (A/B/C, 1/2/3), c'est probablement des quiz ou duels
- Pour les quiz: identifie quelle reponse est correcte (mention explicite ou implicite)
- Pour les duels: toutes les reponses sont valides mais avec des points differents (30/20/10). Deduis les points selon la qualite de chaque reponse
- Si le texte mentionne des financements, subventions, levees de fonds → c'est des fundings (tokens positifs 1-10)
- Si le texte mentionne des opportunites, bonnes nouvelles, reussites → c'est des opportunities (tokens positifs 1-5)
- Si le texte mentionne des obstacles, problemes, crises → c'est des challengeEvents (tokens NEGATIFS -1 a -5)
- Genere des IDs uniques (quiz_1, quiz_2, duel_1, fund_1, opp_1, chal_1...)
- Inclus UNIQUEMENT les types pour lesquels tu trouves du contenu dans le texte
- Si le texte est incomplet ou ambigu, complète intelligemment en restant fidèle au sujet
- Ne rajoute PAS de contenu inventé si le texte n'en contient pas
- TRES IMPORTANT: Extrais TOUT le contenu du texte sans exception. Si le texte contient 40 quiz, retourne les 40 quiz. Si le texte contient 15 opportunités, retourne les 15 opportunités. Ne limite JAMAIS le nombre d'éléments extraits. Retourne CHAQUE élément trouvé dans le texte, même si la réponse est très longue
- category pour les quiz: "business-model", "financement", "marketing", "legal", "management", "tech", "pitch", "strategie"`,
    buildUserPrompt: (input, ctx) => {
      const filterMap: Record<string, string> = {
        quizzes: 'quiz (questions avec réponses)',
        duels: 'duels (questions avec réponses pondérées 30/20/10 points)',
        fundings: 'fundings/financements (événements de financement avec tokens positifs)',
        opportunities: 'opportunities/opportunités (événements positifs avec tokens)',
        challengeEvents: 'challengeEvents/défis (obstacles avec tokens négatifs)',
      };
      const parts: string[] = [];
      if (ctx?.subLevelTitle) parts.push(`Contexte - Sous-niveau: ${ctx.subLevelTitle}`);
      if (ctx?.levelTitle) parts.push(`Niveau: ${ctx.levelTitle}`);
      if (ctx?.programName) parts.push(`Programme: ${ctx.programName}`);
      const filter = ctx?.importFilter as string;
      if (filter && filterMap[filter]) {
        parts.push(`\nIMPORTANT: Génère UNIQUEMENT du contenu de type "${filterMap[filter]}". N'inclus AUCUN autre type dans ta réponse JSON. Concentre-toi exclusivement sur l'extraction/génération de ${filterMap[filter]} à partir du texte fourni. Si le texte ne contient pas explicitement ce type de contenu, transforme/adapte le texte pour créer du contenu pertinent de ce type.`);
      }
      parts.push(`\n=== TEXTE A ANALYSER ===\n${input}`);
      return parts.join('\n');
    },
  },

  achievements: {
    label: 'Achievements',
    placeholder: 'Ex: 10 achievements varies (jeux, social, challenges) avec des rarete differentes',
    description: 'Genere des achievements/badges de jeu',
    systemPrompt: `${BASE_SYSTEM}

Genere un tableau JSON d'achievements. Format:
[
  {
    "id": "ach_1",
    "title": "Nom du badge",
    "description": "Condition pour debloquer",
    "icon": "trophy-outline",
    "category": "games|social|challenge|collection|special",
    "condition": { "type": "games_played|wins|challenge_complete|etc", "target": 5 },
    "xpReward": 50,
    "rarity": "common|rare|epic|legendary",
    "enabled": true
  }
]
Varie les categories et les raretes. Les legendaires doivent etre rares et difficiles.`,
    buildUserPrompt: (input) => input,
  },

  default_projects: {
    label: 'Projets par defaut',
    placeholder: 'Ex: 4 startups fictives pour l\'edition agriculture',
    description: 'Genere des projets/startups fictifs pour les joueurs sans compte',
    systemPrompt: `${BASE_SYSTEM}

Genere un tableau JSON de projets de startup fictifs (DefaultProject). Format EXACT:
[
  {
    "id": "slug-unique-en-minuscules",
    "name": "Nom de la startup",
    "description": "Pitch court et realiste (1-3 phrases)",
    "sector": "secteur en minuscules, aligne sur les secteurs de l'edition si fournis",
    "target": "cible client / utilisateurs",
    "mission": "mission ou vision en une phrase",
    "initialBudget": 100000,
    "icon": "business-outline"
  }
]
REGLES:
- "id": slug ASCII unique deduit du nom (ex: agri-smart-dakar)
- "sector": choisis parmi les secteurs de l'edition fournis dans le contexte
- "initialBudget": entier positif plausible (50000-200000)
- "icon": nom d'icone ionicons-style (ex: leaf-outline); business-outline par defaut
- Les noms doivent sonner africains et modernes; les descriptions realistes
- Retourne UNIQUEMENT le tableau JSON, sans texte autour`,
    buildUserPrompt: (input, ctx) =>
      `Edition: ${ctx?.edition || 'classic'}. Secteurs possibles: ${ctx?.sectors || 'variés'}.\n\nDemande: ${input}`,
  },

  edition_projects_import: {
    label: 'Import projets edition',
    placeholder: 'Colle une liste de startups, fiches projet, notes...',
    description: 'Extrait des projets par defaut (DefaultProject) depuis un texte brut',
    systemPrompt: `${BASE_SYSTEM}

Tu recois un texte brut (liste, notes, export) decrivant des startups/projets fictifs pour une edition du jeu.

Analyse le texte et extrais TOUS les projets trouves. Retourne UN objet JSON valide avec cette forme EXACTE:

{
  "defaultProjects": [
    {
      "id": "slug-unique-en-minuscules",
      "name": "Nom de la startup",
      "description": "Pitch court (1-3 phrases)",
      "sector": "nom du secteur (aligne avec les secteurs de l'edition si fournis)",
      "target": "cible client / utilisateurs",
      "mission": "mission ou vision en une phrase",
      "initialBudget": 100000,
      "icon": "business-outline"
    }
  ]
}

REGLES:
- "id": slug ASCII (ex: agri-smart-dakar), unique; si absent dans le texte, deduis-le du nom
- "sector": si le texte ne precise pas, choisis le secteur le plus coherent parmi ceux listes dans le contexte, sinon un libelle court coherent
- "initialBudget": nombre entier positif (ex: 50000-200000) si mentionne ou raisonnable; sinon omets la cle ou mets une valeur plausible
- "icon": optionnel, nom d'icone ionicons-style (ex: leaf-outline); omets si inconnu
- Extrais CHAQUE projet distinct du texte; ne limite pas artificiellement le nombre
- Ne invente pas de projets si le texte n'en contient pas; dans ce cas retourne { "defaultProjects": [] }
- Ne rajoute pas de champs hors de ce schema`,
    buildUserPrompt: (input, ctx) => {
      const parts: string[] = [];
      if (ctx?.editionName) parts.push(`Edition: ${ctx.editionName}`);
      if (ctx?.sectors) parts.push(`Secteurs de l'edition (pour aligner les secteurs des projets): ${ctx.sectors}`);
      parts.push(`\n=== TEXTE A ANALYSER ===\n${input}`);
      return parts.join('\n');
    },
  },

  personas: {
    label: 'Personas',
    placeholder: 'Ex: 4 personas d\'entrepreneurs pour ce programme agricole',
    description: 'Genere des personas-personnages que les joueurs incarnent (nom, age, secteur, statut, jetons)',
    systemPrompt: `${BASE_SYSTEM}

Genere un tableau JSON de personas-personnages d'entrepreneurs que les joueurs vont INCARNER pendant le parcours. Chaque persona est un profil realiste et attachant. Format EXACT:
[
  {
    "id": "slug-unique-en-minuscules",
    "name": "Prenom (africain, moderne)",
    "age": 27,
    "description": "2-3 phrases : qui est ce persona, son activite, sa situation entrepreneuriale, ses defis",
    "location": "Ville / region (contexte africain)",
    "sector": "secteur en minuscules, aligne sur les secteurs du programme si fournis",
    "status": "Idee | Informel | Formalise | En croissance",
    "tokens": 100
  }
]
REGLES:
- "id": slug ASCII unique deduit du nom (ex: awa-thies)
- "age": entier realiste (20-45)
- "sector": choisis parmi les secteurs du programme fournis dans le contexte
- "status": l'un des quatre statuts entrepreneuriaux exacts ci-dessus
- "tokens": jetons de depart (50-200), coherents avec le statut (Idee=peu, En croissance=plus)
- Varie les profils : genre, age, secteur, statut, region — pour une bonne diversite
- Les personas doivent etre ancres dans le contexte du programme et realistes
- Retourne UNIQUEMENT le tableau JSON, sans texte autour

FIDELITE AUX DOCUMENTS (IMPERATIF) :
- "location" : utilise UNIQUEMENT des lieux (villes, regions, pays) mentionnes ou clairement impliques par les documents du programme. N'INVENTE JAMAIS un lieu absent des documents.
- Si les documents ne precisent pas de lieu, reste dans le pays/la zone geographique du programme ; NE PLACE JAMAIS un persona dans un autre pays.
- Idem pour les secteurs, activites et realites : ancre-les dans les documents, n'invente pas a l'aveugle.
- En cas de doute, prefere rester generique et fidele au contexte plutot qu'inventer un detail non etaye.`,
    buildUserPrompt: (input, ctx) => {
      const parts: string[] = [];
      if (ctx?.programName) parts.push(`Programme: ${ctx.programName}`);
      if (ctx?.objective) parts.push(`Objectif pedagogique: ${ctx.objective}`);
      if (ctx?.sectors) parts.push(`Secteurs du programme (pour aligner les personas): ${ctx.sectors}`);
      if (ctx?.region) parts.push(`Zone geographique du programme (les personas DOIVENT y etre situes): ${ctx.region}`);
      if (ctx?.sourceText) {
        const src = String(ctx.sourceText).slice(0, 40000);
        parts.push(`\n=== BASE DE CONNAISSANCES (documents du programme) ===\nCes documents sont la SEULE source de verite pour les lieux, secteurs et realites. Ancre-y chaque persona. N'invente aucun lieu ni detail absent de ce texte.\n"""\n${src}\n"""`);
      } else {
        parts.push(`\n(Aucun document fourni : reste STRICTEMENT dans la zone geographique et les secteurs du programme indiques ci-dessus. N'invente pas de lieu hors de cette zone.)`);
      }
      parts.push(`\nDemande: ${input || 'Genere 3 a 5 personas varies et coherents avec le programme.'}`);
      return parts.join('\n');
    },
  },

  program_eligibility: {
    label: 'Eligibilite',
    placeholder: 'Deduis les criteres d\'eligibilite du programme depuis ses documents',
    description: 'Deduit les criteres d\'eligibilite (age, regions, secteurs, profils) a partir des documents du programme',
    systemPrompt: `${BASE_SYSTEM}

Tu extrais les CRITERES D'ELIGIBILITE d'un programme d'accompagnement entrepreneurial a partir de ses documents. Reponds avec un OBJET JSON (pas un tableau). Format EXACT:
{
  "ageMin": 18,
  "ageMax": 35,
  "regions": ["Dakar"],
  "sectors": ["Agriculture"],
  "audienceProfiles": ["Jeunes entrepreneurs en démarrage"]
}
REGLES STRICTES:
- "ageMin"/"ageMax": entiers deduits des documents (tranche d'age ciblee). Si non precise, utilise 18 et 35.
- "regions": tableau de regions, choisies EXCLUSIVEMENT dans la liste "Regions disponibles" fournie dans le contexte. N'invente AUCUNE region hors de cette liste. Si le programme couvre tout le pays ou n'en precise aucune, retourne un tableau vide [].
- "sectors": tableau de secteurs, choisis EXCLUSIVEMENT dans la liste "Secteurs disponibles" fournie. N'invente AUCUN secteur hors liste. Vide [] si non precise.
- "audienceProfiles": tableau de profils cibles, choisis EXCLUSIVEMENT dans la liste "Profils disponibles" fournie. Vide [] si non precise.
- Utilise EXACTEMENT l'orthographe et la casse des valeurs des listes fournies (elles seront comparees a l'identique).
- Base-toi UNIQUEMENT sur les documents du programme. En cas de doute, laisse un tableau vide plutot que d'inventer.
- Retourne UNIQUEMENT l'objet JSON, sans texte ni markdown autour.`,
    buildUserPrompt: (input, ctx) => {
      const parts: string[] = [];
      if (ctx?.programName) parts.push(`Programme: ${ctx.programName}`);
      if (ctx?.objective) parts.push(`Objectif pedagogique: ${ctx.objective}`);
      if (ctx?.availableRegions) parts.push(`Regions disponibles (choisis UNIQUEMENT dans cette liste): ${ctx.availableRegions}`);
      if (ctx?.availableSectors) parts.push(`Secteurs disponibles (choisis UNIQUEMENT dans cette liste): ${ctx.availableSectors}`);
      if (ctx?.availableProfiles) parts.push(`Profils disponibles (choisis UNIQUEMENT dans cette liste): ${ctx.availableProfiles}`);
      if (ctx?.sourceText) {
        const src = String(ctx.sourceText).slice(0, 40000);
        parts.push(`\n=== BASE DE CONNAISSANCES (documents du programme) ===\nDeduis les criteres d'eligibilite de ce texte. C'est la SEULE source de verite.\n"""\n${src}\n"""`);
      } else {
        parts.push(`\n(Aucun document fourni : retourne des criteres generiques prudents — ageMin 18, ageMax 35, et des tableaux vides pour regions/sectors/audienceProfiles.)`);
      }
      parts.push(`\nDemande: ${input || 'Deduis les criteres d\'eligibilite du programme a partir de ses documents.'}`);
      return parts.join('\n');
    },
  },
};
