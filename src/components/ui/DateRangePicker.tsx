'use client';

import { useEffect, useState } from 'react';

/**
 * Sélecteur de plage de dates [from, to] en <input type="date"> natifs (aucune
 * dépendance externe). La saisie se fait sur un brouillon local ; la plage n'est
 * remontée au parent (onChange) que via le bouton « Appliquer ». `from` est ramené
 * au début de journée locale, `to` à la fin de journée locale (bornes inclusives).
 */

interface DateRangePickerProps {
  from: Date | null;
  to: Date | null;
  onChange: (range: { from: Date | null; to: Date | null }) => void;
}

/** Date → "YYYY-MM-DD" en heure LOCALE (pas toISOString, qui décale en UTC). */
function toInputValue(d: Date | null): string {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * "YYYY-MM-DD" → Date début/fin de journée locale.
 * Renvoie null si la valeur est vide OU incomplète : pendant une saisie manuelle,
 * l'input émet des états transitoires (année à 1, 2, 190… chiffres). On n'accepte
 * qu'une année à 4 chiffres plausible pour éviter d'enregistrer « 1906 » quand
 * l'utilisateur est en train de taper « 2026 ».
 */
function fromInputValue(value: string, edge: 'start' | 'end'): Date | null {
  if (!value) return null;
  const [ys, ms, ds] = value.split('-');
  const y = parseInt(ys, 10);
  const m = parseInt(ms, 10);
  const d = parseInt(ds, 10);
  if (!y || !m || !d) return null;
  // Année plausible uniquement (4 chiffres, > 1900). Rejette les états transitoires.
  if (y < 1900 || y > 9999) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return edge === 'start'
    ? new Date(y, m - 1, d, 0, 0, 0, 0)
    : new Date(y, m - 1, d, 23, 59, 59, 999);
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
  color: 'var(--color-text)',
  fontSize: 13,
};

/** Deux Date représentent-elles le même instant (ou toutes deux null) ? */
function sameDate(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) return a === b;
  return a.getTime() === b.getTime();
}

export default function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  // Brouillon local : la saisie ne remonte au parent qu'à la validation.
  const [draftFrom, setDraftFrom] = useState<Date | null>(from);
  const [draftTo, setDraftTo] = useState<Date | null>(to);

  // Resynchronise le brouillon si le parent change la plage (ex. reset externe).
  useEffect(() => { setDraftFrom(from); }, [from]);
  useEffect(() => { setDraftTo(to); }, [to]);

  const dirty = !sameDate(draftFrom, from) || !sameDate(draftTo, to);

  const applyPreset = (days: number | null) => {
    if (days === null) {
      setDraftFrom(null);
      setDraftTo(null);
      onChange({ from: null, to: null });
      return;
    }
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    setDraftFrom(start);
    setDraftTo(end);
    onChange({ from: start, to: end });
  };

  const apply = () => onChange({ from: draftFrom, to: draftTo });

  const presetBtn = (label: string, days: number | null) => (
    <button
      type="button"
      className="btn-secondary"
      onClick={() => applyPreset(days)}
      style={{ fontSize: 12, padding: '6px 10px' }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <input
        type="date"
        defaultValue={toInputValue(from)}
        key={`from-${toInputValue(from)}`}
        max={toInputValue(draftTo) || undefined}
        onChange={(e) => setDraftFrom(fromInputValue(e.target.value, 'start'))}
        style={inputStyle}
        aria-label="Date de début"
      />
      <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>→</span>
      <input
        type="date"
        defaultValue={toInputValue(to)}
        key={`to-${toInputValue(to)}`}
        min={toInputValue(draftFrom) || undefined}
        onChange={(e) => setDraftTo(fromInputValue(e.target.value, 'end'))}
        style={inputStyle}
        aria-label="Date de fin"
      />
      <button
        type="button"
        className="btn-primary"
        onClick={apply}
        disabled={!dirty}
        style={{ fontSize: 12, padding: '7px 14px', opacity: dirty ? 1 : 0.5, cursor: dirty ? 'pointer' : 'default' }}
      >
        Appliquer
      </button>
      <div style={{ display: 'flex', gap: 6, marginLeft: 4 }}>
        {presetBtn('7j', 7)}
        {presetBtn('30j', 30)}
        {presetBtn('90j', 90)}
        {presetBtn('Tout', null)}
      </div>
    </div>
  );
}
