'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Download, Target, Zap, Shield, Star, Trophy } from 'lucide-react';
import { getScopedPrograms, getLeadsByProgram, updateLeadStatus } from '@/lib/firestore-service';
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
  const [selectedLead, setSelectedLead] = useState<ProgramEnrollment | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await getScopedPrograms(admin);
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

  const currentProgram = programs.find((p) => p.id === programId);
  const programName = currentProgram?.name ?? '';
  // Maps id→label pour rendre lisibles les réponses dynamiques (customResponses/customConsents).
  const fieldLabels = useMemo(() => {
    const m = new Map<string, string>();
    currentProgram?.endForm?.fields.forEach((f) => m.set(f.id, f.label));
    return m;
  }, [currentProgram]);
  const consentLabels = useMemo(() => {
    const m = new Map<string, string>();
    currentProgram?.endForm?.consents.forEach((c) => m.set(c.id, c.label));
    return m;
  }, [currentProgram]);

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
    // Colonnes dynamiques = champs custom du formulaire de fin du programme.
    const customFields = currentProgram?.endForm?.fields ?? [];
    const header = [
      'Nom', 'Téléphone', 'Email', 'Ville', 'Persona', 'Concordance', 'Intention',
      ...customFields.map((f) => f.label),
      'Statut', 'Arrivée',
    ];
    const rows = [
      header,
      ...filtered.map((l) => [
        l.formData?.fullName ?? '',
        l.formData?.phone ?? '',
        l.formData?.email ?? '',
        l.formData?.city ?? '',
        l.profileName ?? '',
        l.formData?.profileMatch ?? '',
        String(l.formData?.applicationIntent ?? ''),
        ...customFields.map((f) => {
          const v = l.formData?.customResponses?.[f.id];
          return Array.isArray(v) ? v.join(' | ') : v != null ? String(v) : '';
        }),
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
                  <tr key={l.id} onClick={() => setSelectedLead(l)} style={{ borderTop: '1px solid var(--color-card-border)', cursor: 'pointer' }}>
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
                    <td style={{ padding: '12px 14px' }} onClick={(e) => e.stopPropagation()}>
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

      {/* Panneau de détail d'un lead — toutes les réponses (fixes + custom). */}
      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          fieldLabels={fieldLabels}
          consentLabels={consentLabels}
          onClose={() => setSelectedLead(null)}
          onStatus={(s) => setStatus(selectedLead, s)}
        />
      )}
    </div>
  );
}

/** Affiche une valeur de réponse (string, array, number, bool) de façon lisible. */
function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  return String(v);
}

function LeadDetail({ lead, fieldLabels, consentLabels, onClose, onStatus }: {
  lead: ProgramEnrollment;
  fieldLabels: Map<string, string>;
  consentLabels: Map<string, string>;
  onClose: () => void;
  onStatus: (s: ProgramLeadStatus) => void;
}) {
  const fd = lead.formData;
  const status = lead.leadStatus ?? 'new';
  const custom = fd?.customResponses ?? {};
  const customC = fd?.customConsents ?? {};
  const customKeys = Object.keys(custom);
  const customCKeys = Object.keys(customC);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div
        className="h-full overflow-y-auto"
        style={{ width: 'min(440px, 92vw)', background: 'var(--color-card)', borderLeft: '1px solid var(--color-card-border)', padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h2 style={{ fontSize: 19, fontWeight: 700, color: 'var(--color-text-primary)' }}>{fd?.fullName || 'Candidat'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>Candidature reçue {timeAgo(lead.enrolledAt)}</p>

        {/* Statut */}
        <div className="mb-5">
          <select
            value={status}
            onChange={(e) => onStatus(e.target.value as ProgramLeadStatus)}
            style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '5px 14px', fontSize: 13, fontWeight: 600, color: STATUS_META[status].color, background: STATUS_META[status].bg }}
          >
            {(Object.keys(STATUS_META) as ProgramLeadStatus[]).map((s) => (
              <option key={s} value={s} style={{ color: '#000' }}>{STATUS_META[s].label}</option>
            ))}
          </select>
        </div>

        {/* Coordonnées (champs fixes) */}
        <Section title="Coordonnées">
          <Row label="Nom complet" value={fd?.fullName} />
          <Row label="Téléphone" value={fd?.phone} />
          <Row label="Email" value={fd?.email} />
          <Row label="Ville" value={fd?.city} />
          <Row label="Statut professionnel" value={fd?.professionalStatus} />
        </Section>

        {/* Parcours / scoring */}
        <Section title="Profil & intention">
          <Row label="Persona incarné" value={lead.profileName} />
          <Row label="Concordance profil" value={fd?.profileMatch ? (MATCH_LABEL[fd.profileMatch]?.label ?? fd.profileMatch) : undefined} />
          <Row label="Intention de candidature" value={fd?.applicationIntent != null ? `${fd.applicationIntent} / 10` : undefined} />
        </Section>

        {/* Réponses dynamiques (custom) */}
        {customKeys.length > 0 && (
          <Section title="Réponses au formulaire">
            {customKeys.map((id) => (
              <Row key={id} label={fieldLabels.get(id) ?? id} value={renderValue(custom[id])} />
            ))}
          </Section>
        )}

        {/* Consentements */}
        <Section title="Consentements">
          <Row label="Traitement des données" value={fd?.consentDataProcessing ? 'Oui' : 'Non'} />
          <Row label="Accepte d’être recontacté" value={fd?.consentContact ? 'Oui' : 'Non'} />
          <Row label="Newsletter" value={fd?.newsletterOptIn ? 'Oui' : 'Non'} />
          {customCKeys.map((id) => (
            <Row key={id} label={consentLabels.get(id) ?? id} value={customC[id] ? 'Oui' : 'Non'} />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>{title}</p>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: unknown }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--color-text-primary)', textAlign: 'right', fontWeight: 500 }}>{renderValue(value)}</span>
    </div>
  );
}

function UserCheckIcon() {
  return <Target size={48} />;
}
