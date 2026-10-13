/**
 * Feedback du contrôle thématique d'un cours déposé.
 *
 * POURQUOI UN PANNEAU ET PAS UN TOAST — un refus doit expliquer, et un toast
 * disparaît en quatre secondes. L'enseignant à qui on refuse son cours a besoin
 * de lire le thème détecté, de comprendre la règle et de connaître son
 * alternative ; il doit pouvoir y revenir après avoir rouvert son fichier. Le
 * panneau reste donc à l'écran jusqu'à ce qu'il le ferme ou dépose autre chose.
 */

'use client';

import { AlertTriangle, Info, X } from 'lucide-react';
import type { AnalyseThematique } from '@/lib/analyse-thematique';

interface Props {
  /** Nom du fichier concerné, pour que l'enseignant sache lequel est visé. */
  fichier: string;
  /** Analyse rendue par le contrôle. */
  analyse: AnalyseThematique;
  /** Fermeture du panneau. */
  onFermer: () => void;
}

/**
 * Panneau de refus (verdict `hors-sujet`) ou d'avertissement (`incertain`).
 *
 * Les deux cas partagent la même structure mais PAS le même sens, et c'est la
 * distinction importante : le refus annonce un blocage, l'avertissement invite
 * à relire un contenu qui a bien été généré. Les traiter du même ton
 * entraînerait l'enseignant à ignorer les deux.
 */
export default function RefusThematique({ fichier, analyse, onFermer }: Props) {
  const bloque = analyse.verdict === 'hors-sujet';

  const accent = bloque ? 'var(--color-error, #DC2626)' : '#B87A0C';
  const fond = bloque ? 'rgba(220, 38, 38, 0.07)' : 'rgba(184, 122, 12, 0.07)';

  return (
    <div
      role={bloque ? 'alert' : 'status'}
      style={{
        border: `1px solid ${accent}`,
        background: fond,
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        gap: 12,
      }}
    >
      {bloque ? (
        <AlertTriangle size={17} style={{ color: accent, flexShrink: 0, marginTop: 1 }} />
      ) : (
        <Info size={17} style={{ color: accent, flexShrink: 0, marginTop: 1 }} />
      )}

      <div className="flex flex-col gap-2" style={{ flex: 1 }}>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          {bloque
            ? `« ${fichier} » n’a pas été ajouté`
            : `« ${fichier} » a été ajouté, mais relisez bien le contenu`}
        </p>

        <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          {analyse.motif}
        </p>

        {bloque && (
          <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            Startup Ludo génère des quiz sur la <strong>création d’entreprise</strong>, le{' '}
            <strong>financement</strong>, le <strong>marketing</strong>, la{' '}
            <strong>gestion</strong> et la <strong>stratégie</strong>. Déposez un cours couvrant
            ces notions — ou lancez votre séance sur une édition existante, sans document.
          </p>
        )}

        {analyse.notions.length > 0 && (
          <div className="flex flex-wrap gap-1.5" style={{ marginTop: 2 }}>
            {analyse.notions.map((n) => (
              <span
                key={n}
                style={{
                  fontSize: 11,
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: '1px solid var(--color-card-border)',
                  color: 'var(--color-text-muted)',
                }}
              >
                {n}
              </span>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onFermer}
        aria-label="Fermer"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', alignSelf: 'flex-start' }}
      >
        <X size={15} />
      </button>
    </div>
  );
}
