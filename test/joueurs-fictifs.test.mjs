/**
 * Le générateur de joueurs fictifs.
 *
 * Deux propriétés comptent, et aucune n'est évidente à l'œil : les pseudos
 * doivent être uniques (un doublon se lit comme un bug d'affichage), et les
 * scores doivent décroître de façon irrégulière (une suite régulière se
 * repère au premier coup d'œil et rend les rangs absurdes).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { genererJoueursFictifs, estJoueurFictif, PREFIXE_FICTIF } from '../src/lib/joueurs-fictifs.ts';

test('génère exactement le nombre demandé', () => {
  assert.equal(genererJoueursFictifs(100).length, 100);
  assert.equal(genererJoueursFictifs(1).length, 1);
});

test('les identifiants portent tous le préfixe et sont uniques', () => {
  const joueurs = genererJoueursFictifs(100);
  const ids = new Set(joueurs.map((j) => j.userId));
  assert.equal(ids.size, 100);
  for (const j of joueurs) {
    assert.ok(j.userId.startsWith(PREFIXE_FICTIF), j.userId);
    assert.ok(estJoueurFictif(j.userId));
  }
});

test('les pseudos sont uniques — un doublon se lit comme un bug', () => {
  const noms = genererJoueursFictifs(100).map((j) => j.displayName);
  assert.equal(new Set(noms).size, noms.length);
});

test('aucun score ne dépasse le maximum demandé', () => {
  for (const j of genererJoueursFictifs(200, { maxXp: 400 })) {
    assert.ok(j.xp <= 400, `${j.xp} > 400`);
    assert.ok(j.xp >= 20, `${j.xp} < 20`);
  }
});

test('la répartition est écrasée vers le bas, pas linéaire', () => {
  const xps = genererJoueursFictifs(200, { maxXp: 600 })
    .map((j) => j.xp)
    .sort((a, b) => b - a);
  const median = xps[Math.floor(xps.length / 2)];
  /*
    Avec une répartition linéaire la médiane serait vers 300 (la moitié du
    maximum). La puissance 2.2 doit la ramener nettement plus bas : beaucoup
    de petits scores, peu de gros.
  */
  assert.ok(median < 200, `médiane ${median} — répartition trop plate`);
});

test('parties et briques restent cohérentes avec le score', () => {
  for (const j of genererJoueursFictifs(150)) {
    assert.ok(j.briquesPosees >= 0 && j.briquesPosees <= 5, `briques ${j.briquesPosees}`);
    assert.ok(j.parties >= 1, `parties ${j.parties}`);
    // Une brique vaut 60 points : on ne peut pas en avoir plus que le score.
    assert.ok(j.briquesPosees * 60 <= j.xp + 60, `${j.briquesPosees} briques pour ${j.xp} XP`);
  }
});

test('la même graine redonne exactement les mêmes joueurs', () => {
  const a = genererJoueursFictifs(50, { graine: 7 });
  const b = genererJoueursFictifs(50, { graine: 7 });
  assert.deepEqual(a, b);
});

test('deux graines différentes donnent des populations différentes', () => {
  const a = genererJoueursFictifs(50, { graine: 1 });
  const b = genererJoueursFictifs(50, { graine: 2 });
  assert.notDeepEqual(a.map((j) => j.displayName), b.map((j) => j.displayName));
});

test('un identifiant ordinaire n’est pas pris pour un fictif', () => {
  assert.equal(estJoueurFictif('uid_abdoulaye'), false);
  assert.equal(estJoueurFictif(''), false);
});
