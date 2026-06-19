'use client';

export type ContentLang = 'fr' | 'en';

const LANGS: { code: ContentLang; label: string }[] = [
  { code: 'fr', label: 'FR' },
  { code: 'en', label: 'EN' },
];

/** Petit sélecteur de langue (FR/EN) pour éditer le contenu original ou sa traduction. */
export default function LangTabs({ lang, onChange }: { lang: ContentLang; onChange: (l: ContentLang) => void }) {
  return (
    <div className="flex items-center" style={{ background: 'var(--color-surface)', borderRadius: 8, padding: 2 }}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => onChange(l.code)}
          style={{
            padding: '4px 12px',
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            background: lang === l.code ? 'rgba(91,141,239,0.25)' : 'transparent',
            color: lang === l.code ? '#9DBDF7' : 'var(--color-text-muted)',
          }}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
