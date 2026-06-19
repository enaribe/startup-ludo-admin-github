'use client';

import { useEffect, useState } from 'react';
import { Bell, Search, Monitor, Smartphone, ChevronDown } from 'lucide-react';
import { getPrograms, getProgramsByOwner } from '@/lib/firestore-service';
import { useAuth } from '@/lib/auth-context';
import type { PartnerProgram } from '@/types';

export default function Header() {
  const { admin, isSuperAdmin } = useAuth();
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [view, setView] = useState<'backoffice' | 'player'>('backoffice');

  useEffect(() => {
    (async () => {
      try {
        const list = isSuperAdmin ? await getPrograms() : admin?.uid ? await getProgramsByOwner(admin.uid) : [];
        setPrograms(list);
      } catch { /* silencieux */ }
    })();
  }, [isSuperAdmin, admin?.uid]);

  const current = programs[0];
  const initials = (admin?.displayName ?? 'A').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <header className="flex items-center justify-between px-6 py-3" style={{
      borderBottom: '1px solid var(--color-card-border)',
      background: 'rgba(255, 255, 255, 0.9)',
      backdropFilter: 'blur(12px)',
    }}>
      {/* Sélecteur de programme */}
      <button className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: '#FFFFFF', border: '1px solid var(--color-card-border)', cursor: 'pointer' }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,188,64,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--color-primary-dark)' }}>
          {(current?.name ?? 'P').slice(0, 3).toUpperCase()}
        </div>
        <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{current?.name ?? 'Programme'}</p>
          <p style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{current?.subtitle ?? 'Plateforme programme'}</p>
        </div>
        <ChevronDown size={14} color="var(--color-text-muted)" />
      </button>

      {/* Recherche */}
      <div className="relative" style={{ flex: 1, maxWidth: 480, margin: '0 24px' }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
        <input
          type="text"
          placeholder="Rechercher leads, cartes, personas..."
          className="input-field"
          style={{ paddingLeft: 38, width: '100%', fontSize: 13, height: 38 }}
        />
        <kbd style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--color-text-muted)', border: '1px solid var(--color-card-border)', borderRadius: 4, padding: '1px 6px' }}>⌘K</kbd>
      </div>

      <div className="flex items-center gap-3">
        {/* Toggle Back-office / App joueur */}
        <div className="flex items-center" style={{ background: 'var(--color-surface)', borderRadius: 10, padding: 3 }}>
          <button onClick={() => setView('backoffice')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ border: 'none', cursor: 'pointer', fontSize: 12, background: view === 'backoffice' ? '#FFFFFF' : 'transparent', boxShadow: view === 'backoffice' ? '0 1px 2px rgba(12,36,62,0.08)' : 'none', color: view === 'backoffice' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
            <Monitor size={14} /> Back-office
          </button>
          <button onClick={() => setView('player')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ border: 'none', cursor: 'pointer', fontSize: 12, background: view === 'player' ? '#FFFFFF' : 'transparent', boxShadow: view === 'player' ? '0 1px 2px rgba(12,36,62,0.08)' : 'none', color: view === 'player' ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
            <Smartphone size={14} /> App joueur
          </button>
        </div>

        <button className="relative p-2 rounded-lg" style={{ background: '#FFFFFF', border: '1px solid var(--color-card-border)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
          <Bell size={16} />
        </button>

        {/* Profil admin */}
        <div className="flex items-center gap-2.5">
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,188,64,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--color-primary-dark)' }}>
            {initials}
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{admin?.displayName ?? 'Admin'}</p>
            <p style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{isSuperAdmin ? 'Super Admin' : 'Admin'}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
