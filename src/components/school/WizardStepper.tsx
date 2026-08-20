'use client';

/**
 * Fil d'étapes numérotées d'un wizard — carte pleine largeur, cercles
 * numérotés reliés par un filet (maquette « Lancer une session »).
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
    <div className="glass-card flex items-center gap-3 px-5 py-4" style={{ flexWrap: 'wrap' }}>
      {etapes.map((label, i) => {
        const actif = i === etape;
        const franchi = i < etape;
        return (
          <div key={label} className="flex items-center gap-3" style={{ flex: i < etapes.length - 1 ? 1 : 'none' }}>
            <button
              type="button"
              onClick={() => onAller(i)}
              className="flex items-center gap-2"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                // Toutes les étapes sont atteignables : le curseur le dit.
                cursor: 'pointer',
              }}
            >
              <span
                className="flex items-center justify-center"
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  fontSize: 12,
                  fontWeight: 800,
                  flexShrink: 0,
                  background: actif
                    ? 'var(--color-primary)'
                    : franchi
                      ? 'var(--color-success)'
                      : 'rgba(15,28,46,0.07)',
                  color: actif ? '#0C243E' : franchi ? '#FFFFFF' : 'var(--color-text-muted)',
                }}
              >
                {franchi ? <Check size={13} /> : i + 1}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: actif ? 700 : 500,
                  color: actif ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </span>
            </button>
            {i < etapes.length - 1 && (
              <span style={{ flex: 1, minWidth: 24, height: 1, background: 'var(--color-card-border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
