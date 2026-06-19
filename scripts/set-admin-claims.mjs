/**
 * Pose les custom claims Firebase Auth pour les comptes back-office.
 *
 * Deux rôles :
 *   - super_admin : gère partenaires, programmes et comptes admin (claim super_admin + admin)
 *   - admin       : gère SON programme uniquement (claim admin, + programId optionnel)
 *
 * Le script pose AUSSI le doc Firestore users/{uid} (role, displayName, programId)
 * pour que la connexion au dashboard fonctionne (signInAdmin lit ce doc).
 *
 * Prérequis : le service account JSON doit être à la racine du repo admin
 * (startup-ludo-new-firebase-adminsdk-fbsvc-*.json) ou pointé par
 * GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Usage :
 *   # par UID
 *   node scripts/set-admin-claims.mjs --uid <UID> --role super_admin --name "Tools"
 *   node scripts/set-admin-claims.mjs --uid <UID> --role admin --name "Awa Diop" --program <programId>
 *
 *   # par email (résolu en UID automatiquement)
 *   node scripts/set-admin-claims.mjs --email tools@concree.com --role super_admin --name "Tools"
 *
 * IMPORTANT : après avoir posé un claim, l'utilisateur doit se reconnecter
 * (ou rafraîchir son token) pour que le nouveau claim soit pris en compte.
 */

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// ----- Résolution du service account -----
function resolveServiceAccountPath() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return process.env.GOOGLE_APPLICATION_CREDENTIALS;
  }
  const candidate = readdirSync(repoRoot).find(
    (f) => f.includes('firebase-adminsdk') && f.endsWith('.json')
  );
  if (candidate && existsSync(join(repoRoot, candidate))) {
    return join(repoRoot, candidate);
  }
  throw new Error(
    "Service account introuvable. Place le JSON à la racine du repo admin ou définis GOOGLE_APPLICATION_CREDENTIALS."
  );
}

// ----- Parsing des arguments -----
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key.startsWith('--')) {
      const name = key.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
      args[name] = value;
      if (value !== 'true') i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const role = args.role;
  const program = args.program ?? null;
  const displayName = args.name ?? null;

  if (role !== 'admin' && role !== 'super_admin') {
    throw new Error('--role doit être "admin" ou "super_admin".');
  }
  if (!args.uid && !args.email) {
    throw new Error('Précise --uid <UID> ou --email <email>.');
  }
  if (role === 'admin' && !program) {
    console.warn('⚠️  Rôle admin sans --program : le compte n\'aura aucun programme assigné.');
  }

  const serviceAccount = JSON.parse(readFileSync(resolveServiceAccountPath(), 'utf8'));

  initializeApp({ credential: cert(serviceAccount) });
  const authAdmin = getAuth();
  const db = getFirestore();

  // Résolution UID
  let uid = args.uid;
  let email = args.email;
  if (!uid) {
    const userRecord = await authAdmin.getUserByEmail(email);
    uid = userRecord.uid;
    email = userRecord.email ?? email;
  } else {
    const userRecord = await authAdmin.getUser(uid);
    email = userRecord.email ?? email ?? '';
  }

  // ----- Custom claims -----
  // Un super_admin a aussi le claim "admin" (pour les règles qui utilisent isAdmin()).
  const claims =
    role === 'super_admin'
      ? { super_admin: true, admin: true }
      : { admin: true };

  await authAdmin.setCustomUserClaims(uid, claims);

  // ----- Doc Firestore users/{uid} (lu par signInAdmin) -----
  const userDoc = {
    email: email ?? '',
    displayName: displayName ?? email ?? 'Admin',
    role,
    updatedAt: Date.now(),
  };
  if (role === 'admin') {
    userDoc.programId = program;
  }
  // createdAt seulement à la création, pour respecter isValidUser des règles
  const existing = await db.collection('users').doc(uid).get();
  if (!existing.exists) userDoc.createdAt = Date.now();

  await db.collection('users').doc(uid).set(userDoc, { merge: true });

  console.log('✅ Claims posés :', JSON.stringify(claims));
  console.log('✅ Doc users/%s mis à jour :', uid, JSON.stringify(userDoc));
  console.log('');
  console.log('⚠️  IMPORTANT : l\'utilisateur doit se DÉCONNECTER puis se reconnecter');
  console.log('   au dashboard pour que les nouveaux claims soient actifs.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Erreur :', err.message);
  process.exit(1);
});
