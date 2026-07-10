'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Rocket, Users, Gamepad2, Plus } from 'lucide-react';
import { getPartners, getPrograms, programOwnerIds } from '@/lib/firestore-service';
import { useAuth } from '@/lib/auth-context';
import type { PartnerProgram, ProgramPartner } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

/** Accueil du super admin : vue globale Startup Ludo (catalogue), sans détail de programme. */
export default function SuperAdminHome() {
  const router = useRouter();
  const { admin } = useAuth();
  const [partners, setPartners] = useState<ProgramPartner[]>([]);
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [p, prog] = await Promise.all([getPartners(), getPrograms()]);
        setPartners(p);
        setPrograms(prog);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  const activePrograms = programs.filter((p) => p.isActive !== false).length;
  const assigned = programs.filter((p) => programOwnerIds(p).length > 0).length;

  return (
    <div>
      <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)' }}>Bonjour {admin?.displayName?.split(' ')[0] ?? ''} 👋</h1>
      <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginTop: 2, marginBottom: 24 }}>
        Vue d’ensemble de la plateforme Startup Ludo
      </p>

      {/* KPI globaux */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card icon={<Building2 size={18} />} color="#5B8DEF" label="Partenaires" value={partners.length} />
        <Card icon={<Rocket size={18} />} color="#3FAE6B" label="Programmes" value={programs.length} />
        <Card icon={<Gamepad2 size={18} />} color="#F5A623" label="Programmes actifs" value={activePrograms} />
        <Card icon={<Users size={18} />} color="#9B59B6" label="Programmes avec admin" value={assigned} />
      </div>

      {/* Actions rapides */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Action title="Créer un partenaire" desc="Ajouter une organisation partenaire" onClick={() => router.push('/partners/new')} />
        <Action title="Créer un programme" desc="Lancer un nouveau parcours" onClick={() => router.push('/programs/new')} />
        <Action title="Créer un espace admin" desc="Assigner un admin à un programme" onClick={() => router.push('/admins')} />
      </div>

      {/* Programmes récents */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>Programmes</h3>
          <button className="btn-secondary flex items-center gap-2" style={{ fontSize: 12 }} onClick={() => router.push('/programs')}>Voir tout</button>
        </div>
        {programs.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Aucun programme. Créez-en un pour commencer.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {programs.slice(0, 6).map((p) => (
              <button key={p.id} onClick={() => router.push(`/programs/${p.id}`)} className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--color-surface)', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div className="flex items-center gap-3">
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.isActive !== false ? '#3FAE6B' : 'var(--color-text-muted)' }} />
                  <span style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{p.name}</span>
                  {programOwnerIds(p).length === 0 && <span style={{ fontSize: 11, color: '#F5A623' }}>· sans admin</span>}
                </div>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{partners.find((x) => x.id === p.partnerId)?.name ?? ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ icon, color, label, value }: { icon: React.ReactNode; color: string; label: string; value: number }) {
  return (
    <div className="glass-card p-5">
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, marginBottom: 12 }}>{icon}</div>
      <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-muted)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-primary)' }}>{value.toLocaleString()}</p>
    </div>
  );
}

function Action({ title, desc, onClick }: { title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="glass-card p-5" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--color-card-border)' }}>
      <div className="flex items-center gap-2 mb-1">
        <Plus size={16} color="#FFBC40" />
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{desc}</p>
    </button>
  );
}
