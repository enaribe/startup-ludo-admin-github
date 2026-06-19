'use client';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  trend?: string;
}

export default function StatCard({ label, value, icon, color = '#FFBC40', trend }: StatCardProps) {
  return (
    <div className="glass-card p-5 flex items-start gap-4">
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
}
