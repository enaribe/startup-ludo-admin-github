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

export type AdminRole =
  | 'admin'
  | 'super_admin'
  | 'partner_admin'
  | 'sponsor'
  // ===== Mode Classe =====
  /** Directeur / responsable d'un établissement scolaire : pilote SON établissement. */
  | 'establishment_admin'
  /** Enseignant : pilote uniquement les classes qui lui sont affectées. */
  | 'teacher';

export interface AdminUser {
  uid: string;
  email: string;
  displayName: string;
  role: AdminRole;
  /** Programme géré par cet admin (pour role === 'admin'). Absent sinon. */
  programId?: string | null;
  /** Partenaire géré par cet admin (pour role === 'partner_admin'). Absent sinon. */
  partnerId?: string | null;
  /**
   * Éditions sponsorisées par ce compte (pour role === 'sponsor'). Sur le modèle
   * de programIds : le périmètre d'un sponsor est une liste d'éditions assignées.
   */
  editionIds?: string[];
  /**
   * Établissement scolaire de rattachement (pour role === 'establishment_admin'
   * ou 'teacher'). Absent pour les autres rôles.
   */
  establishmentId?: string | null;
  /**
   * Classes enseignées par ce compte.
   *
   * ⚠️ Ce champ est **orthogonal au rôle**, contrairement à `programId`,
   * `partnerId` ou `editionIds` qui, eux, ne valent que pour un rôle précis.
   * Un `establishment_admin` peut parfaitement avoir des classes ici : c'est le
   * cas du directeur qui enseigne aussi (double rôle). On ne le conditionne donc
   * JAMAIS au rôle, ni en lecture ici, ni en écriture dans /api/admins — sans
   * quoi le double rôle imposerait une migration vers un `roles[]` et la révision
   * de tous les points de lecture (cf. SPEC-MODE-CLASSE §2.2).
   */
  teachingClassIds?: string[];
  /** True tant que l'admin doit changer son mot de passe (1re connexion / reset). */
  mustChangePassword?: boolean;
  /**
   * COMPTE EN ATTENTE D'ACTIVATION (demande `pending`).
   *
   * Le compte peut se connecter et PARCOURIR son espace, mais n'a AUCUN claim
   * Firebase : toutes ses lectures Firestore sont refusées et ses écrans sont
   * donc vides. C'est voulu — on ne fabrique pas de fausses données pour
   * meubler. L'interface désactive les actions et affiche un bandeau ; les
   * routes API refusent en 403 ; les règles refusent faute de claim.
   *
   * `role` est alors le rôle DEMANDÉ, pas un rôle accordé : il ne sert qu'à
   * choisir l'espace à afficher. Ne jamais s'en servir pour autoriser quoi que
   * ce soit sans vérifier `enAttente` d'abord.
   */
  enAttente?: boolean;
  /** Nom de l'organisation déclarée dans la demande (bandeau d'attente). */
  orgName?: string | null;
  /** Date de dépôt de la demande, en ms (bandeau d'attente). */
  demandeLe?: number | null;
}

/**
 * Espace à présenter à un compte EN ATTENTE, d'après le type de sa demande.
 * Aucun pouvoir attaché : `enAttente` reste vrai et rien n'est autorisé.
 */
const ROLE_DEMANDE: Record<string, AdminRole> = {
  establishment: 'establishment_admin',
  teacher: 'teacher',
  sponsor: 'sponsor',
  partner: 'partner_admin',
};

/** Rôles reconnus comme administrateurs autorisés à se connecter à l'admin. */
const ADMIN_ROLES: AdminRole[] = [
  'admin',
  'super_admin',
  'partner_admin',
  'sponsor',
  'establishment_admin',
  'teacher',
];
function isAdminRole(role: string | undefined): role is AdminRole {
  return !!role && (ADMIN_ROLES as string[]).includes(role);
}

/**
 * Normalise le périmètre d'éditions d'un compte sponsor.
 * Tolérance : accepte `editionIds` (tableau, cas normal) ou `editionId` seul
 * (ancien format / saisie manuelle dans la console Firebase).
 */
function readEditionIds(data: { editionIds?: unknown; editionId?: unknown }): string[] {
  const raw = data.editionIds ?? data.editionId;
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const cleaned = arr.map((v) => String(v).trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

/**
 * Normalise la liste des classes enseignées par un compte (Mode Classe).
 * Même tolérance que `readEditionIds` : accepte `teachingClassIds` (tableau, cas
 * normal), `classIds` (nom du claim, saisie manuelle) ou une valeur unique.
 *
 * Rappel : ce périmètre est orthogonal au rôle (cf. `AdminUser.teachingClassIds`).
 */
function readClassIds(data: { teachingClassIds?: unknown; classIds?: unknown }): string[] {
  const raw = data.teachingClassIds ?? data.classIds;
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const cleaned = arr.map((v) => String(v).trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

/** Demande d'inscription telle qu'écrite par /api/inscription. */
interface DemandeInscription {
  status?: string;
  motif?: string;
  type?: string;
  displayName?: string;
  orgName?: string | null;
  createdAt?: number;
}

/**
 * Demande d'inscription du compte connecté, ou `null`. Lue AVANT le signOut :
 * ou `null` s'il n'y en a pas. Lu AVANT le signOut : la règle Firestore de
 * `signupRequests/{uid}` n'autorise que le propriétaire authentifié.
 */
async function lireDemandeInscription(uid: string): Promise<DemandeInscription | null> {
  try {
    const snap = await getDoc(doc(firestore, COLLECTIONS.signupRequests, uid));
    if (!snap.exists()) return null;
    return snap.data() as DemandeInscription;
  } catch {
    return null;
  }
}

/** Message d'échec pour une demande qui n'ouvre PAS l'espace (refus, absence). */
function messageRefus(demande: DemandeInscription | null): string | null {
  if (!demande) return null;
  if (demande.status === 'rejected') {
    return `Votre demande d’inscription n’a pas été retenue${demande.motif ? ` (motif : ${demande.motif})` : ''}. Vous pouvez soumettre une nouvelle demande depuis la page d’inscription.`;
  }
  return null;
}

/**
 * Construit l'utilisateur « visiteur » d'une demande en attente, ou `null` si
 * la demande n'est pas en attente (refusée, absente, type inconnu).
 */
function visiteurEnAttente(
  uid: string,
  email: string,
  demande: DemandeInscription | null
): AdminUser | null {
  if (!demande || demande.status !== 'pending') return null;
  const role = ROLE_DEMANDE[String(demande.type ?? '')];
  if (!role) return null;
  return {
    uid,
    email,
    displayName: demande.displayName || 'Compte en attente',
    role,
    enAttente: true,
    orgName: demande.orgName ?? null,
    demandeLe: typeof demande.createdAt === 'number' ? demande.createdAt : null,
    // Aucun périmètre : le compte n'a ni claim, ni établissement, ni édition.
    establishmentId: null,
    editionIds: [],
    teachingClassIds: [],
  };
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
    // Pas de fiche : peut-être une demande d'inscription en attente. On ouvre
    // alors l'espace en LECTURE SEULE plutôt que de rejeter la connexion — le
    // candidat découvre son futur espace pendant l'examen de sa demande.
    const demande = await lireDemandeInscription(user.uid);
    const visiteur = visiteurEnAttente(user.uid, user.email || email, demande);
    if (visiteur) return visiteur;
    await firebaseSignOut(auth);
    throw new Error(messageRefus(demande) ?? 'Compte non trouvé.');
  }

  const userData = userDoc.data();
  const role = userData.role as string | undefined;

  if (!isAdminRole(role)) {
    // Même logique : un JOUEUR mobile (base Firebase partagée) qui vient de
    // déposer une demande a une fiche `users` sans rôle admin.
    const demande = await lireDemandeInscription(user.uid);
    const visiteur = visiteurEnAttente(user.uid, user.email || email, demande);
    if (visiteur) return visiteur;
    await firebaseSignOut(auth);
    throw new Error(messageRefus(demande) ?? 'Accès refusé. Vous n\'êtes pas administrateur.');
  }

  return {
    uid: user.uid,
    email: user.email || email,
    displayName: userData.displayName || 'Admin',
    role,
    programId: (userData.programId as string | undefined) ?? null,
    partnerId: (userData.partnerId as string | undefined) ?? null,
    editionIds: readEditionIds(userData),
    establishmentId: (userData.establishmentId as string | undefined) ?? null,
    // Orthogonal au rôle : renseigné quel que soit `role` (double rôle directeur/enseignant).
    teachingClassIds: readClassIds(userData),
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
    // Même repli que `signInAdmin` : sans lui, un compte en attente perdrait sa
    // session au premier rafraîchissement de page.
    if (!userDoc.exists()) {
      return visiteurEnAttente(user.uid, user.email || '', await lireDemandeInscription(user.uid));
    }

    const userData = userDoc.data();
    const role = userData.role as string | undefined;

    if (!isAdminRole(role)) {
      return visiteurEnAttente(user.uid, user.email || '', await lireDemandeInscription(user.uid));
    }

    return {
      uid: user.uid,
      email: user.email || '',
      displayName: userData.displayName || 'Admin',
      role,
      programId: (userData.programId as string | undefined) ?? null,
      partnerId: (userData.partnerId as string | undefined) ?? null,
      editionIds: readEditionIds(userData),
      establishmentId: (userData.establishmentId as string | undefined) ?? null,
      // Orthogonal au rôle : renseigné quel que soit `role` (double rôle directeur/enseignant).
      teachingClassIds: readClassIds(userData),
      mustChangePassword: userData.mustChangePassword === true,
    };
  } catch {
    return null;
  }
}
