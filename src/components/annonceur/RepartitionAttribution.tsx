'use client';

/**
 * Répartition « Personnes touchées » par secteur ⇄ région — barres horizontales.
 *
 * PRÉCISION IMPORTANTE affichée à l'utilisateur : la ventilation compte des
 * VUES (le joueur porte son secteur et sa région à chaque affichage), pas des
 * personnes uniques — la télémétrie mobile n'attribue pas l'unicité par
 * segment, et prétendre le contraire fausserait un rapport bailleur. Le
 * sous-titre du panneau le dit en toutes lettres.
 *
 * `non-renseigne` est affiché comme les autres : masquer l'inconnu gonflerait
 * silencieusement la part des répondants.
 */

import { useMemo, useState } from 'react';
import { libelleAttribution } from '@/lib/annonceur-service';

export default function RepartitionAttribution({
  bySector,
  byRegion,
  avecSecteur = true,
}: {
  bySector: Record<string, number>;
  byRegion: Record<string, number>;
  /**
   * Affiche la bascule « Par secteur ». À laisser à `false` sur l'habillage
   * d'une ÉDITION : le secteur remonté est celui de la startup du joueur, or
   * l'écran sponsor s'affiche au CHOIX de l'édition — avant qu'il n'ait joué.
   * La ventilation sectorielle y mélangerait donc des profils sans rapport
   * avec ce que l'annonceur a réservé. La région, elle, reste pertinente.
   */
  avecSecteur?: boolean;
}) {
  const [mode, setMode] = useState<'secteur' | 'region'>(avecSecteur ? 'secteur' : 'region');
  const source = mode === 'secteur' && avecSecteur ? bySector : byRegion;

  const lignes = useMemo(() => {
    const entrees = Object.entries(source).sort((a, b) => b[1] - a[1]);
    const total = entrees.reduce((somme, [, n]) => somme + n, 0);
    return { entrees: entrees.slice(0, 8), total };
  }, [source]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Personnes touchées
          </h3>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
            {avecSecteur
              ? 'Ventilation des vues par profil de joueur'
              : 'Ventilation des vues par région du joueur'}
          </p>
        </div>
        {/* Une seule dimension disponible : pas de bascule à une seule option. */}
        <div
          className="flex items-center"
          style={{
            borderRadius: 8,
            border: '1px solid var(--color-card-border)',
            overflow: 'hidden',
            display: avecSecteur ? undefined : 'none',
          }}
        >
          {(
            [
              { cle: 'secteur', libelle: 'Par secteur' },
              { cle: 'region', libelle: 'Par région' },
            ] as const
          ).map(({ cle, libelle }) => (
            <button
              key={cle}
              type="button"
              onClick={() => setMode(cle)}
              style={{
                fontSize: 12,
                padding: '6px 12px',
                border: 'none',
                cursor: 'pointer',
                background: mode === cle ? '#FFFFFF' : 'transparent',
                color: mode === cle ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                fontWeight: mode === cle ? 700 : 400,
                boxShadow: mode === cle ? '0 1px 3px rgba(15,28,46,0.12)' : 'none',
              }}
            >
              {libelle}
            </button>
          ))}
        </div>
      </div>

      {lignes.entrees.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', padding: '12px 0' }}>
          Aucune donnée pour l’instant — la ventilation se remplit au fil des vues
          (elle exige la version de l’app qui remonte secteur et région).
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {lignes.entrees.map(([slug, n]) => {
            const part = lignes.total > 0 ? (n / lignes.total) * 100 : 0;
            return (
              <div key={slug} className="flex items-center gap-3">
                <span
                  style={{
                    fontSize: 12.5,
                    color: 'var(--color-text-secondary)',
                    width: 130,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={libelleAttribution(slug)}
                >
                  {libelleAttribution(slug)}
                </span>
                <div
                  style={{
                    flex: 1,
                    height: 8,
                    borderRadius: 4,
                    background: 'var(--color-surface)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(2, part)}%`,
                      height: '100%',
                      borderRadius: 4,
                      background: '#0F1C2E',
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: 'var(--color-text-primary)',
                    width: 88,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {n.toLocaleString('fr-FR')}
                  <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 4 }}>
                    {part.toFixed(1).replace('.', ',')} %
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
