'use client';

/**
 * Auth Context - Provides admin user state across the app
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthChange, getCurrentAdmin, signOutAdmin, type AdminUser } from './auth';

interface AuthContextValue {
  admin: AdminUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  /** Recharge les données de l'admin depuis Firestore (ex. après changement de mot de passe). */
  refreshAdmin: () => Promise<void>;
  /** True si l'admin connecté est super_admin (accès complet). */
  isSuperAdmin: boolean;
  /** True si l'admin connecté gère tous les programmes d'un partenaire. */
  isPartnerAdmin: boolean;
  /** True si l'admin connecté gère un seul programme. */
  isProgramAdmin: boolean;
  /** True si le compte connecté est un sponsor (accès limité à /sponsoring). */
  isSponsor: boolean;
  /** True si le compte connecté pilote un établissement scolaire (Mode Classe). */
  isEstablishmentAdmin: boolean;
  /** True si le compte connecté est un enseignant (Mode Classe). */
  isTeacher: boolean;
  /**
   * True pour l'un OU l'autre des rôles scolaires. Raccourci utile partout où
   * la distinction directeur/enseignant n'importe pas (garde de routes,
   * masquage d'écrans hors Mode Classe).
   */
  isSchoolRole: boolean;
  /** Programme géré (pour un admin de programme), sinon null. */
  scopedProgramId: string | null;
  /** Partenaire géré (pour un admin de partenaire), sinon null. */
  scopedPartnerId: string | null;
  /** Éditions sponsorisées assignées (pour un sponsor), sinon tableau vide. */
  scopedEditionIds: string[];
  /** Établissement de rattachement (pour un rôle scolaire), sinon null. */
  scopedEstablishmentId: string | null;
  /**
   * Classes enseignées par le compte connecté, sinon tableau vide.
   * ⚠️ Orthogonal au rôle : un `establishment_admin` qui enseigne en a aussi.
   * On ne filtre donc PAS sur `isTeacher` (cf. `AdminUser.teachingClassIds`).
   */
  scopedClassIds: string[];
}

const AuthContext = createContext<AuthContextValue>({
  admin: null,
  loading: true,
  logout: async () => {},
  refreshAdmin: async () => {},
  isSuperAdmin: false,
  isPartnerAdmin: false,
  isProgramAdmin: false,
  isSponsor: false,
  isEstablishmentAdmin: false,
  isTeacher: false,
  isSchoolRole: false,
  scopedProgramId: null,
  scopedPartnerId: null,
  scopedEditionIds: [],
  scopedEstablishmentId: null,
  scopedClassIds: [],
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

  const refreshAdmin = async () => {
    const adminData = await getCurrentAdmin();
    setAdmin(adminData);
  };

  const isSuperAdmin = admin?.role === 'super_admin';
  const isPartnerAdmin = admin?.role === 'partner_admin';
  const isProgramAdmin = admin?.role === 'admin';
  const isSponsor = admin?.role === 'sponsor';
  const isEstablishmentAdmin = admin?.role === 'establishment_admin';
  const isTeacher = admin?.role === 'teacher';
  const isSchoolRole = isEstablishmentAdmin || isTeacher;
  const scopedProgramId = isProgramAdmin ? admin?.programId ?? null : null;
  const scopedPartnerId = isPartnerAdmin ? admin?.partnerId ?? null : null;
  const scopedEstablishmentId = isSchoolRole ? admin?.establishmentId ?? null : null;
  // Mémoïsé sur le contenu : évite de re-déclencher les effets des écrans
  // sponsor à chaque rendu (un tableau littéral changerait d'identité).
  const editionIdsKey = (admin?.editionIds ?? []).join('|');
  const scopedEditionIds = useMemo(
    () => (isSponsor ? editionIdsKey.split('|').filter(Boolean) : []),
    [isSponsor, editionIdsKey]
  );
  // Même mémoïsation sur le contenu. Volontairement NON conditionné au rôle :
  // les classes sont orthogonales (un directeur qui enseigne en a aussi).
  const classIdsKey = (admin?.teachingClassIds ?? []).join('|');
  const scopedClassIds = useMemo(() => classIdsKey.split('|').filter(Boolean), [classIdsKey]);

  return (
    <AuthContext.Provider
      value={{ admin, loading, logout, refreshAdmin, isSuperAdmin, isPartnerAdmin, isProgramAdmin, isSponsor, isEstablishmentAdmin, isTeacher, isSchoolRole, scopedProgramId, scopedPartnerId, scopedEditionIds, scopedEstablishmentId, scopedClassIds }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
