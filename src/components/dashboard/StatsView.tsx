'use client';

import { Users, Gamepad2, Rocket, Building2, UserCheck, Activity, ClipboardCheck, Percent } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';

/** Forme des statistiques globales (identique côté service et route publique). */
export interface GlobalStatsData {
  totalUsers: number;
  totalGames: number;
  totalPrograms: number;
  totalPartners: number;
  totalEnrollments: number;
  formsSubmitted: number;
  activeUsers7d: number;
  activeUsers30d: number;
  programSessions: number;
  conversionRate: number;
  enrollmentTimeline: { label: string; count: number }[];
  topPrograms: { name: string; count: number }[];
  rangeMetrics?: {
    newUsers: number;
    games: number;
    enrollments: number;
    fromMs: number | null;
    toMs: number | null;
  };
}

/**
 * Vue visuelle des statistiques globales — partagée entre la page admin et la
 * page publique. `interactive` rend certaines cartes cliquables (navigation vers
 * les listes détaillées) : réservé au contexte admin, jamais sur la page publique.
 */
export default function StatsView({ stats, interactive = false }: { stats: GlobalStatsData; interactive?: boolean }) {
  const maxDay = Math.max(1, ...stats.enrollmentTimeline.map((d) => d.count));
  const maxProg = Math.max(1, ...stats.topPrograms.map((p) => p.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* KPIs principaux */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
        <StatCard label="Joueurs inscrits" value={stats.totalUsers.toLocaleString('fr-FR')} icon={<Users size={20} />} color="#FFBC40" href={interactive ? '/users' : undefined} trend={stats.rangeMetrics ? `+${stats.rangeMetrics.newUsers.toLocaleString('fr-FR')} sur la période` : undefined} />
        <StatCard label="Parties jouées" value={stats.totalGames.toLocaleString('fr-FR')} icon={<Gamepad2 size={20} />} color="#1F91D0" trend={stats.rangeMetrics ? `+${stats.rangeMetrics.games.toLocaleString('fr-FR')} sur la période` : undefined} />
        <StatCard label="Programmes" value={stats.totalPrograms} icon={<Rocket size={20} />} color="#9B59B6" href={interactive ? '/programs' : undefined} />
        <StatCard label="Partenaires" value={stats.totalPartners} icon={<Building2 size={20} />} color="#3FAE6B" href={interactive ? '/partners' : undefined} />
      </div>

      {/* Engagement */}
      <div>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--color-text)' }}>Engagement</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          <StatCard label="Actifs (7 jours)" value={stats.activeUsers7d.toLocaleString('fr-FR')} icon={<Activity size={20} />} color="#3FAE6B" />
          <StatCard label="Actifs (30 jours)" value={stats.activeUsers30d.toLocaleString('fr-FR')} icon={<Activity size={20} />} color="#1F91D0" />
          <StatCard label="Sessions de programme" value={stats.programSessions.toLocaleString('fr-FR')} icon={<Gamepad2 size={20} />} color="#FFBC40" />
          <StatCard label="Inscriptions programme" value={stats.totalEnrollments.toLocaleString('fr-FR')} icon={<UserCheck size={20} />} color="#9B59B6" href={interactive ? '/leads' : undefined} trend={stats.rangeMetrics ? `+${stats.rangeMetrics.enrollments.toLocaleString('fr-FR')} sur la période` : undefined} />
          <StatCard label="Formulaires soumis" value={stats.formsSubmitted.toLocaleString('fr-FR')} icon={<ClipboardCheck size={20} />} color="#3FAE6B" />
          <StatCard label="Taux de conversion" value={`${stats.conversionRate}%`} icon={<Percent size={20} />} color="#FFBC40" trend="Inscriptions → formulaire soumis" />
        </div>
      </div>

      {/* Évolution des inscriptions (30 jours par défaut, ou sur la plage choisie) */}
      <div className="glass-card p-6">
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: 'var(--color-text)' }}>
          {stats.rangeMetrics ? 'Inscriptions — sur la période' : 'Inscriptions — 30 derniers jours'}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
          {stats.enrollmentTimeline.reduce((s, d) => s + d.count, 0)} inscription(s) sur la période
        </p>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 140 }}>
          {stats.enrollmentTimeline.map((d, i) => (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={`${d.label} : ${d.count}`}>
              <div
                style={{
                  width: '100%',
                  height: `${(d.count / maxDay) * 110}px`,
                  minHeight: d.count > 0 ? 4 : 1,
                  background: d.count > 0 ? 'linear-gradient(180deg, #FFBC40, #FFD97A)' : 'var(--color-border)',
                  borderRadius: 3,
                  transition: 'height .3s',
                }}
              />
              {i % 5 === 0 && <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>{d.label}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Top programmes */}
      <div className="glass-card p-6">
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: 'var(--color-text)' }}>Top programmes par inscriptions</h2>
        {stats.topPrograms.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Aucun programme.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {stats.topPrograms.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text)', width: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <div style={{ flex: 1, height: 10, background: 'var(--color-border)', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${(p.count / maxProg) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #1F91D0, #4FB3E0)', borderRadius: 5 }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', width: 40, textAlign: 'right' }}>{p.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
