/**
 * Contrôle thématique des cours déposés — `analyse-thematique.ts`.
 *
 * CE QUI EST TESTÉ ICI, ET POURQUOI. Un contrôle qui refuse du contenu a deux
 * modes de défaillance aux coûts très inégaux :
 *
 *   - FAUX NÉGATIF (un cours hors-sujet passe) : des quiz de géologie étiquetés
 *     « business-model », et un rapport de séance qui annonce des pourcentages
 *     par notion sur des questions qui n'en relèvent pas.
 *   - FAUX POSITIF (le cours d'un enseignant est refusé à tort) : un enseignant
 *     bloqué devant sa classe, sans recours. C'est le pire des deux.
 *
 * La suite est donc volontairement déséquilibrée : l'essentiel des cas vérifie
 * qu'on ne refuse PAS à tort, et que toute défaillance du classifieur laisse
 * passer plutôt que de bloquer.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compterIndicesEntrepreneuriat,
  extraireEchantillon,
  lireVerdictModele,
  messageRefus,
  preVerdictLexical,
  toucheAuVoisinage,
} from '../src/lib/analyse-thematique.ts';

/**
 * Texte contenant chaque racine de la liste, sous une forme et sous l'autre.
 *
 * Sert au garde-fou anti-doublon : en faisant matcher tout ce qui peut matcher,
 * on expose deux racines qui se replieraient sur la même chaîne.
 */
const RACINES_TEMOIN = [
  'entrepreneuriat startup start-up business model business plan modele economique',
  'proposition de valeur etude de marche segment de clientele chiffre d affaires',
  'rentabilite levee de fonds investisseur capital-risque capital risque microfinance',
  'micro-credit incubateur accelerateur pitch plan d affaires tresorerie',
  'fonds de roulement marge commerciale creation d entreprise porteur de projet pme tpe',
  'commercialisation strategie commerciale avantage concurrentiel concurrence clientele',
  'fournisseur statut juridique immatriculation formalisation secteur informel innovation',
  'prototype mvp parts de marche fonds propres subvention credit bancaire garantie bancaire',
  'comptabilite facturation fiscalite cooperative gestion d entreprise ressources humaines',
  'recrutement marketing publicite reseau de distribution',
  // Variantes accentuées et apostrophées : si une racine accentuée a été
  // ajoutée à la liste, elle matchera ici et le doublon sera détecté.
  'rentabilité trésorerie comptabilité clientèle chiffre d’affaires étude de marché',
  'modèle économique coopérative publicité fiscalité accélérateur micro-crédit',
];

/** Répète un texte jusqu'à dépasser la longueur minimale d'analyse. */
const long = (t) => t.repeat(Math.ceil(400 / t.length) + 1);

// ═══ DÉTECTION LEXICALE ═══

test('les racines attrapent les formes fléchies', () => {
  for (const mot of ['entrepreneuriat', 'entreprendre', 'entrepreneur', 'entrepreneuriale']) {
    assert.ok(
      compterIndicesEntrepreneuriat(mot).length >= 1,
      `« ${mot} » devrait être reconnu par la racine « entrepre »`
    );
  }
});

test('les accents ne changent rien à la détection', () => {
  const avec = compterIndicesEntrepreneuriat('La rentabilité et la trésorerie de l’entreprise');
  const sans = compterIndicesEntrepreneuriat('La rentabilite et la tresorerie de l’entreprise');
  assert.deepEqual(
    avec.sort(),
    sans.sort(),
    'un cours tapé sans accents doit être analysé comme un cours accentué'
  );
});

test('la casse ne change rien à la détection', () => {
  assert.equal(
    compterIndicesEntrepreneuriat('BUSINESS MODEL').length,
    compterIndicesEntrepreneuriat('business model').length
  );
});

test('les indices sont comptés une seule fois, même répétés', () => {
  // Sans ça, un seul mot martelé suffirait à faire passer n'importe quel texte.
  const indices = compterIndicesEntrepreneuriat('innovation '.repeat(50));
  assert.equal(indices.length, 1, `une seule racine distincte attendue, reçu : ${indices}`);
});

test('aucun faux positif sur du vocabulaire courant', () => {
  const texte =
    'Entre deux cours, lors de l’entretien, les élèves entrent dans la salle et ' +
    'entretiennent leur matériel. L’entrée est libre.';
  assert.deepEqual(
    compterIndicesEntrepreneuriat(texte),
    [],
    '« entre », « entretien », « entrent » ne doivent PAS déclencher la racine « entrepre »'
  );
});

test('les apostrophes typographiques sont reconnues', () => {
  /*
    RÉGRESSION FIXÉE ICI. La liste de racines est écrite sans apostrophe
    (« chiffre d affaires »), mais Word pose U+2019 et un export Markdown pose
    U+0027. Sans normalisation, la détection dépendait du traitement de texte de
    l'enseignant — un cours écrit sous Word n'était pas vu.
  */
  for (const forme of [
    'chiffre d’affaires', // U+2019, celle de Word
    "chiffre d'affaires", // U+0027
    'chiffre d affaires',
  ]) {
    assert.ok(
      compterIndicesEntrepreneuriat(forme).includes('chiffre d affaires'),
      `« ${forme} » doit être reconnu quelle que soit l'apostrophe`
    );
  }
});

test('un retour à la ligne au milieu d’une expression ne la masque pas', () => {
  // Un PDF coupe les lignes où il veut : « business\nmodel » est fréquent.
  assert.ok(compterIndicesEntrepreneuriat('le business\n   model canvas').includes('business model'));
});

test('AUCUNE racine n’est un doublon accentué d’une autre', () => {
  /*
    GARDE-FOU DE MAINTENANCE. `replier()` dépouille accents et apostrophes des
    DEUX côtés : « rentabilite » et « rentabilité » matchent donc exactement les
    mêmes textes. Un tel doublon serait compté deux fois, gonflant le score face
    au seuil d'acceptation et affichant « rentabilite · rentabilité » dans la
    liste des notions montrée à l'enseignant. Ce test échoue si quelqu'un ajoute
    une variante accentuée par réflexe.
  */
  const texteTemoin = RACINES_TEMOIN.join(' ');
  const detectees = compterIndicesEntrepreneuriat(texteTemoin);
  const vues = new Map();
  for (const r of detectees) {
    const plie = r
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['’\u02bc]/g, ' ')
      .replace(/\s+/g, ' ');
    assert.equal(
      vues.has(plie),
      false,
      `« ${r} » et « ${vues.get(plie)} » se replient tous deux sur « ${plie} » : doublon`
    );
    vues.set(plie, r);
  }
});

// ═══ CALIBRAGE SUR DES DOCUMENTS RÉELS ═══
/*
  Ces cas sont la justification du seuil d'acceptation. Ils encadrent la décision
  par du texte réaliste des deux côtés de la frontière : si quelqu'un déplace le
  seuil, c'est ici que ça casse, avec le document concret qui en souffre.
*/

const COURS_HORS_SUJET = {
  grammaire:
    "Le complément d'objet direct répond à la question « qui ? » ou « quoi ? ». " +
    "L'accord du participe passé avec l'auxiliaire être se fait avec le sujet. Les " +
    'propositions subordonnées relatives sont introduites par un pronom relatif.',
  'histoire — partage colonial':
    "La conférence de Berlin de 1884 organise le partage de l'Afrique entre les " +
    'puissances européennes. Les tracés frontaliers ignorent les réalités ethniques. ' +
    'Les indépendances africaines surviennent majoritairement en 1960.',
  'EPS — athlétisme':
    "L'échauffement prévient les blessures musculaires. Le relais 4x100 mètres exige " +
    'une transmission précise du témoin. Les étirements se pratiquent à froid ou à ' +
    "chaud. Le saut en longueur comporte quatre phases d'exécution.",
  'informatique — purement technique':
    "Une boucle for itère sur une séquence. Les tableaux sont indexés à partir de " +
    "zéro. La récursivité consiste pour une fonction à s'appeler elle-même. Le " +
    "protocole TCP garantit l'ordre des paquets. Une adresse IPv4 comporte quatre octets.",
  'SVT — photosynthèse':
    "La photosynthèse permet aux plantes chlorophylliennes de produire de la matière " +
    "organique à partir de dioxyde de carbone et d'eau. Les chloroplastes contiennent " +
    "la chlorophylle. La respiration cellulaire libère l'énergie du glucose dans les " +
    'mitochondries. Les échanges gazeux sont régulés par les stomates.',
  'mathématiques — proportionnalité avec des prix':
    "Un commerçant vend 3 kg de riz pour 2400 francs. Calculer le prix de 7 kg. Une " +
    "voiture consomme 8 litres aux 100 km : quelle quantité pour 350 km ? Résoudre " +
    "l'équation 3x + 5 = 20. Le théorème de Thalès permet de calculer une longueur " +
    "manquante. Calculer l'aire d'un triangle de base 6 cm et de hauteur 4 cm.",
  'administratif — règlement intérieur':
    "Les élèves entrent dans l'établissement à 7h30. Le port de l'uniforme est " +
    'obligatoire. Tout retard doit être justifié auprès du surveillant général. ' +
    "L'usage du téléphone est interdit en classe. Les sorties exigent une décharge signée.",
};

for (const [nom, texte] of Object.entries(COURS_HORS_SUJET)) {
  test(`refusé localement : ${nom}`, () => {
    const v = preVerdictLexical(texte);
    assert.ok(v, `« ${nom} » doit être tranché sans dépenser un appel IA`);
    assert.equal(v.verdict, 'hors-sujet');
  });
}

const COURS_DU_DOMAINE = {
  'entrepreneuriat — business model':
    "Le business model canvas comporte neuf blocs dont la proposition de valeur et le " +
    "segment de clientèle. L'étude de marché précède le plan d'affaires. L'entrepreneur " +
    'évalue son seuil de rentabilité et son besoin en fonds de roulement. Le financement ' +
    'mobilise fonds propres, crédit bancaire et microfinance. Les investisseurs examinent le pitch.',
  'gestion commerciale — sans le mot « entrepreneuriat »':
    // Cas limite VOLONTAIRE : aucune occurrence de la racine « entrepre », et
    // pourtant c'est pleinement le domaine du produit.
    'La facturation suit la livraison. La marge commerciale est la différence entre le ' +
    'prix de vente et le coût d’achat. La comptabilité enregistre chaque opération et la ' +
    'trésorerie se suit au jour le jour. Le fournisseur accorde parfois un délai de ' +
    'paiement. La clientèle fidèle génère un chiffre d’affaires récurrent.',
};

for (const [nom, texte] of Object.entries(COURS_DU_DOMAINE)) {
  test(`accepté localement : ${nom}`, () => {
    const v = preVerdictLexical(texte);
    assert.ok(v, `« ${nom} » doit être validé sans dépenser un appel IA`);
    assert.equal(v.verdict, 'entrepreneuriat');
  });
}

test('un cours d’économie générale n’est NI accepté NI refusé localement', () => {
  // La frontière du produit : l'économie macro n'est pas de l'entrepreneuriat,
  // mais le refuser sur du vocabulaire serait arbitraire. C'est au classifieur
  // de juger, et ce test garantit qu'il est bien convoqué.
  const texte =
    "Le produit intérieur brut mesure la valeur ajoutée produite sur un territoire. " +
    "L'inflation est la hausse générale des prix. La politique monétaire est conduite " +
    'par la banque centrale. Le chômage structurel se distingue du conjoncturel. La ' +
    'balance commerciale compare exportations et importations.';
  assert.equal(preVerdictLexical(texte), null);
});

// ═══ PRÉ-VERDICT LEXICAL ═══

test('un cours franchement entrepreneurial est validé sans appel IA', () => {
  const cours = `
    Chapitre 3 — Le financement de la création d’entreprise.
    L’entrepreneur doit d’abord établir son business plan et son modèle économique,
    puis évaluer ses besoins en fonds de roulement et sa trésorerie.
    Les sources : fonds propres, crédit bancaire, microfinance, levée de fonds
    auprès d’un investisseur, subvention publique. Le seuil de rentabilité et
    le chiffre d’affaires prévisionnel conditionnent la garantie bancaire.
    L’étude de marché précise la clientèle et la concurrence.
  `;
  const v = preVerdictLexical(cours);
  assert.ok(v, 'ce cours doit être tranché localement, sans dépenser un appel');
  assert.equal(v.verdict, 'entrepreneuriat');
  assert.equal(v.localement, true);
  assert.ok(v.notions.length > 0, 'le verdict doit nommer les notions repérées');
});

test('un cours sans la moindre notion est refusé sans appel IA', () => {
  const cours = long(
    'La tectonique des plaques explique la formation des chaînes de montagnes. ' +
      'Le manteau terrestre est composé de roches silicatées. '
  );
  const v = preVerdictLexical(cours);
  assert.ok(v);
  assert.equal(v.verdict, 'hors-sujet');
  assert.equal(v.localement, true);
  assert.deepEqual(v.notions, [], 'un document hors-sujet ne doit lister aucune notion');
});

test('un document AMBIGU n’est pas tranché localement — il monte à l’IA', () => {
  // C'est le cas le plus important du module : quelques indices isolés ne
  // suffisent NI à valider NI à refuser. Trancher ici produirait des refus
  // arbitraires sur des cours d'économie générale.
  const cours = long(
    'Le produit intérieur brut mesure la richesse créée. La concurrence entre ' +
      'les nations structure les échanges internationaux. '
  );
  assert.equal(
    preVerdictLexical(cours),
    null,
    'un texte à indices faibles doit être délégué au classifieur, pas tranché'
  );
});

test('le refus local exige ZÉRO indice, pas « peu »', () => {
  // Une seule notion suffit à interdire le refus local : la frontière est
  // stricte, et c'est voulu — le refus est la décision la plus coûteuse.
  const cours = long('Cours de littérature comparée. Le marketing du livre y est évoqué. ');
  const v = preVerdictLexical(cours);
  assert.equal(v, null, 'un seul indice doit suffire à empêcher un refus local');
});

// ═══ VOISINAGE ÉCONOMIQUE : CE QUI INTERDIT UN REFUS SANS LECTURE ═══
/*
  Le refus local exige DEUX absences : aucune notion entrepreneuriale, et aucun
  mot du voisinage économique. Cette seconde condition existe parce qu'un cours
  d'économie, de droit ou de gestion de projet peut porter un volet
  entrepreneurial réel sans employer le vocabulaire canonique. Le refuser sur
  l'absence de « business model » serait un faux positif — un enseignant bloqué.
*/

test('les disciplines hors-sujet ne touchent PAS au voisinage économique', () => {
  // Si ce test casse, c'est qu'une racine de voisinage est devenue trop large et
  // qu'elle vient de désarmer le refus local sur un document franchement
  // étranger au produit.
  for (const [nom, texte] of Object.entries(COURS_HORS_SUJET)) {
    assert.equal(
      toucheAuVoisinage(texte),
      false,
      `« ${nom} » ne doit pas être vu comme limitrophe du sujet`
    );
  }
});

test('un cours d’économie touche au voisinage et échappe au refus', () => {
  const texte =
    "L'inflation est la hausse générale des prix. La politique monétaire est conduite " +
    'par la banque centrale. Le chômage structurel se distingue du conjoncturel. La ' +
    'balance commerciale compare exportations et importations.';
  assert.ok(toucheAuVoisinage(texte), 'l’économie est limitrophe du sujet');
  assert.equal(
    preVerdictLexical(texte),
    null,
    'un cours d’économie doit être LU par le classifieur, jamais refusé d’emblée'
  );
});

test('un cours de droit du travail échappe au refus', () => {
  // Zéro notion canonique, mais « contrat », « salarié » et « emploi » font du
  // volet entrepreneurial une hypothèse sérieuse.
  const texte =
    "Le contrat à durée indéterminée est la forme normale de la relation de travail. " +
    'La période d’essai se calcule en jours calendaires. Le salarié bénéficie d’un ' +
    'congé annuel. La rupture conventionnelle suppose un accord des deux parties.';
  assert.equal(preVerdictLexical(texte), null);
});

// ═══ ÉCHANTILLONNAGE ═══

test('un texte court est transmis intégralement', () => {
  assert.equal(extraireEchantillon('abc', 100), 'abc');
});

test('l’échantillon prélève le DÉBUT, le MILIEU et la FIN', () => {
  // Une page de garde et un sommaire occupent le début d'un polycopié : prendre
  // les N premiers caractères ferait juger le document sur sa couverture.
  const texte = 'D'.repeat(300) + 'M'.repeat(300) + 'F'.repeat(300);
  const e = extraireEchantillon(texte, 90);
  assert.ok(e.includes('D'), 'le début doit être présent');
  assert.ok(e.includes('M'), 'le milieu doit être présent');
  assert.ok(e.includes('F'), 'la fin doit être présente');
  assert.ok(e.includes('[...]'), 'les coupes doivent être signalées au modèle');
});

test('l’échantillon reste borné', () => {
  const e = extraireEchantillon('x'.repeat(100000), 6000);
  assert.ok(e.length < 6100, `échantillon trop gros : ${e.length}`);
});

// ═══ LECTURE DU VERDICT DU MODÈLE ═══

test('un verdict hors-sujet explicite est respecté', () => {
  const v = lireVerdictModele({
    verdict: 'hors-sujet',
    confiance: 0.95,
    theme: 'géologie',
    motif: 'Le document traite de la structure interne de la Terre.',
    notions: [],
  });
  assert.equal(v.verdict, 'hors-sujet');
  assert.equal(v.theme, 'géologie');
  assert.equal(v.localement, false);
});

test('la variante avec tiret bas est acceptée', () => {
  // Les modèles alternent « hors-sujet » et « hors_sujet » d'un appel à l'autre.
  assert.equal(lireVerdictModele({ verdict: 'hors_sujet' }).verdict, 'hors-sujet');
});

test('un verdict inconnu NE BLOQUE PAS — il devient incertain', () => {
  for (const brut of ['peut-être', 'OUI', '', 'maybe', 'refusé']) {
    assert.equal(
      lireVerdictModele({ verdict: brut }).verdict,
      'incertain',
      `« ${brut} » ne doit pas bloquer le travail de l’enseignant`
    );
  }
});

test('une réponse vide ou non-objet devient incertain', () => {
  for (const brut of [null, undefined, 'texte', 42, []]) {
    assert.equal(lireVerdictModele(brut).verdict, 'incertain');
  }
});

test('« entrepreneuriat_partiel » vaut acceptation', () => {
  // Un document partiellement pertinent doit passer : son volet entrepreneurial
  // est exactement ce dont la génération a besoin.
  assert.equal(lireVerdictModele({ verdict: 'entrepreneuriat_partiel' }).verdict, 'entrepreneuriat');
});

test('la confiance est bornée entre 0 et 1', () => {
  assert.equal(lireVerdictModele({ verdict: 'hors-sujet', confiance: 42 }).confiance, 1);
  assert.equal(lireVerdictModele({ verdict: 'hors-sujet', confiance: -3 }).confiance, 0);
  assert.equal(lireVerdictModele({ verdict: 'hors-sujet', confiance: 'beaucoup' }).confiance, 0.5);
});

test('les notions non-textuelles sont écartées sans faire échouer la lecture', () => {
  const v = lireVerdictModele({
    verdict: 'entrepreneuriat',
    notions: ['business model', 42, null, { a: 1 }, 'financement'],
  });
  assert.deepEqual(v.notions, ['business model', 'financement']);
});

test('les notions sont plafonnées', () => {
  const v = lireVerdictModele({
    verdict: 'entrepreneuriat',
    notions: Array.from({ length: 50 }, (_, i) => `notion ${i}`),
  });
  assert.ok(v.notions.length <= 8, `trop de notions remontées : ${v.notions.length}`);
});

test('un motif absent est remplacé par un texte affichable', () => {
  const v = lireVerdictModele({ verdict: 'incertain' });
  assert.ok(v.motif.length > 0, 'le motif ne doit jamais être vide : il est affiché tel quel');
  assert.ok(v.theme.length > 0);
});

// ═══ MESSAGE DE REFUS ═══

test('le refus nomme le thème détecté', () => {
  const m = messageRefus({
    verdict: 'hors-sujet',
    confiance: 0.9,
    theme: 'géologie',
    motif: '',
    notions: [],
    localement: false,
  });
  assert.ok(m.includes('géologie'), `le thème doit apparaître : ${m}`);
});

test('le refus dit ce qui est attendu ET donne une alternative', () => {
  const m = messageRefus({
    verdict: 'hors-sujet',
    confiance: 0.9,
    theme: 'inconnu',
    motif: '',
    notions: [],
    localement: true,
  });
  // Un refus qui ne dit pas quoi faire ensuite produit un ticket de support.
  assert.ok(/financement/i.test(m), 'le message doit rappeler les notions attendues');
  assert.ok(/édition/i.test(m), 'le message doit offrir la voie sans document');
  assert.ok(!m.includes('inconnu'), 'un thème « inconnu » ne doit pas être affiché tel quel');
});

// ═══ ROBUSTESSE DE L'ANALYSE COMPLÈTE ═══
/*
  `analyserDocument` est la seule fonction du module qui sort sur le réseau.
  Ces tests remplacent `fetch` pour vérifier LA PROPRIÉTÉ LA PLUS IMPORTANTE du
  module : une panne du classifieur ne doit jamais bloquer un enseignant. Le
  contrôle thématique est une garde de QUALITÉ, pas un contrôle d'accès.
*/

const { analyserDocument } = await import('../src/lib/analyse-thematique.ts');

/** Remplace `fetch` le temps d'un appel, et le restaure quoi qu'il arrive. */
async function avecFetch(faux, fn) {
  const vrai = globalThis.fetch;
  globalThis.fetch = faux;
  try {
    return await fn();
  } finally {
    globalThis.fetch = vrai;
  }
}

/** Texte ambigu : force le passage à l'étage IA (le lexical ne tranche pas). */
const AMBIGU = long(
  'Le produit intérieur brut mesure la richesse créée. La concurrence entre les ' +
    'nations structure les échanges internationaux. '
);

test('un document trop court est incertain, sans appel réseau', async () => {
  const v = await avecFetch(
    () => {
      throw new Error('aucun appel ne devrait partir');
    },
    () => analyserDocument('Trois mots.')
  );
  assert.equal(v.verdict, 'incertain');
  assert.equal(v.localement, true);
  assert.ok(/court/i.test(v.motif), `le motif doit dire pourquoi : ${v.motif}`);
});

test('une panne réseau laisse passer au lieu de bloquer', async () => {
  const v = await avecFetch(
    () => Promise.reject(new Error('ECONNREFUSED')),
    () => analyserDocument(AMBIGU)
  );
  assert.equal(v.verdict, 'incertain', 'une panne ne doit JAMAIS produire un refus');
});

test('une erreur HTTP du classifieur laisse passer', async () => {
  const v = await avecFetch(
    () => Promise.resolve({ ok: false, json: async () => ({ error: 'quota dépassé' }) }),
    () => analyserDocument(AMBIGU)
  );
  assert.equal(v.verdict, 'incertain');
  assert.ok(/indisponible/i.test(v.motif), `le motif doit être explicite : ${v.motif}`);
});

test('une réponse illisible laisse passer', async () => {
  const v = await avecFetch(
    () => Promise.resolve({ ok: true, json: async () => { throw new Error('JSON invalide'); } }),
    () => analyserDocument(AMBIGU)
  );
  assert.equal(v.verdict, 'incertain');
});

test('un verdict hors-sujet du classifieur est bien transmis', async () => {
  const v = await avecFetch(
    () =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          data: { verdict: 'hors-sujet', confiance: 0.92, theme: 'géologie', motif: 'Roches.', notions: [] },
        }),
      }),
    () => analyserDocument(AMBIGU)
  );
  assert.equal(v.verdict, 'hors-sujet');
  assert.equal(v.theme, 'géologie');
});

test('un cours franchement entrepreneurial n’appelle PAS le classifieur', async () => {
  // Vérifie l'économie d'appel : c'est le cas nominal du produit, il doit être
  // gratuit. Un `fetch` qui lève ferait échouer le test s'il était atteint.
  const cours = `
    Le business plan de l’entrepreneur précise le modèle économique, l’étude de
    marché, la clientèle visée, la concurrence, le chiffre d’affaires et le seuil
    de rentabilité. Le financement combine fonds propres, crédit bancaire et
    microfinance. La trésorerie et le fonds de roulement sont suivis mensuellement.
  `;
  const v = await avecFetch(
    () => {
      throw new Error('le classifieur ne devait pas être appelé');
    },
    () => analyserDocument(cours)
  );
  assert.equal(v.verdict, 'entrepreneuriat');
  assert.equal(v.localement, true);
});

// ═══ LE PARCOURS SANS DOCUMENT NE DOIT PAS ÊTRE BLOQUÉ ═══
/*
  Toutes les générations ne partent PAS d'un cours déposé. L'écran « séances
  prêtes » génère depuis les seules consignes de l'enseignant, et le prompt de
  contenu de séance a un repli documenté (« aucun cours fourni : produis un
  contenu généraliste d'initiation à l'entrepreneuriat »).

  Un contrôle thématique appliqué sans discernement casserait ce parcours : un
  texte vide ne contient aucune notion, il serait donc refusé. La garde de
  genererContenuSeance() est pour cette raison conditionnée à la présence d'un
  texte source — et c'est ce que ce test protège d'une refonte distraite.
*/

test('un texte source VIDE n’est jamais interprété comme hors-sujet', () => {
  for (const vide of ['', '   ', '\n\n']) {
    const v = preVerdictLexical(vide);
    if (v) {
      assert.notEqual(
        v.verdict,
        'hors-sujet',
        'un texte vide signifie « pas de cours déposé », pas « cours hors sujet »'
      );
    }
  }
});
