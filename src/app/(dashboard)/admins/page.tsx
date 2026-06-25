'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Plus, Trash2, ShieldCheck, Rocket, Building2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getScopedPrograms, getPartners } from '@/lib/firestore-service';
import type { PartnerProgram, ProgramPartner } from '@/types';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';

type NewAdminRole = 'admin' | 'partner_admin';

interface AdminAccount {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'super_admin' | 'partner_admin';
  programId: string | null;
  partnerId: string | null;
}

async function authHeader(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export default function AdminsPage() {
  const router = useRouter();
  const { admin, isSuperAdmin, isPartnerAdmin, loading: authLoading } = useAuth();
  // Le super admin et l'admin de partenaire (délégation) accèdent à cette page.
  const canAccess = isSuperAdmin || isPartnerAdmin;
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [partners, setPartners] = useState<ProgramPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  // form
  const [role, setRole] = useState<NewAdminRole>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [programId, setProgramId] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [creating, setCreating] = useState(false);

  // Réservé au super admin / admin de partenaire.
  useEffect(() => {
    if (!authLoading && !canAccess) router.replace('/programs');
  }, [authLoading, canAccess, router]);

  const load = useCallback(async () => {
    try {
      const [res, progs, parts] = await Promise.all([
        fetch('/api/admins', { headers: await authHeader() }),
        getScopedPrograms(admin),
        isSuperAdmin ? getPartners() : Promise.resolve([] as ProgramPartner[]),
      ]);
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
      const data = await res.json();
      setAdmins(data.admins ?? []);
      setPrograms(progs.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      setPartners(parts);
    } catch (error) {
      console.error('Failed to load admins:', error);
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, admin?.uid]);

  useEffect(() => {
    if (canAccess) load();
  }, [canAccess, load]);

  const programName = (id: string | null) =>
    id ? programs.find((p) => p.id === id)?.name ?? id : '—';
  const partnerName = (id: string | null) =>
    id ? partners.find((p) => p.id === id)?.name ?? id : '—';

  const resetForm = () => {
    setRole('admin');
    setEmail('');
    setPassword('');
    setDisplayName('');
    setProgramId('');
    setPartnerId('');
  };

  const handleCreate = async () => {
    const wantsPartner = role === 'partner_admin';
    if (!email.trim() || !password.trim() || !displayName.trim() || (wantsPartner ? !partnerId : !programId)) {
      toast.error('Tous les champs sont requis.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify(
          wantsPartner
            ? { email, password, displayName, role: 'partner_admin', partnerId }
            : { email, password, displayName, role: 'admin', programId }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Création impossible');
      toast.success('Espace admin créé !');
      setShowCreate(false);
      resetForm();
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admins?uid=${encodeURIComponent(deleteTarget.uid)}`, {
        method: 'DELETE',
        headers: await authHeader(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Révocation impossible');
      toast.success('Accès révoqué');
      setAdmins((prev) => prev.filter((a) => a.uid !== deleteTarget.uid));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  // Programmes déjà assignés (pour éviter de les ré-attribuer par erreur — affichage indicatif).
  const assignedProgramIds = new Set(admins.map((a) => a.programId).filter(Boolean) as string[]);

  if (authLoading || (canAccess && loading)) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  }
  if (!canAccess) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {admins.length} compte{admins.length !== 1 ? 's' : ''} back-office
        </p>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => { resetForm(); setShowCreate(true); }}
          disabled={programs.length === 0 && partners.length === 0}
          title={programs.length === 0 && partners.length === 0 ? 'Créez d’abord un programme ou un partenaire' : undefined}
        >
          <Plus size={16} />
          Créer un espace admin
        </button>
      </div>

      {admins.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title="Aucun compte admin"
          description="Créez le premier espace admin et assignez-lui un programme à gérer."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {admins.map((a) => (
            <div key={a.uid} className="glass-card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,188,64,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {a.role === 'super_admin' ? <ShieldCheck size={18} color="#FFBC40" /> : <Users size={18} color="#FFBC40" />}
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{a.displayName || a.email}</h3>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{a.email}</p>
                  </div>
                </div>
                <span className={`badge ${a.role === 'super_admin' ? 'badge-primary' : a.role === 'partner_admin' ? 'badge-info' : 'badge-success'}`}>
                  {a.role === 'super_admin' ? 'Super Admin' : a.role === 'partner_admin' ? 'Admin partenaire' : 'Admin programme'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mb-4" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {a.role === 'partner_admin'
                  ? <><Building2 size={13} color="#FFB347" />{partnerName(a.partnerId)}</>
                  : <><Rocket size={13} color="#FFB347" />{a.role === 'super_admin' ? 'Accès complet' : programName(a.programId)}</>
                }
              </div>
              {a.role !== 'super_admin' && (
                <button
                  onClick={() => setDeleteTarget(a)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(244,67,54,0.08)', color: '#F44336', border: 'none', cursor: 'pointer', fontSize: 12 }}
                >
                  <Trash2 size={13} />
                  Révoquer l’accès
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nouvel espace admin">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Choix du rôle — réservé au super admin (le partenaire ne crée que des admins programme). */}
          {isSuperAdmin && (
            <Field label="Type d’admin">
              <div className="flex gap-2">
                {([
                  { key: 'admin', label: 'Admin programme' },
                  { key: 'partner_admin', label: 'Admin partenaire' },
                ] as { key: NewAdminRole; label: string }[]).map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRole(r.key)}
                    style={{
                      flex: 1, padding: '8px 12px', borderRadius: 10, fontSize: 13, cursor: 'pointer',
                      fontWeight: role === r.key ? 600 : 500,
                      border: `1px solid ${role === r.key ? 'transparent' : 'var(--color-card-border)'}`,
                      background: role === r.key ? 'var(--color-info-light)' : '#FFFFFF',
                      color: role === r.key ? 'var(--color-info)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Nom de l'admin">
            <input className="input-field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Awa Diop" />
          </Field>
          <Field label="Email">
            <input className="input-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="awa@cjs.sn" />
          </Field>
          <Field label="Mot de passe (min. 8 caractères)">
            <input className="input-field" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe initial" />
          </Field>

          {role === 'partner_admin' ? (
            <Field label="Partenaire assigné">
              <select className="input-field" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                <option value="">— Choisir un partenaire —</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Programme assigné">
              <select className="input-field" value={programId} onChange={(e) => setProgramId(e.target.value)}>
                <option value="">— Choisir un programme —</option>
                {programs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{assignedProgramIds.has(p.id) ? ' (déjà assigné)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {role === 'partner_admin'
              ? 'L’admin partenaire gérera tous les programmes de ce partenaire et pourra déléguer des admins programme.'
              : 'L’admin pourra se connecter avec cet email/mot de passe et ne gérera que ce programme.'}
          </p>
          <button className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? 'Création...' : 'Créer le compte'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Révoquer l’accès"
        message={`Révoquer l’accès de "${deleteTarget?.displayName || deleteTarget?.email}" ? Son programme sera libéré.`}
        confirmLabel="Révoquer"
        danger
        loading={deleting}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
