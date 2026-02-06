/**
 * Firebase Admin SDK - Server-side only
 * Bypasses Firestore security rules (used for seed, migrations, etc.)
 */

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { join } from 'path';

function loadServiceAccount() {
  const filePath = join(process.cwd(), 'startup-ludo-new-firebase-adminsdk-fbsvc-a0d9e579b8.json');
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

let adminApp: App;

if (getApps().length === 0) {
  const serviceAccount = loadServiceAccount();
  adminApp = initializeApp({
    credential: cert(serviceAccount),
  });
} else {
  adminApp = getApps()[0]!;
}

export const adminFirestore: Firestore = getFirestore(adminApp);
export { adminApp };
