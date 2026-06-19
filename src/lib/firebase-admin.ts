/**
 * Firebase Admin SDK - Server-side only
 * Bypasses Firestore security rules (used for seed, migrations, etc.)
 *
 * Credentials:
 * - On Vercel: set FIREBASE_SERVICE_ACCOUNT_KEY (JSON string of the service account file).
 * - Local: place startup-ludo-new-firebase-adminsdk-*.json at project root, or set the env var.
 */

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

function loadServiceAccount(): Record<string, unknown> {
  const envKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (envKey) {
    try {
      return JSON.parse(envKey) as Record<string, unknown>;
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is set but invalid JSON');
    }
  }
  const filePath = join(process.cwd(), 'startup-ludo-new-firebase-adminsdk-fbsvc-a0d9e579b8.json');
  if (!existsSync(filePath)) {
    throw new Error(
      'Firebase Admin: no credentials. Set FIREBASE_SERVICE_ACCOUNT_KEY (JSON string) or add the service account JSON file at project root.'
    );
  }
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

let adminApp: App | null = null;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps()[0];
  if (existing) {
    adminApp = existing as App;
    return adminApp;
  }
  const serviceAccount = loadServiceAccount();
  adminApp = initializeApp({
    credential: cert(serviceAccount as Parameters<typeof cert>[0]),
  });
  return adminApp;
}

export function getAdminFirestore(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

// Lazy ref for backward compatibility: only resolves when first used at runtime (not at build).
let _adminFirestore: Firestore | null = null;
export const adminFirestore = new Proxy({} as Firestore, {
  get(_, prop) {
    if (!_adminFirestore) _adminFirestore = getFirestore(getAdminApp());
    return (_adminFirestore as unknown as Record<string, unknown>)[prop as string];
  },
});

export { getAdminApp as adminApp };
