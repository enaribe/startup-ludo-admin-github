'use client';

import { useEffect, useMemo, useState } from 'react';
import { use } from 'react';
import { Target, Search, X } from 'lucide-react';
import type { ProgramEnrollment, ProgramEndForm, ProgramSessionDoc } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { PROFILE_META, MATCH_LABEL, timeAgo, LeadDetail } from '@/components/leads/shared';

interface ShareData {
  program: { id: string; name: string; endForm: ProgramEndForm | null };
  leads: ProgramEnrollment[];
  sessionsByUser: Record<string, ProgramSessionDoc[]>;
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<ProgramEnrollment | null>(null);
  const [search, setSearch] = useState('');
  const [formFilters, setFormFilters] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    fetch(`/api/share/${token}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Lien indisponible');
        return json as ShareData;
      })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Erreur'); });
    return () => { alive = false; };
  }, [token]);

  const program = data?.program;
  const allLeads = useMemo(
    () => (data?.leads ?? []).slice().sort((a, b) => b.enrolledAt - a.enrolledAt),
    [data]
  );

  // Champs du formulaire filtrables (choix fermé).
  const filterableFields = useMemo(
    () => (program?.endForm?.fields ?? []).filter(
      (f) => f.type === 'select' || f.type === 'radio' || f.type === 'multi_select'
    ),
    [program]
  );

  const leads = useMemo(() => {
    let out = allLeads;

    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((l) => {
        const fd = l.formData;
        return [fd?.fullName, fd?.email, fd?.phone].some((v) => (v ?? '').toLowerCase().includes(q));
      });
    }

    const active = Object.entries(formFilters).filter(([, v]) => v);
    if (active.length) {
      out = out.filter((l) =>
        active.every(([fieldId, value]) => {
          const resp = l.formData?.customResponses?.[fieldId];
          if (Array.isArray(resp)) return resp.map(String).includes(value);
          return resp != null && String(resp) === value;
        })
      );
    }

    return out;
  }, [allLeads, search, formFilters]);

  const fieldLabels = useMemo(() => {
    const m = new Map<string, string>();
    program?.endForm?.fields.forEach((f) => m.set(f.id, f.label));
    return m;
  }, [program]);
  const consentLabels = useMemo(() => {
    const m = new Map<string, string>();
    program?.endForm?.consents.forEach((c) => m.set(c.id, c.label));
    return m;
  }, [program]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', padding: 24 }}>
        <div className="glass-card p-8" style={{ textAlign: 'center', maxWidth: 420 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>Lien indisponible</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="mb-4">
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Joueurs · {program?.name}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {leads.length}{leads.length !== allLeads.length ? ` / ${allLeads.length}` : ''} joueur{allLeads.length !== 1 ? 's' : ''} · vue partagée en lecture seule
          </p>
        </div>

        {allLeads.length > 0 && (
          <>
            <div className="flex gap-2 mb-3 flex-wrap items-center">
              <div className="flex items-center gap-2" style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: 10, color: 'var(--color-text-muted)' }} />
                <input
                  className="input-field"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher nom, email, téléphone…"
                  style={{ paddingLeft: 32, minWidth: 260 }}
                />
              </div>
            </div>
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
          </>
        )}

        {leads.length === 0 ? (
          <EmptyState icon={<Target size={48} />} title="Aucun joueur" description={allLeads.length === 0 ? 'Les candidatures apparaîtront ici.' : 'Aucun joueur ne correspond aux filtres.'} />
        ) : (
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--color-surface)', textAlign: 'left' }}>
                  {['Arrivée', 'Joueur', 'Persona', 'Concordance', 'Niveau', 'Parties', 'Profil'].map((h) => (
                    <th key={h} style={{ padding: '12px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-muted)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => {
                  const match = l.formData?.profileMatch ? MATCH_LABEL[l.formData.profileMatch] : null;
                  const profile = l.entrepreneurProfile ? PROFILE_META[l.entrepreneurProfile] : null;
                  return (
                    <tr key={l.id} onClick={() => setSelectedLead(l)} style={{ borderTop: '1px solid var(--color-card-border)', cursor: 'pointer' }}>
                      <td style={{ padding: '12px 14px', color: 'var(--color-text-muted)' }}>{timeAgo(l.enrolledAt)}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--color-text-primary)', fontWeight: 600 }}>{l.formData?.fullName || '—'}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--color-text-secondary)' }}>{l.profileName || '—'}</td>
                      <td style={{ padding: '12px 14px' }}>
                        {match ? <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, color: match.color, background: match.bg }}>{match.label}</span> : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--color-text-primary)', fontWeight: 600 }}>{(l.currentLevel ?? 0) + 1}</td>
                      <td style={{ padding: '12px 14px', color: 'var(--color-text-secondary)' }}>{l.totalSessions ?? 0} ({l.totalWins ?? 0} V)</td>
                      <td style={{ padding: '12px 14px' }}>
                        {profile ? (
                          <span className="flex items-center gap-1.5" style={{ color: profile.color }}>{profile.icon}{profile.label}</span>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedLead && (
        <LeadDetail
          lead={selectedLead}
          programId={program!.id}
          fieldLabels={fieldLabels}
          consentLabels={consentLabels}
          onClose={() => setSelectedLead(null)}
          sessions={data.sessionsByUser[selectedLead.userId] ?? []}
        />
      )}
    </div>
  );
}
