'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Download, Target, Zap, Shield, Star, Trophy } from 'lucide-react';
import { getPrograms, getProgramsByOwner, getLeadsByProgram, updateLeadStatus } from '@/lib/firestore-service';
import type { PartnerProgram, ProgramEnrollment, ProgramLeadStatus, EntrepreneurProfile } from '@/types';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import toast from 'react-hot-toast';

const STATUS_META: Record<ProgramLeadStatus, { label: string; color: string; bg: string }> = {
  new: { label: 'Nouveau', color: '#5B8DEF', bg: 'rgba(91,141,239,0.15)' },
  contacted: { label: 'Contacté', color: '#F5A623', bg: 'rgba(245,166,35,0.15)' },
  converted: { label: 'Converti', color: '#3FAE6B', bg: 'rgba(63,174,107,0.15)' },
  rejected: { label: 'Rejeté', color: '#F44336', bg: 'rgba(244,67,54,0.15)' },
};

const PROFILE_META: Record<EntrepreneurProfile, { label: string; icon: React.ReactNode; color: string }> = {
  strategist: { label: 'Stratège', icon: <Target size={13} />, color: '#5B8DEF' },
  goer: { label: 'Fonceur', icon: <Zap size={13} />, color: '#F5A623' },
  cautious: { label: 'Prudent', icon: <Shield size={13} />, color: '#3FAE6B' },
  creative: { label: 'Créatif', icon: <Star size={13} />, color: '#9B59B6' },
  builder: { label: 'Bâtisseur', icon: <Trophy size={13} />, color: '#C9821E' },
};

const MATCH_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  yes: { label: 'Oui', color: '#3FAE6B', bg: 'rgba(63,174,107,0.15)' },
  partial: { label: 'Partiellement', color: '#F5A623', bg: 'rgba(245,166,35,0.15)' },
  no: { label: 'Non', color: '#F44336', bg: 'rgba(244,67,54,0.15)' },
};

type FilterKey = 'all' | 'highIntent' | 'notContacted';

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

export default function LeadsPage() {
  const { isSuperAdmin, admin } = useAuth();
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [programId, setProgramId] = useState('');
  const [leads, setLeads] = useState<ProgramEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');

  useEffect(() => {
    (async () => {
      try {
        const list = isSuperAdmin ? await getPrograms() : admin?.uid ? await getProgramsByOwner(admin.uid) : [];
        setPrograms(list);
        if (list.length > 0) setProgramId(list[0].id);
        else setLoading(false);
      } catch {
        toast.error('Erreur de chargement');
        setLoading(false);
      }
    })();
  }, [isSuperAdmin, admin?.uid]);

  const loadLeads = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await getLeadsByProgram(id);
      setLeads(data.sort((a, b) => b.enrolledAt - a.enrolledAt));
    } catch {
      toast.error('Erreur de chargement des leads');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (programId) loadLeads(programId); }, [programId, loadLeads]);

  const stats = useMemo(() => {
    const total = leads.length;
    const qualified = leads.filter((l) => (l.formData?.applicationIntent ?? 0) >= 7).length;
    const contacted = leads.filter((l) => l.leadStatus === 'contacted' || l.leadStatus === 'converted').length;
    const converted = leads.filter((l) => l.leadStatus === 'converted').length;
    return { total, qualified, contacted, converted };
  }, [leads]);

  const filtered = useMemo(() => {
    switch (filter) {
      case 'highIntent': return leads.filter((l) => (l.formData?.applicationIntent ?? 0) >= 7);
      case 'notContacted': return leads.filter((l) => !l.leadStatus || l.leadStatus === 'new');
      default: return leads;
    }
  }, [leads, filter]);

  const setStatus = async (lead: ProgramEnrollment, status: ProgramLeadStatus) => {
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, leadStatus: status } : l)));
    try {
      await updateLeadStatus(lead.id, status);
    } catch {
      toast.error('Erreur de mise à jour');
      loadLeads(programId);
    }
  };

  const exportCsv = () => {
    const rows = [
      ['Nom', 'Téléphone', 'Email', 'Ville', 'Persona', 'Concordance', 'Intention', 'Statut', 'Arrivée'],
      ...filtered.map((l) => [
        l.formData?.fullName ?? '',
        l.formData?.phone ?? '',
        l.formData?.email ?? '',
        l.formData?.city ?? '',
        l.profileName ?? '',
        l.formData?.profileMatch ?? '',
        String(l.formData?.applicationIntent ?? ''),
        l.leadStatus ?? 'new',
        new Date(l.enrolledAt).toISOString(),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${programId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && leads.length === 0 && programs.length === 0) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  }
  if (programs.length === 0) {
    return <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucun programme accessible.</div>;
  }

  const programName = programs.find((p) => p.id === programId)?.name ?? '';

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>Leads & candidats {programName ? `· ${programName}` : ''}</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {stats.qualified} qualifiés · {stats.total} au total · {stats.contacted} contactés · {stats.converted} convertis
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isSuperAdmin && programs.length > 1 && (
            <select className="input-field" value={programId} onChange={(e) => setProgramId(e.target.value)} style={{ maxWidth: 220 }}>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button className="btn-primary flex items-center gap-2" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download size={16} /> Exporter CSV
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {([
          { key: 'all', label: 'Tous' },
          { key: 'highIntent', label: 'Score ≥ 7' },
          { key: 'notContacted', label: 'Non contactés' },
        ] as { key: FilterKey; label: string }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={filter === f.key ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 16px', fontSize: 13 }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<UserCheckIcon />} title="Aucun lead" description="Les candidatures soumises en fin de parcours apparaîtront ici." />
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-surface)', textAlign: 'left' }}>
                {['Arrivée', 'Lead', 'Persona', 'Concordance', 'Intention', 'Profil', 'Statut', 'Téléphone'].map((h) => (
                  <th key={h} style={{ padding: '12px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => {
                const intent = l.formData?.applicationIntent ?? 0;
                const match = l.formData?.profileMatch ? MATCH_LABEL[l.formData.profileMatch] : null;
                const profile = l.entrepreneurProfile ? PROFILE_META[l.entrepreneurProfile] : null;
                const status = l.leadStatus ?? 'new';
                return (
                  <tr key={l.id} style={{ borderTop: '1px solid var(--color-card-border)' }}>
                    <td style={{ padding: '12px 14px', color: 'var(--color-text-muted)' }}>{timeAgo(l.enrolledAt)}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--color-text-primary)', fontWeight: 600 }}>{l.formData?.fullName || '—'}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--color-text-secondary)' }}>{l.profileName || '—'}</td>
                    <td style={{ padding: '12px 14px' }}>
                      {match ? <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, color: match.color, background: match.bg }}>{match.label}</span> : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <div className="flex items-center gap-2">
                        <div style={{ width: 60, height: 5, borderRadius: 3, background: 'var(--color-surface-variant)' }}>
                          <div style={{ width: `${intent * 10}%`, height: '100%', borderRadius: 3, background: intent >= 7 ? '#3FAE6B' : intent >= 4 ? '#F5A623' : '#F44336' }} />
                        </div>
                        <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{intent}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      {profile ? (
                        <span className="flex items-center gap-1.5" style={{ color: profile.color }}>{profile.icon}{profile.label}</span>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <select
                        value={status}
                        onChange={(e) => setStatus(l, e.target.value as ProgramLeadStatus)}
                        style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: STATUS_META[status].color, background: STATUS_META[status].bg }}
                      >
                        {(Object.keys(STATUS_META) as ProgramLeadStatus[]).map((s) => (
                          <option key={s} value={s} style={{ color: '#000' }}>{STATUS_META[s].label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#5B8DEF' }}>{l.formData?.phone || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UserCheckIcon() {
  return <Target size={48} />;
}
