/**
 * Import JSON du contenu d'un défi — `importerContenuJson`.
 *
 * Ces tests portent sur ce qui coûte cher ailleurs : une carte acceptée alors
 * qu'elle est injouable n'échoue qu'EN PARTIE, chez le joueur, sans trace.
 * Chaque cas bloquant ci-dessous correspond à un défaut invisible à la
 * relecture du fichier.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  importerContenuJson,
  modeleContenuJson,
  MODELE_CONTENU_JSON,
} from '../src/lib/defi-json-import.ts';

/** Un quiz minimal valide, à altérer dans les cas de rejet. */
const QUIZ_OK = {
  question: 'Quelle est la première étape du Business Model Canvas ?',
  options: ['Le segment de clientèle', 'Le prix', 'La publicité'],
  correctAnswer: 0,
  category: 'business-model',
};

const bloquantes = (r) => r.anomalies.filter((a) => a.bloquant);
const corrections = (r) => r.anomalies.filter((a) => !a.bloquant);

// ═══ ENVELOPPE ═══

test('refuse ce qui n’est pas un objet', () => {
  for (const brut of [null, 42, 'texte', [], undefined]) {
    const r = importerContenuJson(brut, 's1');
    assert.equal(r.contenu, null, `accepté à tort : ${JSON.stringify(brut)}`);
    assert.equal(bloquantes(r).length, 1);
  }
});

test('refuse un objet sans aucune liste reconnue', () => {
  const r = importerContenuJson({ titre: 'Mon défi', cartes: [] }, 's1');
  assert.equal(r.contenu, null);
  assert.match(bloquantes(r)[0].message, /Aucune liste reconnue/);
});

test('accepte les listes à la racine', () => {
  const r = importerContenuJson({ quizzes: [QUIZ_OK] }, 's1');
  assert.ok(r.contenu);
  assert.equal(r.contenu.quizzes.length, 1);
});

test('accepte les listes sous « contenu » — un export se réimporte', () => {
  const r = importerContenuJson({ contenu: { quizzes: [QUIZ_OK] } }, 's1');
  assert.ok(r.contenu, bloquantes(r).map((a) => a.message).join(' / '));
  assert.equal(r.contenu.quizzes.length, 1);
});

test('accepte les listes sous « content »', () => {
  const r = importerContenuJson({ content: { quizzes: [QUIZ_OK] } }, 's1');
  assert.ok(r.contenu, bloquantes(r).map((a) => a.message).join(' / '));
  assert.equal(r.contenu.quizzes.length, 1);
});

test('l’enveloppe reconnue l’emporte sur la racine — une seule source de vérité', () => {
  /*
    Si `contenu` porte des listes, c'est LUI qui est lu, même si la racine en
    porte aussi : lire les deux fusionnerait deux contenus dont on ne sait pas
    lequel l'auteur voulait. Ce test fixe le choix pour qu'il ne dérive pas.
  */
  const r = importerContenuJson(
    { contenu: { quizzes: [QUIZ_OK] }, quizzes: [QUIZ_OK, QUIZ_OK] },
    's1'
  );
  assert.ok(r.contenu, bloquantes(r).map((a) => a.message).join(' / '));
  assert.equal(r.contenu.quizzes.length, 1, 'seule l’enveloppe doit être lue');
});

test('un champ « content » textuel ne masque pas les listes de la racine', () => {
  // Régression : descendre aveuglément dans `content` perdrait les quiz.
  const r = importerContenuJson({ content: 'blabla', quizzes: [QUIZ_OK] }, 's1');
  assert.ok(r.contenu, bloquantes(r).map((a) => a.message).join(' / '));
  assert.equal(r.contenu.quizzes.length, 1);
});

test('signale une liste inconnue sans bloquer', () => {
  const r = importerContenuJson({ quizzes: [QUIZ_OK], quiz: [{}] }, 's1');
  assert.ok(r.contenu);
  assert.ok(corrections(r).some((a) => /« quiz » est ignorée/.test(a.message)));
});

// ═══ QUIZ : correctAnswer, l'erreur la plus coûteuse ═══

test('refuse un quiz sans question', () => {
  const r = importerContenuJson({ quizzes: [{ ...QUIZ_OK, question: '  ' }] }, 's1');
  assert.equal(r.contenu, null);
  assert.match(bloquantes(r)[0].message, /question/);
  assert.equal(bloquantes(r)[0].ou, 'Quiz #1');
});

test('refuse un quiz à moins de 2 options', () => {
  const r = importerContenuJson({ quizzes: [{ ...QUIZ_OK, options: ['seule'] }] }, 's1');
  assert.equal(r.contenu, null);
  assert.match(bloquantes(r)[0].message, /au moins 2 options/);
});

test('refuse correctAnswer absent', () => {
  const { correctAnswer, ...sansReponse } = QUIZ_OK;
  const r = importerContenuJson({ quizzes: [sansReponse] }, 's1');
  assert.equal(r.contenu, null);
  assert.match(bloquantes(r)[0].message, /correctAnswer/);
});

test('refuse correctAnswer hors bornes — question ingagnable', () => {
  const r = importerContenuJson({ quizzes: [{ ...QUIZ_OK, correctAnswer: 3 }] }, 's1');
  assert.equal(r.contenu, null, 'un index hors bornes ne doit PAS être borné en silence');
  assert.match(bloquantes(r)[0].message, /entre 0 et 2/);
});

test('refuse correctAnswer négatif', () => {
  const r = importerContenuJson({ quizzes: [{ ...QUIZ_OK, correctAnswer: -1 }] }, 's1');
  assert.equal(r.contenu, null);
});

test('refuse correctAnswer non entier', () => {
  const r = importerContenuJson({ quizzes: [{ ...QUIZ_OK, correctAnswer: 1.5 }] }, 's1');
  assert.equal(r.contenu, null);
});

test('correctAnswer = 0 est valide — ne pas confondre avec « absent »', () => {
  const r = importerContenuJson({ quizzes: [{ ...QUIZ_OK, correctAnswer: 0 }] }, 's1');
  assert.ok(r.contenu, bloquantes(r).map((a) => a.message).join(' / '));
  assert.equal(r.contenu.quizzes[0].correctAnswer, 0);
});

test('correctAnswer au dernier index est valide', () => {
  const r = importerContenuJson({ quizzes: [{ ...QUIZ_OK, correctAnswer: 2 }] }, 's1');
  assert.ok(r.contenu);
  assert.equal(r.contenu.quizzes[0].correctAnswer, 2);
});

test('options de quiz acceptées sous forme d’objets {text}', () => {
  const r = importerContenuJson(
    { quizzes: [{ ...QUIZ_OK, options: [{ text: 'a' }, { text: 'b' }] }] },
    's1'
  );
  assert.ok(r.contenu, bloquantes(r).map((a) => a.message).join(' / '));
  assert.deepEqual(r.contenu.quizzes[0].options, ['a', 'b']);
});

test('catégorie hors liste ramenée et signalée', () => {
  const r = importerContenuJson(
    { quizzes: [{ ...QUIZ_OK, category: 'Financement des startups' }] },
    's1'
  );
  assert.ok(r.contenu);
  assert.equal(r.contenu.quizzes[0].category, 'financement');
  assert.ok(corrections(r).some((a) => /ramenée/.test(a.message)));
});

test('catégorie absente signalée', () => {
  const { category, ...sansCat } = QUIZ_OK;
  const r = importerContenuJson({ quizzes: [sansCat] }, 's1');
  assert.ok(r.contenu);
  assert.ok(corrections(r).some((a) => /Catégorie absente/.test(a.message)));
});

// ═══ DUELS : la forme des options ═══

test('refuse des options de duel en texte simple, avec la forme attendue', () => {
  const r = importerContenuJson(
    { duels: [{ question: 'Quel pitch ?', options: ['a', 'b', 'c'] }] },
    's1'
  );
  assert.equal(r.contenu, null);
  assert.match(bloquantes(r)[0].message, /"points"/);
});

test('refuse une option de duel sans points', () => {
  const r = importerContenuJson(
    { duels: [{ question: 'Q', options: [{ text: 'a', points: 30 }, { text: 'b' }] }] },
    's1'
  );
  assert.equal(r.contenu, null);
  assert.match(bloquantes(r)[0].message, /Option 2 sans « points »/);
});

test('refuse une option de duel sans texte', () => {
  const r = importerContenuJson(
    { duels: [{ question: 'Q', options: [{ text: '', points: 30 }, { text: 'b', points: 10 }] }] },
    's1'
  );
  assert.equal(r.contenu, null);
  assert.match(bloquantes(r)[0].message, /Option 1 sans « text »/);
});

test('accepte un duel bien formé', () => {
  const r = importerContenuJson(
    {
      duels: [
        {
          question: 'Quelle approche pour trouver ses premiers clients ?',
          options: [
            { text: 'Aller les rencontrer', points: 30 },
            { text: 'Publier sur les réseaux', points: 20 },
            { text: 'Attendre', points: 10 },
          ],
          category: 'marketing',
        },
      ],
    },
    's1'
  );
  assert.ok(r.contenu, bloquantes(r).map((a) => a.message).join(' / '));
  assert.equal(r.contenu.duels[0].options[2].points, 10);
});

// ═══ SIGNE DES JETONS : le défaut invisible en partie ═══

test('un challenge à jetons positifs est corrigé en négatif et signalé', () => {
  const r = importerContenuJson(
    { challengeEvents: [{ title: 'Panne de courant', description: 'Deux jours sans électricité.', tokens: 3 }] },
    's1'
  );
  assert.ok(r.contenu, bloquantes(r).map((a) => a.message).join(' / '));
  assert.equal(r.contenu.challengeEvents[0].tokens, -3, 'un challenge doit COÛTER des jetons');
  assert.ok(corrections(r).some((a) => /signe a été corrigé/.test(a.message)));
});

test('une opportunité à jetons négatifs est corrigée en positif', () => {
  const r = importerContenuJson(
    { opportunities: [{ title: 'Nouveau client', description: 'Un gros contrat.', tokens: -4 }] },
    's1'
  );
  assert.ok(r.contenu);
  assert.equal(r.contenu.opportunities[0].tokens, 4);
});

test('un financement garde son signe positif sans anomalie', () => {
  const r = importerContenuJson(
    { fundings: [{ title: 'Tontine', description: 'Un prêt du groupe.', tokens: 5, source: 'Tontine' }] },
    's1'
  );
  assert.ok(r.contenu);
  assert.equal(r.contenu.fundings[0].tokens, 5);
  assert.equal(r.contenu.fundings[0].source, 'Tontine');
  assert.equal(corrections(r).length, 0, corrections(r).map((a) => a.message).join(' / '));
});

test('jetons absents : valeur par défaut signalée', () => {
  const r = importerContenuJson(
    { challengeEvents: [{ title: 'Retard', description: 'Livraison en retard.' }] },
    's1'
  );
  assert.ok(r.contenu);
  assert.equal(r.contenu.challengeEvents[0].tokens, -2);
  assert.ok(corrections(r).some((a) => /Jetons absents/.test(a.message)));
});

test('jetons à zéro ramenés à au moins 1 en magnitude', () => {
  // Une carte à 0 jeton n'a aucun effet : elle ne vaut pas une case.
  const r = importerContenuJson(
    { opportunities: [{ title: 'Rien', description: 'Sans effet.', tokens: 0 }] },
    's1'
  );
  assert.ok(r.contenu);
  assert.equal(r.contenu.opportunities[0].tokens, 1);
});

test('refuse une carte titre/desc sans titre', () => {
  const r = importerContenuJson({ fundings: [{ description: 'sans titre', tokens: 2 }] }, 's1');
  assert.equal(r.contenu, null);
  assert.equal(bloquantes(r)[0].ou, 'Financement #1');
});

test('description absente signalée sans bloquer', () => {
  const r = importerContenuJson({ fundings: [{ title: 'Prêt', tokens: 2 }] }, 's1');
  assert.ok(r.contenu);
  assert.ok(corrections(r).some((a) => /Description absente/.test(a.message)));
});

// ═══ RIEN N'EST IMPORTÉ EN CAS D'ERREUR ═══

test('une seule carte invalide refuse TOUT l’import', () => {
  const r = importerContenuJson(
    { quizzes: [QUIZ_OK, { ...QUIZ_OK, correctAnswer: 9 }, QUIZ_OK] },
    's1'
  );
  assert.equal(r.contenu, null, 'un import partiel livrerait un défi amputé en silence');
  assert.equal(bloquantes(r)[0].ou, 'Quiz #2', 'la position doit pointer la 2e carte du fichier');
});

test('toutes les anomalies sont rapportées, pas seulement la première', () => {
  const r = importerContenuJson(
    {
      quizzes: [{ ...QUIZ_OK, question: '' }, { ...QUIZ_OK, options: ['x'] }],
      duels: [{ question: 'Q', options: ['a', 'b'] }],
    },
    's1'
  );
  assert.equal(r.contenu, null);
  assert.equal(bloquantes(r).length, 3, 'les 3 problèmes doivent être listés en un seul passage');
});

test('refuse un fichier dont toutes les listes sont vides', () => {
  const r = importerContenuJson({ quizzes: [], duels: [] }, 's1');
  assert.equal(r.contenu, null);
  assert.match(bloquantes(r).at(-1).message, /Aucune carte/);
});

// ═══ IDS ═══

test('les ids du fichier sont réécrits — pas de doublon possible', () => {
  const r = importerContenuJson(
    { quizzes: [{ ...QUIZ_OK, id: 'meme_id' }, { ...QUIZ_OK, id: 'meme_id' }] },
    'seed1'
  );
  assert.ok(r.contenu);
  const ids = r.contenu.quizzes.map((q) => q.id);
  assert.deepEqual(ids, ['quiz_seed1_0', 'quiz_seed1_1']);
  assert.equal(new Set(ids).size, 2, 'des ids identiques casseraient la déduplication du moteur');
});

test('tous les ids d’un même import sont distincts', () => {
  const r = importerContenuJson(
    {
      quizzes: [QUIZ_OK, QUIZ_OK],
      duels: [{ question: 'Q', options: [{ text: 'a', points: 30 }, { text: 'b', points: 10 }] }],
      fundings: [{ title: 'F', description: 'd', tokens: 2 }],
      opportunities: [{ title: 'O', description: 'd', tokens: 2 }],
      challengeEvents: [{ title: 'C', description: 'd', tokens: -2 }],
    },
    'sx'
  );
  assert.ok(r.contenu, bloquantes(r).map((a) => a.message).join(' / '));
  const tous = [
    ...r.contenu.quizzes,
    ...r.contenu.duels,
    ...r.contenu.fundings,
    ...r.contenu.opportunities,
    ...r.contenu.challengeEvents,
  ].map((c) => c.id);
  assert.equal(new Set(tous).size, tous.length);
  assert.deepEqual(r.comptes, {
    quizzes: 2, duels: 1, fundings: 1, opportunities: 1, challengeEvents: 1,
  });
});

// ═══ LE MODÈLE FOURNI À L'UTILISATEUR ═══

test('le modèle téléchargeable est valide tel quel, sans aucune anomalie', () => {
  /*
    Le modèle sert à être dupliqué et rempli. S'il déclenchait ne serait-ce
    qu'une correction automatique, il enseignerait un format faux : l'auteur
    reproduirait l'erreur dans toutes ses cartes.
  */
  const r = importerContenuJson(MODELE_CONTENU_JSON, 'm1');
  assert.ok(r.contenu, bloquantes(r).map((a) => `${a.ou}: ${a.message}`).join(' / '));
  assert.equal(
    r.anomalies.length,
    0,
    `le modèle doit être exemplaire : ${r.anomalies.map((a) => `${a.ou} ${a.message}`).join(' / ')}`
  );
});

test('le modèle couvre les cinq types de cartes', () => {
  const r = importerContenuJson(MODELE_CONTENU_JSON, 'm1');
  assert.ok(r.contenu);
  assert.deepEqual(r.comptes, {
    quizzes: 1, duels: 1, fundings: 1, opportunities: 1, challengeEvents: 1,
  });
});

test('le modèle sérialisé se réimporte', () => {
  // Le chemin réel : télécharger (donc sérialiser), puis réimporter.
  const r = importerContenuJson(JSON.parse(modeleContenuJson()), 'm2');
  assert.ok(r.contenu, bloquantes(r).map((a) => a.message).join(' / '));
  assert.equal(r.anomalies.length, 0);
});

test('le modèle illustre les trois subtilités du format', () => {
  const r = importerContenuJson(MODELE_CONTENU_JSON, 'm1');
  assert.ok(r.contenu);
  // correctAnswer est un index 0-based, et il désigne bien la bonne réponse.
  const q = r.contenu.quizzes[0];
  assert.equal(q.options[q.correctAnswer], 'Le Business Model Canvas');
  // Les options de duel portent des points, pas du texte simple.
  assert.equal(typeof r.contenu.duels[0].options[0].points, 'number');
  // Les jetons d'un challenge sont négatifs, ceux d'un financement positifs.
  assert.ok(r.contenu.challengeEvents[0].tokens < 0);
  assert.ok(r.contenu.fundings[0].tokens > 0);
});
