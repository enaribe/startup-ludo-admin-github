'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronDown, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useCurrentProgram } from '@/lib/program-context';

// Routes de la section « Catalogue » de la sidebar (gestion globale super-admin).
// Le nom du programme sélectionné n'a de sens que là ; ailleurs on le masque.
const CATALOGUE_ROUTES = ['/partners', '/programs', '/admins'];

export default function Header() {
  const { admin, isSuperAdmin, isSponsor, isEstablishmentAdmin, isTeacher } = useAuth();
  const { programs, currentProgram, currentProgramId, setCurrentProgramId } = useCurrentProgram();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const inCatalogue = CATALOGUE_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'));

  const canSwitch = programs.length > 1;
  const initials = (admin?.displayName ?? 'A').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  // Ferme le menu au clic extérieur.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const label = currentProgram?.name ?? (programs.length ? 'Programme' : 'Aucun programme');
  const badge = (currentProgram?.name ?? 'P').slice(0, 3).toUpperCase();

  return (
    <header className="flex items-center justify-between px-6 py-3" style={{
      borderBottom: '1px solid var(--color-card-border)',
      background: 'rgba(255, 255, 255, 0.9)',
      backdropFilter: 'blur(12px)',
    }}>
      {/* Sélecteur de programme — visible uniquement dans le Catalogue */}
      {inCatalogue && (
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button
          onClick={() => canSwitch && setOpen((v) => !v)}
          className="flex items-center gap-3 px-3 py-2 rounded-xl"
          style={{
            background: '#FFFFFF',
            border: '1px solid var(--color-card-border)',
            cursor: canSwitch ? 'pointer' : 'default',
          }}
        >
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,188,64,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--color-primary-dark)' }}>
            {badge}
          </div>
          <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</p>
            <p style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
              {canSwitch ? `${programs.length} programmes` : (currentProgram?.subtitle ?? 'Programme actif')}
            </p>
          </div>
          {canSwitch && <ChevronDown size={14} color="var(--color-text-muted)" style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />}
        </button>

        {open && canSwitch && (
          <div
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
              minWidth: 260, maxHeight: 360, overflowY: 'auto',
              background: '#FFFFFF', border: '1px solid var(--color-card-border)',
              borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6,
            }}
          >
            {programs.map((p) => {
              const active = p.id === currentProgramId;
              return (
                <button
                  key={p.id}
                  onClick={() => { setCurrentProgramId(p.id); setOpen(false); }}
                  className="flex items-center gap-2 w-full"
                  style={{
                    padding: '9px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: active ? 'var(--color-info-light)' : 'transparent',
                  }}
                >
                  <div style={{ flex: 1, lineHeight: 1.2 }}>
                    <p style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: 'var(--color-text-primary)' }}>{p.name}</p>
                    {p.subtitle && <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{p.subtitle}</p>}
                  </div>
                  {active && <Check size={15} color="var(--color-info)" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      )}

      <div className="flex items-center gap-3 ml-auto">
        {/* Profil admin */}
        <div className="flex items-center gap-2.5">
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,188,64,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--color-primary-dark)' }}>
            {initials}
          </div>
          <div style={{ lineHeight: 1.2 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{admin?.displayName ?? 'Admin'}</p>
            <p style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{isSuperAdmin ? 'Super Admin'
              : isSponsor ? 'Sponsor'
                : isEstablishmentAdmin ? 'Établissement'
                  : isTeacher ? 'Enseignant'
                    : 'Admin'}</p>
          </div>
        </div>
      </div>
    </header>
  );
}
