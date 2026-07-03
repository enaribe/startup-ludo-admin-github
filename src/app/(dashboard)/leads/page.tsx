'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Download, Target, Search, X, Share2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getLeadsByProgram, updateLeadStatus } from '@/lib/firestore-service';
import type { ProgramEnrollment, ProgramLeadStatus } from '@/types';
import { useCurrentProgram } from '@/lib/program-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import { STATUS_META, PROFILE_META, MATCH_LABEL, timeAgo, LeadDetail } from '@/components/leads/shared';
import toast from 'react-hot-toast';

type FilterKey = 'all' | 'highIntent' | 'notContacted';

export default function LeadsPage() {
  const { programs, currentProgramId: programId, currentProgram, loading: programsLoading } = useCurrentProgram();
  const [leads, setLeads] = useState<ProgramEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  // Filtres dynamiques sur les réponses du formulaire : fieldId → valeur sélectionnée.
  const [formFilters, setFormFilters] = useState<Record<string, string>>({});
  const [selectedLead, setSelectedLead] = useState<ProgramEnrollment | null>(null);
  // Partage public
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareLoading, setShareLoading] = useState(false);

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

  useEffect(() => {
    if (programId) loadLeads(programId);
    else if (!programsLoading) setLoading(false);
    // Reset des filtres quand on change de programme (les champs custom diffèrent).
    setFormFilters({});
    setSearch('');
    setFilter('all');
  }, [programId, programsLoading, loadLeads]);

  const programName = currentProgram?.name ?? '';

  // Champs du formulaire filtrables : ceux à choix fermé (valeur exacte).
  const filterableFields = useMemo(
    () => (currentProgram?.endForm?.fields ?? []).filter(
      (f) => f.type === 'select' || f.type === 'radio' || f.type === 'multi_select'
    ),
    [currentProgram]
  );

  const stats = useMemo(() => {
    const total = leads.length;
    const qualified = leads.filter((l) => (l.formData?.applicationIntent ?? 0) >= 7).length;
    const contacted = leads.filter((l) => l.leadStatus === 'contacted' || l.leadStatus === 'converted').length;
    const converted = leads.filter((l) => l.leadStatus === 'converted').length;
    return { total, qualified, contacted, converted };
  }, [leads]);

  const filtered = useMemo(() => {
    let out = leads;

    // Filtre rapide (statut / intention).
    if (filter === 'highIntent') out = out.filter((l) => (l.formData?.applicationIntent ?? 0) >= 7);
    else if (filter === 'notContacted') out = out.filter((l) => !l.leadStatus || l.leadStatus === 'new');

    // Recherche texte sur nom / email / téléphone.
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((l) => {
        const fd = l.formData;
        return [fd?.fullName, fd?.email, fd?.phone].some((v) => (v ?? '').toLowerCase().includes(q));
      });
    }

    // Filtres dynamiques sur les réponses du formulaire.
    const activeFormFilters = Object.entries(formFilters).filter(([, v]) => v);
    if (activeFormFilters.length) {
      out = out.filter((l) =>
        activeFormFilters.every(([fieldId, value]) => {
          const resp = l.formData?.customResponses?.[fieldId];
          if (Array.isArray(resp)) return resp.map(String).includes(value);
          return resp != null && String(resp) === value;
        })
      );
    }

    return out;
  }, [leads, filter, search, formFilters]);
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
      if (programId) loadLeads(programId);
    }
  };

  const authHeader = async (): Promise<HeadersInit> => {
    const token = await auth.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  };

  const openShare = async () => {
    if (!programId) return;
    setShareOpen(true);
    setShareLoading(true);
    setShareUrl('');
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({ programId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Génération impossible');
      setShareUrl(`${window.location.origin}/share/${data.token}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur');
      setShareOpen(false);
    } finally {
      setShareLoading(false);
    }
  };

  const revokeShare = async () => {
    if (!programId) return;
    setShareLoading(true);
    try {
      const res = await fetch(`/api/share?programId=${encodeURIComponent(programId)}`, {
        method: 'DELETE',
        headers: await authHeader(),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Révocation impossible');
      toast.success('Lien révoqué');
      setShareOpen(false);
      setShareUrl('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur');
    } finally {
      setShareLoading(false);
    }
  };

  const copyShareUrl = () => {
    navigator.clipboard.writeText(shareUrl).then(() => toast.success('Lien copié'));
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
    a.download = `leads-${programId ?? 'export'}.csv`;
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
          <button className="btn-secondary flex items-center gap-2" onClick={openShare} disabled={!programId}>
            <Share2 size={16} /> Partager
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={exportCsv} disabled={filtered.length === 0}>
            <Download size={16} /> Exporter CSV
          </button>
        </div>
      </div>

      {/* Filtres rapides + recherche */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
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
        <div className="flex items-center gap-2" style={{ marginLeft: 'auto', position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, color: 'var(--color-text-muted)' }} />
          <input
            className="input-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher nom, email, téléphone…"
            style={{ paddingLeft: 32, minWidth: 240 }}
          />
        </div>
      </div>

      {/* Filtres dynamiques sur les réponses du formulaire */}
      {filterableFields.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap items-center">
          {filterableFields.map((f) => (
            <select
              key={f.id}
              className="input-field"
              value={formFilters[f.id] ?? ''}
              onChange={(e) => setFormFilters((prev) => ({ ...prev, [f.id]: e.target.value }))}
              style={{ maxWidth: 220, fontSize: 13 }}
            >
              <option value="">{f.label} : tous</option>
              {(f.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ))}
          {Object.values(formFilters).some(Boolean) && (
            <button
              onClick={() => setFormFilters({})}
              className="btn-secondary flex items-center gap-1.5"
              style={{ padding: '6px 12px', fontSize: 13 }}
            >
              <X size={13} /> Réinitialiser
            </button>
          )}
        </div>
      )}

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
          programId={programId ?? ''}
          fieldLabels={fieldLabels}
          consentLabels={consentLabels}
          onClose={() => setSelectedLead(null)}
          onStatus={(s) => setStatus(selectedLead, s)}
        />
      )}

      {/* Modal de partage public */}
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Partager le suivi des joueurs">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Toute personne disposant de ce lien pourra consulter (en lecture seule) la liste des joueurs de
            <strong> {programName}</strong> et leur progression, sans avoir à se connecter.
          </p>
          {shareLoading && !shareUrl ? (
            <div className="flex items-center justify-center py-4"><LoadingSpinner /></div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <input className="input-field" value={shareUrl} readOnly style={{ flex: 1, fontSize: 13 }} onFocus={(e) => e.target.select()} />
                <button className="btn-primary" onClick={copyShareUrl} disabled={!shareUrl} style={{ whiteSpace: 'nowrap' }}>
                  Copier
                </button>
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                Ce lien contient des données nominatives (nom, email, téléphone). Révoquez-le dès qu'il n'est plus nécessaire.
              </p>
              <button
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                onClick={revokeShare}
                disabled={shareLoading}
                style={{ background: 'rgba(244,67,54,0.08)', color: '#F44336', border: 'none', cursor: 'pointer', fontSize: 13, alignSelf: 'flex-start' }}
              >
                <X size={14} /> Révoquer ce lien
              </button>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

function UserCheckIcon() {
  return <Target size={48} />;
}
