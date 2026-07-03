'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { TrendingUp, Users, Award, Clock } from 'lucide-react';
import { getProgram, getEnrollmentsByProgram } from '@/lib/firestore-service';
import type { ProgramEnrollment } from '@/types';
import { useCurrentProgram } from '@/lib/program-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function AnalyticsPage() {
  const { programs, currentProgramId: programId, loading: programsLoading } = useCurrentProgram();
  const [enrollments, setEnrollments] = useState<ProgramEnrollment[]>([]);
  const [totalLevels, setTotalLevels] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const [prog, enr] = await Promise.all([getProgram(id), getEnrollmentsByProgram(id)]);
      setTotalLevels(Math.max(1, prog?.contentPacks?.length ?? 1));
      setEnrollments(enr);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (programId) load(programId);
    else if (!programsLoading) setLoading(false);
  }, [programId, programsLoading, load]);

  const m = useMemo(() => {
    const n = enrollments.length;
    const completed = enrollments.filter((e) => (e.completedLevels ?? 0) >= totalLevels).length;
    const withForm = enrollments.filter((e) => e.formData != null).length;
    const totalWins = enrollments.reduce((s, e) => s + (e.totalWins ?? 0), 0);
    const totalSessions = enrollments.reduce((s, e) => s + (e.totalSessions ?? 0), 0);
    const avgLevel = n > 0 ? (enrollments.reduce((s, e) => s + (e.currentLevel ?? 0), 0) / n) : 0;
    const winRate = totalSessions > 0 ? Math.round((totalWins / totalSessions) * 100) : 0;
    const conversionRate = n > 0 ? Math.round((withForm / n) * 100) : 0;
    const completionRate = n > 0 ? Math.round((completed / n) * 100) : 0;
    return { n, completionRate, conversionRate, winRate, avgLevel, totalSessions };
  }, [enrollments, totalLevels]);

  // Inscriptions par jour (14 derniers jours).
  const timeline = useMemo(() => {
    const days: { label: string; count: number }[] = [];
    for (let i = 13; i >= 0; i -= 1) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - i);
      const end = start.getTime() + 86_400_000;
      const count = enrollments.filter((e) => e.enrolledAt >= start.getTime() && e.enrolledAt < end).length;
      days.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, count });
    }
    return days;
  }, [enrollments]);

  if (loading && programs.length === 0) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  if (programs.length === 0) return <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucun programme accessible.</div>;

  const maxDay = Math.max(1, ...timeline.map((d) => d.count));

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>Analytics</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>Mesures d’engagement et de conversion du parcours</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10"><LoadingSpinner /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Metric icon={<Users size={18} />} color="#5B8DEF" label="Inscrits" value={m.n.toLocaleString()} />
            <Metric icon={<Award size={18} />} color="#3FAE6B" label="Taux de complétion" value={`${m.completionRate}%`} />
            <Metric icon={<TrendingUp size={18} />} color="#F5A623" label="Taux de conversion" value={`${m.conversionRate}%`} />
            <Metric icon={<Clock size={18} />} color="#9B59B6" label="Niveau moyen atteint" value={m.avgLevel.toFixed(1)} />
          </div>

          <div className="glass-card p-6 mb-6">
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 16 }}>Inscriptions · 14 derniers jours</h3>
            <div className="flex items-end gap-2" style={{ height: 160 }}>
              {timeline.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5" style={{ justifyContent: 'flex-end', height: '100%' }}>
                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{d.count > 0 ? d.count : ''}</span>
                  <div style={{ width: '100%', height: `${(d.count / maxDay) * 100}%`, minHeight: d.count > 0 ? 4 : 0, background: '#5B8DEF', borderRadius: 4 }} />
                  <span style={{ fontSize: 9, color: 'var(--color-text-muted)' }}>{d.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Mini label="Parties jouées (total)" value={m.totalSessions.toLocaleString()} />
            <Mini label="Taux de victoire" value={`${m.winRate}%`} />
            <Mini label="Candidatures (leads)" value={enrollments.filter((e) => e.formData != null).length.toLocaleString()} />
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ icon, color, label, value }: { icon: React.ReactNode; color: string; label: string; value: string }) {
  return (
    <div className="glass-card p-5">
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, marginBottom: 12 }}>{icon}</div>
      <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-muted)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card p-5">
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</p>
    </div>
  );
}
