'use client';

/**
 * Funnel d'impact d'une carte : Vue → Flip → Clic → Sauvegarde.
 *
 * Le FLIP (retournement de la carte pour lire le verso) est déjà dans le
 * funnel alors que la carte recto/verso n'existe pas encore côté mobile : la
 * marche s'affiche à zéro avec la mention « bientôt mesuré ». La retirer
 * aujourd'hui pour la réinsérer au lot 4 changerait la lecture des taux d'un
 * rapport à l'autre — un annonceur qui compare deux exports doit comparer la
 * même chose.
 *
 * Les taux de passage sont calculés marche à marche (clics / flips, pas
 * clics / vues) SAUF si la marche précédente est vide : on retombe alors sur
 * la base des vues pour ne pas afficher une division par zéro.
 */

export interface EtapeFunnel {
  libelle: string;
  valeur: number;
  /** Marche pas encore mesurée par l'app mobile (flips avant le lot 4). */
  aVenir?: boolean;
}

export default function FunnelImpact({ etapes }: { etapes: EtapeFunnel[] }) {
  const base = etapes[0]?.valeur ?? 0;

  return (
    <div className="flex flex-col gap-2">
      {etapes.map((etape, i) => {
        const precedent = i > 0 ? etapes[i - 1] : null;
        const largeurPct = base > 0 ? Math.max(3, (etape.valeur / base) * 100) : 3;

        // Taux vs la marche précédente NON VIDE la plus proche (sinon vs vues).
        let taux: number | null = null;
        if (i > 0) {
          const referent =
            precedent && precedent.valeur > 0 ? precedent.valeur : base > 0 ? base : 0;
          taux = referent > 0 ? (etape.valeur / referent) * 100 : null;
        }

        return (
          <div key={etape.libelle}>
            <div className="flex items-center justify-between mb-1">
              <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                {etape.libelle}
                {etape.aVenir && (
                  <span
                    style={{
                      fontSize: 10.5,
                      color: 'var(--color-text-muted)',
                      marginLeft: 6,
                      fontStyle: 'italic',
                    }}
                  >
                    bientôt mesuré
                  </span>
                )}
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {etape.valeur.toLocaleString('fr-FR')}
                {taux !== null && (
                  <span style={{ fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 6 }}>
                    {taux.toFixed(1).replace('.', ',')} %
                  </span>
                )}
              </span>
            </div>
            <div
              style={{
                height: 22,
                borderRadius: 6,
                background: 'var(--color-surface)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${largeurPct}%`,
                  height: '100%',
                  borderRadius: 6,
                  background: etape.aVenir
                    ? 'repeating-linear-gradient(45deg, #C8D0DC, #C8D0DC 6px, #DDE3EC 6px, #DDE3EC 12px)'
                    : `rgba(15, 28, 46, ${1 - i * 0.18})`,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
