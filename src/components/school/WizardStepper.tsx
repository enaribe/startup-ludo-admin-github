'use client';

/**
 * Fil d'étapes numérotées d'un wizard.
 *
 * REPRIS de `SponsorCardWizard.tsx`, avec SON DÉFAUT CORRIGÉ. Là-bas, le
 * `cursor` n'est `pointer` que pour `i < etape` : les étapes SUIVANTES sont
 * bien cliquables (le `onClick` ne filtre pas) mais rien ne le laisse deviner,
 * et le curseur dit le contraire. L'utilisateur en déduit qu'il doit repasser
 * par « Continuer » à chaque fois, alors qu'il pourrait sauter à l'étape voulue.
 *
 * Ici, **toutes** les étapes sont cliquables et le montrent. C'est le bon
 * comportement pour un wizard de séance : un enseignant qui reprend un brouillon
 * veut aller droit au récapitulatif, pas re-dérouler la génération. La validation
 * n'est pas perdue pour autant — elle porte sur le bouton final, pas sur la
 * navigation.
 */

import { Check } from 'lucide-react';

interface WizardStepperProps {
  /** Libellés des étapes, dans l'ordre. */
  etapes: readonly string[];
  /** Index de l'étape affichée. */
  etape: number;
  /** Appelé avec l'index de l'étape demandée. */
  onAller: (index: number) => void;
}

export default function WizardStepper({ etapes, etape, onAller }: WizardStepperProps) {
  return (
    <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
      {etapes.map((label, i) => {
        const actif = i === etape;
        const franchi = i < etape;
        return (
          <div key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAller(i)}
              className="flex items-center gap-2"
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: `1px solid ${actif ? 'transparent' : 'var(--color-card-border)'}`,
                background: actif
                  ? 'var(--color-primary)'
                  : franchi
                    ? 'var(--color-success-light)'
                    : '#FFFFFF',
                color: actif ? '#0C243E' : franchi ? 'var(--color-success)' : 'var(--color-text-muted)',
                // Toutes les étapes sont atteignables : le curseur le dit.
                cursor: 'pointer',
                fontSize: 12.5,
                fontWeight: actif ? 700 : 500,
              }}
            >
              <span
                className="flex items-center justify-center"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  fontSize: 10.5,
                  fontWeight: 800,
                  background: actif
                    ? 'rgba(12,36,62,0.14)'
                    : franchi
                      ? 'var(--color-success)'
                      : 'var(--color-surface-variant)',
                  color: actif ? '#0C243E' : franchi ? '#FFFFFF' : 'var(--color-text-muted)',
                }}
              >
                {franchi ? <Check size={11} /> : i + 1}
              </span>
              {label}
            </button>
            {i < etapes.length - 1 && (
              <span style={{ width: 14, height: 1, background: 'var(--color-card-border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
