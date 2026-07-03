'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getScopedPrograms } from '@/lib/firestore-service';
import { useAuth } from '@/lib/auth-context';
import type { PartnerProgram } from '@/types';

const STORAGE_KEY = 'admin.currentProgramId';

interface ProgramContextValue {
  /** Programmes accessibles selon le rôle de l'admin. */
  programs: PartnerProgram[];
  /** Programme actuellement sélectionné (partagé par toutes les pages). */
  currentProgramId: string | null;
  currentProgram: PartnerProgram | null;
  /** Change le programme courant (persisté). */
  setCurrentProgramId: (id: string) => void;
  loading: boolean;
  /** Recharge la liste (après création/suppression d'un programme). */
  refresh: () => Promise<void>;
}

const ProgramContext = createContext<ProgramContextValue>({
  programs: [],
  currentProgramId: null,
  currentProgram: null,
  setCurrentProgramId: () => {},
  loading: true,
  refresh: async () => {},
});

export function ProgramProvider({ children }: { children: ReactNode }) {
  const { admin, isSuperAdmin } = useAuth();
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [currentProgramId, setCurrentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!admin) { setPrograms([]); setLoading(false); return; }
    try {
      const list = await getScopedPrograms(admin);
      setPrograms(list);
    } catch {
      // silencieux
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, admin?.uid]);

  // Résout le programme courant : choix persisté s'il est encore accessible,
  // sinon le premier de la liste (fallback si programme supprimé/inaccessible).
  useEffect(() => {
    if (programs.length === 0) { setCurrentId(null); return; }
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const valid = stored && programs.some((p) => p.id === stored) ? stored : programs[0].id;
    setCurrentId(valid);
    if (typeof window !== 'undefined' && valid !== stored) localStorage.setItem(STORAGE_KEY, valid);
  }, [programs]);

  const setCurrentProgramId = (id: string) => {
    setCurrentId(id);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, id);
  };

  const currentProgram = useMemo(
    () => programs.find((p) => p.id === currentProgramId) ?? null,
    [programs, currentProgramId]
  );

  const value: ProgramContextValue = {
    programs,
    currentProgramId,
    currentProgram,
    setCurrentProgramId,
    loading,
    refresh: load,
  };

  return <ProgramContext.Provider value={value}>{children}</ProgramContext.Provider>;
}

export function useCurrentProgram() {
  return useContext(ProgramContext);
}
