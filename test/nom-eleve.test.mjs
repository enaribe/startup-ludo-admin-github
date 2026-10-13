/**
 * Traitement du nom saisi par l'élève — `nom-eleve.ts`.
 *
 * CE QUI EST EN JEU. Depuis l'auto-inscription, ce nom est une saisie libre qui
 * part dans la salle d'attente projetée au tableau, dans le rapport de séance,
 * dans les cumuls annuels et sur les certificats nominatifs. Deux fautes
 * possibles, de gravités très inégales :
 *
 *   - LAISSER PASSER un pseudo ou une insulte : gênant, mais l'enseignant voit
 *     le nom dans la salle d'attente et exclut d'un appui.
 *   - REFUSER un vrai nom : l'élève ne peut pas rejoindre la séance, pendant le
 *     cours, sans aucun recours. C'est la faute à ne pas commettre.
 *
 * D'où le déséquilibre de cette suite : l'essentiel vérifie qu'on n'empêche
 * personne d'écrire son propre nom.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decouperNom, nomAffiche, normaliserNomSaisi } from '../src/lib/nom-eleve.ts';

// ═══ LES VRAIS NOMS DOIVENT PASSER ═══
/*
  Noms réellement portés en Afrique de l'Ouest, zone du produit. Chacun contient
  une particularité qu'un filtre naïf écrase : apostrophe, tiret, particule,
  accent, nom composé long.
*/

const NOMS_LEGITIMES = {
  'apostrophe droite': ["N'Diaye", 'N'],
  'apostrophe typographique': ['N’Diaye', 'N'],
  'tiret': ['Ba-Diallo', 'B'],
  'particule séparée': ['Ba Sow', 'B'],
  'accents': ['Thiès', 'T'],
  'tréma': ['Aïssatou Diallo', 'A'],
  'cédille': ['François Koné', 'F'],
  'composé long': ['Marie Claire Ba Sow', 'M'],
  'initiale avec point': ['A. Diop', 'A'],
  'prénom seul': ['Fatou', 'F'],
  'deux particules': ['Ould Mohamed Lemine', 'O'],
  'tiret et apostrophe': ["N'Ba-Diop", 'N'],
};

for (const [cas, [nom]] of Object.entries(NOMS_LEGITIMES)) {
  test(`nom légitime accepté — ${cas} : « ${nom} »`, () => {
    const propre = normaliserNomSaisi(nom);
    assert.ok(propre, `« ${nom} » est un nom réel : le refuser bloquerait un élève en pleine séance`);
  });
}

test('un nom en capitales est ramené à une casse lisible', () => {
  // Les claviers mobiles passent volontiers en capitales : sans ça, la salle
  // d'attente afficherait « FATOU DIOP » en hurlant.
  assert.equal(normaliserNomSaisi('FATOU DIOP'), 'Fatou Diop');
});

test('un nom tout en minuscules est capitalisé', () => {
  assert.equal(normaliserNomSaisi('fatou diop'), 'Fatou Diop');
});

test('la majuscule suit le tiret ET l’apostrophe', () => {
  /*
    Le point le moins évident du module. Une capitalisation « par mot » donne
    « N'diaye » et « Ba-diallo » — des orthographes que les personnes concernées
    ne reconnaissent pas comme leur nom.
  */
  assert.equal(normaliserNomSaisi("n'diaye"), "N'Diaye");
  assert.equal(normaliserNomSaisi('ba-diallo'), 'Ba-Diallo');
  assert.equal(normaliserNomSaisi('n’diaye'), 'N’Diaye');
});

test('les espaces superflus sont repliés', () => {
  assert.equal(normaliserNomSaisi('  Fatou    Diop  '), 'Fatou Diop');
});

test('les espaces insécables d’un copier-coller sont acceptés', () => {
  // Un copier-coller depuis un PDF de liste de classe colle des U+00A0. Les
  // refuser donnerait un échec incompréhensible pour l'élève.
  assert.equal(normaliserNomSaisi('Fatou Diop'), 'Fatou Diop');
});

test('les caractères invisibles sont retirés sans faire échouer la saisie', () => {
  // U+200B (espace de largeur nulle) et U+202E (inversion bidirectionnelle, qui
  // retourne l'affichage d'une ligne entière) sont supprimés, pas rejetés.
  assert.equal(normaliserNomSaisi('Fatou​ Diop'), 'Fatou Diop');
  assert.equal(normaliserNomSaisi('‮Fatou Diop'), 'Fatou Diop');
});

test('un alphabet non latin est accepté', () => {
  // Un établissement arabophone doit pouvoir inscrire ses élèves.
  assert.ok(normaliserNomSaisi('فاطمة'), 'les lettres arabes sont des lettres');
  assert.ok(normaliserNomSaisi('Ολυμπία'), 'les lettres grecques aussi');
});

// ═══ CE QUI DOIT ÊTRE REFUSÉ ═══

test('une saisie vide est refusée', () => {
  for (const vide of ['', '   ', '\n', ' ']) {
    assert.equal(normaliserNomSaisi(vide), null);
  }
});

test('une saisie sans deux lettres est refusée', () => {
  // Passe la liste blanche mais n'est pas un nom.
  for (const faux of ['-', '--', '..', "'", '. .', 'A']) {
    assert.equal(normaliserNomSaisi(faux), null, `« ${faux} » n’est pas un nom`);
  }
});

test('les emoji et symboles sont refusés', () => {
  for (const faux of ['Fatou 😀', '★Fatou★', 'Fatou<script>', 'Fatou@diop', 'Fatou_123', 'xXx_Gamer_xXx']) {
    assert.equal(normaliserNomSaisi(faux), null, `« ${faux} » ne doit pas s’afficher au tableau`);
  }
});

test('les chiffres sont refusés', () => {
  assert.equal(normaliserNomSaisi('Fatou 2'), null);
  assert.equal(normaliserNomSaisi('Joueur1'), null);
});

test('l’usurpation d’autorité est refusée', () => {
  // Le vrai risque : un élève affiché « Professeur » brouille la lecture de la
  // salle d'attente, qui est l'outil d'arbitrage de l'enseignant.
  for (const faux of ['Professeur', 'Le Professeur', 'Admin', 'ADMINISTRATEUR', 'Startup Ludo', 'Directeur']) {
    assert.equal(normaliserNomSaisi(faux), null, `« ${faux} » usurpe une autorité`);
  }
});

test('les insultes les plus grossières sont refusées', () => {
  for (const faux of ['Grosse Pute', 'Fuck You', 'Connard']) {
    assert.equal(normaliserNomSaisi(faux), null);
  }
});

test('un nom qui CONTIENT une suite interdite reste accepté', () => {
  /*
    GARDE-FOU CONTRE LE ZÈLE. « Negrete » est un patronyme réel, « Nique » peut
    apparaître dans un nom. Sans frontière de mot, le filtre refuserait des
    élèves à cause d'une sous-chaîne — exactement la faute la plus grave du
    module.
  */
  for (const vrai of ['Negrete', 'Niquelandia', 'Administra']) {
    assert.ok(
      normaliserNomSaisi(vrai),
      `« ${vrai} » doit passer : le filtre travaille sur des mots entiers, pas des fragments`
    );
  }
});

test('un nom trop long est tronqué, pas refusé', () => {
  // Tronquer plutôt que refuser : la longueur n'est pas une faute de l'élève.
  const long = 'Mohamed '.repeat(20);
  const propre = normaliserNomSaisi(long);
  assert.ok(propre, 'un nom long doit être accepté tronqué');
  assert.ok(propre.length <= 60, `tronqué à 60 au plus, reçu ${propre.length}`);
});

// ═══ DÉCOUPAGE PRÉNOM / NOM ═══

test('le premier fragment est le prénom, le reste le nom', () => {
  assert.deepEqual(decouperNom('Fatou Diop'), { firstName: 'Fatou', lastName: 'Diop' });
  assert.deepEqual(decouperNom('Marie Claire Ba Sow'), {
    firstName: 'Marie',
    lastName: 'Claire Ba Sow',
  });
});

test('un nom d’un seul mot n’a pas de nom de famille', () => {
  assert.deepEqual(decouperNom('Fatou'), { firstName: 'Fatou', lastName: '' });
});

test('un tiret ne coupe PAS le prénom du nom', () => {
  // « Ba-Diallo » est un seul patronyme : le découper en deux donnerait un
  // affichage « Ba B. » absurde.
  assert.deepEqual(decouperNom('Ba-Diallo'), { firstName: 'Ba-Diallo', lastName: '' });
});

// ═══ PROJECTION PUBLIQUE ═══

test('la projection publique réduit le nom à prénom + initiale', () => {
  // Exigence de protection des données : il s'agit de mineurs, et ce nom est
  // exposé par les routes publiques de résolution de code.
  assert.equal(nomAffiche('Fatou', 'Diop'), 'Fatou D.');
  assert.equal(nomAffiche('Marie', 'Claire Ba Sow'), 'Marie C.');
});

test('la projection ne révèle jamais le nom de famille complet', () => {
  const affiche = nomAffiche('Fatou', 'Diop');
  assert.ok(!affiche.includes('Diop'), `« ${affiche} » expose l’état civil`);
});

test('la projection reste lisible sans nom de famille', () => {
  assert.equal(nomAffiche('Fatou', ''), 'Fatou');
  assert.equal(nomAffiche('', 'Diop'), 'D.');
  assert.equal(nomAffiche('', ''), 'Élève');
});

test('le nom normalisé et sa projection sont cohérents', () => {
  // Chaîne complète : ce que l'élève tape → ce que l'enseignant voit.
  const propre = normaliserNomSaisi('  fatou   DIOP ');
  assert.ok(propre);
  const { firstName, lastName } = decouperNom(propre);
  assert.equal(nomAffiche(firstName, lastName), 'Fatou D.');
});
