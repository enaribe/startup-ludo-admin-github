'use client';

/**
 * Auth Context - Provides admin user state across the app
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthChange, getCurrentAdmin, signOutAdmin, type AdminUser } from './auth';

interface AuthContextValue {
  admin: AdminUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  /** True si l'admin connecté est super_admin (accès complet). */
  isSuperAdmin: boolean;
  /** True si l'admin connecté gère tous les programmes d'un partenaire. */
  isPartnerAdmin: boolean;
  /** True si l'admin connecté gère un seul programme. */
  isProgramAdmin: boolean;
  /** Programme géré (pour un admin de programme), sinon null. */
  scopedProgramId: string | null;
  /** Partenaire géré (pour un admin de partenaire), sinon null. */
  scopedPartnerId: string | null;
}

const AuthContext = createContext<AuthContextValue>({
  admin: null,
  loading: true,
  logout: async () => {},
  isSuperAdmin: false,
  isPartnerAdmin: false,
  isProgramAdmin: false,
  scopedProgramId: null,
  scopedPartnerId: null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthChange(async (user) => {
      if (user) {
        const adminData = await getCurrentAdmin();
        setAdmin(adminData);
      } else {
        setAdmin(null);
      }
      setLoading(false);
    });

    return unsub;
  }, []);

  const logout = async () => {
    await signOutAdmin();
    setAdmin(null);
  };

  const isSuperAdmin = admin?.role === 'super_admin';
  const isPartnerAdmin = admin?.role === 'partner_admin';
  const isProgramAdmin = admin?.role === 'admin';
  const scopedProgramId = isProgramAdmin ? admin?.programId ?? null : null;
  const scopedPartnerId = isPartnerAdmin ? admin?.partnerId ?? null : null;

  return (
    <AuthContext.Provider
      value={{ admin, loading, logout, isSuperAdmin, isPartnerAdmin, isProgramAdmin, scopedProgramId, scopedPartnerId }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
