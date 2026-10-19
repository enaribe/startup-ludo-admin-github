/**
 * Joueurs fictifs pour peupler le classement d'un défi.
 *
 * ═══ À QUOI ÇA SERT ═══
 *
 * Un défi qui ouvre avec trois participants n'a pas de podium, pas de
 * « autour de toi », et un rang #2 sur 3 qui ne veut rien dire. Les premiers
 * joueurs voient un écran vide et en concluent que personne ne joue — ce qui
 * devient vrai. Ces faux joueurs servent à amorcer, le temps que de vrais
 * arrivent.
 *
 * ═══ CE QUE C'EST, ET CE QUE CE N'EST PAS ═══
 *
 * Ce sont de VRAIS documents `defiScores`, écrits en base : ils apparaissent
 * dans le classement de tout le monde, comptent dans le total de joueurs et
 * peuvent occuper le podium. Ce ne sont PAS des comptes : aucun utilisateur
 * Firebase n'est créé, aucun ne peut se connecter, aucune idée n'est écrite.
 *
 * Conséquence à connaître : un joueur fictif qui finit dans les trois
 * premiers d'un défi clos bloquerait un lot. À retirer avant la clôture —
 * c'est pour ça que le back-office propose aussi la suppression.
 *
 * ═══ POURQUOI UN PRÉFIXE D'IDENTIFIANT ═══
 *
 * Tous portent `fictif_`. C'est ce qui permet de les retrouver pour les
 * supprimer, sans toucher à un seul vrai score. Un faux joueur qu'on ne sait
 * plus distinguer d'un vrai est un faux joueur définitif.
 */

/** Préfixe de l'identifiant. NE PAS CHANGER : la suppression s'en sert. */
export const PREFIXE_FICTIF = 'fictif_';

/** Un joueur fictif est-il désigné par cet identifiant ? */
export function estJoueurFictif(userId: string): boolean {
  return userId.startsWith(PREFIXE_FICTIF);
}

/**
 * Prénoms et formes de pseudo courantes au Sénégal.
 *
 * Écrits à la main plutôt que tirés de syllabes : un générateur produit des
 * noms qui sonnent faux, et c'est précisément ce qu'on cherche à éviter.
 */
const PRENOMS = [
  'Aminata', 'Ibou', 'Mame Bineta', 'Moussa', 'Fatou', 'Abdoulaye', 'Khadija',
  'Cheikh', 'Ndeye', 'Modou', 'Astou', 'Ousmane', 'Sokhna', 'Babacar', 'Maimouna',
  'Lamine', 'Rokhaya', 'Serigne', 'Adama', 'Papis', 'Dieynaba', 'Alioune',
  'Coumba', 'Mamadou', 'Awa', 'Pape', 'Yacine', 'Saliou', 'Bineta', 'Idrissa',
  'Marieme', 'Seydou', 'Oumou', 'Malick', 'Anta', 'Souleymane', 'Nafissatou',
  'Elhadji', 'Daba', 'Assane', 'Fatima', 'Omar', 'Seynabou', 'Mouhamed', 'Thioro',
];

const NOMS = [
  'Diop', 'Ndiaye', 'Fall', 'Sow', 'Ba', 'Gueye', 'Sarr', 'Mbengue', 'Faye',
  'Diallo', 'Cisse', 'Thiam', 'Sy', 'Toure', 'Seck', 'Camara', 'Niang', 'Diouf',
  'Sene', 'Kane', 'Dieng', 'Samb', 'Wade', 'Lo', 'Badiane',
];

/**
 * Noms d'idées, affichés sous le pseudo au classement.
 *
 * Volontairement variés en thème : un classement où tout le monde a une idée
 * sur l'eau se lirait comme une liste générée, ce qu'elle est.
 */
const IDEES = [
  'Prépa Pluie', 'Kit Puits Propre', 'Alerte Crue', 'Toit Sec', 'Eau Claire',
  'Vide-Cave', 'Digue Quartier', 'Pompe Solidaire', 'Abri Mobile', 'Sacs Anti-Eau',
  'Réseau Voisins', 'Carto Inondation', 'Filtre Maison', 'Chantier Drain',
  'Veille Météo', 'Relais Santé', 'Transport Sûr', 'École au Sec', 'Stock Urgence',
  'Toilettes Sèches', 'Pirogue Taxi', 'Mur de Sable', 'Capteur Niveau',
  'Brigade Canal', 'Récup Pluie',
];

/** Un joueur fictif prêt à écrire. */
export interface JoueurFictif {
  userId: string;
  displayName: string;
  xp: number;
  parties: number;
  ideeNom: string;
  briquesPosees: number;
}

/**
 * Générateur pseudo-aléatoire À GRAINE.
 *
 * ═══ POURQUOI PAS `Math.random()` ═══
 *
 * Deux générations avec la même graine donnent les mêmes joueurs. Sans ça,
 * relancer l'opération après une suppression partielle créerait une seconde
 * population différente, et le classement mélangerait deux vagues de faux
 * joueurs sans qu'on puisse les distinguer.
 *
 * (Mulberry32 — court, suffisant pour des noms et des scores.)
 */
function alea(graine: number): () => number {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fabrique `nombre` joueurs fictifs, aux scores répartis de façon crédible.
 *
 * ═══ LA RÉPARTITION DES SCORES N'EST PAS LINÉAIRE ═══
 *
 * Un classement réel a quelques gros scores, beaucoup de moyens, et une
 * longue traîne de petits — des joueurs qui ont fait une partie et ne sont
 * pas revenus. Des scores régulièrement décroissants se repèrent au premier
 * coup d'œil, et rendent le rang d'un vrai joueur absurde : il grimperait de
 * dix places en une partie.
 *
 * D'où la puissance 2.2 appliquée à un tirage uniforme : elle écrase vers le
 * bas, ce qui donne exactement cette forme.
 *
 * `maxXp` borne le haut du classement. Le passer au-dessus des scores réels
 * donnerait un podium entièrement fictif, ce qui est rarement ce qu'on veut.
 */
export function genererJoueursFictifs(
  nombre: number,
  options: { maxXp?: number; graine?: number } = {}
): JoueurFictif[] {
  const maxXp = options.maxXp ?? 600;
  const r = alea(options.graine ?? 42);
  const joueurs: JoueurFictif[] = [];
  const prisName = new Set<string>();

  for (let i = 0; i < nombre; i += 1) {
    /*
      Le pseudo doit être UNIQUE : deux « Aminata Diop » au classement se
      lisent comme un bug d'affichage. Quelques tentatives, puis un suffixe
      numérique — mieux vaut « Aminata D. 2 » qu'un doublon.
    */
    let nom = '';
    for (let essai = 0; essai < 12 && !nom; essai += 1) {
      const candidat = `${PRENOMS[Math.floor(r() * PRENOMS.length)]} ${
        NOMS[Math.floor(r() * NOMS.length)]![0]
      }.`;
      if (!prisName.has(candidat)) nom = candidat;
    }
    if (!nom) nom = `${PRENOMS[i % PRENOMS.length]} ${i}`;
    prisName.add(nom);

    // Puissance 2.2 : beaucoup de petits scores, peu de gros. Voir plus haut.
    const xp = Math.max(20, Math.round(maxXp * Math.pow(r(), 2.2)));

    /*
      Parties et briques DÉDUITES du score, pas tirées à part : un joueur à
      560 points qui n'aurait joué qu'une partie serait incohérent avec le
      barème affiché aux joueurs (20 par partie, 60 par brique).
    */
    const briques = Math.min(5, Math.floor(xp / 110));
    const parties = Math.max(1, Math.round((xp - briques * 60) / 25));

    joueurs.push({
      userId: `${PREFIXE_FICTIF}${i + 1}`,
      displayName: nom,
      xp,
      parties,
      ideeNom: IDEES[Math.floor(r() * IDEES.length)]!,
      briquesPosees: briques,
    });
  }

  return joueurs;
}
