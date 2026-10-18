/**
 * Import JSON de la fiche d'un défi — `importerFicheJson`.
 *
 * Ces tests portent sur ce qui se voit TARD : un chiffre sans source est
 * accepté par le formulaire et n'apparaît jamais dans l'app, un fuseau
 * inventé ne lève qu'au calcul du plafond quotidien, et une clé mal nommée
 * rend « import réussi » sur un formulaire resté vide.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  importerFicheJson,
  modeleFicheJson,
  MODELE_FICHE_JSON,
} from '../src/lib/defi-fiche-import.ts';

const bloquantes = (r) => r.anomalies.filter((a) => a.bloquant);
const douces = (r) => r.anomalies.filter((a) => !a.bloquant);

// ═══ ENVELOPPE ═══

test('un texte vide est refusé', () => {
  const r = importerFicheJson('   ');
  assert.equal(r.fiche, null);
  assert.equal(bloquantes(r).length, 1);
});

test('un JSON mal formé est refusé avec le détail de l’erreur', () => {
  const r = importerFicheJson('{ "titre": }');
  assert.equal(r.fiche, null);
  assert.match(bloquantes(r)[0].message, /JSON invalide/);
});

test('une liste à la racine est refusée', () => {
  const r = importerFicheJson('[{ "titre": "Test" }]');
  assert.equal(r.fiche, null);
  assert.match(bloquantes(r)[0].message, /objet/);
});

test('l’enveloppe « defi » est acceptée comme les champs à plat', () => {
  const enveloppe = importerFicheJson('{ "defi": { "titre": "Les inondations" } }');
  const plat = importerFicheJson('{ "titre": "Les inondations" }');
  assert.equal(enveloppe.fiche.titre, 'Les inondations');
  assert.deepEqual(enveloppe.fiche, plat.fiche);
});

test('un objet reçu déjà analysé est accepté', () => {
  const r = importerFicheJson({ titre: 'Direct' });
  assert.equal(r.fiche.titre, 'Direct');
});

/*
  LE CAS LE PLUS COÛTEUX : des clés inconnues.

  Sans ce refus, une faute de frappe sur « titre » rendrait « import réussi »
  et l'auteur relirait son JSON au lieu de relire le nom des clés.
*/
test('un JSON valide dont aucune clé n’est reconnue est refusé', () => {
  const r = importerFicheJson('{ "theme": "Oups", "pays": "SN" }');
  assert.equal(r.fiche, null);
  assert.match(bloquantes(r)[0].message, /Aucun champ reconnu/);
});

// ═══ RIEN N'EST OBLIGATOIRE ═══

test('un JSON partiel ne renseigne que ses propres champs', () => {
  const r = importerFicheJson('{ "titre": "Seul le titre" }');
  assert.equal(r.fiche.titre, 'Seul le titre');
  assert.equal(r.fiche.description, undefined);
  assert.equal(r.fiche.ideation, undefined);
  assert.deepEqual(r.remplis, ['thème']);
});

test('les espaces de bord sont retirés, et une chaîne vide ne compte pas', () => {
  const r = importerFicheJson('{ "titre": "  Espacé  ", "description": "   " }');
  assert.equal(r.fiche.titre, 'Espacé');
  assert.equal(r.fiche.description, undefined);
});

// ═══ ZONE ═══

test('la zone exige code, nom et article ensemble', () => {
  const r = importerFicheJson('{ "titre": "T", "zone": { "code": "SN" } }');
  assert.equal(r.fiche.zone, undefined);
  assert.match(douces(r)[0].message, /ensemble/);
});

test('le code pays est mis en majuscules', () => {
  const r = importerFicheJson(
    '{ "zone": { "code": "sn", "nom": "Sénégal", "avecArticle": "au Sénégal" } }'
  );
  assert.equal(r.fiche.zone.code, 'SN');
});

// ═══ CALENDRIER ═══

test('la semaine accepte une chaîne, car un JSON écrit à la main en porte', () => {
  const r = importerFicheJson('{ "semaine": "43" }');
  assert.equal(r.fiche.semaine, 43);
});

test('une semaine hors bornes est écartée sans bloquer le reste', () => {
  const r = importerFicheJson('{ "titre": "T", "semaine": 70 }');
  assert.equal(r.fiche.semaine, undefined);
  assert.equal(r.fiche.titre, 'T');
  assert.match(douces(r)[0].message, /1 et 53/);
});

/*
  Le fuseau décide du découpage des journées pour le plafond de parties.
  Un fuseau inventé n'échoue qu'EN PARTIE, chez le joueur.
*/
test('un fuseau inconnu est écarté', () => {
  const r = importerFicheJson('{ "titre": "T", "fuseau": "Africa/Dakarr" }');
  assert.equal(r.fiche.fuseau, undefined);
  assert.match(douces(r)[0].message, /n'est pas un fuseau reconnu/);
});

test('un fuseau valide est conservé', () => {
  const r = importerFicheJson('{ "fuseau": "Africa/Dakar" }');
  assert.equal(r.fiche.fuseau, 'Africa/Dakar');
});

// ═══ CHIFFRES ═══

test('un chiffre sans source est écarté : l’app ne l’afficherait pas', () => {
  const r = importerFicheJson(
    '{ "chiffres": [{ "valeur": "8 336", "libelle": "sinistrés" }] }'
  );
  assert.equal(r.fiche, null);
  assert.match(douces(r)[0].message, /pas de source/);
});

test('un chiffre complet est conservé', () => {
  const r = importerFicheJson(
    '{ "chiffres": [{ "valeur": "8 336", "libelle": "sinistrés", "source": "MHA 2025" }] }'
  );
  assert.deepEqual(r.fiche.chiffres, [
    { valeur: '8 336', libelle: 'sinistrés', source: 'MHA 2025' },
  ]);
  assert.deepEqual(r.remplis, ['1 chiffre']);
});

test('au-delà de trois chiffres, les suivants sont écartés et signalés', () => {
  const un = (i) => `{ "valeur": "${i}", "libelle": "l${i}", "source": "s" }`;
  const r = importerFicheJson(`{ "chiffres": [${[1, 2, 3, 4].map(un).join(',')}] }`);
  assert.equal(r.fiche.chiffres.length, 3);
  assert.match(douces(r)[0].message, /Au-delà de 3/);
});

// ═══ IDÉATION ═══

test('les doublons d’une liste sont retirés, casse ignorée', () => {
  const r = importerFicheJson(
    '{ "ideation": { "angles": ["Prévenir", "prévenir", "Évacuer"] } }'
  );
  assert.deepEqual(r.fiche.ideation.angles, ['Prévenir', 'Évacuer']);
  assert.match(douces(r)[0].message, /en double/);
});

test('les trois listes sont toujours écrites, même vides', () => {
  const r = importerFicheJson('{ "ideation": { "angles": ["A"] } }');
  assert.deepEqual(r.fiche.ideation.angles, ['A']);
  assert.deepEqual(r.fiche.ideation.cibles, []);
  assert.deepEqual(r.fiche.ideation.missions, []);
});

test('une liste est plafonnée à six entrées', () => {
  const sept = Array.from({ length: 7 }, (_, i) => `"a${i}"`).join(',');
  const r = importerFicheJson(`{ "ideation": { "cibles": [${sept}] } }`);
  assert.equal(r.fiche.ideation.cibles.length, 6);
});

test('les ids des pistes sont réécrits, pour qu’aucun ne se répète', () => {
  const p = (n) =>
    `{ "id": "DOUBLON", "nom": "${n}", "description": "d", "pourQui": "q" }`;
  const r = importerFicheJson(
    `{ "ideation": { "pistesExpress": [${p('A')}, ${p('B')}] } }`
  );
  const ids = r.fiche.ideation.pistesExpress.map((x) => x.id);
  assert.equal(new Set(ids).size, 2);
});

test('une piste incomplète est écartée, les autres passent', () => {
  const r = importerFicheJson(
    '{ "ideation": { "pistesExpress": [' +
      '{ "nom": "Bonne", "description": "d", "pourQui": "q" },' +
      '{ "nom": "Sans pourQui", "description": "d" }] } }'
  );
  assert.equal(r.fiche.ideation.pistesExpress.length, 1);
  assert.match(douces(r)[0].message, /pourQui/);
});

// ═══ VIDÉO ET LOT ═══

test('une vidéo sans url est écartée', () => {
  const r = importerFicheJson('{ "titre": "T", "video": { "dureeS": 30 } }');
  assert.equal(r.fiche.video, undefined);
  assert.match(douces(r)[0].message, /url/);
});

test('un lot sans version courte est écarté', () => {
  const r = importerFicheJson('{ "titre": "T", "lot": { "long": "Long seul" } }');
  assert.equal(r.fiche.lot, undefined);
});

// ═══ LE MODÈLE ═══

/*
  Le modèle doit traverser son propre importeur sans une seule anomalie :
  c'est lui qu'on propose à l'auteur, et un modèle qui se fait corriger
  enseignerait un format faux.
*/
test('le modèle fourni s’importe sans aucune anomalie', () => {
  const r = importerFicheJson(modeleFicheJson());
  assert.deepEqual(r.anomalies, []);
  assert.equal(r.fiche.titre, MODELE_FICHE_JSON.titre);
  assert.equal(r.fiche.zone.code, 'SN');
  assert.equal(r.fiche.ideation.angles.length, 3);
  assert.equal(r.fiche.chiffres.length, 1);
});

test('le modèle est du JSON indenté, lisible dans un champ', () => {
  const t = modeleFicheJson();
  assert.doesNotThrow(() => JSON.parse(t));
  assert.match(t, /\n {2}"titre"/);
});
