'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Users, Plus, Trash2, ShieldCheck, Rocket, Building2, Pencil, Handshake, BookOpen } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getScopedPrograms, getPartners, getEditions } from '@/lib/firestore-service';
import type { EditionData, PartnerProgram, ProgramPartner } from '@/types';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';

/** Rôles créables depuis cet écran. « sponsor » est réservé au super admin. */
type NewAdminRole = 'admin' | 'partner_admin' | 'sponsor';

interface AdminAccount {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'super_admin' | 'partner_admin' | 'sponsor';
  /** Programmes gérés (multi). programId (unique) conservé pour rétrocompat. */
  programIds?: string[] | null;
  programId: string | null;
  partnerId: string | null;
  /** Éditions sponsorisées (périmètre d'un compte sponsor). */
  editionIds?: string[] | null;
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
  // Éditions : nécessaires pour assigner un périmètre à un compte sponsor.
  const [editions, setEditions] = useState<EditionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  // form
  const [role, setRole] = useState<NewAdminRole>('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [programIds, setProgramIds] = useState<string[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [editionIds, setEditionIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  // édition (super admin uniquement)
  const [editTarget, setEditTarget] = useState<AdminAccount | null>(null);
  const [editRole, setEditRole] = useState<NewAdminRole>('admin');
  const [editProgramIds, setEditProgramIds] = useState<string[]>([]);
  const [editPartnerId, setEditPartnerId] = useState('');
  const [editEditionIds, setEditEditionIds] = useState<string[]>([]);
  const [editPassword, setEditPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // Réservé au super admin / admin de partenaire.
  useEffect(() => {
    if (!authLoading && !canAccess) router.replace('/programs');
  }, [authLoading, canAccess, router]);

  const load = useCallback(async () => {
    try {
      // Les éditions ne servent qu'au super admin (création de comptes sponsor).
      const [res, progs, parts, eds] = await Promise.all([
        fetch('/api/admins', { headers: await authHeader() }),
        getScopedPrograms(admin),
        isSuperAdmin ? getPartners() : Promise.resolve([] as ProgramPartner[]),
        isSuperAdmin ? getEditions() : Promise.resolve([] as EditionData[]),
      ]);
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
      const data = await res.json();
      setAdmins(data.admins ?? []);
      setPrograms(progs.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      setPartners(parts);
      setEditions(eds.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)));
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
  const editionName = (id: string) => editions.find((e) => e.id === id)?.name ?? id;

  const resetForm = () => {
    setRole('admin');
    setEmail('');
    setPassword('');
    setDisplayName('');
    setProgramIds([]);
    setPartnerId('');
    setEditionIds([]);
  };

  const handleCreate = async () => {
    const wantsPartner = role === 'partner_admin';
    const wantsSponsor = role === 'sponsor';
    // Chaque rôle a sa cible d'assignation : partenaire, éditions ou programmes.
    const assignmentMissing = wantsPartner ? !partnerId : wantsSponsor ? editionIds.length === 0 : programIds.length === 0;
    if (!email.trim() || !password.trim() || !displayName.trim() || assignmentMissing) {
      toast.error(
        wantsPartner ? 'Tous les champs sont requis.'
          : wantsSponsor ? 'Renseignez les infos et sélectionnez au moins une édition.'
            : 'Renseignez les infos et sélectionnez au moins un programme.'
      );
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
            : wantsSponsor
              ? { email, password, displayName, role: 'sponsor', editionIds }
              : { email, password, displayName, role: 'admin', programIds }
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Création impossible');
      toast.success(wantsSponsor ? 'Espace sponsor créé !' : 'Espace admin créé !');
      setShowCreate(false);
      resetForm();
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur');
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (a: AdminAccount) => {
    setEditTarget(a);
    setEditRole(a.role === 'partner_admin' ? 'partner_admin' : a.role === 'sponsor' ? 'sponsor' : 'admin');
    setEditProgramIds(a.programIds ?? (a.programId ? [a.programId] : []));
    setEditPartnerId(a.partnerId ?? '');
    setEditEditionIds(a.editionIds ?? []);
    setEditPassword('');
  };

  const handleSave = async () => {
    if (!editTarget) return;
    const wantsPartner = editRole === 'partner_admin';
    const wantsSponsor = editRole === 'sponsor';
    const assignmentMissing = wantsPartner ? !editPartnerId : wantsSponsor ? editEditionIds.length === 0 : editProgramIds.length === 0;
    if (assignmentMissing) {
      toast.error(
        wantsPartner ? 'Choisissez un partenaire.'
          : wantsSponsor ? 'Sélectionnez au moins une édition.'
            : 'Sélectionnez au moins un programme.'
      );
      return;
    }
    if (editPassword && editPassword.trim().length < 8) {
      toast.error('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = wantsPartner
        ? { uid: editTarget.uid, role: 'partner_admin', partnerId: editPartnerId }
        : wantsSponsor
          ? { uid: editTarget.uid, role: 'sponsor', editionIds: editEditionIds }
          : { uid: editTarget.uid, role: 'admin', programIds: editProgramIds };
      if (editPassword.trim()) body.password = editPassword.trim();

      const res = await fetch('/api/admins', {
        method: 'PATCH',
        headers: await authHeader(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Modification impossible');
      toast.success('Admin mis à jour !');
      setEditTarget(null);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur');
    } finally {
      setSaving(false);
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

  const adminProgramIds = (a: AdminAccount): string[] => a.programIds ?? (a.programId ? [a.programId] : []);

  // Un programme peut être géré par PLUSIEURS admins. On construit, pour chaque
  // programme, la liste des noms d'admins qui le gèrent (affichage « aussi : … »).
  const programCoAdmins = new Map<string, string[]>();
  for (const a of admins) {
    for (const pid of adminProgramIds(a)) {
      const list = programCoAdmins.get(pid) ?? [];
      list.push(a.displayName || a.email);
      programCoAdmins.set(pid, list);
    }
  }

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
          disabled={programs.length === 0 && partners.length === 0 && editions.length === 0}
          title={programs.length === 0 && partners.length === 0 && editions.length === 0 ? 'Créez d’abord un programme, un partenaire ou une édition' : undefined}
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
                    {a.role === 'super_admin' ? <ShieldCheck size={18} color="#FFBC40" />
                      : a.role === 'sponsor' ? <Handshake size={18} color="#FFBC40" />
                        : <Users size={18} color="#FFBC40" />}
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{a.displayName || a.email}</h3>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{a.email}</p>
                  </div>
                </div>
                <span className={`badge ${a.role === 'super_admin' ? 'badge-primary' : a.role === 'partner_admin' ? 'badge-info' : a.role === 'sponsor' ? 'badge-primary' : 'badge-success'}`}>
                  {a.role === 'super_admin' ? 'Super Admin'
                    : a.role === 'partner_admin' ? 'Admin partenaire'
                      : a.role === 'sponsor' ? 'Sponsor'
                        : 'Admin programme'}
                </span>
              </div>
              <div className="flex items-start gap-1.5 mb-4" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {a.role === 'partner_admin' ? (
                  <><Building2 size={13} color="#FFB347" />{partnerName(a.partnerId)}</>
                ) : a.role === 'super_admin' ? (
                  <><Rocket size={13} color="#FFB347" />Accès complet</>
                ) : a.role === 'sponsor' ? (
                  <>
                    <BookOpen size={13} color="#FFB347" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>{(a.editionIds ?? []).map(editionName).join(', ') || 'Aucune édition assignée'}</span>
                  </>
                ) : (
                  <>
                    <Rocket size={13} color="#FFB347" style={{ marginTop: 2, flexShrink: 0 }} />
                    <span>{adminProgramIds(a).map((id) => programName(id)).join(', ') || '—'}</span>
                  </>
                )}
              </div>
              {a.role !== 'super_admin' && (
                <div className="flex items-center gap-2">
                  {isSuperAdmin && (
                    <button
                      onClick={() => openEdit(a)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg"
                      style={{ background: 'rgba(33,150,243,0.08)', color: 'var(--color-info)', border: 'none', cursor: 'pointer', fontSize: 12 }}
                    >
                      <Pencil size={13} />
                      Modifier
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteTarget(a)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: 'rgba(244,67,54,0.08)', color: '#F44336', border: 'none', cursor: 'pointer', fontSize: 12 }}
                  >
                    <Trash2 size={13} />
                    Révoquer l’accès
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nouvel espace admin">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Choix du rôle — réservé au super admin (le partenaire ne crée que des admins programme). */}
          {isSuperAdmin && (
            <Field label="Type de compte">
              <div className="flex gap-2">
                {([
                  { key: 'admin', label: 'Admin programme' },
                  { key: 'partner_admin', label: 'Admin partenaire' },
                  { key: 'sponsor', label: 'Sponsor' },
                ] as { key: NewAdminRole; label: string }[]).map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRole(r.key)}
                    style={{
                      flex: 1, padding: '8px 10px', borderRadius: 10, fontSize: 12.5, cursor: 'pointer',
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
          ) : role === 'sponsor' ? (
            <Field label={`Éditions sponsorisées${editionIds.length ? ` (${editionIds.length})` : ''}`}>
              <EditionMultiSelect editions={editions} selected={editionIds} onChange={setEditionIds} />
            </Field>
          ) : (
            <Field label={`Programmes assignés${programIds.length ? ` (${programIds.length})` : ''}`}>
              <ProgramMultiSelect
                programs={programs}
                selected={programIds}
                onChange={setProgramIds}
                coAdmins={programCoAdmins}
              />
            </Field>
          )}

          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {role === 'partner_admin'
              ? 'L’admin partenaire gérera tous les programmes de ce partenaire et pourra déléguer des admins programme.'
              : role === 'sponsor'
                ? 'Le sponsor n’aura accès qu’à l’espace « Sponsoring » : il y configurera le popup et les cartes des éditions sélectionnées, rien d’autre.'
                : 'L’admin pourra se connecter avec cet email/mot de passe et gérera les programmes sélectionnés.'}
          </p>
          <button className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? 'Création...' : 'Créer le compte'}
          </button>
        </div>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Modifier ${editTarget?.displayName || editTarget?.email || ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Type de compte">
            <div className="flex gap-2">
              {([
                { key: 'admin', label: 'Admin programme' },
                { key: 'partner_admin', label: 'Admin partenaire' },
                { key: 'sponsor', label: 'Sponsor' },
              ] as { key: NewAdminRole; label: string }[]).map((r) => (
                <button
                  key={r.key}
                  onClick={() => setEditRole(r.key)}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 10, fontSize: 12.5, cursor: 'pointer',
                    fontWeight: editRole === r.key ? 600 : 500,
                    border: `1px solid ${editRole === r.key ? 'transparent' : 'var(--color-card-border)'}`,
                    background: editRole === r.key ? 'var(--color-info-light)' : '#FFFFFF',
                    color: editRole === r.key ? 'var(--color-info)' : 'var(--color-text-secondary)',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </Field>

          {editRole === 'partner_admin' ? (
            <Field label="Partenaire assigné">
              <select className="input-field" value={editPartnerId} onChange={(e) => setEditPartnerId(e.target.value)}>
                <option value="">— Choisir un partenaire —</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          ) : editRole === 'sponsor' ? (
            <Field label={`Éditions sponsorisées${editEditionIds.length ? ` (${editEditionIds.length})` : ''}`}>
              <EditionMultiSelect editions={editions} selected={editEditionIds} onChange={setEditEditionIds} />
            </Field>
          ) : (
            <Field label={`Programmes assignés${editProgramIds.length ? ` (${editProgramIds.length})` : ''}`}>
              <ProgramMultiSelect
                programs={programs}
                selected={editProgramIds}
                onChange={setEditProgramIds}
                coAdmins={programCoAdmins}
                currentIds={editTarget ? adminProgramIds(editTarget) : []}
                selfName={editTarget ? (editTarget.displayName || editTarget.email) : undefined}
              />
            </Field>
          )}

          <Field label="Nouveau mot de passe (optionnel, min. 8 caractères)">
            <input
              className="input-field"
              type="text"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              placeholder="Laisser vide pour ne pas changer"
            />
          </Field>

          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            {editRole === 'partner_admin'
              ? 'L’admin partenaire gérera tous les programmes de ce partenaire.'
              : editRole === 'sponsor'
                ? 'Le sponsor ne verra que les éditions cochées. Décocher une édition lui en retire l’accès, sans toucher au sponsoring déjà publié.'
                : 'Un programme peut être géré par plusieurs admins. Décocher retire seulement cet admin ; les autres gestionnaires sont conservés.'}
          </p>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
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

/**
 * Sélection multiple d'éditions par cases à cocher — périmètre d'un compte sponsor.
 * Le statut « sponsorisée » est affiché pour repérer d'un coup d'œil les éditions
 * déjà configurées.
 */
function EditionMultiSelect({
  editions,
  selected,
  onChange,
}: {
  editions: EditionData[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto',
        border: '1px solid var(--color-card-border)', borderRadius: 10, padding: 6,
      }}
    >
      {editions.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: 8 }}>Aucune édition disponible.</p>
      )}
      {editions.map((e) => {
        const checked = selected.includes(e.id);
        return (
          <label
            key={e.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8,
              cursor: 'pointer', fontSize: 13,
              background: checked ? 'var(--color-info-light)' : 'transparent',
              color: 'var(--color-text-primary)',
            }}
          >
            <input type="checkbox" checked={checked} onChange={() => toggle(e.id)} />
            <span style={{ flex: 1 }}>{e.name || e.id}</span>
            {e.sponsor?.enabled && (
              <span style={{ fontSize: 11, color: 'var(--color-success)' }}>sponsorisée</span>
            )}
          </label>
        );
      })}
    </div>
  );
}

/** Sélection multiple de programmes par cases à cocher (multi-admin). */
function ProgramMultiSelect({
  programs,
  selected,
  onChange,
  coAdmins,
  currentIds,
  selfName,
}: {
  programs: PartnerProgram[];
  selected: string[];
  onChange: (ids: string[]) => void;
  /** programId → noms des admins qui le gèrent déjà (pour afficher « aussi : … »). */
  coAdmins: Map<string, string[]>;
  /** Programmes déjà gérés par l'admin en cours d'édition. */
  currentIds?: string[];
  /** Nom de l'admin en cours d'édition (exclu de la liste des co-admins affichée). */
  selfName?: string;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto',
        border: '1px solid var(--color-card-border)', borderRadius: 10, padding: 6,
      }}
    >
      {programs.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: 8 }}>Aucun programme disponible.</p>
      )}
      {programs.map((p) => {
        const checked = selected.includes(p.id);
        // Autres admins gérant déjà ce programme (hors l'admin en cours d'édition).
        const others = (coAdmins.get(p.id) ?? []).filter((n) => n !== selfName);
        return (
          <label
            key={p.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8,
              cursor: 'pointer', fontSize: 13,
              background: checked ? 'var(--color-info-light)' : 'transparent',
              color: 'var(--color-text-primary)',
            }}
          >
            <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} />
            <span style={{ flex: 1 }}>{p.name}</span>
            {others.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }} title={others.join(', ')}>
                aussi&nbsp;: {others.length > 2 ? `${others.slice(0, 2).join(', ')} +${others.length - 2}` : others.join(', ')}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}
