'use client';

/**
 * Courbe « vues et clics par jour » — double axe, N derniers jours.
 *
 * SVG maison plutôt qu'une bibliothèque : le projet n'embarque aucune lib de
 * charts, et ce graphe est le seul du back-office — 30 Ko de dépendance pour
 * une polyligne serait le mauvais échange. Deux axes parce que les clics font
 * ~3 % des vues : sur un axe commun, la courbe des clics serait un trait plat
 * collé à zéro, illisible — exactement ce que la maquette évite.
 */

import { useMemo } from 'react';

/** Un point du graphe — la page fournit la série (carte ou édition). */
export interface PointJour {
  /** AAAA-MM-JJ. */
  date: string;
  vues: number;
  clics: number;
}

const LARGEUR = 640;
const HAUTEUR = 220;
const MARGE = { haut: 16, bas: 28, gauche: 44, droite: 44 };

const COULEUR_VUES = '#0F1C2E';
const COULEUR_CLICS = '#F5A623';

/** Arrondit un maximum d'axe à une valeur « propre » (1/2/5 × 10^n). */
function maxPropre(valeur: number): number {
  if (valeur <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(valeur));
  for (const m of [1, 2, 5, 10]) {
    if (valeur <= m * magnitude) return m * magnitude;
  }
  return 10 * magnitude;
}

export default function CourbeQuotidienne({ serie }: { serie: PointJour[] }) {
  const { pointsVues, pointsClics, maxVues, maxClics, labels } = useMemo(() => {
    const vues = serie.map((j) => j.vues);
    const clics = serie.map((j) => j.clics);
    const mv = maxPropre(Math.max(...vues, 1));
    const mc = maxPropre(Math.max(...clics, 1));

    const largeurUtile = LARGEUR - MARGE.gauche - MARGE.droite;
    const hauteurUtile = HAUTEUR - MARGE.haut - MARGE.bas;
    const x = (i: number) =>
      MARGE.gauche + (serie.length <= 1 ? largeurUtile / 2 : (i / (serie.length - 1)) * largeurUtile);
    const y = (v: number, max: number) => MARGE.haut + hauteurUtile - (v / max) * hauteurUtile;

    return {
      pointsVues: vues.map((v, i) => ({ x: x(i), y: y(v, mv), v })),
      pointsClics: clics.map((v, i) => ({ x: x(i), y: y(v, mc), v })),
      maxVues: mv,
      maxClics: mc,
      // « 22 juil. » sur ~5 graduations pour ne pas empiler 14 étiquettes.
      labels: serie.map((j, i) => {
        const pas = Math.max(1, Math.round(serie.length / 5));
        if (i % pas !== 0 && i !== serie.length - 1) return null;
        const [, mois, jour] = j.date.split('-');
        return { x: x(i), texte: `${Number(jour)}/${Number(mois)}` };
      }),
    };
  }, [serie]);

  const chemin = (pts: { x: number; y: number }[]) =>
    pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const hauteurUtile = HAUTEUR - MARGE.haut - MARGE.bas;

  return (
    <div>
      <div className="flex items-center gap-4 mb-2" style={{ fontSize: 12 }}>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 8, height: 8, borderRadius: 4, background: COULEUR_VUES, display: 'inline-block' }} />
          <span style={{ color: 'var(--color-text-secondary)' }}>Vues</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span style={{ width: 8, height: 8, borderRadius: 4, background: COULEUR_CLICS, display: 'inline-block' }} />
          <span style={{ color: 'var(--color-text-secondary)' }}>Clics</span>
        </span>
        <span style={{ color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
          dernière journée en cours
        </span>
      </div>

      <svg
        viewBox={`0 0 ${LARGEUR} ${HAUTEUR}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Vues et clics par jour"
      >
        {/* Grille horizontale (4 lignes) + graduations des deux axes */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const yy = MARGE.haut + hauteurUtile - f * hauteurUtile;
          return (
            <g key={f}>
              <line
                x1={MARGE.gauche}
                x2={LARGEUR - MARGE.droite}
                y1={yy}
                y2={yy}
                stroke="var(--color-card-border)"
                strokeWidth={1}
              />
              <text x={MARGE.gauche - 6} y={yy + 4} textAnchor="end" fontSize={10} fill="#8A94A6">
                {Math.round(f * maxVues).toLocaleString('fr-FR')}
              </text>
              <text x={LARGEUR - MARGE.droite + 6} y={yy + 4} textAnchor="start" fontSize={10} fill={COULEUR_CLICS}>
                {Math.round(f * maxClics).toLocaleString('fr-FR')}
              </text>
            </g>
          );
        })}

        {/* Étiquettes de dates */}
        {labels.map(
          (l, i) =>
            l && (
              <text key={i} x={l.x} y={HAUTEUR - 8} textAnchor="middle" fontSize={10} fill="#8A94A6">
                {l.texte}
              </text>
            )
        )}

        {/* Courbes */}
        <path d={chemin(pointsVues)} fill="none" stroke={COULEUR_VUES} strokeWidth={2} />
        <path d={chemin(pointsClics)} fill="none" stroke={COULEUR_CLICS} strokeWidth={2} />

        {/* Points, avec infobulle native <title> */}
        {pointsVues.map((p, i) => (
          <circle key={`v${i}`} cx={p.x} cy={p.y} r={3} fill={COULEUR_VUES}>
            <title>{`${serie[i].date} — ${p.v.toLocaleString('fr-FR')} vue${p.v > 1 ? 's' : ''}`}</title>
          </circle>
        ))}
        {pointsClics.map((p, i) => (
          <circle key={`c${i}`} cx={p.x} cy={p.y} r={3} fill={COULEUR_CLICS}>
            <title>{`${serie[i].date} — ${p.v.toLocaleString('fr-FR')} clic${p.v > 1 ? 's' : ''}`}</title>
          </circle>
        ))}
      </svg>
    </div>
  );
}
