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

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'super_admin';
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

  if (role !== 'admin' && role !== 'super_admin') {
    await firebaseSignOut(auth);
    throw new Error('Accès refusé. Vous n\'êtes pas administrateur.');
  }

  return {
    uid: user.uid,
    email: user.email || email,
    displayName: userData.displayName || 'Admin',
    role: role as 'admin' | 'super_admin',
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

    if (role !== 'admin' && role !== 'super_admin') return null;

    return {
      uid: user.uid,
      email: user.email || '',
      displayName: userData.displayName || 'Admin',
      role: role as 'admin' | 'super_admin',
    };
  } catch {
    return null;
  }
}
