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
}

const AuthContext = createContext<AuthContextValue>({
  admin: null,
  loading: true,
  logout: async () => {},
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

  return (
    <AuthContext.Provider value={{ admin, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
