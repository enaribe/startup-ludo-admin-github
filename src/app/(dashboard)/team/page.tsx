'use client';

import { useState } from 'react';
import { UserPlus, Shield, Eye, Pencil, Mail } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';

type Role = 'owner' | 'editor' | 'viewer';

const ROLE_META: Record<Role, { label: string; desc: string; color: string; icon: React.ReactNode }> = {
  owner: { label: 'Propriétaire', desc: 'Accès complet au programme', color: '#FFBC40', icon: <Shield size={14} /> },
  editor: { label: 'Éditeur', desc: 'Peut créer et modifier le contenu', color: '#5B8DEF', icon: <Pencil size={14} /> },
  viewer: { label: 'Lecture', desc: 'Consultation seule (stats, leads)', color: '#3FAE6B', icon: <Eye size={14} /> },
};

interface Member {
  id: string;
  name: string;
  email: string;
  role: Role;
  pending?: boolean;
}

export default function TeamPage() {
  const { admin } = useAuth();
  // L'admin connecté est le propriétaire ; les membres invités sont locaux (stub démo).
  const [members, setMembers] = useState<Member[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('editor');

  const owner: Member = {
    id: admin?.uid ?? 'me',
    name: admin?.displayName ?? 'Vous',
    email: admin?.email ?? '',
    role: 'owner',
  };

  const invite = () => {
    if (!email.trim()) { toast.error('Email requis'); return; }
    // Stub démo : l'invitation réelle (envoi email + création compte) sera branchée plus tard.
    setMembers((prev) => [...prev, { id: `m_${Date.now()}`, name: email.split('@')[0], email: email.trim(), role, pending: true }]);
    toast.success('Invitation enregistrée (démo — envoi email à brancher)');
    setShowInvite(false);
    setEmail('');
    setRole('editor');
  };

  const all = [owner, ...members];

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>Équipe & rôles</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>Gérez les membres ayant accès à ce programme</p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => setShowInvite(true)}>
          <UserPlus size={16} /> Inviter un membre
        </button>
      </div>

      <div className="glass-card" style={{ overflow: 'hidden' }}>
        {all.map((m, i) => {
          const meta = ROLE_META[m.role];
          return (
            <div key={m.id} className="flex items-center justify-between p-4" style={{ borderTop: i > 0 ? '1px solid var(--color-card-border)' : 'none' }}>
              <div className="flex items-center gap-3">
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,188,64,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#FFBC40' }}>
                  {(m.name || m.email).charAt(0).toUpperCase()}
                </div>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {m.name} {m.pending && <span style={{ fontSize: 11, color: '#F5A623' }}>· en attente</span>}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{m.email}</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5" style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: meta.color, background: `${meta.color}1f` }}>
                {meta.icon} {meta.label}
              </span>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 14 }}>
        L’envoi d’invitations par email et la gestion fine des permissions seront activés prochainement.
      </p>

      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Inviter un membre">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 5 }}>Email</label>
            <div className="relative">
              <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
              <input className="input-field" style={{ paddingLeft: 36 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="collegue@cjs.sn" />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Rôle</label>
            <div className="flex flex-col gap-2">
              {(['editor', 'viewer'] as Role[]).map((r) => (
                <label key={r} className="flex items-center gap-3 p-3 rounded-lg" style={{ cursor: 'pointer', border: `1px solid ${role === r ? ROLE_META[r].color : 'var(--color-card-border)'}`, background: role === r ? `${ROLE_META[r].color}12` : 'transparent' }}>
                  <input type="radio" checked={role === r} onChange={() => setRole(r)} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{ROLE_META[r].label}</p>
                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{ROLE_META[r].desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <button className="btn-primary" onClick={invite}>Envoyer l’invitation</button>
        </div>
      </Modal>
    </div>
  );
}
