'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Plus, Download, Pencil, Trash2, User } from 'lucide-react';
import { getScopedPrograms, getProgram, saveProgram, getEnrollmentsByProgram } from '@/lib/firestore-service';
import { generateId } from '@/lib/utils';
import type { PartnerProgram, ProgramProfile, ProgramEnrollment } from '@/types';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import ImageUploadField from '@/components/ui/ImageUploadField';
import toast from 'react-hot-toast';

type Tab = 'active' | 'draft';

function emptyProfile(): ProgramProfile {
  return { id: `profile_${generateId()}`, name: '', age: 25, description: '', location: '', sector: '', avatarUrl: '', status: '', tokens: 0, enabled: true, isDraft: false };
}

export default function PersonasPage() {
  const { isSuperAdmin, admin } = useAuth();
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [programId, setProgramId] = useState('');
  const [profiles, setProfiles] = useState<ProgramProfile[]>([]);
  const [enrollments, setEnrollments] = useState<ProgramEnrollment[]>([]);
  const [totalLevels, setTotalLevels] = useState(1);
  const [tab, setTab] = useState<Tab>('active');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ProgramProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProgramProfile | null>(null);

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

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const [prog, enr] = await Promise.all([getProgram(id), getEnrollmentsByProgram(id)]);
      setProfiles(prog?.profiles ?? []);
      setTotalLevels(Math.max(1, prog?.contentPacks?.length ?? 1));
      setEnrollments(enr);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (programId) load(programId); }, [programId, load]);

  const program = programs.find((p) => p.id === programId);

  // Persiste la liste de profils sur le programme.
  const persist = async (next: ProgramProfile[]) => {
    const prog = await getProgram(programId);
    if (!prog) return;
    const { id: _id, ...rest } = prog;
    void _id;
    await saveProgram(programId, { ...rest, profiles: next });
    setProfiles(next);
  };

  const toggleEnabled = async (p: ProgramProfile) => {
    const next = profiles.map((x) => (x.id === p.id ? { ...x, enabled: !(x.enabled !== false) } : x));
    setProfiles(next);
    try { await persist(next); } catch { toast.error('Erreur'); load(programId); }
  };

  const saveProfile = async (p: ProgramProfile) => {
    const exists = profiles.some((x) => x.id === p.id);
    const next = exists ? profiles.map((x) => (x.id === p.id ? p : x)) : [...profiles, p];
    try {
      await persist(next);
      toast.success(exists ? 'Persona mis à jour' : 'Persona créé');
      setEditing(null);
    } catch {
      toast.error('Erreur lors de l’enregistrement');
    }
  };

  const removeProfile = async () => {
    if (!deleteTarget) return;
    const next = profiles.filter((x) => x.id !== deleteTarget.id);
    try {
      await persist(next);
      toast.success('Persona supprimé');
    } catch {
      toast.error('Erreur');
    } finally {
      setDeleteTarget(null);
    }
  };

  // KPI par persona depuis les enrollments.
  const kpi = useCallback((profileId: string) => {
    const players = enrollments.filter((e) => e.profileId === profileId);
    const n = players.length;
    const completion = n > 0 ? Math.round((players.filter((e) => (e.completedLevels ?? 0) >= totalLevels).length / n) * 100) : 0;
    const conversion = n > 0 ? Math.round((players.filter((e) => e.leadStatus === 'converted').length / n) * 100) : 0;
    return { players: n, completion, conversion };
  }, [enrollments, totalLevels]);

  const active = useMemo(() => profiles.filter((p) => !p.isDraft), [profiles]);
  const drafts = useMemo(() => profiles.filter((p) => p.isDraft), [profiles]);
  const shown = tab === 'active' ? active : drafts;

  if (loading && programs.length === 0) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  if (programs.length === 0) {
    return <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucun programme accessible.</div>;
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>Personas {program?.name ? `· ${program.name}` : ''}</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>Gérez la bibliothèque de profils incarnés par vos joueurs</p>
        </div>
        <div className="flex items-center gap-3">
          {isSuperAdmin && programs.length > 1 && (
            <select className="input-field" value={programId} onChange={(e) => setProgramId(e.target.value)} style={{ maxWidth: 200 }}>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button className="btn-secondary flex items-center gap-2" disabled title="Bientôt" style={{ fontSize: 12, opacity: 0.5 }}>
            <Download size={14} /> Importer depuis CONCREE
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={() => setEditing(emptyProfile())}>
            <Plus size={16} /> Créer un persona
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-2 mb-5" style={{ borderBottom: '1px solid var(--color-card-border)' }}>
        {([
          { key: 'active' as Tab, label: `Personas du parcours (${active.length})` },
          { key: 'draft' as Tab, label: `Brouillons (${drafts.length})` },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '10px 4px', marginBottom: -1, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14,
              color: tab === t.key ? '#5B8DEF' : 'var(--color-text-muted)',
              borderBottom: `2px solid ${tab === t.key ? '#5B8DEF' : 'transparent'}`,
              marginRight: 20,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10"><LoadingSpinner /></div>
      ) : shown.length === 0 ? (
        <EmptyState icon={<User size={48} />} title={tab === 'active' ? 'Aucun persona' : 'Aucun brouillon'} description="Créez un persona pour proposer un profil à incarner." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map((p) => {
            const k = kpi(p.id);
            const enabled = p.enabled !== false;
            return (
              <div key={p.id} className="glass-card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {p.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.avatarUrl} alt="" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={22} color="var(--color-text-muted)" /></div>
                    )}
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>{p.name || 'Sans nom'}{p.age ? `, ${p.age}` : ''}</h3>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{[p.description?.split('.')[0], p.location].filter(Boolean).join(' · ')}</p>
                    </div>
                  </div>
                  {!p.isDraft && (
                    <button onClick={() => toggleEnabled(p)} title={enabled ? 'Activé' : 'Désactivé'} style={{ width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: enabled ? '#3FAE6B' : 'var(--color-surface-variant)', position: 'relative', flexShrink: 0 }}>
                      <span style={{ position: 'absolute', top: 3, left: enabled ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {p.sector && <Tag>{p.sector}</Tag>}
                  {p.status && <Tag>{p.status}</Tag>}
                  {p.tokens ? <Tag amber>{p.tokens} jetons</Tag> : null}
                </div>

                <div className="grid grid-cols-3 gap-2 mb-4" style={{ paddingTop: 12, borderTop: '1px solid var(--color-card-border)' }}>
                  <Stat value={k.players.toLocaleString()} label="Joueurs" />
                  <Stat value={`${k.completion}%`} label="Complétion" />
                  <Stat value={`${k.conversion}%`} label="Conversion" />
                </div>

                <div className="flex items-center gap-2">
                  <button className="btn-secondary flex-1 flex items-center justify-center gap-2" onClick={() => setEditing(p)} style={{ padding: '8px 12px', fontSize: 12 }}>
                    <Pencil size={13} /> Modifier
                  </button>
                  <button onClick={() => setDeleteTarget(p)} className="p-2 rounded-lg" style={{ background: 'rgba(244,67,54,0.08)', color: '#F44336', border: 'none', cursor: 'pointer' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal édition / création */}
      {editing && (
        <Modal open onClose={() => setEditing(null)} title={profiles.some((x) => x.id === editing.id) ? 'Modifier le persona' : 'Nouveau persona'}>
          <ProfileForm
            initial={editing}
            storageId={programId}
            onCancel={() => setEditing(null)}
            onSave={saveProfile}
          />
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeProfile}
        title="Supprimer le persona"
        message={`Supprimer "${deleteTarget?.name}" ? Action irréversible.`}
        confirmLabel="Supprimer"
        danger
      />
    </div>
  );
}

function ProfileForm({ initial, storageId, onCancel, onSave }: { initial: ProgramProfile; storageId: string; onCancel: () => void; onSave: (p: ProgramProfile) => void }) {
  const [p, setP] = useState<ProgramProfile>(initial);
  const set = <K extends keyof ProgramProfile>(k: K, v: ProgramProfile[K]) => setP((prev) => ({ ...prev, [k]: v }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <ImageUploadField label="Avatar" value={p.avatarUrl || ''} onChange={(url) => set('avatarUrl', url)} storagePath={`programs/${storageId}/profiles/${p.id}`} aspectRatio="square" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nom"><input className="input-field" value={p.name} onChange={(e) => set('name', e.target.value)} placeholder="Aïssatou" /></Field>
        <Field label="Âge"><input type="number" className="input-field" value={p.age} onChange={(e) => set('age', Number(e.target.value) || 0)} /></Field>
      </div>
      <Field label="Description"><textarea className="input-field" rows={2} value={p.description} onChange={(e) => set('description', e.target.value)} placeholder="Transformatrice de céréales…" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lieu"><input className="input-field" value={p.location} onChange={(e) => set('location', e.target.value)} placeholder="Kaolack" /></Field>
        <Field label="Secteur"><input className="input-field" value={p.sector} onChange={(e) => set('sector', e.target.value)} placeholder="Agroalimentaire" /></Field>
      </div>
      {/* Champs masqués : status et tokens non consommés par le mobile (points fixes côté jeu). Valeurs conservées dans le state via emptyProfile/initial. */}
      <label className="flex items-center gap-3" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={!!p.isDraft} onChange={(e) => set('isDraft', e.target.checked)} />
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Brouillon (non visible côté joueur)</span>
      </label>
      <div className="flex items-center gap-3 mt-2">
        <button className="btn-secondary flex-1" onClick={onCancel}>Annuler</button>
        <button className="btn-primary flex-1" onClick={() => { if (!p.name.trim()) { toast.error('Nom requis'); return; } onSave(p); }}>Enregistrer</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 5 }}>{label}</label>{children}</div>;
}
function Tag({ children, amber }: { children: React.ReactNode; amber?: boolean }) {
  return <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, color: amber ? '#F5A623' : 'var(--color-text-secondary)', background: amber ? 'rgba(245,166,35,0.14)' : 'var(--color-surface)' }}>{children}</span>;
}
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</p>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{label}</p>
    </div>
  );
}
