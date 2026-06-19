'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Plus, Trash2, ShieldCheck, Rocket } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getPrograms } from '@/lib/firestore-service';
import type { PartnerProgram } from '@/types';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';

interface AdminAccount {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'super_admin';
  programId: string | null;
}

async function authHeader(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

export default function AdminsPage() {
  const router = useRouter();
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  // form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [programId, setProgramId] = useState('');
  const [creating, setCreating] = useState(false);

  // Réservé au super admin.
  useEffect(() => {
    if (!authLoading && !isSuperAdmin) router.replace('/programs');
  }, [authLoading, isSuperAdmin, router]);

  const load = useCallback(async () => {
    try {
      const [res, progs] = await Promise.all([
        fetch('/api/admins', { headers: await authHeader() }),
        getPrograms(),
      ]);
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
      const data = await res.json();
      setAdmins(data.admins ?? []);
      setPrograms(progs.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
    } catch (error) {
      console.error('Failed to load admins:', error);
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) load();
  }, [isSuperAdmin, load]);

  const programName = (id: string | null) =>
    id ? programs.find((p) => p.id === id)?.name ?? id : '—';

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setProgramId('');
  };

  const handleCreate = async () => {
    if (!email.trim() || !password.trim() || !displayName.trim() || !programId) {
      toast.error('Tous les champs sont requis.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admins', {
        method: 'POST',
        headers: await authHeader(),
        body: JSON.stringify({ email, password, displayName, programId }),
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

  if (authLoading || (isSuperAdmin && loading)) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  }
  if (!isSuperAdmin) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {admins.length} compte{admins.length !== 1 ? 's' : ''} back-office
        </p>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => { resetForm(); setShowCreate(true); }}
          disabled={programs.length === 0}
          title={programs.length === 0 ? 'Créez d’abord un programme' : undefined}
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
                <span className={`badge ${a.role === 'super_admin' ? 'badge-primary' : 'badge-success'}`}>
                  {a.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mb-4" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                <Rocket size={13} color="#FFB347" />
                {a.role === 'super_admin' ? 'Accès complet' : programName(a.programId)}
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
          <Field label="Nom de l'admin">
            <input className="input-field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Awa Diop" />
          </Field>
          <Field label="Email">
            <input className="input-field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="awa@cjs.sn" />
          </Field>
          <Field label="Mot de passe (min. 8 caractères)">
            <input className="input-field" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe initial" />
          </Field>
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
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            L’admin pourra se connecter avec cet email/mot de passe et ne gérera que ce programme.
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
