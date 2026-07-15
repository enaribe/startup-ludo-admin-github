'use client';

/**
 * Sélecteur de plage de dates [from, to] en <input type="date"> natifs (aucune
 * dépendance externe). Composant contrôlé : reflète les props et remonte via
 * onChange. `from` est ramené au début de journée locale, `to` à la fin de
 * journée locale (bornes inclusives).
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

/** "YYYY-MM-DD" → Date début (00:00:00.000) ou fin (23:59:59.999) de journée locale. */
function fromInputValue(value: string, edge: 'start' | 'end'): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
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

export default function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const applyPreset = (days: number | null) => {
    if (days === null) {
      onChange({ from: null, to: null });
      return;
    }
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    onChange({ from: start, to: end });
  };

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
        value={toInputValue(from)}
        max={toInputValue(to) || undefined}
        onChange={(e) => onChange({ from: fromInputValue(e.target.value, 'start'), to })}
        style={inputStyle}
        aria-label="Date de début"
      />
      <span style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>→</span>
      <input
        type="date"
        value={toInputValue(to)}
        min={toInputValue(from) || undefined}
        onChange={(e) => onChange({ from, to: fromInputValue(e.target.value, 'end') })}
        style={inputStyle}
        aria-label="Date de fin"
      />
      <div style={{ display: 'flex', gap: 6, marginLeft: 4 }}>
        {presetBtn('7j', 7)}
        {presetBtn('30j', 30)}
        {presetBtn('90j', 90)}
        {presetBtn('Tout', null)}
      </div>
    </div>
  );
}
