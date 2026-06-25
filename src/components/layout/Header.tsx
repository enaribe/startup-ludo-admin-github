'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getScopedPrograms } from '@/lib/firestore-service';
import { useAuth } from '@/lib/auth-context';
import type { PartnerProgram } from '@/types';

export default function Header() {
  const { admin, isSuperAdmin } = useAuth();
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);

  useEffect(() => {
    (async () => {
      try {
        setPrograms(await getScopedPrograms(admin));
      } catch { /* silencieux */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      <div className="flex items-center gap-3 ml-auto">
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
