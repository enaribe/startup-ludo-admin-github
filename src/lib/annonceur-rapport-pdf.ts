/**
 * Rapport d'impact PDF d'une mise en visibilité — la pièce justificative que
 * l'annonceur joint à son rapport de programme ou à sa demande de paiement.
 *
 * Même socle technique que les certificats du Mode Classe : pdf-lib, polices
 * standard Helvetica en WinAnsiEncoding (couvre le français accentué), aucune
 * dépendance de plus. Les caractères hors WinAnsi (→, ’, …) sont remplacés
 * avant écriture — un rapport qui plante à l'export sur un guillemet
 * typographique n'aurait jamais dû quitter la revue de code.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { MiseEnVisibilite } from './annonceur-service';
import type { PointJour } from '@/components/annonceur/CourbeQuotidienne';

const NAVY = rgb(15 / 255, 28 / 255, 46 / 255);
const ORANGE = rgb(245 / 255, 166 / 255, 35 / 255);
const GRIS = rgb(0.45, 0.5, 0.56);
const A4 = { largeur: 595.28, hauteur: 841.89 };
const MARGE = 48;

/** Remplace ce que WinAnsiEncoding ne sait pas encoder. */
function winAnsi(texte: string): string {
  return texte
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/→/g, '->')
    .replace(/·/g, '-')
    .replace(/●/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\xFF]/g, '');
}

/** Une ligne d'indicateur du rapport. */
export interface LigneRapport {
  libelle: string;
  valeur: string;
  detail?: string;
}

export interface DonneesRapport {
  visibilite: MiseEnVisibilite;
  indicateurs: LigneRapport[];
  funnel: Array<{ libelle: string; valeur: number }>;
  serie14j: PointJour[];
}

/** Génère le rapport et retourne ses octets (à passer à un Blob). */
export async function genererRapportImpactPdf(donnees: DonneesRapport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const police = {
    normal: await pdf.embedFont(StandardFonts.Helvetica),
    gras: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  const page = pdf.addPage([A4.largeur, A4.hauteur]);
  let y = A4.hauteur - MARGE;

  const texte = (
    contenu: string,
    options: { x?: number; taille?: number; police?: PDFFont; couleur?: ReturnType<typeof rgb> } = {}
  ) => {
    page.drawText(winAnsi(contenu), {
      x: options.x ?? MARGE,
      y,
      size: options.taille ?? 10,
      font: options.police ?? police.normal,
      color: options.couleur ?? NAVY,
    });
  };

  // ===== En-tête =====
  page.drawRectangle({ x: 0, y: A4.hauteur - 86, width: A4.largeur, height: 86, color: NAVY });
  y = A4.hauteur - 40;
  texte('CONCREE - Startup Ludo', { taille: 10, couleur: ORANGE, police: police.gras });
  y -= 20;
  texte("Rapport d'impact - Espace Annonceur", {
    taille: 16,
    police: police.gras,
    couleur: rgb(1, 1, 1),
  });

  const v = donnees.visibilite;
  y = A4.hauteur - 86 - 32;

  // ===== Identité de la mise en visibilité =====
  texte(v.titre.length > 90 ? `${v.titre.slice(0, 87)}...` : v.titre, {
    taille: 13,
    police: police.gras,
  });
  y -= 16;
  texte(
    `${v.structure}  -  format ${v.format === 'edition' ? 'Edition sponsorisee' : `Carte ${v.kind === 'funding' ? 'FINANCEMENT' : 'OPPORTUNITE'}`}  -  edition ${v.editionName}`,
    { taille: 9.5, couleur: GRIS }
  );
  y -= 13;
  const exportLe = new Date().toLocaleString('fr-FR');
  texte(`Exporte le ${exportLe} - diffusion en continu - facture a la vue reelle`, {
    taille: 9.5,
    couleur: GRIS,
  });
  y -= 26;

  // ===== Indicateurs =====
  texte('INDICATEURS', { taille: 9, police: police.gras, couleur: GRIS });
  y -= 14;
  for (const ligne of donnees.indicateurs) {
    texte(ligne.libelle, { taille: 10.5 });
    texte(ligne.valeur, { x: 330, taille: 10.5, police: police.gras });
    if (ligne.detail) texte(ligne.detail, { x: 430, taille: 9, couleur: GRIS });
    y -= 16;
  }
  y -= 12;

  // ===== Funnel =====
  texte('PARCOURS DU JOUEUR', { taille: 9, police: police.gras, couleur: GRIS });
  y -= 14;
  const base = donnees.funnel[0]?.valeur ?? 0;
  for (const [i, etape] of donnees.funnel.entries()) {
    const largeurMax = 300;
    const largeur = base > 0 ? Math.max(6, (etape.valeur / base) * largeurMax) : 6;
    page.drawRectangle({
      x: MARGE,
      y: y - 3,
      width: largeur,
      height: 11,
      color: rgb(15 / 255, 28 / 255, 46 / 255),
      opacity: 1 - i * 0.18,
    });
    texte(`${etape.libelle} : ${etape.valeur.toLocaleString('fr-FR')}`, {
      x: MARGE + largeurMax + 16,
      taille: 10,
    });
    y -= 20;
  }
  y -= 12;

  // ===== Détail quotidien =====
  texte('DETAIL QUOTIDIEN (14 DERNIERS JOURS)', { taille: 9, police: police.gras, couleur: GRIS });
  y -= 14;
  texte('Jour', { taille: 9, police: police.gras });
  texte('Vues', { x: 200, taille: 9, police: police.gras });
  texte('Clics', { x: 280, taille: 9, police: police.gras });
  y -= 13;
  for (const jour of donnees.serie14j) {
    texte(jour.date, { taille: 9, couleur: GRIS });
    texte(jour.vues.toLocaleString('fr-FR'), { x: 200, taille: 9 });
    texte(jour.clics.toLocaleString('fr-FR'), { x: 280, taille: 9 });
    y -= 12;
  }

  // ===== Pied =====
  page.drawText(
    winAnsi(
      'Les vues sont comptees par l\'application au moment ou la carte s\'affiche reellement en partie. Aucune vue non livree n\'est facturee.'
    ),
    { x: MARGE, y: 40, size: 8, font: police.normal, color: GRIS, maxWidth: A4.largeur - 2 * MARGE }
  );

  return pdf.save();
}

/** Une ligne de facture (miroir de la route /api/annonceur/compte). */
export interface LigneFacturePdf {
  titre: string;
  vues: number;
  clics: number;
  perView: number;
  perClick: number;
  montantFcfa: number;
}

/** Génère la facture mensuelle — la pièce comptable téléchargée par l'annonceur. */
export async function genererFacturePdf(donnees: {
  reference: string;
  period: string;
  raisonSociale?: string;
  ninea?: string;
  lines: LigneFacturePdf[];
  totalFcfa: number;
  status: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([A4.largeur, A4.hauteur]);
  let y = A4.hauteur - MARGE;

  const texte = (contenu: string, x: number, taille = 10, police: PDFFont = normal, couleur = NAVY) =>
    page.drawText(winAnsi(contenu), { x, y, size: taille, font: police, color: couleur });

  page.drawRectangle({ x: 0, y: A4.hauteur - 86, width: A4.largeur, height: 86, color: NAVY });
  y = A4.hauteur - 40;
  texte('CONCREE - Startup Ludo - Espace Annonceur', MARGE, 10, gras, ORANGE);
  y -= 20;
  texte(`Facture ${donnees.reference}`, MARGE, 16, gras, rgb(1, 1, 1));

  y = A4.hauteur - 86 - 30;
  texte(`Periode : ${donnees.period}  -  Statut : ${donnees.status === 'paid' ? 'Payee' : 'En cours'}`, MARGE, 10, normal, GRIS);
  y -= 14;
  if (donnees.raisonSociale) {
    texte(`Client : ${donnees.raisonSociale}${donnees.ninea ? ` - NINEA ${donnees.ninea}` : ''}`, MARGE, 10, normal, GRIS);
    y -= 14;
  }
  y -= 12;

  texte('MISE EN VISIBILITE', MARGE, 8.5, gras, GRIS);
  texte('VUES', 300, 8.5, gras, GRIS);
  texte('CLICS', 360, 8.5, gras, GRIS);
  texte('MONTANT', 440, 8.5, gras, GRIS);
  y -= 14;
  for (const ligne of donnees.lines) {
    texte(ligne.titre.length > 52 ? `${ligne.titre.slice(0, 49)}...` : ligne.titre, MARGE, 9.5);
    texte(ligne.vues.toLocaleString('fr-FR'), 300, 9.5);
    texte(ligne.clics.toLocaleString('fr-FR'), 360, 9.5);
    texte(`${ligne.montantFcfa.toLocaleString('fr-FR')} F`, 440, 9.5, gras);
    y -= 12;
    texte(`${ligne.perView} F/vue - ${ligne.perClick} F/clic`, MARGE, 8, normal, GRIS);
    y -= 15;
  }
  y -= 8;
  texte('TOTAL', MARGE, 11, gras);
  texte(`${donnees.totalFcfa.toLocaleString('fr-FR')} FCFA`, 440, 11, gras);

  page.drawText(
    winAnsi('Facture a la vue et au clic reellement livres. Aucune vue non livree n\'est facturee.'),
    { x: MARGE, y: 40, size: 8, font: normal, color: GRIS }
  );
  return pdf.save();
}

/** Déclenche le téléchargement navigateur du rapport. */
export function telechargerRapport(octets: Uint8Array, nomFichier: string): void {
  const blob = new Blob([octets.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  lien.click();
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════════════════════════════════
// RAPPORT CONSOLIDÉ (tableau de bord — tous formats confondus, 30 jours)
// ═══════════════════════════════════════════════════════════════════════════

/** Une ligne du tableau « Performance comparée » du rapport consolidé. */
export interface LigneConsolidee {
  titre: string;
  format: string;
  vues: string;
  personnes: string;
  clicsCtr: string;
  coutPersonne: string;
  depense: string;
}

/**
 * Rapport consolidé A4 paysage : tuiles de synthèse puis une ligne par mise
 * en visibilité — le pendant PDF du tableau de bord annonceur.
 */
export async function genererRapportConsolidePdf(donnees: {
  structure: string;
  periode: string;
  tuiles: Array<[string, string]>;
  lignes: LigneConsolidee[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Paysage : largeur et hauteur A4 inversées.
  const L = A4.hauteur;
  const H = A4.largeur;
  const page = pdf.addPage([L, H]);
  let y = H - MARGE;

  const texte = (
    contenu: string,
    options: { x?: number; taille?: number; police?: PDFFont; couleur?: ReturnType<typeof rgb> } = {}
  ) => {
    page.drawText(winAnsi(contenu), {
      x: options.x ?? MARGE,
      y,
      size: options.taille ?? 9.5,
      font: options.police ?? normal,
      color: options.couleur ?? NAVY,
    });
  };

  // ── En-tête navy ──
  page.drawRectangle({ x: 0, y: H - 70, width: L, height: 70, color: NAVY });
  y = H - 32;
  texte('CONCREE - Startup Ludo', { taille: 9.5, couleur: ORANGE, police: gras });
  y -= 18;
  texte('Rapport consolide - Espace Annonceur', { taille: 15, police: gras, couleur: rgb(1, 1, 1) });
  y = H - 70 - 24;
  texte(`${donnees.structure}  -  ${donnees.periode}  -  exporte le ${new Date().toLocaleString('fr-FR')}`, {
    taille: 8.5,
    couleur: GRIS,
  });

  // ── Tuiles de synthèse ──
  y -= 30;
  const largeurTuile = (L - 2 * MARGE - 12 * (donnees.tuiles.length - 1)) / donnees.tuiles.length;
  donnees.tuiles.forEach(([libelle, valeur], i) => {
    const x = MARGE + i * (largeurTuile + 12);
    page.drawRectangle({
      x, y: y - 34, width: largeurTuile, height: 52,
      color: rgb(0.965, 0.97, 0.98), borderColor: rgb(0.88, 0.9, 0.93), borderWidth: 0.8,
    });
    page.drawText(winAnsi(libelle), { x: x + 10, y: y + 4, size: 7.5, font: normal, color: GRIS });
    page.drawText(winAnsi(valeur), { x: x + 10, y: y - 14, size: 12.5, font: gras, color: NAVY });
  });
  y -= 60;

  // ── Tableau « Performance comparée » ──
  const colonnes: Array<{ cle: keyof LigneConsolidee; titre: string; x: number; droite?: boolean }> = [
    { cle: 'titre', titre: 'MISE EN VISIBILITE', x: MARGE },
    { cle: 'format', titre: 'FORMAT', x: MARGE + 292 },
    { cle: 'vues', titre: 'VUES', x: MARGE + 360, droite: true },
    { cle: 'personnes', titre: 'PERSONNES', x: MARGE + 434, droite: true },
    { cle: 'clicsCtr', titre: 'CLICS - CTR', x: MARGE + 520, droite: true },
    { cle: 'coutPersonne', titre: 'COUT / PERS.', x: MARGE + 606, droite: true },
    { cle: 'depense', titre: 'DEPENSE', x: MARGE + 700, droite: true },
  ];
  const cellule = (contenu: string, col: (typeof colonnes)[number], police: PDFFont, taille = 8.5, couleur = NAVY) => {
    const c = winAnsi(contenu);
    const x = col.droite ? col.x - police.widthOfTextAtSize(c, taille) : col.x;
    page.drawText(c, { x, y, size: taille, font: police, color: couleur });
  };
  for (const col of colonnes) cellule(col.titre, col, gras, 7.5, GRIS);
  y -= 6;
  page.drawLine({ start: { x: MARGE, y }, end: { x: L - MARGE, y }, thickness: 0.8, color: rgb(0.85, 0.87, 0.9) });
  y -= 15;

  for (const ligne of donnees.lignes) {
    if (y < MARGE + 20) break; // une page suffit au consolidé — le détail vit dans les rapports d'impact
    cellule(ligne.titre.length > 62 ? `${ligne.titre.slice(0, 59)}...` : ligne.titre, colonnes[0], normal);
    cellule(ligne.format, colonnes[1], normal, 8.5, GRIS);
    cellule(ligne.vues, colonnes[2], normal);
    cellule(ligne.personnes, colonnes[3], normal);
    cellule(ligne.clicsCtr, colonnes[4], normal);
    cellule(ligne.coutPersonne, colonnes[5], normal);
    cellule(ligne.depense, colonnes[6], gras);
    y -= 8;
    page.drawLine({ start: { x: MARGE, y }, end: { x: L - MARGE, y }, thickness: 0.4, color: rgb(0.92, 0.93, 0.95) });
    y -= 13;
  }

  y = MARGE - 14;
  texte('Chiffres mesures par l\'application mobile (vues et clics reels) - facture a la vue reelle, aucun frais fixe.', {
    taille: 7.5,
    couleur: GRIS,
  });

  return pdf.save();
}
