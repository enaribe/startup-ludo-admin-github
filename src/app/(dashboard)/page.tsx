'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Users, Target, UserCheck, Star, TrendingUp, TrendingDown, ExternalLink, Zap, Shield, Trophy } from 'lucide-react';
import { getScopedPrograms, getPartners, getEnrollmentsByProgram, getSessionsByProgram } from '@/lib/firestore-service';
import type { PartnerProgram, ProgramPartner, ProgramEnrollment, ProgramSessionDoc, EntrepreneurProfile } from '@/types';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SuperAdminHome from '@/components/dashboard/SuperAdminHome';

/** Variation d'un KPI sur 30 jours : sens + valeur + unité (% ou pts). */
type Trend = { value: number; unit: '%' | 'pts'; dir: 'up' | 'down' | 'flat' };

// Couleurs sémantiques tirées du design system (src/styles/globals.css @theme).
const DS = {
  info: 'var(--color-info)',            // #2196F3 — bleu
  success: 'var(--color-success)',      // #4CAF50 — vert
  warning: 'var(--color-warning)',      // #FF9800 — orange
  challenge: 'var(--color-event-challenge)', // #9B59B6 — violet
  primaryDark: 'var(--color-primary-dark)',  // #CC9633 — doré
} as const;

const PROFILE_META: Record<EntrepreneurProfile, { label: string; icon: React.ReactNode; color: string }> = {
  strategist: { label: 'Stratège', icon: <Target size={16} />, color: DS.info },
  goer: { label: 'Fonceur', icon: <Zap size={16} />, color: DS.warning },
  cautious: { label: 'Prudent', icon: <Shield size={16} />, color: DS.success },
  creative: { label: 'Créatif', icon: <Star size={16} />, color: DS.challenge },
  builder: { label: 'Bâtisseur', icon: <Trophy size={16} />, color: DS.primaryDark },
};

/** Accueil : vue globale pour le super admin, tableau de bord programme pour l'admin de programme. */
export default function DashboardPage() {
  const { isSuperAdmin } = useAuth();
  if (isSuperAdmin) return <SuperAdminHome />;
  return <ProgramDashboard />;
}

function ProgramDashboard() {
  const { isSuperAdmin, admin } = useAuth();
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [partners, setPartners] = useState<ProgramPartner[]>([]);
  const [programId, setProgramId] = useState('');
  const [enrollments, setEnrollments] = useState<ProgramEnrollment[]>([]);
  const [, setSessions] = useState<ProgramSessionDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [list, p] = await Promise.all([
          getScopedPrograms(admin),
          getPartners(),
        ]);
        setPrograms(list);
        setPartners(p);
        if (list.length > 0) setProgramId(list[0].id);
      } finally {
        setLoading(false);
      }
    })();
  }, [isSuperAdmin, admin?.uid]);

  const loadData = useCallback(async (id: string) => {
    if (!id) return;
    setDataLoading(true);
    try {
      const [enr, sess] = await Promise.all([getEnrollmentsByProgram(id), getSessionsByProgram(id)]);
      setEnrollments(enr);
      setSessions(sess);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => { if (programId) loadData(programId); }, [programId, loadData]);

  const program = programs.find((p) => p.id === programId);
  const partnerName = (id?: string | null) => partners.find((x) => x.id === id)?.name ?? '';
  const totalLevels = Math.max(1, program?.contentPacks?.length ?? 1);

  const stats = useMemo(() => {
    const enrolled = enrollments.length;
    const completed = enrollments.filter((e) => (e.completedLevels ?? 0) >= totalLevels).length;
    const completionRate = enrolled > 0 ? Math.round((completed / enrolled) * 100) : 0;
    const leads = enrollments.filter((e) => e.formData != null);
    const qualified = leads.filter((e) => (e.formData?.applicationIntent ?? 0) >= 7).length;
    return { enrolled, completionRate, qualified };
  }, [enrollments, totalLevels]);

  // Tendances sur 30 jours : compare la fenêtre récente (0-30j) à la précédente (30-60j),
  // à partir de la date d'inscription (enrolledAt). Renvoie null si pas de date exploitable.
  const trends = useMemo(() => {
    const DAY = 86_400_000;
    const now = Date.now();
    const dated = enrollments.filter((e) => typeof e.enrolledAt === 'number' && e.enrolledAt > 0);
    if (dated.length === 0) {
      return { enrolled: null, completion: null, qualified: null } as Record<'enrolled' | 'completion' | 'qualified', Trend | null>;
    }
    const inWindow = (e: ProgramEnrollment, from: number, to: number) => e.enrolledAt >= now - to * DAY && e.enrolledAt < now - from * DAY;
    const recent = dated.filter((e) => inWindow(e, 0, 30));
    const prev = dated.filter((e) => inWindow(e, 30, 60));

    // % de croissance d'un volume entre période précédente et récente.
    const growth = (cur: number, before: number): Trend | null => {
      if (before === 0) return cur > 0 ? { value: 100, unit: '%', dir: 'up' } : null;
      const pct = Math.round(((cur - before) / before) * 100);
      return { value: Math.abs(pct), unit: '%', dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
    };
    const completionRateOf = (arr: ProgramEnrollment[]) =>
      arr.length > 0 ? Math.round((arr.filter((e) => (e.completedLevels ?? 0) >= totalLevels).length / arr.length) * 100) : 0;
    const qualifiedOf = (arr: ProgramEnrollment[]) =>
      arr.filter((e) => e.formData != null && (e.formData?.applicationIntent ?? 0) >= 7).length;

    // Complétion : variation en points (pts).
    const compDelta = completionRateOf(recent) - completionRateOf(prev);
    const completion: Trend | null = recent.length === 0 && prev.length === 0
      ? null
      : { value: Math.abs(compDelta), unit: 'pts', dir: compDelta > 0 ? 'up' : compDelta < 0 ? 'down' : 'flat' };

    return {
      enrolled: growth(recent.length, prev.length),
      completion,
      qualified: growth(qualifiedOf(recent), qualifiedOf(prev)),
    };
  }, [enrollments, totalLevels]);

  // Funnel : nombre de joueurs ayant atteint chaque niveau.
  const funnel = useMemo(() => {
    const reached: number[] = new Array(totalLevels).fill(0);
    enrollments.forEach((e) => {
      const max = Math.min((e.currentLevel ?? 0) + 1, totalLevels); // niveau en cours inclus
      for (let i = 0; i < max; i += 1) reached[i] += 1;
    });
    return reached.map((count, i) => ({
      level: i + 1,
      title: program?.contentPacks?.[i]?.title || program?.contentPacks?.[i]?.name || `Partie ${i + 1}`,
      count,
      dropoff: i > 0 && reached[i - 1] > 0 ? Math.round(((reached[i] - reached[i - 1]) / reached[i - 1]) * 100) : null,
    }));
  }, [enrollments, totalLevels, program]);

  // Profil entrepreneur : répartition (quand rempli côté jeu).
  const profileDist = useMemo(() => {
    const counts: Record<EntrepreneurProfile, number> = { strategist: 0, goer: 0, cautious: 0, creative: 0, builder: 0 };
    let withProfile = 0;
    enrollments.forEach((e) => { if (e.entrepreneurProfile) { counts[e.entrepreneurProfile] += 1; withProfile += 1; } });
    return (Object.keys(counts) as EntrepreneurProfile[]).map((k) => ({
      key: k,
      pct: withProfile > 0 ? Math.round((counts[k] / withProfile) * 100) : 0,
    }));
  }, [enrollments]);

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  if (programs.length === 0) {
    return (
      <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
        {isSuperAdmin ? 'Aucun programme. Créez-en un pour voir son tableau de bord.' : 'Aucun programme ne vous est assigné.'}
      </div>
    );
  }

  const activeDays = program?.updatedAt ? Math.max(0, Math.floor((Date.now() - program.updatedAt) / 86_400_000)) : 0;

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)' }}>Bonjour {admin?.displayName?.split(' ')[0] ?? ''} 👋</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginTop: 2 }}>
            Voici l’état de votre parcours {program?.name ?? ''}
          </p>
        </div>
        {isSuperAdmin && programs.length > 1 && (
          <select className="input-field" value={programId} onChange={(e) => setProgramId(e.target.value)} style={{ maxWidth: 220 }}>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      {/* Bandeau programme */}
      <div className="glass-card p-5 mb-6 flex items-center justify-between" style={{ marginTop: 16 }}>
        <div className="flex items-center gap-4">
          {program?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={program.logoUrl} alt="" style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'contain', background: 'var(--color-surface)' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Target size={20} color="var(--color-text-muted)" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h2 style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text-primary)' }}>{program?.name}</h2>
              <span className={`badge ${program?.isActive !== false ? 'badge-success' : 'badge-error'}`}>{program?.isActive !== false ? 'Publié' : 'Inactif'}</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {activeDays > 0 ? `Actif depuis ${activeDays} jours · ` : ''}
              {[partnerName(program?.partnerId), ...(program?.coPartnerIds ?? []).map(partnerName)].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <button className="btn-secondary flex items-center gap-2" style={{ fontSize: 12 }}>
          <ExternalLink size={14} /> Voir côté joueur
        </button>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Kpi icon={<Users size={18} />} label="Joueurs inscrits" value={stats.enrolled.toLocaleString()} color={DS.info} trend={trends.enrolled} />
        <Kpi icon={<Target size={18} />} label={`Complétion ${totalLevels}/${totalLevels}`} value={`${stats.completionRate}%`} color={DS.success} trend={trends.completion} />
        <Kpi icon={<UserCheck size={18} />} label="Leads qualifiés" value={stats.qualified.toLocaleString()} color={DS.warning} trend={trends.qualified} />
        <Kpi icon={<Star size={18} />} label="Note pédagogique" value="—" color={DS.challenge} hint="bientôt" />
      </div>

      {dataLoading ? (
        <div className="flex items-center justify-center py-10"><LoadingSpinner /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Funnel */}
          <div className="glass-card p-6 lg:col-span-2">
            <div className="flex items-center justify-between mb-5">
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>Funnel d’engagement</h3>
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{totalLevels} parties</span>
            </div>
            {(() => {
              const max = Math.max(1, ...funnel.map((f) => f.count));
              return (
                <div className="flex flex-col gap-3">
                  {funnel.map((f) => (
                    <div key={f.level} className="flex items-center gap-3">
                      <div style={{ width: 110, flexShrink: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>Partie {f.level}</p>
                        <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{f.title}</p>
                      </div>
                      <div style={{ flex: 1, height: 30, borderRadius: 6, background: 'var(--color-surface)', overflow: 'hidden' }}>
                        <div style={{ width: `${(f.count / max) * 100}%`, height: '100%', background: `hsl(${210 - f.level * 12}, 55%, 55%)`, display: 'flex', alignItems: 'center', paddingLeft: 10, minWidth: f.count > 0 ? 40 : 0 }}>
                          {f.count > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF' }}>{f.count}</span>}
                        </div>
                      </div>
                      <span style={{ width: 44, textAlign: 'right', fontSize: 12, color: f.dropoff != null && f.dropoff < -25 ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
                        {f.dropoff != null ? `${f.dropoff}%` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
            {stats.enrolled === 0 && (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>Aucun joueur inscrit pour l’instant.</p>
            )}
          </div>

          {/* Profil entrepreneur */}
          <div className="glass-card p-6">
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 18 }}>Profil entrepreneur</h3>
            {profileDist.every((p) => p.pct === 0) ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={16} /> Données disponibles dès que les joueurs terminent des parties.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {profileDist.map((p) => {
                  const meta = PROFILE_META[p.key];
                  return (
                    <div key={p.key} className="flex items-center gap-3">
                      <span style={{ color: meta.color, display: 'flex' }}>{meta.icon}</span>
                      <span style={{ width: 80, fontSize: 13, color: 'var(--color-text-secondary)' }}>{meta.label}</span>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--color-surface)' }}>
                        <div style={{ width: `${p.pct}%`, height: '100%', borderRadius: 3, background: meta.color }} />
                      </div>
                      <span style={{ width: 38, textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{p.pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ icon, label, value, color, hint, trend }: { icon: React.ReactNode; label: string; value: string; color: string; hint?: string; trend?: Trend | null }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          {icon}
        </div>
        {trend ? <TrendBadge trend={trend} /> : hint ? <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{hint}</span> : null}
      </div>
      <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-muted)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</p>
    </div>
  );
}

/** Badge de variation : ↗ +18% (vert), ↘ -31% (rouge), — stable (gris). Utilise les tokens du design system. */
function TrendBadge({ trend }: { trend: Trend }) {
  if (trend.dir === 'flat' || trend.value === 0) {
    return <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>— stable</span>;
  }
  const up = trend.dir === 'up';
  return (
    <span className="flex items-center gap-1" style={{ fontSize: 12, fontWeight: 600, color: up ? 'var(--color-success)' : 'var(--color-error)' }}>
      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {up ? '+' : '-'}{trend.value}{trend.unit === 'pts' ? ' pts' : '%'}
    </span>
  );
}
