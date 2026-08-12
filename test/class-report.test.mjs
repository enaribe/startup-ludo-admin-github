/**
 * Tests unitaires du RAPPORT PÉDAGOGIQUE (lot 6).
 *
 * POURQUOI CE FICHIER : le rapport est le document que l'établissement lit pour
 * décider de renouveler sa licence. Un taux faux n'y serait pas un bug
 * d'affichage, ce serait une affirmation erronée sur le niveau d'élèves réels.
 * Les fonctions d'agrégation sont donc pures et testées séparément de l'écran.
 *
 * CE QUI EST VÉRIFIÉ EN PRIORITÉ : le SEUIL DES 3 QUESTIONS, dans les deux sens
 * — une notion à 2 réponses ne doit jamais afficher de pourcentage, une notion
 * à exactement 3 doit en afficher un. C'est la garantie qu'un rapport ne
 * publiera pas « Networking : 0 % » sur une base d'une seule question.
 *
 * Exécution : `npm run test:report`
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SEUIL_QUESTIONS_NOTION,
  agregerNotions,
  calculerIndicateurs,
  construireCsvRapport,
  construireSuivi,
  libelleNotion,
  niveauDeTaux,
  suggestionSeanceSuivante,
} from '../src/lib/class-report-service.ts';

// ═══════════════════════════════════════════════════════════════════════════
// FABRIQUES DE JEU D'ESSAI
// ═══════════════════════════════════════════════════════════════════════════

/** Fabrique une réponse de quiz. */
function reponse(category, correct, quizId = `q-${Math.random().toString(36).slice(2)}`) {
  return { quizId, category, correct, answeredAt: 1_700_000_000_000 };
}

/** Fabrique `n` réponses d'une même catégorie, dont `justes` correctes. */
function reponses(category, n, justes) {
  return Array.from({ length: n }, (_, i) => reponse(category, i < justes, `${category}-${i}`));
}

/** Fabrique un participant. */
function participant(learnerId, options = {}) {
  return {
    learnerId,
    status: options.status ?? 'playing',
    score: options.score,
    progress: options.progress,
    answers: options.answers ?? [],
    joinedAt: options.joinedAt ?? 1_700_000_000_000,
    lastSeenAt: options.lastSeenAt ?? 1_700_000_000_000,
    ...(options.finishedAt ? { finishedAt: options.finishedAt } : {}),
  };
}

/** Fabrique un élève de la classe. */
function eleve(id, firstName, lastName, isActive = true) {
  return { id, firstName, lastName, isActive };
}

// ═══════════════════════════════════════════════════════════════════════════
// LE SEUIL DES 3 QUESTIONS — la règle centrale du lot
// ═══════════════════════════════════════════════════════════════════════════

describe('agregerNotions — seuil des 3 questions', () => {
  it('la constante de seuil vaut bien 3', () => {
    assert.equal(SEUIL_QUESTIONS_NOTION, 3);
  });

  it('écarte du chiffrage une notion à 1 seule réponse (cas de l’édition Classique)', () => {
    // Le cas exact que le seuil protège : une catégorie à une question, ratée.
    // Sans seuil, le rapport annoncerait « Networking : 0 % ».
    const agregation = agregerNotions([
      participant('e1', { answers: [reponse('networking', false)] }),
    ]);

    assert.equal(agregation.notions.length, 0, 'aucune notion ne doit être chiffrée');
    assert.equal(agregation.sousEchantillonnees.length, 1);
    assert.equal(agregation.sousEchantillonnees[0].category, 'networking');
    assert.equal(agregation.sousEchantillonnees[0].total, 1);
    // Contrat fort : l'objet sous-échantillonné ne PORTE aucun taux, il n'est
    // donc pas possible d'en afficher un par erreur en aval.
    assert.equal('taux' in agregation.sousEchantillonnees[0], false);
  });

  it('écarte encore une notion à 2 réponses', () => {
    const agregation = agregerNotions([
      participant('e1', { answers: reponses('pitch', 2, 2) }),
    ]);
    assert.equal(agregation.notions.length, 0);
    assert.equal(agregation.sousEchantillonnees[0].total, 2);
  });

  it('chiffre une notion à exactement 3 réponses — le seuil est inclusif', () => {
    const agregation = agregerNotions([
      participant('e1', { answers: reponses('financement', 3, 2) }),
    ]);
    assert.equal(agregation.sousEchantillonnees.length, 0);
    assert.equal(agregation.notions.length, 1);
    assert.equal(agregation.notions[0].total, 3);
    assert.equal(agregation.notions[0].taux, 67); // round(2/3 × 100)
  });

  it('cumule les réponses de PLUSIEURS élèves pour atteindre le seuil', () => {
    // Trois élèves ayant répondu une fois chacun : la notion devient publiable.
    // Le seuil porte sur le volume de mesure de la CLASSE, pas par élève.
    const agregation = agregerNotions([
      participant('e1', { answers: [reponse('marketing', true)] }),
      participant('e2', { answers: [reponse('marketing', true)] }),
      participant('e3', { answers: [reponse('marketing', false)] }),
    ]);
    assert.equal(agregation.notions.length, 1);
    assert.equal(agregation.notions[0].total, 3);
    assert.equal(agregation.notions[0].taux, 67);
  });

  it('partitionne correctement quand les deux cas coexistent', () => {
    const agregation = agregerNotions([
      participant('e1', { answers: [...reponses('financement', 5, 2), ...reponses('legal', 2, 1)] }),
      participant('e2', { answers: [...reponses('marketing', 4, 4), reponse('tech', false)] }),
    ]);

    assert.deepEqual(
      agregation.notions.map((n) => n.category).sort(),
      ['financement', 'marketing']
    );
    assert.deepEqual(
      agregation.sousEchantillonnees.map((n) => n.category).sort(),
      ['legal', 'tech']
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXACTITUDE DES TAUX
// ═══════════════════════════════════════════════════════════════════════════

describe('agregerNotions — taux et arrondis', () => {
  it('calcule un taux exact sur des valeurs rondes', () => {
    const agregation = agregerNotions([
      participant('e1', { answers: reponses('strategie', 10, 7) }),
    ]);
    assert.equal(agregation.notions[0].taux, 70);
    assert.equal(agregation.notions[0].correct, 7);
    assert.equal(agregation.notions[0].total, 10);
  });

  it('arrondit à l’entier le plus proche', () => {
    // 5/7 = 71,43 % → 71
    const agregation = agregerNotions([participant('e1', { answers: reponses('tech', 7, 5) })]);
    assert.equal(agregation.notions[0].taux, 71);
  });

  it('gère 0 % et 100 % sans cas particulier', () => {
    const agregation = agregerNotions([
      participant('e1', { answers: reponses('legal', 4, 0) }),
      participant('e2', { answers: reponses('pitch', 4, 4) }),
    ]);
    const parCategorie = Object.fromEntries(agregation.notions.map((n) => [n.category, n.taux]));
    assert.equal(parCategorie.legal, 0);
    assert.equal(parCategorie.pitch, 100);
  });

  it('ne compte comme correcte qu’une valeur strictement `true`', () => {
    // Une donnée mobile ancienne pourrait porter `correct: 1` ou `correct: 'oui'` :
    // rien de tout cela ne doit gonfler le taux de réussite d'une classe.
    const agregation = agregerNotions([
      participant('e1', {
        answers: [
          { quizId: 'a', category: 'management', correct: true, answeredAt: 1 },
          { quizId: 'b', category: 'management', correct: 1, answeredAt: 2 },
          { quizId: 'c', category: 'management', correct: 'oui', answeredAt: 3 },
          { quizId: 'd', category: 'management', correct: false, answeredAt: 4 },
        ],
      }),
    ]);
    assert.equal(agregation.notions[0].total, 4);
    assert.equal(agregation.notions[0].correct, 1);
    assert.equal(agregation.notions[0].taux, 25);
  });

  it('regroupe les variantes de casse et d’espaces d’une même catégorie', () => {
    const agregation = agregerNotions([
      participant('e1', {
        answers: [
          reponse('Financement', true),
          reponse('financement', true),
          reponse('  FINANCEMENT  ', false),
        ],
      }),
    ]);
    assert.equal(agregation.notions.length, 1, 'une seule notion, pas trois');
    assert.equal(agregation.notions[0].total, 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CATÉGORIES VIDES ET PARTICIPANTS SANS RÉPONSE
// ═══════════════════════════════════════════════════════════════════════════

describe('agregerNotions — données absentes ou dégradées', () => {
  it('ignore les réponses sans catégorie exploitable', () => {
    const agregation = agregerNotions([
      participant('e1', {
        answers: [
          reponse('', true),
          reponse('   ', false),
          { quizId: 'x', correct: true, answeredAt: 1 }, // `category` absente
          ...reponses('financement', 3, 3),
        ],
      }),
    ]);

    assert.equal(agregation.notions.length, 1);
    assert.equal(agregation.notions[0].category, 'financement');
    assert.equal(agregation.sousEchantillonnees.length, 0, 'aucune notion fantôme');
    assert.equal(agregation.totalReponses, 3, 'les réponses sans catégorie ne comptent pas');
  });

  it('traverse sans broncher des participants sans champ `answers`', () => {
    const agregation = agregerNotions([
      { learnerId: 'e1' }, // document réduit au minimum (élève ayant rejoint sans jouer)
      participant('e2', { answers: undefined }),
      participant('e3', { answers: reponses('marketing', 3, 3) }),
    ]);
    assert.equal(agregation.notions.length, 1);
    assert.equal(agregation.notions[0].taux, 100);
  });

  it('sur une séance sans aucune réponse, ne renvoie AUCUNE notion (et pas des 0 %)', () => {
    const agregation = agregerNotions([
      participant('e1', { answers: [] }),
      participant('e2', { answers: [] }),
    ]);
    assert.deepEqual(agregation.notions, []);
    assert.deepEqual(agregation.sousEchantillonnees, []);
    assert.equal(agregation.notionLaPlusFaible, null);
    assert.equal(agregation.totalReponses, 0);
    assert.equal(suggestionSeanceSuivante(agregation), null, 'aucune suggestion sans mesure');
  });

  it('sur une liste vide de participants, renvoie une agrégation vide', () => {
    const agregation = agregerNotions([]);
    assert.deepEqual(agregation.notions, []);
    assert.equal(agregation.notionLaPlusFaible, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// TRI ET SUGGESTION
// ═══════════════════════════════════════════════════════════════════════════

describe('agregerNotions — tri et notion la plus faible', () => {
  it('trie par taux CROISSANT : la notion la plus faible en premier', () => {
    const agregation = agregerNotions([
      participant('e1', {
        answers: [
          ...reponses('marketing', 10, 9), // 90 %
          ...reponses('financement', 10, 4), // 40 %
          ...reponses('legal', 10, 7), // 70 %
        ],
      }),
    ]);

    assert.deepEqual(
      agregation.notions.map((n) => n.category),
      ['financement', 'legal', 'marketing']
    );
    assert.equal(agregation.notionLaPlusFaible.category, 'financement');
  });

  it('à taux égal, place d’abord la notion la mieux mesurée', () => {
    const agregation = agregerNotions([
      participant('e1', {
        answers: [
          ...reponses('pitch', 4, 2), // 50 % sur 4
          ...reponses('tech', 10, 5), // 50 % sur 10
        ],
      }),
    ]);
    assert.deepEqual(
      agregation.notions.map((n) => n.category),
      ['tech', 'pitch']
    );
  });

  it('ne désigne jamais une notion sous le seuil comme la plus faible', () => {
    // `networking` est à 0 % mais sur une seule question : la suggestion doit
    // porter sur `financement` (60 % sur 5), pas sur elle.
    const agregation = agregerNotions([
      participant('e1', {
        answers: [reponse('networking', false), ...reponses('financement', 5, 3)],
      }),
    ]);

    assert.equal(agregation.notionLaPlusFaible.category, 'financement');
    const phrase = suggestionSeanceSuivante(agregation);
    assert.match(phrase, /Financement/);
    assert.doesNotMatch(phrase, /etworking/, 'une notion sous-échantillonnée n’est jamais citée');
    assert.match(phrase, /60 %/);
  });

  it('adapte la phrase quand tout est acquis', () => {
    const agregation = agregerNotions([
      participant('e1', { answers: reponses('marketing', 10, 9) }),
    ]);
    const phrase = suggestionSeanceSuivante(agregation);
    assert.match(phrase, /acquises/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// CODE COULEUR
// ═══════════════════════════════════════════════════════════════════════════

describe('niveauDeTaux — bornes du code couleur', () => {
  it('applique les seuils 70 / 40 aux bornes exactes', () => {
    assert.equal(niveauDeTaux(100), 'reussi');
    assert.equal(niveauDeTaux(70), 'reussi');
    assert.equal(niveauDeTaux(69), 'a-consolider');
    assert.equal(niveauDeTaux(40), 'a-consolider');
    assert.equal(niveauDeTaux(39), 'a-retravailler');
    assert.equal(niveauDeTaux(0), 'a-retravailler');
  });
});

describe('libelleNotion', () => {
  it('traduit les catégories normalisées du prompt IA', () => {
    assert.equal(libelleNotion('business-model'), 'Business model');
    assert.equal(libelleNotion('legal'), 'Juridique');
    assert.equal(libelleNotion('strategie'), 'Stratégie');
  });

  it('rend présentable une catégorie libre issue du contenu ancien', () => {
    assert.equal(libelleNotion('go-to-market'), 'Go to market');
    assert.equal(libelleNotion('ressources_humaines'), 'Ressources humaines');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// INDICATEURS
// ═══════════════════════════════════════════════════════════════════════════

describe('calculerIndicateurs', () => {
  const classe = [
    eleve('e1', 'Awa', 'Diop'),
    eleve('e2', 'Moussa', 'Ba'),
    eleve('e3', 'Fatou', 'Sow'),
    eleve('e4', 'Ancien', 'Élève', false), // retiré : hors effectif
  ];

  it('compte la participation sur l’effectif ACTIF de la classe', () => {
    const indicateurs = calculerIndicateurs(classe, [
      participant('e1', { score: 40 }),
      participant('e2', { score: 20 }),
    ]);
    assert.equal(indicateurs.effectifClasse, 3, 'l’élève retiré n’est pas compté');
    assert.equal(indicateurs.nbParticipants, 2);
  });

  it('moyenne le score sur les PARTICIPANTS, jamais sur la classe entière', () => {
    // 40 et 20 sur deux joueurs → 30. Diviser par les 3 élèves donnerait 20 et
    // présenterait une absence comme une contre-performance.
    const indicateurs = calculerIndicateurs(classe, [
      participant('e1', { score: 40 }),
      participant('e2', { score: 20 }),
    ]);
    assert.equal(indicateurs.scoreMoyen, 30);
  });

  it('compte un participant SANS réponse dans la participation, mais pas dans les notions', () => {
    const participants = [
      participant('e1', { score: 30, answers: reponses('financement', 3, 3) }),
      participant('e2', { score: 0, answers: [] }), // a rejoint, n'a pas répondu
    ];

    const indicateurs = calculerIndicateurs(classe, participants);
    assert.equal(indicateurs.nbParticipants, 2, 'il compte dans la participation');
    assert.equal(indicateurs.nbReponses, 3);

    const agregation = agregerNotions(participants);
    assert.equal(agregation.notions[0].total, 3, 'il n’ajoute rien au dénominateur');
    assert.equal(agregation.notions[0].taux, 100, 'et ne fait pas chuter le taux');
  });

  it('additionne les cartes jouées et les réponses', () => {
    const indicateurs = calculerIndicateurs(classe, [
      participant('e1', { progress: { cellIndex: 12, tokens: 40, cardsPlayed: 9 }, answers: reponses('tech', 4, 2) }),
      participant('e2', { progress: { cellIndex: 5, tokens: 10, cardsPlayed: 3 }, answers: reponses('tech', 2, 2) }),
    ]);
    assert.equal(indicateurs.cartesJouees, 12);
    assert.equal(indicateurs.nbReponses, 6);
    assert.equal(indicateurs.nbCorrectes, 4);
    assert.equal(indicateurs.tauxGlobal, 67);
  });

  it('renvoie un taux global `null` (et non 0) quand personne n’a répondu', () => {
    const indicateurs = calculerIndicateurs(classe, [participant('e1', { answers: [] })]);
    assert.equal(indicateurs.tauxGlobal, null);
  });

  it('replie le score sur les jetons quand `score` est absent', () => {
    const indicateurs = calculerIndicateurs(classe, [
      participant('e1', { progress: { cellIndex: 3, tokens: 25, cardsPlayed: 2 } }),
    ]);
    assert.equal(indicateurs.scoreMoyen, 25);
  });

  it('compte `abandoned` comme une partie terminée', () => {
    const indicateurs = calculerIndicateurs(classe, [
      participant('e1', { status: 'finished' }),
      participant('e2', { status: 'abandoned' }),
      participant('e3', { status: 'playing' }),
    ]);
    assert.equal(indicateurs.nbTermines, 2);
  });

  it('calcule la durée réelle depuis les horodatages de la séance', () => {
    const debut = 1_700_000_000_000;
    const indicateurs = calculerIndicateurs(classe, [], {
      startedAt: debut,
      endedAt: debut + 32 * 60_000,
    });
    assert.equal(indicateurs.dureeReelleMinutes, 32);
  });

  it('renvoie une durée `null` si la séance n’est pas close', () => {
    assert.equal(calculerIndicateurs(classe, [], { startedAt: 1 }).dureeReelleMinutes, null);
    assert.equal(calculerIndicateurs(classe, [], null).dureeReelleMinutes, null);
    // Horodatages incohérents (fin avant début) : `null` plutôt qu'un négatif.
    assert.equal(
      calculerIndicateurs(classe, [], { startedAt: 500, endedAt: 100 }).dureeReelleMinutes,
      null
    );
  });

  it('reste stable sur une séance sans aucun participant', () => {
    const indicateurs = calculerIndicateurs(classe, []);
    assert.equal(indicateurs.nbParticipants, 0);
    assert.equal(indicateurs.scoreMoyen, 0, 'pas de division par zéro');
    assert.equal(indicateurs.tauxGlobal, null);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SUIVI (croisement classe × participants)
// ═══════════════════════════════════════════════════════════════════════════

describe('construireSuivi', () => {
  const classe = [
    eleve('e1', 'Awa', 'Diop'),
    eleve('e2', 'Moussa', 'Ba'),
    eleve('e3', 'Fatou', 'Sow'),
    eleve('e9', 'Parti', 'Ailleurs', false),
  ];

  it('affiche les élèves NON connectés — l’information utile au prof', () => {
    const lignes = construireSuivi(classe, [participant('e1', { status: 'playing' })]);
    assert.equal(lignes.length, 3, 'les 3 élèves actifs, connectés ou non');
    const absents = lignes.filter((l) => l.etat === 'absent').map((l) => l.learnerId);
    assert.deepEqual(absents.sort(), ['e2', 'e3']);
  });

  it('exclut les élèves retirés de la classe', () => {
    const lignes = construireSuivi(classe, []);
    assert.equal(lignes.some((l) => l.learnerId === 'e9'), false);
  });

  it('place les non-connectés en tête, puis trie par progression décroissante', () => {
    const lignes = construireSuivi(classe, [
      participant('e1', { progress: { cellIndex: 4, tokens: 10, cardsPlayed: 2 } }),
      participant('e3', { progress: { cellIndex: 18, tokens: 60, cardsPlayed: 11 } }),
    ]);
    assert.deepEqual(
      lignes.map((l) => l.learnerId),
      ['e2', 'e3', 'e1']
    );
  });

  it('classe `finished` et `abandoned` en « terminé », le reste en « en jeu »', () => {
    const lignes = construireSuivi(classe, [
      participant('e1', { status: 'finished' }),
      participant('e2', { status: 'abandoned' }),
      participant('e3', { status: 'joined' }),
    ]);
    const parId = Object.fromEntries(lignes.map((l) => [l.learnerId, l.etat]));
    assert.equal(parId.e1, 'termine');
    assert.equal(parId.e2, 'termine');
    assert.equal(parId.e3, 'en-jeu');
  });

  it('prend le nom dans la LISTE DE CLASSE, pas dans le document participant', () => {
    // La source nominative de référence est l'établissement. `displayName` est
    // recopié par le mobile et peut être un pseudo ou une valeur périmée.
    const lignes = construireSuivi(classe, [
      { learnerId: 'e1', displayName: 'TheKing221', status: 'playing' },
    ]);
    const ligne = lignes.find((l) => l.learnerId === 'e1');
    assert.equal(ligne.nom, 'Awa Diop');
  });

  it('conserve un participant qui n’est plus dans la liste de classe', () => {
    // Sinon les totaux du rapport ne se recouperaient plus avec le détail.
    const lignes = construireSuivi(classe, [
      participant('inconnu', { score: 15, answers: reponses('tech', 3, 3) }),
    ]);
    const orphelin = lignes.find((l) => l.learnerId === 'inconnu');
    assert.ok(orphelin, 'le participant orphelin est présent');
    assert.equal(orphelin.score, 15);
  });

  it('remplit à zéro les compteurs d’un élève non connecté', () => {
    const ligne = construireSuivi(classe, []).find((l) => l.learnerId === 'e1');
    assert.deepEqual(
      { s: ligne.score, c: ligne.cellIndex, r: ligne.nbReponses, v: ligne.lastSeenAt },
      { s: 0, c: 0, r: 0, v: 0 }
    );
  });

  it('compte les réponses correctes de chaque élève', () => {
    const ligne = construireSuivi(classe, [
      participant('e1', { answers: reponses('tech', 5, 3) }),
    ]).find((l) => l.learnerId === 'e1');
    assert.equal(ligne.nbReponses, 5);
    assert.equal(ligne.nbCorrectes, 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT CSV
// ═══════════════════════════════════════════════════════════════════════════

describe('construireCsvRapport', () => {
  it('produit un en-tête et une ligne par élève, non-connectés compris', () => {
    const lignes = construireSuivi(
      [eleve('e1', 'Awa', 'Diop'), eleve('e2', 'Moussa', 'Ba')],
      [participant('e1', { score: 30, answers: reponses('tech', 4, 3) })]
    );
    const csv = construireCsvRapport(lignes).split('\n');

    assert.equal(csv.length, 3, 'en-tête + 2 élèves');
    assert.match(csv[0], /^"Élève","État","Score"/);
    assert.match(csv.join('\n'), /"Moussa Ba","Pas connecté","0"/);
    assert.match(csv.join('\n'), /"Awa Diop","En jeu","30".*"4","3","75"/);
  });

  it('échappe les guillemets et les virgules d’un nom composé', () => {
    const lignes = construireSuivi([eleve('e1', 'Jean, dit "Jo"', 'Ndiaye')], []);
    const csv = construireCsvRapport(lignes);
    assert.match(csv, /"Jean, dit ""Jo"" Ndiaye"/);
    // La ligne conserve exactement 8 colonnes malgré la virgule dans le nom.
    assert.equal(csv.split('\n')[1].split('","').length, 8);
  });

  it('laisse le taux VIDE quand l’élève n’a donné aucune réponse', () => {
    // Une cellule vide se lit « non mesuré » ; un `0` se lirait « tout faux ».
    const lignes = construireSuivi([eleve('e1', 'Awa', 'Diop')], []);
    assert.match(construireCsvRapport(lignes).split('\n')[1], /,""$/);
  });
});
