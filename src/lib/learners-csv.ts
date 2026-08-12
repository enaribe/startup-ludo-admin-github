/**
 * Import CSV d'une liste d'élèves — parsing maison, **aucune dépendance**.
 *
 * Format attendu : `prénom;nom;identifiant?`
 *   - séparateur `;` (usage FR, Excel) ou `,` — détecté ligne par ligne ;
 *   - en-tête optionnel, reconnu automatiquement ;
 *   - encodage UTF-8 ou Latin-1 (voir `lireFichierTexte`).
 *
 * Le parseur ne jette jamais : chaque ligne écartée est rendue avec son motif,
 * de sorte que l'utilisateur voie exactement ce qui a été ignoré et pourquoi
 * avant de valider. Sur le style d'export CSV du projet (`leads/page.tsx`).
 */

/** Une ligne exploitable du fichier. */
export interface LigneEleveCsv {
  /** Numéro de la ligne dans le fichier (1-indexé), pour le rapport. */
  numeroLigne: number;
  /** Prénom nettoyé. */
  firstName: string;
  /** Nom nettoyé. */
  lastName: string;
  /** Identifiant externe, chaîne vide si absent. */
  externalId: string;
  /** Doublon d'une autre ligne du MÊME fichier. */
  doublonFichier: boolean;
  /** Doublon d'un élève déjà présent dans la classe. */
  doublonClasse: boolean;
}

/** Une ligne écartée, avec son motif affichable tel quel. */
export interface LigneIgnoreeCsv {
  /** Numéro de la ligne dans le fichier (1-indexé). */
  numeroLigne: number;
  /** Contenu brut de la ligne, tronqué à l'affichage. */
  contenu: string;
  /** Motif du rejet, rédigé pour l'utilisateur final. */
  motif: string;
}

/** Résultat complet d'une analyse de fichier. */
export interface ResultatAnalyseCsv {
  /** Lignes retenues, doublons inclus (marqués, décochables à l'écran). */
  lignes: LigneEleveCsv[];
  /** Lignes écartées avec leur motif. */
  ignorees: LigneIgnoreeCsv[];
}

/** Élève déjà présent dans la classe, pour la détection de doublons. */
export interface EleveExistant {
  firstName: string;
  lastName: string;
}

/**
 * Clé de comparaison d'un élève : prénom + nom, insensible à la casse, aux
 * accents et aux espaces multiples. « Fatou  DIOP » et « fatou diop » sont donc
 * bien reconnus comme un seul et même élève.
 */
export function cleEleve(firstName: string, lastName: string): string {
  const normaliser = (v: string) =>
    v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  return `${normaliser(firstName)}|${normaliser(lastName)}`;
}

/**
 * Lit un fichier en texte, en tolérant l'UTF-8 ET le Latin-1.
 *
 * Pourquoi ce détour plutôt que `file.text()` : un CSV exporté depuis un Excel
 * francophone est très souvent en Latin-1 (windows-1252). Décodé en UTF-8, il
 * produit des « Ã© » à la place des « é » — la liste d'élèves d'un établissement
 * client serait illisible. On décode donc d'abord en UTF-8 strict ; si le
 * décodage échoue (octet invalide), on retombe sur Latin-1, qui accepte tout
 * octet et ne peut donc pas échouer à son tour.
 */
export async function lireFichierTexte(fichier: File): Promise<string> {
  const buffer = await fichier.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('iso-8859-1').decode(buffer);
  }
}

/** Retire les guillemets encadrants d'un champ CSV et déséchappe les `""`. */
function nettoyerChamp(valeur: string): string {
  const trim = valeur.trim();
  if (trim.length >= 2 && trim.startsWith('"') && trim.endsWith('"')) {
    return trim.slice(1, -1).replace(/""/g, '"').trim();
  }
  return trim;
}

/**
 * Découpe une ligne CSV en champs, en respectant les guillemets.
 * Le séparateur est choisi par ligne : celui des deux (`;` ou `,`) qui apparaît
 * le plus souvent hors guillemets. Un nom composé « Ndiaye, Fatou » entre
 * guillemets ne casse donc pas la ligne.
 */
function decouperLigne(ligne: string): string[] {
  const compter = (sep: string) => {
    let n = 0;
    let dansGuillemets = false;
    for (const c of ligne) {
      if (c === '"') dansGuillemets = !dansGuillemets;
      else if (c === sep && !dansGuillemets) n++;
    }
    return n;
  };
  const separateur = compter(';') >= compter(',') ? ';' : ',';

  const champs: string[] = [];
  let courant = '';
  let dansGuillemets = false;
  for (const c of ligne) {
    if (c === '"') {
      dansGuillemets = !dansGuillemets;
      courant += c;
    } else if (c === separateur && !dansGuillemets) {
      champs.push(courant);
      courant = '';
    } else {
      courant += c;
    }
  }
  champs.push(courant);
  return champs.map(nettoyerChamp);
}

/**
 * Une ligne est-elle un en-tête ? On teste les deux premiers champs contre le
 * vocabulaire attendu (« prénom », « nom », « firstname »…). Un élève réellement
 * prénommé « Nom » resterait un cas pathologique, et il apparaîtrait dans le
 * rapport de prévisualisation avant validation.
 */
function estEnTete(champs: string[]): boolean {
  const mots = ['prenom', 'prénom', 'firstname', 'first name', 'nom', 'lastname', 'last name', 'name'];
  const normaliser = (v: string) =>
    v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const [a = '', b = ''] = champs;
  return mots.includes(normaliser(a)) && mots.includes(normaliser(b));
}

/**
 * Analyse le contenu d'un CSV et produit la prévisualisation.
 *
 * @param contenu Texte du fichier, déjà décodé (cf. `lireFichierTexte`).
 * @param existants Élèves déjà présents dans la classe (actifs ET retirés :
 *   réimporter le nom d'un élève retiré doit être signalé, sinon on créerait un
 *   doublon silencieux au lieu de le réintégrer).
 */
export function analyserCsvEleves(contenu: string, existants: EleveExistant[]): ResultatAnalyseCsv {
  const lignes: LigneEleveCsv[] = [];
  const ignorees: LigneIgnoreeCsv[] = [];

  const clesExistantes = new Set(existants.map((e) => cleEleve(e.firstName, e.lastName)));
  const clesVues = new Set<string>();

  // \r\n (Windows), \n (Unix) et \r (vieux Mac) — un CSV peut venir de partout.
  const brutes = contenu.replace(/^\ufeff/, '').split(/\r\n|\n|\r/);

  brutes.forEach((brute, index) => {
    const numeroLigne = index + 1;
    if (!brute.trim()) return; // ligne vide : ignorée en silence, ce n'est pas une erreur

    const champs = decouperLigne(brute);

    // En-tête : uniquement sur la première ligne non vide rencontrée.
    if (lignes.length === 0 && ignorees.length === 0 && estEnTete(champs)) return;

    const firstName = champs[0] ?? '';
    const lastName = champs[1] ?? '';
    const externalId = champs[2] ?? '';

    if (!firstName && !lastName) {
      ignorees.push({ numeroLigne, contenu: brute, motif: 'Prénom et nom manquants' });
      return;
    }
    if (!firstName) {
      ignorees.push({ numeroLigne, contenu: brute, motif: 'Prénom manquant' });
      return;
    }
    if (!lastName) {
      ignorees.push({ numeroLigne, contenu: brute, motif: 'Nom manquant' });
      return;
    }

    const cle = cleEleve(firstName, lastName);
    const doublonFichier = clesVues.has(cle);
    const doublonClasse = clesExistantes.has(cle);
    clesVues.add(cle);

    lignes.push({ numeroLigne, firstName, lastName, externalId, doublonFichier, doublonClasse });
  });

  return { lignes, ignorees };
}
