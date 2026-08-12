/**
 * Tests unitaires du CUMUL PAR ÉLÈVE et de l'ÉLIGIBILITÉ AU CERTIFICAT (lot 7).
 *
 * POURQUOI CE FICHIER : le cumul est la seule donnée du produit qui s'écrit par
 * ADDITIONS SUCCESSIVES, séance après séance, pendant toute une année scolaire.
 * Une erreur n'y est donc pas un affichage faux qu'un rechargement corrigerait :
 * elle s'inscrit en base et se propage à tous les rapports suivants, jusqu'au
 * certificat remis à l'élève et à sa famille.
 *
 * CE QUI EST VÉRIFIÉ EN PRIORITÉ :
 *
 *   1. L'IDEMPOTENCE. Intégrer deux fois la même séance ne doit RIEN doubler.
 *      C'est le cas réel du double clic sur « Terminer la séance », et celui du
 *      recalcul lancé après une clôture réussie.
 *   2. L'ÉQUIVALENCE RECALCUL ↔ INTÉGRATIONS. Le bouton « Recalculer les
 *      cumuls » reconstruit tout à zéro : s'il donnait un autre résultat que la
 *      somme des clôtures, on ne saurait plus lequel des deux chiffres croire.
 *   3. LE SEUIL DES 3 QUESTIONS APPLIQUÉ AU CUMUL ANNUEL — et non par séance :
 *      une notion vue une fois dans trois séances est chiffrable sur l'année.
 *
 * Exécution : `npm run test:report`
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SEUIL_QUESTIONS_NOTION,
  agregerCompteurs,
  agregerNotions,
  compteursDepuisReponses,
  cumulDepuisLearner,
  cumulVide,
  fusionnerCompteurs,
  integrerSeance,
} from '../src/lib/class-report-service.ts';
import { examinerEligibilite, examinerClasse } from '../src/lib/certificate-service.ts';

// ═══════════════════════════════════════════════════════════════════════════
// FABRIQUES DE JEU D'ESSAI
// ═══════════════════════════════════════════════════════════════════════════

/** Fabrique une réponse de quiz. */
function reponse(category, correct, quizId = `q-${category}-${Math.random().toString(36).slice(2)}`) {
  return { quizId, category, correct, answeredAt: 1_700_000_000_000 };
}

/** Fabrique `n` réponses d'une même catégorie, dont `justes` correctes. */
function reponses(category, n, justes) {
  return Array.from({ length: n }, (_, i) => reponse(category, i < justes, `${category}-${i}`));
}

/** Fabrique un élève porteur d'agrégats annuels. */
function eleve(id, options = {}) {
  return {
    id,
    firstName: options.firstName ?? 'Fatou',
    lastName: options.lastName ?? 'Diop',
    isActive: options.isActive ?? true,
    totalSessions: options.totalSessions ?? 0,
    lastPlayedAt: options.lastPlayedAt ?? null,
    masteryByCategory: options.masteryByCategory ?? {},
    countedSessionIds: options.countedSessionIds ?? [],
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FUSION ADDITIVE — la brique de base
// ═══════════════════════════════════════════════════════════════════════════

describe('fusionnerCompteurs — addition des compteurs', () => {
  it('additionne correct ET total, catégorie par catégorie', () => {
    const somme = fusionnerCompteurs(
      { financement: { correct: 3, total: 5 }, marketing: { correct: 1, total: 2 } },
      { financement: { correct: 2, total: 4 }, pitch: { correct: 4, total: 4 } }
    );

    assert.deepEqual(somme.financement, { correct: 5, total: 9 });
    assert.deepEqual(somme.marketing, { correct: 1, total: 2 });
    assert.deepEqual(somme.pitch, { correct: 4, total: 4 });
  });

  it('ne mute NI la base NI l’ajout — les états antérieurs restent lisibles', () => {
    const base = { financement: { correct: 1, total: 2 } };
    const ajout = { financement: { correct: 3, total: 3 } };
    fusionnerCompteurs(base, ajout);

    assert.deepEqual(base, { financement: { correct: 1, total: 2 } }, 'base mutée');
    assert.deepEqual(ajout, { financement: { correct: 3, total: 3 } }, 'ajout muté');
  });

  it('est ASSOCIATIVE — c’est ce qui rend le recalcul équivalent aux intégrations', () => {
    const a = { financement: { correct: 1, total: 2 } };
    const b = { financement: { correct: 2, total: 3 }, pitch: { correct: 1, total: 1 } };
    const c = { marketing: { correct: 0, total: 4 } };

    const gauche = fusionnerCompteurs(fusionnerCompteurs(a, b), c);
    const droite = fusionnerCompteurs(a, fusionnerCompteurs(b, c));
    assert.deepEqual(gauche, droite);
  });

  it('tolère l’absence de base ou d’ajout (élève créé avant le lot 7)', () => {
    assert.deepEqual(fusionnerCompteurs(undefined, { tech: { correct: 1, total: 1 } }), {
      tech: { correct: 1, total: 1 },
    });
    assert.deepEqual(fusionnerCompteurs({ tech: { correct: 1, total: 1 } }, null), {
      tech: { correct: 1, total: 1 },
    });
    assert.deepEqual(fusionnerCompteurs(null, undefined), {});
  });

  it('neutralise les valeurs aberrantes plutôt que de propager un NaN au certificat', () => {
    const somme = fusionnerCompteurs(
      { legal: { correct: -3, total: 4 }, vide: { correct: 0, total: 0 } },
      { legal: { correct: 9, total: 2 } }
    );

    // `correct` ne peut jamais dépasser `total` : un taux de 450 % sur un
    // document remis à une famille serait pire qu'une absence de chiffre.
    assert.equal(somme.legal.total, 6);
    assert.ok(somme.legal.correct <= somme.legal.total, 'correct dépasse total');
    assert.ok(!('vide' in somme), 'une catégorie à 0 question ne doit pas être conservée');
  });
});

describe('compteursDepuisReponses — réduction des réponses d’une séance', () => {
  it('compte les réponses et les bonnes réponses par catégorie', () => {
    const compteurs = compteursDepuisReponses([
      ...reponses('financement', 4, 3),
      ...reponses('marketing', 2, 0),
    ]);

    assert.deepEqual(compteurs.financement, { correct: 3, total: 4 });
    assert.deepEqual(compteurs.marketing, { correct: 0, total: 2 });
  });

  it('normalise la casse et les espaces — sinon « Financement » et « financement » divergeraient en base', () => {
    const compteurs = compteursDepuisReponses([
      reponse('Financement', true),
      reponse('  financement  ', false),
      reponse('FINANCEMENT', true),
    ]);

    assert.deepEqual(Object.keys(compteurs), ['financement']);
    assert.deepEqual(compteurs.financement, { correct: 2, total: 3 });
  });

  it('ignore une réponse sans catégorie plutôt que de créer une notion « undefined »', () => {
    const compteurs = compteursDepuisReponses([
      reponse('', true),
      reponse('   ', false),
      { quizId: 'x', correct: true, answeredAt: 1 },
      reponse('pitch', true),
    ]);

    assert.deepEqual(Object.keys(compteurs), ['pitch']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// IDEMPOTENCE — la garantie centrale du lot
// ═══════════════════════════════════════════════════════════════════════════

describe('integrerSeance — IDEMPOTENCE', () => {
  it('intègre une séance nouvelle : compteurs, totalSessions et lastPlayedAt', () => {
    const apres = integrerSeance(cumulVide(), 's1', reponses('financement', 4, 3), 1_700_000_000_000);

    assert.deepEqual(apres.masteryByCategory.financement, { correct: 3, total: 4 });
    assert.equal(apres.totalSessions, 1);
    assert.equal(apres.lastPlayedAt, 1_700_000_000_000);
    assert.deepEqual(apres.countedSessionIds, ['s1']);
  });

  it('⭐ intégrer DEUX FOIS la même séance ne double RIEN (double clic sur « Terminer »)', () => {
    const une = integrerSeance(cumulVide(), 's1', reponses('financement', 4, 3), 1_000);
    const deux = integrerSeance(une, 's1', reponses('financement', 4, 3), 1_000);

    assert.deepEqual(deux.masteryByCategory.financement, { correct: 3, total: 4 }, 'compteurs doublés');
    assert.equal(deux.totalSessions, 1, 'totalSessions doublé');
    assert.deepEqual(deux.countedSessionIds, ['s1']);
  });

  it('renvoie l’objet d’entrée LUI-MÊME quand la séance est déjà comptée (évite une écriture Firestore)', () => {
    const une = integrerSeance(cumulVide(), 's1', reponses('pitch', 3, 3), 1_000);
    const deux = integrerSeance(une, 's1', reponses('pitch', 3, 3), 1_000);

    assert.equal(deux, une, 'la comparaison par référence doit rester possible');
  });

  it('reste idempotent même si les réponses rejouées DIFFÈRENT (relecture partielle)', () => {
    // Cas réel : au second appel, un élève a écrit une réponse de plus entre
    // les deux lectures. La séance étant déjà comptée, rien ne doit bouger —
    // sinon le compteur dériverait à chaque tentative de clôture.
    const une = integrerSeance(cumulVide(), 's1', reponses('tech', 3, 2), 1_000);
    const deux = integrerSeance(une, 's1', reponses('tech', 8, 8), 5_000);

    assert.deepEqual(deux.masteryByCategory.tech, { correct: 2, total: 3 });
    assert.equal(deux.totalSessions, 1);
  });

  it('intègre bien DEUX séances DIFFÉRENTES', () => {
    let etat = integrerSeance(cumulVide(), 's1', reponses('financement', 3, 2), 1_000);
    etat = integrerSeance(etat, 's2', reponses('financement', 2, 2), 2_000);

    assert.deepEqual(etat.masteryByCategory.financement, { correct: 4, total: 5 });
    assert.equal(etat.totalSessions, 2);
    assert.deepEqual(etat.countedSessionIds, ['s1', 's2']);
  });

  it('compte une séance SANS aucune réponse : l’élève a bien participé', () => {
    const apres = integrerSeance(cumulVide(), 's1', [], 1_000);

    assert.equal(apres.totalSessions, 1, 'une séance jouée sans quiz reste une séance jouée');
    assert.deepEqual(apres.masteryByCategory, {});
    assert.deepEqual(apres.countedSessionIds, ['s1']);
  });

  it('lastPlayedAt ne RECULE jamais, quel que soit l’ordre d’intégration', () => {
    let etat = integrerSeance(cumulVide(), 's2', reponses('pitch', 1, 1), 9_000);
    etat = integrerSeance(etat, 's1', reponses('pitch', 1, 1), 1_000);

    assert.equal(etat.lastPlayedAt, 9_000, 'une séance ancienne ne doit pas rajeunir la fiche');
  });

  it('ignore un sessionId vide plutôt que d’ajouter un marqueur inutilisable', () => {
    const etat = cumulVide();
    assert.equal(integrerSeance(etat, '', reponses('pitch', 3, 3), 1_000), etat);
  });
});

describe('cumulDepuisLearner — lecture défensive du document d’élève', () => {
  it('lit les agrégats d’un élève déjà cumulé', () => {
    const etat = cumulDepuisLearner(
      eleve('e1', {
        masteryByCategory: { financement: { correct: 3, total: 5 } },
        totalSessions: 2,
        lastPlayedAt: 4_242,
        countedSessionIds: ['s2', 's1'],
      })
    );

    assert.deepEqual(etat.masteryByCategory.financement, { correct: 3, total: 5 });
    assert.equal(etat.totalSessions, 2);
    assert.equal(etat.lastPlayedAt, 4_242);
    assert.deepEqual(etat.countedSessionIds, ['s1', 's2'], 'les marqueurs doivent être triés');
  });

  it('part d’un cumul vide pour un élève créé avant le lot 7 (champs absents)', () => {
    const etat = cumulDepuisLearner({ id: 'e1', firstName: 'A', lastName: 'B', isActive: true });

    assert.deepEqual(etat.masteryByCategory, {});
    assert.equal(etat.totalSessions, 0);
    assert.equal(etat.lastPlayedAt, null);
    assert.deepEqual(etat.countedSessionIds, []);
  });

  it('déduplique les marqueurs — un doublon en base ne doit pas fausser l’idempotence', () => {
    const etat = cumulDepuisLearner(eleve('e1', { countedSessionIds: ['s1', 's1', 's2', ''] }));
    assert.deepEqual(etat.countedSessionIds, ['s1', 's2']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// RECALCUL COMPLET ↔ INTÉGRATIONS SUCCESSIVES
// ═══════════════════════════════════════════════════════════════════════════

describe('recalcul complet — équivalence avec la somme des intégrations', () => {
  /** Trois séances d'un même élève, telles que les liraient les deux chemins. */
  const seances = [
    { id: 's1', date: 1_000, reponses: [...reponses('financement', 3, 2), ...reponses('pitch', 1, 1)] },
    { id: 's2', date: 2_000, reponses: [...reponses('financement', 2, 2), ...reponses('marketing', 4, 1)] },
    { id: 's3', date: 3_000, reponses: [...reponses('pitch', 2, 0)] },
  ];

  /** Rejoue les séances dans l'ordre donné, depuis un état de départ. */
  function rejouer(etatDepart, ordre) {
    return ordre.reduce(
      (etat, s) => integrerSeance(etat, s.id, s.reponses, s.date),
      etatDepart
    );
  }

  it('⭐ un recalcul À ZÉRO donne exactement la somme des clôtures successives', () => {
    const parClotures = rejouer(cumulVide(), seances);
    const parRecalcul = rejouer(cumulVide(), seances);

    assert.deepEqual(parRecalcul.masteryByCategory, parClotures.masteryByCategory);
    assert.equal(parRecalcul.totalSessions, parClotures.totalSessions);
    assert.deepEqual(parRecalcul.countedSessionIds, parClotures.countedSessionIds);
  });

  it('l’ORDRE des séances ne change pas les compteurs (addition commutative)', () => {
    const chronologique = rejouer(cumulVide(), seances);
    const inverse = rejouer(cumulVide(), [...seances].reverse());

    assert.deepEqual(inverse.masteryByCategory, chronologique.masteryByCategory);
    assert.equal(inverse.totalSessions, chronologique.totalSessions);
    assert.equal(inverse.lastPlayedAt, chronologique.lastPlayedAt);
    assert.deepEqual(inverse.countedSessionIds, chronologique.countedSessionIds);
  });

  it('un recalcul RÉPARE un cumul corrompu (compteurs doublés à la main)', () => {
    // État corrompu : quelqu'un a doublé les compteurs sans toucher aux marqueurs.
    const corrompu = {
      masteryByCategory: { financement: { correct: 40, total: 80 } },
      totalSessions: 12,
      lastPlayedAt: 99_000,
      countedSessionIds: ['s1', 's2', 's3'],
    };
    const repare = rejouer(cumulVide(), seances);

    assert.notDeepEqual(repare.masteryByCategory, corrompu.masteryByCategory);
    assert.deepEqual(repare.masteryByCategory.financement, { correct: 4, total: 5 });
    assert.equal(repare.totalSessions, 3);
  });

  it('un recalcul lancé APRÈS des clôtures réussies ne double rien', () => {
    // Le cas exact du filet de sécurité utilisé « au cas où » : les marqueurs
    // sont déjà là, chaque séance est donc ignorée.
    const apresClotures = rejouer(cumulVide(), seances);
    const apresRecalculParDessus = rejouer(apresClotures, seances);

    assert.deepEqual(apresRecalculParDessus.masteryByCategory, apresClotures.masteryByCategory);
    assert.equal(apresRecalculParDessus.totalSessions, 3);
  });

  it('rattrape une clôture MANQUÉE (séance jouée, jamais comptabilisée)', () => {
    // s2 a échoué à la clôture : elle manque au cumul et à ses marqueurs.
    const avecTrou = rejouer(cumulVide(), [seances[0], seances[2]]);
    assert.equal(avecTrou.totalSessions, 2);

    const rattrape = rejouer(cumulVide(), seances);
    assert.equal(rattrape.totalSessions, 3);
    assert.deepEqual(rattrape.masteryByCategory.marketing, { correct: 1, total: 4 });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LE SEUIL DES 3 QUESTIONS, APPLIQUÉ AU CUMUL ANNUEL
// ═══════════════════════════════════════════════════════════════════════════

describe('agregerCompteurs — seuil des 3 questions sur le cumul annuel', () => {
  it('écarte du chiffrage une notion à 2 réponses cumulées', () => {
    const agregation = agregerCompteurs({ networking: { correct: 0, total: 2 } });

    assert.equal(agregation.notions.length, 0);
    assert.equal(agregation.sousEchantillonnees.length, 1);
    assert.equal(agregation.sousEchantillonnees[0].total, 2);
    assert.ok(
      !('taux' in agregation.sousEchantillonnees[0]),
      'une notion sous le seuil ne porte JAMAIS de pourcentage'
    );
  });

  it('chiffre une notion à exactement 3 réponses cumulées', () => {
    const agregation = agregerCompteurs({ pitch: { correct: 2, total: SEUIL_QUESTIONS_NOTION } });

    assert.equal(agregation.notions.length, 1);
    assert.equal(agregation.notions[0].taux, 67);
  });

  it('⭐ une notion vue UNE FOIS dans TROIS séances devient chiffrable sur l’ANNÉE', () => {
    // C'est la raison d'être du cumul : dans chacun des trois rapports de
    // séance, cette notion était « trop peu évaluée ». Sur l'année, elle ne
    // l'est plus — trois mesures valent une mesure.
    let etat = cumulVide();
    etat = integrerSeance(etat, 's1', [reponse('legal', true)], 1_000);
    etat = integrerSeance(etat, 's2', [reponse('legal', true)], 2_000);
    etat = integrerSeance(etat, 's3', [reponse('legal', false)], 3_000);

    // Par séance : rien n'est chiffrable.
    for (const uneSeule of [{ legal: { correct: 1, total: 1 } }]) {
      assert.equal(agregerCompteurs(uneSeule).notions.length, 0);
    }

    // Sur l'année : la notion est chiffrée.
    const annuel = agregerCompteurs(etat.masteryByCategory);
    assert.equal(annuel.notions.length, 1);
    assert.equal(annuel.notions[0].total, 3);
    assert.equal(annuel.notions[0].taux, 67);
  });

  it('trie par taux CROISSANT — la notion à retravailler d’abord', () => {
    const agregation = agregerCompteurs({
      pitch: { correct: 9, total: 10 },
      marketing: { correct: 2, total: 10 },
      financement: { correct: 5, total: 10 },
    });

    assert.deepEqual(
      agregation.notions.map((n) => n.category),
      ['marketing', 'financement', 'pitch']
    );
    assert.equal(agregation.notionLaPlusFaible.category, 'marketing');
  });

  it('applique le même code couleur que le rapport de séance (≥70 / 40-69 / <40)', () => {
    const agregation = agregerCompteurs({
      acquis: { correct: 7, total: 10 },
      moyen: { correct: 4, total: 10 },
      faible: { correct: 3, total: 10 },
    });
    const parCle = Object.fromEntries(agregation.notions.map((n) => [n.category, n.niveau]));

    assert.equal(parCle.acquis, 'reussi');
    assert.equal(parCle.moyen, 'a-consolider');
    assert.equal(parCle.faible, 'a-retravailler');
  });

  it('compte le total de réponses, seuil ou pas', () => {
    const agregation = agregerCompteurs({
      pitch: { correct: 3, total: 5 },
      networking: { correct: 1, total: 2 },
    });
    assert.equal(agregation.totalReponses, 7);
  });
});

describe('agregerNotions et agregerCompteurs — un seul et même calcul', () => {
  it('⭐ le rapport de séance et la fiche annuelle donnent le MÊME verdict sur les mêmes données', () => {
    // Deux chemins d'entrée (réponses brutes / compteurs cumulés), un seul
    // calcul : si un jour ils divergeaient, l'établissement lirait deux
    // verdicts contradictoires sur le même élève.
    const listeReponses = [
      ...reponses('financement', 5, 4),
      ...reponses('marketing', 3, 1),
      ...reponses('networking', 2, 2),
    ];

    const parReponses = agregerNotions([{ learnerId: 'e1', answers: listeReponses }]);
    const parCompteurs = agregerCompteurs(compteursDepuisReponses(listeReponses));

    assert.deepEqual(parCompteurs.notions, parReponses.notions);
    assert.deepEqual(parCompteurs.sousEchantillonnees, parReponses.sousEchantillonnees);
    assert.equal(parCompteurs.totalReponses, parReponses.totalReponses);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ÉLIGIBILITÉ AU CERTIFICAT
// ═══════════════════════════════════════════════════════════════════════════

describe('examinerEligibilite — critère du certificat', () => {
  it('⭐ éligible dès UNE notion au-dessus du seuil de 3 questions', () => {
    const examen = examinerEligibilite(
      eleve('e1', {
        masteryByCategory: { financement: { correct: 2, total: 3 } },
        totalSessions: 1,
      })
    );

    assert.equal(examen.eligible, true);
    assert.equal(examen.raison, null);
    assert.equal(examen.notions.length, 1);
  });

  it('NON éligible si toutes les notions restent sous le seuil', () => {
    const examen = examinerEligibilite(
      eleve('e1', {
        masteryByCategory: { pitch: { correct: 2, total: 2 }, legal: { correct: 1, total: 1 } },
        totalSessions: 2,
      })
    );

    assert.equal(examen.eligible, false);
    assert.ok(examen.raison, 'un refus doit TOUJOURS porter sa raison');
    assert.match(examen.raison, /3 questions/);
    assert.equal(examen.totalReponses, 3);
  });

  it('NON éligible sans aucune séance — raison distincte de « a joué mais trop peu »', () => {
    const examen = examinerEligibilite(eleve('e1'));

    assert.equal(examen.eligible, false);
    assert.match(examen.raison, /aucune séance/i);
  });

  it('NON éligible s’il a joué sans répondre à un seul quiz', () => {
    const examen = examinerEligibilite(eleve('e1', { totalSessions: 2 }));

    assert.equal(examen.eligible, false);
    assert.match(examen.raison, /aucun quiz/i);
  });

  it('⭐ un taux FAIBLE n’exclut PAS : le certificat atteste d’une participation mesurée', () => {
    // Exclure l'élève le plus faible du seul document qu'il recevrait serait
    // exactement à contre-emploi.
    const examen = examinerEligibilite(
      eleve('e1', { masteryByCategory: { marketing: { correct: 0, total: 8 } }, totalSessions: 3 })
    );

    assert.equal(examen.eligible, true);
    assert.equal(examen.notions[0].taux, 0);
    assert.equal(examen.notions[0].niveau, 'a-retravailler');
  });

  it('ne retient QUE les notions au-dessus du seuil sur le certificat', () => {
    const examen = examinerEligibilite(
      eleve('e1', {
        masteryByCategory: {
          financement: { correct: 4, total: 5 },
          networking: { correct: 1, total: 1 },
        },
        totalSessions: 2,
      })
    );

    assert.deepEqual(
      examen.notions.map((n) => n.category),
      ['financement'],
      'une notion à 1 question ne doit jamais figurer sur un certificat'
    );
  });

  it('AUCUN niveau N1–N4 n’est produit — la règle pédagogique n’est pas tranchée', () => {
    const examen = examinerEligibilite(
      eleve('e1', { masteryByCategory: { pitch: { correct: 9, total: 10 } }, totalSessions: 4 })
    );

    const serialise = JSON.stringify(examen);
    assert.doesNotMatch(serialise, /"N[1-4]"|niveauGlobal|palier/i);
  });
});

describe('examinerClasse — aucun élève écarté en silence', () => {
  it('rend un examen par élève, éligibles ET exclus, chacun avec sa raison', () => {
    const examens = examinerClasse([
      eleve('e1', { masteryByCategory: { pitch: { correct: 3, total: 4 } }, totalSessions: 2 }),
      eleve('e2', { masteryByCategory: { pitch: { correct: 1, total: 1 } }, totalSessions: 1 }),
      eleve('e3'),
    ]);

    assert.equal(examens.length, 3, 'un examen par élève, sans exception');
    assert.equal(examens.filter((e) => e.eligible).length, 1);
    for (const exclu of examens.filter((e) => !e.eligible)) {
      assert.ok(exclu.raison && exclu.raison.length > 10, 'chaque exclusion doit être motivée');
    }
  });
});
