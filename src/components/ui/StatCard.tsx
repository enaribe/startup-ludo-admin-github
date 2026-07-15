'use client';

import Link from 'next/link';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  trend?: string;
  /** Rend la carte cliquable (navigation). Optionnel : sans lui la carte reste un <div> statique. */
  href?: string;
  /** Rend la carte cliquable (action). Ignoré si href est fourni. */
  onClick?: () => void;
}

export default function StatCard({ label, value, icon, color = '#FFBC40', trend, href, onClick }: StatCardProps) {
  const interactive = !!href || !!onClick;

  const content = (
    <div
      className="glass-card p-5 flex items-start gap-4"
      style={interactive ? { cursor: 'pointer', transition: 'transform .12s, box-shadow .12s' } : undefined}
    >
      <div className="rounded-lg p-2.5" style={{ background: `${color}15` }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="flex-1">
        <p className="stat-label">{label}</p>
        <p className="stat-value" style={{ color, fontSize: 28 }}>{value}</p>
        {trend && (
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>{trend}</p>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href} style={{ display: 'block', textDecoration: 'none' }}>{content}</Link>;
  }
  if (onClick) {
    return (
      <button onClick={onClick} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0 }}>
        {content}
      </button>
    );
  }
  return content;
}
