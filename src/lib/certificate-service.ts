/**
 * Service Mode Classe — CERTIFICATS PDF NOMINATIFS (lot 7).
 *
 * ═══ CE QUE CE DOCUMENT EST ═══
 *
 * Un certificat est remis à un élève et montré à sa famille. Il porte le nom de
 * CONCREE et celui de l'établissement. Deux conséquences qui priment sur toute
 * considération esthétique :
 *
 *   1. AUCUN CHIFFRE INDÉFENDABLE. Seules les notions ayant atteint le seuil de
 *      3 questions sur l'ANNÉE y figurent, avec leur taux et leur effectif de
 *      questions. Une notion vue une fois n'apparaît pas — pas même à 100 %.
 *   2. AUCUN NIVEAU N1–N4. La règle pédagogique qui associerait un niveau à un
 *      taux cumulé n'est pas tranchée ; inventer un barème sur un document remis
 *      à une famille serait pire que de ne rien afficher.
 *
 * ═══ POURQUOI `pdf-lib` ═══
 *
 * Génération CÔTÉ CLIENT, dans le navigateur de l'enseignant. Aucune route
 * serveur, aucun binaire, aucun quota. L'alternative (Puppeteer / Chromium
 * headless) pèse ~300 Mo et dépasse la limite de taille des fonctions Vercel —
 * pour produire une page de texte.
 *
 * ⚠️ POLICES ET ACCENTS. On utilise exclusivement les polices standard intégrées
 * (Helvetica), encodées en `WinAnsiEncoding` — qui couvre l'intégralité des
 * caractères accentués du français. Aucun fichier de police à télécharger, donc
 * aucune dépendance réseau au moment où le prof clique. En revanche
 * `WinAnsiEncoding` ne connaît PAS les guillemets typographiques ni les tirets
 * cadratins : `assainir()` les remplace avant écriture, faute de quoi pdf-lib
 * lève et le certificat n'est pas produit du tout.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import {
  SEUIL_QUESTIONS_NOTION,
  agregerCompteurs,
  cumulDepuisLearner,
  type NotionAgregee,
} from './class-report-service';
import type { Learner } from '@/types';

// ═══════════════════════════════════════════════════════════════════════════
// 1. ÉLIGIBILITÉ
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Résultat de l'examen d'éligibilité d'un élève.
 *
 * Un élève NON éligible est toujours restitué avec sa raison, jamais écarté en
 * silence : un prof qui génère 28 certificats pour 30 élèves doit savoir
 * lesquels manquent et pourquoi, sinon il découvrira le trou en distribuant.
 */
export interface EligibiliteCertificat {
  /** Élève examiné. */
  eleve: Learner;
  /** True si un certificat peut être émis. */
  eligible: boolean;
  /** Notions au-dessus du seuil, triées par taux croissant. */
  notions: NotionAgregee[];
  /** Nombre total de réponses cumulées sur l'année. */
  totalReponses: number;
  /** Motif du refus, en français, affichable tel quel. `null` si éligible. */
  raison: string | null;
}

/**
 * CRITÈRE D'ÉLIGIBILITÉ : au moins UNE notion au-dessus du seuil de
 * 3 questions, cumulées sur l'année.
 *
 * ═══ POURQUOI CE CRITÈRE ET PAS UN AUTRE ═══
 *
 * Un certificat qui n'attesterait d'aucune notion mesurable serait un papier
 * vide portant deux signatures — précisément ce qui décrédibiliserait le
 * dispositif auprès des familles. On ne certifie donc que ce qu'on peut chiffrer.
 *
 * Ce qui n'est DÉLIBÉRÉMENT pas un critère :
 *   - un taux minimal de réussite. Le certificat atteste d'une PARTICIPATION
 *     mesurée, pas d'une réussite. Exclure l'élève le plus faible du seul
 *     document qu'il recevrait serait exactement à contre-emploi ;
 *   - un nombre minimal de séances. Trois questions sur une notion peuvent venir
 *     d'une seule séance dense comme de trois séances légères : c'est le volume
 *     de mesure qui compte, comme pour le rapport de séance.
 *
 * @param eleve Élève avec ses agrégats annuels (`masteryByCategory`).
 */
export function examinerEligibilite(eleve: Learner): EligibiliteCertificat {
  const cumul = cumulDepuisLearner(eleve);
  const agregation = agregerCompteurs(cumul.masteryByCategory);
  const notions = agregation.notions;

  if (notions.length > 0) {
    return {
      eleve,
      eligible: true,
      notions,
      totalReponses: agregation.totalReponses,
      raison: null,
    };
  }

  // Trois refus distincts, trois messages distincts : « n'a jamais joué » et
  // « a joué mais trop peu » n'appellent pas la même action de l'enseignant.
  if (agregation.totalReponses === 0) {
    return {
      eleve,
      eligible: false,
      notions,
      totalReponses: 0,
      raison:
        cumul.totalSessions === 0
          ? 'N’a participé à aucune séance terminée : aucune notion n’a pu être mesurée.'
          : `A participé à ${cumul.totalSessions} séance${cumul.totalSessions > 1 ? 's' : ''} mais n’a répondu à aucun quiz : aucune notion n’a pu être mesurée.`,
    };
  }

  return {
    eleve,
    eligible: false,
    notions,
    totalReponses: agregation.totalReponses,
    raison: `${agregation.totalReponses} réponse${agregation.totalReponses > 1 ? 's' : ''} cumulée${agregation.totalReponses > 1 ? 's' : ''}, mais aucune notion n’atteint ${SEUIL_QUESTIONS_NOTION} questions sur l’année — le minimum pour qu’un taux soit certifiable.`,
  };
}

/** Examine toute une classe, actifs et retirés séparés par l'appelant. */
export function examinerClasse(eleves: Learner[]): EligibiliteCertificat[] {
  return eleves.map(examinerEligibilite);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. GÉNÉRATION DU PDF
// ═══════════════════════════════════════════════════════════════════════════

/** Contexte commun à tous les certificats d'une même émission. */
export interface ContexteCertificat {
  /** Nom de l'établissement, co-signataire du document. */
  nomEtablissement: string;
  /** Nom de la classe (ex. « Terminale S2 »). */
  nomClasse: string;
  /** Début de la période couverte, en millisecondes epoch (`null` si inconnu). */
  debutPeriode?: number | null;
  /** Fin de la période couverte, en millisecondes epoch (`null` = aujourd'hui). */
  finPeriode?: number | null;
  /** Date d'émission, en millisecondes epoch. Par défaut : maintenant. */
  emisLe?: number;
}

/** Format A4 PAYSAGE, en points PDF (1 pt = 1/72 pouce). */
const LARGEUR = 841.89;
const HAUTEUR = 595.28;

/** Marge intérieure du cadre, en points. */
const MARGE = 46;

/** Palette sobre — un document officiel, pas une affiche. */
const ENCRE = rgb(0.11, 0.13, 0.18);
const ENCRE_DOUCE = rgb(0.42, 0.45, 0.52);
const ACCENT = rgb(0.16, 0.36, 0.72);
const FILET = rgb(0.82, 0.84, 0.88);

/** Couleurs du code couleur des notions — identiques à celles de l'écran. */
const VERT = rgb(0.13, 0.55, 0.33);
const ORANGE = rgb(0.72, 0.47, 0.09);
const ROUGE = rgb(0.72, 0.22, 0.22);

/**
 * Remplace les caractères que `WinAnsiEncoding` ne sait pas encoder.
 *
 * ⚠️ CE N'EST PAS COSMÉTIQUE. Les libellés viennent de l'interface, où les
 * apostrophes typographiques (’) et les tirets cadratins (—) sont partout, et un
 * nom d'établissement peut en contenir. pdf-lib LÈVE sur un caractère
 * inencodable : sans cette normalisation, le clic « Télécharger le certificat »
 * échouerait avec une erreur technique au lieu de produire le document.
 *
 * Les accents français (é, è, ê, à, ç, ï, ô, ù…) sont eux parfaitement couverts
 * par WinAnsi et passent tels quels — c'est tout l'intérêt de cet encodage.
 */
function assainir(texte: string): string {
  return (texte ?? '')
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
    .replace(/[•]/g, '-')
    // Filet de sécurité : tout ce qui reste hors du jeu WinAnsi est écarté
    // plutôt que de faire échouer la génération entière.
    .replace(/[^ -~ -ÿ]/g, '');
}

/** Date au format « 12 juin 2026 ». */
function dateLongue(ms: number): string {
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Couleur associée au taux d'une notion (mêmes seuils que l'écran). */
function couleurNotion(notion: NotionAgregee) {
  if (notion.niveau === 'reussi') return VERT;
  if (notion.niveau === 'a-consolider') return ORANGE;
  return ROUGE;
}

/** Écrit un texte centré horizontalement. */
function texteCentre(
  page: PDFPage,
  texte: string,
  y: number,
  police: PDFFont,
  taille: number,
  couleur = ENCRE
): void {
  const contenu = assainir(texte);
  const largeur = police.widthOfTextAtSize(contenu, taille);
  page.drawText(contenu, { x: (LARGEUR - largeur) / 2, y, size: taille, font: police, color: couleur });
}

/**
 * Réduit la taille de police jusqu'à ce que le texte tienne dans `largeurMax`.
 * Un nom composé long ne doit ni déborder du cadre ni être tronqué : c'est le
 * nom de l'élève, la seule chose qu'il regardera.
 */
function tailleAjustee(
  texte: string,
  police: PDFFont,
  tailleIdeale: number,
  largeurMax: number,
  tailleMin = 12
): number {
  let taille = tailleIdeale;
  while (taille > tailleMin && police.widthOfTextAtSize(assainir(texte), taille) > largeurMax) {
    taille -= 1;
  }
  return taille;
}

/** Libellé de la période couverte par le certificat. */
function libellePeriode(contexte: ContexteCertificat): string {
  const fin = contexte.finPeriode ?? contexte.emisLe ?? Date.now();
  if (contexte.debutPeriode && contexte.debutPeriode < fin) {
    return `Période du ${dateLongue(contexte.debutPeriode)} au ${dateLongue(fin)}`;
  }
  return `Arrêté au ${dateLongue(fin)}`;
}

/**
 * Dessine UNE page de certificat.
 *
 * MISE EN PAGE (A4 paysage, de haut en bas) :
 *   — un cadre fin, un filet d'accent en tête ;
 *   — « CERTIFICAT DE PARTICIPATION », puis le nom de l'élève en grand ;
 *   — la classe, l'établissement, la période et le nombre de séances ;
 *   — les notions maîtrisées, en deux colonnes, avec taux et effectif ;
 *   — la mention de co-signature et la date d'émission.
 *
 * Aucun niveau N1–N4 n'est dessiné, nulle part.
 */
function dessinerCertificat(
  page: PDFPage,
  eligibilite: EligibiliteCertificat,
  contexte: ContexteCertificat,
  polices: { normal: PDFFont; gras: PDFFont; italique: PDFFont }
): void {
  const { eleve, notions } = eligibilite;
  const emisLe = contexte.emisLe ?? Date.now();
  const largeurUtile = LARGEUR - 2 * MARGE;

  // ── Cadre ────────────────────────────────────────────────────────────────
  page.drawRectangle({
    x: MARGE - 14,
    y: MARGE - 14,
    width: largeurUtile + 28,
    height: HAUTEUR - 2 * MARGE + 28,
    borderColor: FILET,
    borderWidth: 1,
  });
  page.drawRectangle({ x: MARGE - 14, y: HAUTEUR - MARGE + 8, width: largeurUtile + 28, height: 6, color: ACCENT });

  // ── En-tête ──────────────────────────────────────────────────────────────
  let y = HAUTEUR - MARGE - 26;
  texteCentre(page, 'CERTIFICAT DE PARTICIPATION', y, polices.gras, 11, ACCENT);
  y -= 16;
  texteCentre(page, 'Startup Ludo - Mode Classe', y, polices.normal, 9.5, ENCRE_DOUCE);

  // ── Identité ─────────────────────────────────────────────────────────────
  y -= 46;
  texteCentre(page, 'Ce certificat est décerné à', y, polices.normal, 11.5, ENCRE_DOUCE);

  const nom = `${eleve.firstName ?? ''} ${eleve.lastName ?? ''}`.trim() || 'Élève sans nom';
  y -= 40;
  texteCentre(page, nom, y, polices.gras, tailleAjustee(nom, polices.gras, 30, largeurUtile - 40), ENCRE);

  y -= 24;
  const ligneClasse = `${contexte.nomClasse} - ${contexte.nomEtablissement}`;
  texteCentre(
    page,
    ligneClasse,
    y,
    polices.normal,
    tailleAjustee(ligneClasse, polices.normal, 13, largeurUtile - 40, 9),
    ENCRE_DOUCE
  );

  y -= 18;
  const seances = Math.max(0, Math.floor(Number(eleve.totalSessions ?? 0)) || 0);
  const detail = `${libellePeriode(contexte)}  -  ${seances} séance${seances > 1 ? 's' : ''} de jeu  -  ${eligibilite.totalReponses} question${eligibilite.totalReponses > 1 ? 's' : ''} répondue${eligibilite.totalReponses > 1 ? 's' : ''}`;
  texteCentre(page, detail, y, polices.normal, 10, ENCRE_DOUCE);

  // ── Notions maîtrisées ───────────────────────────────────────────────────
  y -= 34;
  page.drawLine({
    start: { x: MARGE + 60, y: y + 10 },
    end: { x: LARGEUR - MARGE - 60, y: y + 10 },
    thickness: 0.7,
    color: FILET,
  });

  y -= 8;
  texteCentre(page, 'NOTIONS ÉVALUÉES', y, polices.gras, 9.5, ENCRE_DOUCE);

  /*
    DEUX COLONNES. Une classe peut compter jusqu'à 9 notions (liste fermée du
    prompt IA) : sur une seule colonne, la dernière déborderait sous la ligne de
    signature. La coupe se fait à la moitié arrondie au supérieur, colonne de
    gauche d'abord — l'ordre de lecture reste le tri croissant du rapport.
  */
  y -= 26;
  const affichees = notions.slice(0, 12);
  const parColonne = Math.ceil(affichees.length / 2);
  const colonnes = [affichees.slice(0, parColonne), affichees.slice(parColonne)];
  const largeurColonne = (largeurUtile - 80) / 2;
  const hauteurLigne = 20;

  colonnes.forEach((colonne, indexColonne) => {
    const xBase = MARGE + 40 + indexColonne * (largeurColonne + 20);
    colonne.forEach((notion, index) => {
      const ligneY = y - index * hauteurLigne;
      const couleur = couleurNotion(notion);

      // Pastille de couleur : le code couleur du rapport, repris à l'identique.
      page.drawRectangle({ x: xBase, y: ligneY + 1, width: 6, height: 6, color: couleur });

      page.drawText(assainir(notion.libelle), {
        x: xBase + 14,
        y: ligneY,
        size: 11,
        font: polices.normal,
        color: ENCRE,
      });

      const chiffre = `${notion.taux} %`;
      const effectif = `sur ${notion.total} question${notion.total > 1 ? 's' : ''}`;
      const largeurEffectif = polices.normal.widthOfTextAtSize(effectif, 8.5);
      const largeurChiffre = polices.gras.widthOfTextAtSize(chiffre, 11);

      page.drawText(effectif, {
        x: xBase + largeurColonne - largeurEffectif,
        y: ligneY,
        size: 8.5,
        font: polices.normal,
        color: ENCRE_DOUCE,
      });
      page.drawText(chiffre, {
        x: xBase + largeurColonne - largeurEffectif - largeurChiffre - 10,
        y: ligneY,
        size: 11,
        font: polices.gras,
        color: couleur,
      });
    });
  });

  const basNotions = y - Math.max(0, parColonne - 1) * hauteurLigne;

  // ── Mention du seuil ─────────────────────────────────────────────────────
  // Elle est ÉCRITE SUR LE DOCUMENT, pas seulement expliquée à l'oral : une
  // famille doit pouvoir comprendre pourquoi telle notion n'y figure pas, sans
  // en conclure que l'élève l'a ratée.
  let yBas = basNotions - 26;
  texteCentre(
    page,
    `Seules les notions évaluées par au moins ${SEUIL_QUESTIONS_NOTION} questions sur la période sont certifiées.`,
    yBas,
    polices.italique,
    8.5,
    ENCRE_DOUCE
  );

  // ── Pied de page : co-signature ──────────────────────────────────────────
  yBas = MARGE + 34;
  page.drawLine({
    start: { x: MARGE + 60, y: yBas + 26 },
    end: { x: LARGEUR - MARGE - 60, y: yBas + 26 },
    thickness: 0.7,
    color: FILET,
  });

  texteCentre(
    page,
    `Document co-signé CONCREE et ${contexte.nomEtablissement}`,
    yBas,
    polices.gras,
    10,
    ENCRE
  );
  texteCentre(page, `Émis le ${dateLongue(emisLe)}`, yBas - 15, polices.normal, 9, ENCRE_DOUCE);
}

/**
 * Génère un PDF de certificats : une page par élève éligible.
 *
 * UN SEUL FICHIER, MÊME POUR TOUTE UNE CLASSE — pas de ZIP. Un PDF multi-pages
 * s'imprime d'un geste, s'archive dans un dossier de classe et s'ouvre partout ;
 * un ZIP de 30 fichiers oblige à décompresser puis à imprimer 30 fois.
 *
 * @param eligibles Élèves DÉJÀ filtrés comme éligibles (cf. `examinerClasse`).
 * @param contexte  Établissement, classe, période.
 * @returns Les octets du PDF, à passer à un `Blob` pour le téléchargement.
 * @throws Error si la liste est vide — produire un PDF de zéro page donnerait un
 *         fichier illisible plutôt qu'un message clair.
 */
export async function genererCertificats(
  eligibles: EligibiliteCertificat[],
  contexte: ContexteCertificat
): Promise<Uint8Array> {
  const retenus = eligibles.filter((e) => e.eligible);
  if (retenus.length === 0) {
    throw new Error('Aucun élève éligible : aucun certificat à générer.');
  }

  const pdf = await PDFDocument.create();
  pdf.setTitle(assainir(`Certificats - ${contexte.nomClasse} - ${contexte.nomEtablissement}`));
  pdf.setAuthor('CONCREE - Startup Ludo');
  pdf.setSubject('Certificats de participation - Mode Classe');
  pdf.setCreationDate(new Date(contexte.emisLe ?? Date.now()));

  const polices = {
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    gras: await pdf.embedFont(StandardFonts.HelveticaBold),
    italique: await pdf.embedFont(StandardFonts.HelveticaOblique),
  };

  // Ordre alphabétique : un paquet imprimé se distribue dans l'ordre de l'appel.
  const ordonnes = [...retenus].sort(
    (a, b) =>
      (a.eleve.lastName ?? '').localeCompare(b.eleve.lastName ?? '', 'fr') ||
      (a.eleve.firstName ?? '').localeCompare(b.eleve.firstName ?? '', 'fr')
  );

  for (const eligibilite of ordonnes) {
    dessinerCertificat(pdf.addPage([LARGEUR, HAUTEUR]), eligibilite, contexte, polices);
  }

  return pdf.save();
}

/**
 * Nom de fichier proposé au téléchargement — sans accent ni espace, pour rester
 * lisible sur tous les systèmes de fichiers et dans un dossier partagé.
 */
export function nomFichierCertificat(base: string, emisLe = Date.now()): string {
  const slug =
    base
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'certificat';
  return `certificat-${slug}-${new Date(emisLe).toISOString().slice(0, 10)}.pdf`;
}

/**
 * Déclenche le téléchargement d'un PDF dans le navigateur.
 * Isolé ici pour que `genererCertificats` reste testable sans DOM.
 */
export function telechargerPdf(octets: Uint8Array, nomFichier: string): void {
  // `slice()` produit un ArrayBuffer propre : le buffer sous-jacent de pdf-lib
  // peut être plus grand que la vue, et le passer tel quel joindrait des octets
  // de padding au fichier téléchargé.
  const blob = new Blob([octets.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  lien.click();
  URL.revokeObjectURL(url);
}
