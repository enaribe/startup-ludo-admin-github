/**
 * Admin Authentication
 * Uses Firebase Auth + Firestore role check
 */

import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, firestore, COLLECTIONS } from './firebase';

export type AdminRole = 'admin' | 'super_admin' | 'partner_admin';

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  role: AdminRole;
  /** Programme géré par cet admin (pour role === 'admin'). Absent sinon. */
  programId?: string | null;
  /** Partenaire géré par cet admin (pour role === 'partner_admin'). Absent sinon. */
  partnerId?: string | null;
  /** True tant que l'admin doit changer son mot de passe (1re connexion / reset). */
  mustChangePassword?: boolean;
}

/** Rôles reconnus comme administrateurs autorisés à se connecter à l'admin. */
const ADMIN_ROLES: AdminRole[] = ['admin', 'super_admin', 'partner_admin'];
function isAdminRole(role: string | undefined): role is AdminRole {
  return !!role && (ADMIN_ROLES as string[]).includes(role);
}

/**
 * Sign in with email and password, then verify admin role
 */
export async function signInAdmin(email: string, password: string): Promise<AdminUser> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const user = credential.user;

  // Check admin role in Firestore
  const userDoc = await getDoc(doc(firestore, COLLECTIONS.users, user.uid));

  if (!userDoc.exists()) {
    await firebaseSignOut(auth);
    throw new Error('Compte non trouvé.');
  }

  const userData = userDoc.data();
  const role = userData.role as string | undefined;

  if (!isAdminRole(role)) {
    await firebaseSignOut(auth);
    throw new Error('Accès refusé. Vous n\'êtes pas administrateur.');
  }

  return {
    uid: user.uid,
    email: user.email || email,
    displayName: userData.displayName || 'Admin',
    role,
    programId: (userData.programId as string | undefined) ?? null,
    partnerId: (userData.partnerId as string | undefined) ?? null,
    mustChangePassword: userData.mustChangePassword === true,
  };
}

/**
 * Sign out
 */
export async function signOutAdmin(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Subscribe to auth state changes
 */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

/**
 * Get current admin user data from Firestore
 */
export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    const userDoc = await getDoc(doc(firestore, COLLECTIONS.users, user.uid));
    if (!userDoc.exists()) return null;

    const userData = userDoc.data();
    const role = userData.role as string | undefined;

    if (!isAdminRole(role)) return null;

    return {
      uid: user.uid,
      email: user.email || '',
      displayName: userData.displayName || 'Admin',
      role,
      programId: (userData.programId as string | undefined) ?? null,
      partnerId: (userData.partnerId as string | undefined) ?? null,
      mustChangePassword: userData.mustChangePassword === true,
    };
  } catch {
    return null;
  }
}
