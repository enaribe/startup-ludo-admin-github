/**
 * Seed Ideation Cards to Firestore
 *
 * Creates 3 IdeationDecks: targets (36 cards), missions (40 cards), sectors (17 cards)
 * Uses the /api/seed endpoint.
 *
 * Usage: node scripts/seed-ideation.mjs
 *
 * Make sure the admin Next.js server is running on localhost:3000 first.
 */

// ===== Helpers =====

function rarityFromXP(xp) {
  if (xp >= 2.0) return 'legendary';
  if (xp >= 1.6) return 'rare';
  return 'common';
}

function targetCategory(id) {
  const geographic = [
    'citadins-connectes', 'population-rurale', 'peripheries-urbaines',
    'populations-mobiles', 'communautes-religieuses', 'zones-cotieres',
    'zones-minieres', 'corridors-commerciaux', 'populations-insulaires',
    'nomades-transfrontaliers',
  ];
  const activity = [
    'commercants-vendeurs', 'conducteurs-transporteurs', 'artisans-ouvriers',
    'services-proximite', 'secteur-educatif', 'fonctionnaires',
    'industriels-locaux', 'professionnels-sante', 'secteur-petro-minier',
    'ong-cooperation',
  ];
  const socioeconomic = [
    'populations-revenus-faibles', 'classe-populaire-active',
    'petite-classe-moyenne', 'classe-moyenne-superieure',
    'classe-aisee', 'elite-politique-economique',
  ];
  if (geographic.includes(id)) return 'geographic';
  if (activity.includes(id)) return 'activity';
  if (socioeconomic.includes(id)) return 'socioeconomic';
  return 'demographic';
}

function missionCategory(id) {
  const efficiency = [
    'optimiser-temps', 'economiser-argent', 'simplifier-demarches',
    'ameliorer-acces', 'automatiser-taches', 'optimiser-performances',
    'predire-anticiper', 'equilibrer-vie-pro-perso', 'revolutionner-secteur',
    'creer-nouveaux-marches',
  ];
  const social = [
    'renforcer-liens-sociaux', 'ameliorer-education', 'ameliorer-sante',
    'ameliorer-logement', 'garantir-securite-alimentaire', 'promouvoir-justice',
    'preserver-environnement', 'promouvoir-culture', 'construire-paix',
    'impacter-humanite',
  ];
  const innovation = [
    'digitaliser-services', 'connecter-personnes', 'stimuler-economie-locale',
    'renforcer-securite', 'liberer-creativite', 'developper-intelligence',
    'construire-infrastructure', 'professionnaliser-metiers',
    'inspirer-generations', 'repousser-limites',
  ];
  if (efficiency.includes(id)) return 'efficiency';
  if (social.includes(id)) return 'social';
  if (innovation.includes(id)) return 'innovation';
  return 'african';
}

// ===== CIBLES (36) =====
const RAW_TARGETS = [
  { id: 'jeunes-professionnels', name: 'Jeunes Professionnels', xp: 1.2 },
  { id: 'etudiantes-jeunes-diplomes', name: 'Etudiantes & Jeunes Diplomes', xp: 1.1 },
  { id: 'familles-urbaines', name: 'Familles Urbaines', xp: 1.3 },
  { id: 'seniors-actifs', name: 'Seniors Actifs', xp: 1.2 },
  { id: 'enfants-adolescents', name: 'Enfants & Adolescents', xp: 1.1 },
  { id: 'elite-dirigeants', name: 'Elite & Dirigeants', xp: 1.6 },
  { id: 'entrepreneurs-confirmes', name: 'Entrepreneurs Confirmes', xp: 1.7 },
  { id: 'intellectuels-chercheurs', name: 'Intellectuels & Chercheurs', xp: 1.8 },
  { id: 'diaspora-africaine', name: 'Diaspora Africaine', xp: 2.5 },
  { id: 'ultra-riches', name: 'Ultra-riches', xp: 2.7 },
  { id: 'citadins-connectes', name: 'Citadins Connectes', xp: 1.1 },
  { id: 'population-rurale', name: 'Population Rurale', xp: 1.3 },
  { id: 'peripheries-urbaines', name: 'Peripheries Urbaines', xp: 1.2 },
  { id: 'populations-mobiles', name: 'Populations Mobiles', xp: 1.3 },
  { id: 'communautes-religieuses', name: 'Communautes Religieuses', xp: 1.2 },
  { id: 'zones-cotieres', name: 'Zones Cotieres', xp: 1.7 },
  { id: 'zones-minieres', name: 'Zones Minieres', xp: 1.9 },
  { id: 'corridors-commerciaux', name: 'Corridors Commerciaux', xp: 1.8 },
  { id: 'populations-insulaires', name: 'Populations Insulaires', xp: 2.6 },
  { id: 'nomades-transfrontaliers', name: 'Nomades Transfrontaliers', xp: 2.4 },
  { id: 'commercants-vendeurs', name: 'Commercants & Vendeurs', xp: 1.1 },
  { id: 'conducteurs-transporteurs', name: 'Conducteurs & Transporteurs', xp: 1.2 },
  { id: 'artisans-ouvriers', name: 'Artisans & Ouvriers', xp: 1.3 },
  { id: 'services-proximite', name: 'Services de Proximite', xp: 1.2 },
  { id: 'secteur-educatif', name: 'Secteur Educatif', xp: 1.3 },
  { id: 'fonctionnaires', name: 'Fonctionnaires', xp: 1.6 },
  { id: 'industriels-locaux', name: 'Industriels Locaux', xp: 1.8 },
  { id: 'professionnels-sante', name: 'Professionnels de Sante', xp: 1.9 },
  { id: 'secteur-petro-minier', name: 'Secteur Petro-minier', xp: 2.8 },
  { id: 'ong-cooperation', name: 'ONG & Cooperation', xp: 2.5 },
  { id: 'populations-revenus-faibles', name: 'Populations a Revenus Faibles', xp: 1.4 },
  { id: 'classe-populaire-active', name: 'Classe Populaire Active', xp: 1.3 },
  { id: 'petite-classe-moyenne', name: 'Petite Classe Moyenne', xp: 1.2 },
  { id: 'classe-moyenne-superieure', name: 'Classe Moyenne Superieure', xp: 1.6 },
  { id: 'classe-aisee', name: 'Classe Aisee', xp: 1.7 },
  { id: 'elite-politique-economique', name: 'Elite Politique & Economique', xp: 2.6 },
];

// ===== MISSIONS (40) =====
const RAW_MISSIONS = [
  { id: 'optimiser-temps', name: 'Optimiser le Temps', xp: 1.2 },
  { id: 'economiser-argent', name: "Economiser l'Argent", xp: 1.1 },
  { id: 'simplifier-demarches', name: 'Simplifier les Demarches', xp: 1.3 },
  { id: 'ameliorer-acces', name: "Ameliorer l'Acces", xp: 1.2 },
  { id: 'automatiser-taches', name: 'Automatiser les Taches', xp: 1.3 },
  { id: 'optimiser-performances', name: 'Optimiser les Performances', xp: 1.7 },
  { id: 'predire-anticiper', name: 'Predire & Anticiper', xp: 1.8 },
  { id: 'equilibrer-vie-pro-perso', name: 'Equilibrer Vie Pro/Perso', xp: 1.6 },
  { id: 'revolutionner-secteur', name: 'Revolutionner un Secteur', xp: 2.7 },
  { id: 'creer-nouveaux-marches', name: 'Creer de Nouveaux Marches', xp: 2.5 },
  { id: 'renforcer-liens-sociaux', name: 'Renforcer les Liens Sociaux', xp: 1.2 },
  { id: 'ameliorer-education', name: "Ameliorer l'Education", xp: 1.3 },
  { id: 'ameliorer-sante', name: 'Ameliorer la Sante', xp: 1.4 },
  { id: 'ameliorer-logement', name: 'Ameliorer le Logement', xp: 1.3 },
  { id: 'garantir-securite-alimentaire', name: 'Garantir la Securite Alimentaire', xp: 1.2 },
  { id: 'promouvoir-justice', name: 'Promouvoir la Justice', xp: 1.7 },
  { id: 'preserver-environnement', name: "Preserver l'Environnement", xp: 1.8 },
  { id: 'promouvoir-culture', name: 'Promouvoir la Culture', xp: 1.6 },
  { id: 'construire-paix', name: 'Construire la Paix', xp: 2.8 },
  { id: 'impacter-humanite', name: "Impacter l'Humanite", xp: 2.6 },
  { id: 'digitaliser-services', name: 'Digitaliser les Services', xp: 1.3 },
  { id: 'connecter-personnes', name: 'Connecter les Personnes', xp: 1.2 },
  { id: 'stimuler-economie-locale', name: "Stimuler l'Economie Locale", xp: 1.3 },
  { id: 'renforcer-securite', name: 'Renforcer la Securite', xp: 1.4 },
  { id: 'liberer-creativite', name: 'Liberer la Creativite', xp: 1.2 },
  { id: 'developper-intelligence', name: "Developper l'Intelligence", xp: 1.8 },
  { id: 'construire-infrastructure', name: "Construire l'Infrastructure", xp: 1.9 },
  { id: 'professionnaliser-metiers', name: 'Professionnaliser les Metiers', xp: 1.7 },
  { id: 'inspirer-generations', name: 'Inspirer les Generations', xp: 2.7 },
  { id: 'repousser-limites', name: 'Repousser les Limites', xp: 2.9 },
  { id: 's-adapter-climat', name: "S'adapter au Climat", xp: 1.4 },
  { id: 'contourner-infrastructures', name: 'Contourner les Infrastructures', xp: 1.3 },
  { id: 'gerer-precarite', name: 'Gerer la Precarite', xp: 1.2 },
  { id: 'naviguer-bureaucratie', name: 'Naviguer la Bureaucratie', xp: 1.3 },
  { id: 'pallier-coupures', name: 'Pallier aux Coupures', xp: 1.2 },
  { id: 'moderniser-agriculture', name: "Moderniser l'Agriculture", xp: 1.8 },
  { id: 'ameliorer-soins-sante', name: 'Ameliorer les Soins de Sante', xp: 1.7 },
  { id: 'democratiser-education', name: "Democratiser l'Education", xp: 1.6 },
  { id: 'integrer-afrique', name: "Integrer l'Afrique", xp: 2.8 },
  { id: 'valoriser-ressources', name: 'Valoriser les Ressources', xp: 2.6 },
];

// ===== SECTEURS (17) =====
const RAW_SECTORS = [
  { id: 'fintech', name: 'Fintech', xp: 2.2 },
  { id: 'mobilite', name: 'Mobilite', xp: 2.0 },
  { id: 'proptech', name: 'Proptech', xp: 1.9 },
  { id: 'e-commerce', name: 'E-commerce', xp: 1.8 },
  { id: 'gaming', name: 'Gaming', xp: 1.7 },
  { id: 'greentech', name: 'Greentech', xp: 1.6 },
  { id: 'foodtech', name: 'Foodtech', xp: 1.5 },
  { id: 'entertainment-media', name: 'Entertainment & Media', xp: 1.9 },
  { id: 'agritech', name: 'AgriTech', xp: 2.6 },
  { id: 'cybersecurite', name: 'Cybersecurite', xp: 2.4 },
  { id: 'energie-renouvelable', name: 'Energie renouvelable', xp: 2.6 },
  { id: 'sport-fitness', name: 'Sport & Fitness', xp: 1.4 },
  { id: 'tourisme', name: 'Tourisme', xp: 1.3 },
  { id: 'mobile-telecommunications', name: 'Mobile & Telecommunications', xp: 2.9 },
  { id: 'logistique-supply-chain', name: 'Logistique & Supply Chain', xp: 2.7 },
  { id: 'edtech', name: 'EdTech', xp: 2.3 },
  { id: 'cleantech-environnement', name: 'CleanTech & Environnement', xp: 1.8 },
];

// ===== Build IdeationDecks =====

const targetCards = RAW_TARGETS.map((t) => ({
  id: t.id,
  type: 'target',
  text: t.name,
  category: targetCategory(t.id),
  xpMultiplier: t.xp,
  rarity: rarityFromXP(t.xp),
}));

const missionCards = RAW_MISSIONS.map((m) => ({
  id: m.id,
  type: 'mission',
  text: m.name,
  category: missionCategory(m.id),
  xpMultiplier: m.xp,
  rarity: rarityFromXP(m.xp),
}));

const sectorCards = RAW_SECTORS.map((s) => ({
  id: s.id,
  type: 'sector',
  text: s.name,
  xpMultiplier: s.xp,
  rarity: rarityFromXP(s.xp),
}));

// Single deck with all cards (admin page uses decks[0])
const allCards = [...targetCards, ...missionCards, ...sectorCards];

const ideationDecks = [
  { id: 'default', name: 'Deck Principal', cards: allCards },
];

// ===== Seed =====

async function seedIdeation() {
  const BASE_URL = process.env.SEED_URL || 'http://localhost:3000';

  console.log(`Seeding 1 ideation deck (${allCards.length} cards) to ${BASE_URL}/api/seed ...`);
  console.log(`  - targets: ${targetCards.length} cards`);
  console.log(`  - missions: ${missionCards.length} cards`);
  console.log(`  - sectors: ${sectorCards.length} cards`);
  console.log(`  - total: ${allCards.length} cards in 'default' deck`);

  // First, clean up old separate decks (targets, missions, sectors) if they exist
  console.log('Cleaning up old separate decks...');
  for (const oldId of ['targets', 'missions', 'sectors']) {
    try {
      const delRes = await fetch(`${BASE_URL}/api/seed?deleteIdeation=${oldId}`, { method: 'DELETE' });
      if (delRes.ok) console.log(`  Deleted old deck: ${oldId}`);
    } catch {
      // Ignore - old deck may not exist
    }
  }

  const response = await fetch(`${BASE_URL}/api/seed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ideationDecks }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Seed failed (${response.status}):`, text);
    process.exit(1);
  }

  const result = await response.json();
  console.log('Seed result:', JSON.stringify(result, null, 2));
}

seedIdeation().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
