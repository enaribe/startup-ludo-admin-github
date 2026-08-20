/**
 * Bilan de classe PDF — la vue ANNUELLE, remise à une direction (là où le
 * rapport de session couvre une heure de cours).
 *
 * Même socle que `rapport-session-pdf.ts` : pdf-lib, Helvetica WinAnsi,
 * caractères hors jeu remplacés avant écriture. A4 portrait : bandeau navy,
 * ligne de tuiles, engagement séance par séance en barres, notions travaillées
 * en barres, détail par apprenant paginé (le tableau continue sur une page
 * suivante plutôt que d'être tronqué : un bilan d'année doit nommer tout le
 * monde).
 *
 * TOUT ce qui est imprimé ici est MESURÉ — les chiffres arrivent déjà calculés
 * de la fiche de classe, ce fichier ne fait que les mettre en page. Les limites
 * de mesure (engagement rapporté à l'effectif actuel, rendus de prolongement
 * non comptés par l'app) sont écrites dans le document lui-même : un lecteur ne
 * doit pas avoir besoin du back-office pour savoir ce qu'un chiffre vaut.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';

const NAVY = rgb(15 / 255, 28 / 255, 46 / 255);
const ORANGE = rgb(245 / 255, 166 / 255, 35 / 255);
const GRIS = rgb(0.45, 0.5, 0.56);
const FOND = rgb(0.945, 0.952, 0.965);
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

export interface DonneesBilanClasse {
  nomClasse: string;
  niveau: string;
  etablissement: string;
  /** Enseignants affectés, déjà joints (« Awa Ndiaye, Moussa Ba »). Vide si inconnus. */
  enseignants: string;
  /** Date d'émission, déjà formatée. */
  date: string;
  /** Quatre tuiles [libellé, valeur] — mêmes chiffres que l'écran. */
  tuiles: Array<[string, string]>;
  /** Engagement des séances mesurées, dans l'ordre chronologique. */
  engagement: Array<{ label: string; date: string; pct: number | null }>;
  /** Notions : taux `null` = citée sans pourcentage (seuil des 3 questions non atteint). */
  notions: Array<{ libelle: string; tauxPct: number | null; total: number }>;
  /** Une ligne par apprenant actif. */
  apprenants: Array<{
    nom: string;
    niveau: string;
    questions: number;
    tauxPct: number | null;
    seances: number;
    derniereActivite: string;
  }>;
  /** Vrai si au moins un prolongement a été assigné (déclenche la mention de mesure). */
  mentionProlongements: boolean;
}

export async function genererBilanClassePdf(d: DonneesBilanClasse): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([A4.l, A4.h]);
  let y = A4.h - M;

  const texte = (t: string, x: number, taille = 10, police: PDFFont = normal, couleur = NAVY) =>
    page.drawText(winAnsi(t), { x, y, size: taille, font: police, color: couleur });

  /** Passe à la page suivante quand le contenu approche le pied de page. */
  const garderPlace = (hauteur: number) => {
    if (y - hauteur > 56) return;
    page = pdf.addPage([A4.l, A4.h]);
    y = A4.h - M;
  };

  // ── Bandeau ──
  page.drawRectangle({ x: 0, y: A4.h - 96, width: A4.l, height: 96, color: NAVY });
  y = A4.h - 36;
  texte('CONCREE - Startup Ludo - Mode Classe', M, 9.5, gras, ORANGE);
  y -= 20;
  texte('Bilan de la classe', M, 16, gras, rgb(1, 1, 1));
  y -= 16;
  texte(
    [d.nomClasse, d.niveau, d.etablissement, d.enseignants].filter(Boolean).join(' - ') +
      ` - edite le ${d.date}`,
    M,
    9.5,
    normal,
    rgb(1, 1, 1)
  );

  // ── Tuiles de synthèse ──
  y = A4.h - 96 - 42;
  const largeurTuile = (A4.l - 2 * M - 3 * 10) / 4;
  d.tuiles.slice(0, 4).forEach(([libelle, valeur], i) => {
    const x = M + i * (largeurTuile + 10);
    page.drawRectangle({ x, y: y - 22, width: largeurTuile, height: 52, color: FOND });
    page.drawText(winAnsi(valeur), { x: x + 10, y: y + 8, size: 14, font: gras, color: NAVY });
    page.drawText(winAnsi(libelle.toUpperCase()), { x: x + 10, y: y - 12, size: 6.8, font: normal, color: GRIS });
  });
  y -= 52;

  /** Barre horizontale avec libellé à gauche et valeur à droite. */
  const barre = (libelle: string, pct: number | null, droite: string, faible: boolean) => {
    const largeurMax = 250;
    texte(libelle.slice(0, 36), M, 9.5);
    page.drawRectangle({ x: M + 200, y: y - 2, width: largeurMax, height: 8, color: rgb(0.92, 0.93, 0.95) });
    if (pct != null) {
      page.drawRectangle({
        x: M + 200,
        y: y - 2,
        width: Math.max(4, (Math.min(100, pct) / 100) * largeurMax),
        height: 8,
        color: faible ? ORANGE : NAVY,
      });
    }
    texte(droite, M + 200 + largeurMax + 10, 9, gras, pct == null ? GRIS : NAVY);
    y -= 16;
  };

  // ── Engagement séance par séance ──
  if (d.engagement.length > 0) {
    garderPlace(40 + d.engagement.length * 16);
    texte('ENGAGEMENT SEANCE PAR SEANCE', M, 9, gras, GRIS);
    y -= 15;
    for (const s of d.engagement) {
      barre(
        `${s.label}${s.date ? ` - ${s.date}` : ''}`,
        s.pct,
        s.pct != null ? `${s.pct} %` : 'non mesure',
        (s.pct ?? 100) < 50
      );
    }
    y -= 6;
    texte('Part des apprenants connectes a la seance, rapportee a l\'effectif actuel de la classe.', M, 8, normal, GRIS);
    y -= 20;
  }

  // ── Notions travaillées ──
  if (d.notions.length > 0) {
    garderPlace(40 + Math.min(d.notions.length, 10) * 16);
    texte('PROGRESSION DU CURRICULUM - notions couvertes (cumul annuel)', M, 9, gras, GRIS);
    y -= 15;
    for (const notion of d.notions.slice(0, 10)) {
      barre(
        notion.libelle,
        notion.tauxPct,
        notion.tauxPct != null
          ? `${notion.tauxPct} % sur ${notion.total} question${notion.total > 1 ? 's' : ''}`
          : `vue (${notion.total} question${notion.total > 1 ? 's' : ''}, sous le seuil)`,
        (notion.tauxPct ?? 100) < 60
      );
    }
    if (d.notions.length > 10) {
      texte(`... et ${d.notions.length - 10} autres notions (detail a l'ecran)`, M, 8.5, normal, GRIS);
      y -= 14;
    }
    y -= 12;
  }

  // ── Détail par apprenant, paginé ──
  garderPlace(60);
  texte('DETAIL PAR APPRENANT', M, 9, gras, GRIS);
  y -= 14;
  const entetes = () => {
    texte('Apprenant', M, 8.5, gras);
    texte('Niveau', 250, 8.5, gras);
    texte('Questions', 305, 8.5, gras);
    texte('Reussite', 370, 8.5, gras);
    texte('Seances', 428, 8.5, gras);
    texte('Derniere activite', 482, 8.5, gras);
    y -= 12;
  };
  entetes();
  for (const a of d.apprenants) {
    if (y < 70) {
      page = pdf.addPage([A4.l, A4.h]);
      y = A4.h - M;
      texte(`DETAIL PAR APPRENANT (suite) - ${d.nomClasse}`, M, 9, gras, GRIS);
      y -= 14;
      entetes();
    }
    texte(a.nom.slice(0, 34), M, 9);
    texte(a.niveau, 250, 9);
    texte(String(a.questions), 305, 9);
    texte(a.tauxPct != null ? `${a.tauxPct} %` : '-', 370, 9);
    texte(String(a.seances), 428, 9);
    texte(a.derniereActivite, 482, 9);
    y -= 12;
  }

  // ── Mentions de mesure ──
  const mentions = [
    'Niveaux : N1 decouvre - N2 pratique (10 questions et plus) - N3 maitrise (25 q., 60 %) - N4 autonome (50 q., 70 %).',
    ...(d.mentionProlongements
      ? ['Prolongements : le comptage des rendus arrive avec la prochaine version de l\'application mobile.']
      : []),
  ];
  let yPied = 40;
  for (const mention of [...mentions].reverse()) {
    page.drawText(winAnsi(mention), { x: M, y: yPied, size: 7.5, font: normal, color: GRIS });
    yPied += 11;
  }

  return pdf.save();
}
