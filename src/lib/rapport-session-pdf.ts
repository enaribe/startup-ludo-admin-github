/**
 * Rapport de session PDF (lot M5, spec v2.1 §7) — « la pièce pour le
 * renouvellement de la licence de l'établissement ».
 *
 * Même socle que les certificats et les rapports annonceurs : pdf-lib,
 * Helvetica WinAnsi, caractères hors jeu remplacés avant écriture. Une page
 * A4 : bandeau navy avec le chiffre d'ouverture, indicateurs, notions
 * maîtrisées en barres, prolongement, détail par apprenant (tronqué à la
 * page — le CSV existant reste l'export exhaustif).
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

const NAVY = rgb(15 / 255, 28 / 255, 46 / 255);
const ORANGE = rgb(245 / 255, 166 / 255, 35 / 255);
const GRIS = rgb(0.45, 0.5, 0.56);
const A4 = { l: 595.28, h: 841.89 };
const M = 48;

function winAnsi(t: string): string {
  return t
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[→·●]/g, '-')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x00-\xFF]/g, '');
}

export interface DonneesRapportSession {
  titreSeance: string;
  nomClasse: string;
  date: string;
  participation: { actifs: number; effectif: number };
  scoreMoyenPct: number | null;
  /** Notions : libellé + taux (null = citée sans pourcentage, seuil non atteint). */
  notions: Array<{ libelle: string; tauxPct: number | null }>;
  /** Prolongement assigné, s'il existe. */
  prolongement?: { dateLimite?: string; faits: number; total: number };
  /** Détail par apprenant : nom, score, réponses correctes / total. */
  apprenants: Array<{ nom: string; score: number; correctes: number; total: number }>;
}

export async function genererRapportSessionPdf(d: DonneesRapportSession): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.addPage([A4.l, A4.h]);
  let y = A4.h - M;

  const texte = (t: string, x: number, taille = 10, police: PDFFont = normal, couleur = NAVY) =>
    page.drawText(winAnsi(t), { x, y, size: taille, font: police, color: couleur });

  // ── Bandeau ──
  page.drawRectangle({ x: 0, y: A4.h - 92, width: A4.l, height: 92, color: NAVY });
  y = A4.h - 38;
  texte('CONCREE - Startup Ludo - Mode Classe', M, 9.5, gras, ORANGE);
  y -= 20;
  texte('Rapport de session', M, 16, gras, rgb(1, 1, 1));
  y -= 16;
  texte(`${d.titreSeance} - ${d.nomClasse} - ${d.date}`, M, 10, normal, rgb(1, 1, 1));

  // ── Chiffre d'ouverture ──
  y = A4.h - 92 - 30;
  const pct =
    d.participation.effectif > 0
      ? Math.round((d.participation.actifs / d.participation.effectif) * 100)
      : 0;
  texte(
    `${d.participation.actifs} apprenants ont participe (${pct} % de la classe)` +
      (d.scoreMoyenPct != null ? ` - score moyen ${d.scoreMoyenPct} %` : ''),
    M,
    12,
    gras
  );
  y -= 14;
  texte('Ce rapport sert de piece pour le renouvellement de la licence de l\'etablissement.', M, 9, normal, GRIS);
  y -= 26;

  // ── Notions maîtrisées ──
  texte('NOTIONS MAITRISEES', M, 9, gras, GRIS);
  y -= 15;
  for (const notion of d.notions.slice(0, 8)) {
    const largeurMax = 260;
    const taux = notion.tauxPct;
    texte(notion.libelle.slice(0, 34), M, 9.5);
    page.drawRectangle({ x: M + 190, y: y - 2, width: largeurMax, height: 8, color: rgb(0.92, 0.93, 0.95) });
    if (taux != null) {
      page.drawRectangle({
        x: M + 190,
        y: y - 2,
        width: Math.max(4, (taux / 100) * largeurMax),
        height: 8,
        color: taux < 60 ? ORANGE : NAVY,
      });
      texte(`${taux} %${taux < 60 ? ' - a retravailler' : ''}`, M + 190 + largeurMax + 10, 9, gras);
    } else {
      texte('vue (moins de 3 questions)', M + 190 + largeurMax + 10, 8.5, normal, GRIS);
    }
    y -= 16;
  }
  y -= 10;

  // ── Prolongement ──
  if (d.prolongement) {
    texte('PROLONGEMENT ASSIGNE', M, 9, gras, GRIS);
    y -= 14;
    texte(
      `A rendre avant le ${d.prolongement.dateLimite || '-'} - ${d.prolongement.faits}/${d.prolongement.total} apprenants l'ont termine.`,
      M,
      10
    );
    y -= 22;
  }

  // ── Détail par apprenant ──
  texte('DETAIL PAR APPRENANT', M, 9, gras, GRIS);
  y -= 14;
  texte('Apprenant', M, 8.5, gras);
  texte('Score', 300, 8.5, gras);
  texte('Reponses correctes', 380, 8.5, gras);
  y -= 12;
  for (const a of d.apprenants) {
    if (y < 70) {
      texte(`... et ${d.apprenants.length} apprenants au total (detail complet dans l'export CSV)`, M, 8.5, normal, GRIS);
      break;
    }
    texte(a.nom.slice(0, 40), M, 9);
    texte(String(a.score), 300, 9);
    texte(a.total > 0 ? `${a.correctes}/${a.total}` : '-', 380, 9);
    y -= 12;
  }

  page.drawText(
    winAnsi('Certificats nominatifs co-signes CONCREE et l\'etablissement - generes depuis la fiche de classe.'),
    { x: M, y: 36, size: 8, font: normal, color: GRIS }
  );
  return pdf.save();
}

/** Téléchargement navigateur. */
export function telechargerPdf(octets: Uint8Array, nom: string): void {
  const blob = new Blob([octets.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  a.click();
  URL.revokeObjectURL(url);
}
