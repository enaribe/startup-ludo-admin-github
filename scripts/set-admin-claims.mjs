/**
 * Pose les custom claims Firebase Auth pour les comptes back-office.
 *
 * Six rôles :
 *   - super_admin         : gère partenaires, programmes et comptes admin (claim super_admin + admin)
 *   - partner_admin       : gère TOUS les programmes d'un partenaire (claim partner_admin + admin + partnerId)
 *   - admin               : gère SON programme uniquement (claim admin, + programId optionnel)
 *   - sponsor             : gère le sponsoring des éditions qui lui sont assignées
 *                           (claim sponsor + admin + editionIds) — accès limité à /sponsoring
 *   - establishment_admin : pilote SON établissement — Mode Classe
 *                           (claim establishment_admin + admin + establishmentId + classIds)
 *   - teacher             : pilote UNIQUEMENT ses classes — Mode Classe
 *                           (claim teacher + admin + establishmentId + classIds)
 *
 * ⚠️ Mode Classe : `admin: true` est posé sur les rôles scolaires par cohérence
 * avec les autres rôles, MAIS les règles Firestore les excluent explicitement de
 * `isAdmin()` — sinon un enseignant hériterait des pleins droits sur les éditions,
 * programmes et partenaires.
 *
 * ⚠️ `classIds` est ORTHOGONAL au rôle : un establishment_admin qui enseigne en a
 * aussi (double rôle, cf. SPEC-MODE-CLASSE §2.2). `--classes` vaut donc pour les
 * deux rôles scolaires.
 *
 * Le script pose AUSSI le doc Firestore users/{uid} (role, displayName,
 * programId/partnerId/editionIds/establishmentId/teachingClassIds) pour que la
 * connexion au dashboard fonctionne (signInAdmin lit ce doc).
 *
 * Prérequis : le service account JSON doit être à la racine du repo admin
 * (startup-ludo-new-firebase-adminsdk-fbsvc-*.json) ou pointé par
 * GOOGLE_APPLICATION_CREDENTIALS.
 *
 * Usage :
 *   # par UID
 *   node scripts/set-admin-claims.mjs --uid <UID> --role super_admin --name "Tools"
 *   node scripts/set-admin-claims.mjs --uid <UID> --role partner_admin --name "CJS Manager" --partner <partnerId>
 *   node scripts/set-admin-claims.mjs --uid <UID> --role admin --name "Awa Diop" --program <programId>
 *   node scripts/set-admin-claims.mjs --uid <UID> --role sponsor --name "ADEPME" --editions agriculture,sante
 *   node scripts/set-admin-claims.mjs --uid <UID> --role establishment_admin --name "Lycée ISM" --establishment ism-dakar
 *   node scripts/set-admin-claims.mjs --uid <UID> --role teacher --name "Awa Diop" --establishment ism-dakar --classes tle-s2,tle-s3
 *
 *   # par email (résolu en UID automatiquement)
 *   node scripts/set-admin-claims.mjs --email tools@concree.com --role super_admin --name "Tools"
 *
 *   # compte inexistant : --password le CRÉE au passage (8 caractères min.)
 *   node scripts/set-admin-claims.mjs --email prof@ism.sn --password "Passe1234" \
 *     --role teacher --name "Awa Diop" --establishment ism-dakar --classes tle-s2
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
  const partner = args.partner ?? null;
  const displayName = args.name ?? null;
  // Périmètre sponsor : --editions accepte une liste séparée par des virgules
  // (ex. --editions agriculture,sante). --edition (singulier) est toléré.
  const editionIds = String(args.editions ?? args.edition ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  // ----- Mode Classe -----
  const establishment = args.establishment ?? null;
  // --classes accepte une liste séparée par des virgules (--classes tle-s2,tle-s3).
  // --classe (singulier) est toléré.
  const classIds = String(args.classes ?? args.classe ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
  const isSchoolRole = role === 'establishment_admin' || role === 'teacher';

  const VALID_ROLES = ['admin', 'super_admin', 'partner_admin', 'sponsor', 'establishment_admin', 'teacher'];
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`--role doit être l'un de : ${VALID_ROLES.join(', ')}.`);
  }
  if (!args.uid && !args.email) {
    throw new Error('Précise --uid <UID> ou --email <email>.');
  }
  if (role === 'admin' && !program) {
    console.warn('⚠️  Rôle admin sans --program : le compte n\'aura aucun programme assigné.');
  }
  if (role === 'partner_admin' && !partner) {
    throw new Error('Rôle partner_admin : --partner <partnerId> est requis.');
  }
  if (role === 'sponsor' && editionIds.length === 0) {
    throw new Error('Rôle sponsor : --editions <id1,id2> est requis.');
  }
  if (isSchoolRole && !establishment) {
    throw new Error(`Rôle ${role} : --establishment <establishmentId> est requis.`);
  }
  if (role === 'teacher' && classIds.length === 0) {
    console.warn('⚠️  Rôle teacher sans --classes : l\'enseignant n\'aura accès à aucune classe.');
  }

  const serviceAccount = JSON.parse(readFileSync(resolveServiceAccountPath(), 'utf8'));

  initializeApp({ credential: cert(serviceAccount) });
  const authAdmin = getAuth();
  const db = getFirestore();

  // Résolution UID. Si le compte n'existe pas encore et qu'un --password est
  // fourni, on le crée : c'est le cas courant pour un compte de test, et pour
  // un enseignant dont l'établissement communique les identifiants de la main
  // à la main (la plateforme n'envoie aucun e-mail).
  let uid = args.uid;
  let email = args.email;
  if (!uid) {
    try {
      const userRecord = await authAdmin.getUserByEmail(email);
      uid = userRecord.uid;
      email = userRecord.email ?? email;
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
      if (!args.password) {
        console.error(
          `❌ Aucun compte Firebase pour ${email}.\n` +
            `   → Ajoutez --password <motdepasse> (8 caractères min.) pour le créer,\n` +
            `     ou créez-le d'abord dans la console Firebase Auth.`
        );
        process.exit(1);
      }
      if (String(args.password).length < 8) {
        console.error('❌ Le mot de passe doit faire au moins 8 caractères.');
        process.exit(1);
      }
      const userRecord = await authAdmin.createUser({
        email,
        password: args.password,
        displayName: displayName || email,
      });
      uid = userRecord.uid;
      console.log(`✅ Compte Firebase créé : ${email}`);
    }
  } else {
    const userRecord = await authAdmin.getUser(uid);
    email = userRecord.email ?? email ?? '';
  }

  // ----- Custom claims -----
  // Tous les rôles portent "admin" (pour les règles isAdmin()).
  // partner_admin porte aussi partnerId dans les claims (exploité par les règles Firestore).
  // Rôles scolaires : establishmentId + classIds DOIVENT être dans le token —
  // les règles Firestore ne peuvent pas lire users/{uid}.
  const claims =
    role === 'super_admin'
      ? { super_admin: true, admin: true }
      : role === 'partner_admin'
        ? { partner_admin: true, admin: true, partnerId: partner }
        : role === 'sponsor'
          ? { sponsor: true, admin: true, editionIds }
          : isSchoolRole
            ? {
                admin: true,
                establishment_admin: role === 'establishment_admin',
                teacher: role === 'teacher',
                establishmentId: establishment,
                // Orthogonal au rôle : posé aussi pour un directeur qui enseigne.
                classIds,
              }
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
  if (role === 'partner_admin') {
    userDoc.partnerId = partner;
  }
  if (role === 'sponsor') {
    userDoc.editionIds = editionIds;
  }
  if (isSchoolRole) {
    userDoc.establishmentId = establishment;
    // Nom du champ Firestore = teachingClassIds (le claim, lui, s'appelle classIds).
    userDoc.teachingClassIds = classIds;
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
