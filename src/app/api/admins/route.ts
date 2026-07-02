/**
 * Admins API — gestion des comptes admin.
 *
 * Sécurité : chaque requête porte l'ID token Firebase de l'appelant dans
 * `Authorization: Bearer <idToken>`. Deux profils peuvent appeler :
 *   - super_admin    : peut tout faire (créer admin programme OU admin partenaire).
 *   - partner_admin  : peut créer/révoquer des admins de programme, mais UNIQUEMENT
 *                      pour des programmes de SON partenaire (délégation bornée serveur).
 *
 *  GET    /api/admins            → liste des comptes admin (scopée au partenaire si partner_admin)
 *  POST   /api/admins            → crée un admin (programme ou partenaire) + claims + doc + assignation
 *  PATCH  /api/admins            → modifie un admin (rôle, programme, partenaire, mot de passe)
 *  DELETE /api/admins?uid=...    → révoque un admin (avec contrôle de périmètre)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';

const SUPER_ADMIN_EMAIL = 'startupludo@concree.com';

interface Caller {
  uid: string;
  isSuper: boolean;
  isPartner: boolean;
  partnerId: string | null;
}

/** Vérifie l'ID token et exige un rôle admin (super_admin ou partner_admin). */
async function requireAdmin(req: NextRequest): Promise<Caller | null> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    const isSuper = decoded.super_admin === true || decoded.email === SUPER_ADMIN_EMAIL;
    const isPartner = decoded.partner_admin === true;
    if (!isSuper && !isPartner) return null;
    return {
      uid: decoded.uid,
      isSuper,
      isPartner,
      partnerId: (decoded.partnerId as string | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  try {
    const db = getAdminFirestore();
    const snap = await db.collection(COLLECTIONS.users)
      .where('role', 'in', ['admin', 'super_admin', 'partner_admin'])
      .get();

    let admins = snap.docs.map((d) => {
      const data = d.data();
      const programIds = normalizeIds(data.programIds ?? data.programId);
      return {
        uid: d.id,
        email: data.email ?? '',
        displayName: data.displayName ?? '',
        role: data.role ?? 'admin',
        programIds,
        programId: programIds[0] ?? null, // rétrocompat
        partnerId: data.partnerId ?? null,
      };
    });

    // Un admin de partenaire ne voit que les admins de SES programmes.
    if (caller.isPartner && !caller.isSuper) {
      const partnerProgramIds = await getPartnerProgramIds(caller.partnerId);
      admins = admins.filter((a) => a.role === 'admin' && a.programIds.some((pid) => partnerProgramIds.has(pid)));
    }

    return NextResponse.json({ admins });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur de chargement' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  try {
    const body = await req.json();
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    const displayName = (body.displayName ?? '').trim();
    const role = (body.role ?? 'admin') as 'admin' | 'partner_admin';
    // Multi-programmes : accepte programIds[] (ou programId unique pour rétrocompat).
    const programIds = normalizeIds(body.programIds ?? body.programId);
    const partnerId = (body.partnerId ?? '').trim();

    if (!email || !password || !displayName) {
      return NextResponse.json({ error: 'Email, mot de passe et nom sont requis.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }, { status: 400 });
    }

    // Seul le super admin peut créer un admin de partenaire.
    if (role === 'partner_admin' && !caller.isSuper) {
      return NextResponse.json({ error: 'Seul un super admin peut créer un admin de partenaire.' }, { status: 403 });
    }

    const auth = getAdminAuth();
    const db = getAdminFirestore();

    // ===== Création d'un admin de partenaire =====
    if (role === 'partner_admin') {
      if (!partnerId) return NextResponse.json({ error: 'Un partenaire à assigner est requis.' }, { status: 400 });
      const partnerSnap = await db.collection(COLLECTIONS.partners).doc(partnerId).get();
      if (!partnerSnap.exists) return NextResponse.json({ error: 'Partenaire introuvable.' }, { status: 404 });

      const uid = await upsertAuthUser(email, password, displayName);
      // partnerId dans les claims → exploité par les règles Firestore.
      await auth.setCustomUserClaims(uid, { admin: true, partner_admin: true, partnerId });
      await db.collection(COLLECTIONS.users).doc(uid).set(
        { email, displayName, role: 'partner_admin', partnerId, programId: null, createdAt: Date.now(), updatedAt: Date.now() },
        { merge: true }
      );
      return NextResponse.json({ uid, email, displayName, role, partnerId });
    }

    // ===== Création d'un admin de programme (un ou plusieurs) =====
    if (programIds.length === 0) return NextResponse.json({ error: 'Au moins un programme à assigner est requis.' }, { status: 400 });

    // Vérifie l'existence + le périmètre de CHAQUE programme avant d'écrire quoi que ce soit.
    const programRefs = [];
    for (const pid of programIds) {
      const programRef = db.collection(COLLECTIONS.programs).doc(pid);
      const programSnap = await programRef.get();
      if (!programSnap.exists) return NextResponse.json({ error: `Programme introuvable : ${pid}.` }, { status: 404 });
      if (caller.isPartner && !caller.isSuper) {
        const programPartnerId = programSnap.data()?.partnerId as string | undefined;
        if (!programPartnerId || programPartnerId !== caller.partnerId) {
          return NextResponse.json({ error: 'Un des programmes n’appartient pas à votre partenaire.' }, { status: 403 });
        }
      }
      programRefs.push(programRef);
    }

    const uid = await upsertAuthUser(email, password, displayName);
    await auth.setCustomUserClaims(uid, { admin: true });
    await db.collection(COLLECTIONS.users).doc(uid).set(
      {
        email, displayName, role: 'admin',
        programIds,
        programId: programIds[0], // rétrocompat lecture (anciens consommateurs)
        partnerId: null,
        createdAt: Date.now(), updatedAt: Date.now(),
      },
      { merge: true }
    );
    // Chaque programme reçoit cet admin comme propriétaire unique.
    await Promise.all(programRefs.map((ref) => ref.set({ ownerId: uid, updatedAt: Date.now() }, { merge: true })));

    return NextResponse.json({ uid, email, displayName, role: 'admin', programIds });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Création impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  // Seul le super admin peut éditer un admin (changement de rôle / partenaire
  // dépasse le périmètre délégué d'un admin de partenaire).
  if (!caller.isSuper) {
    return NextResponse.json({ error: 'Seul un super admin peut modifier un admin.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const uid = (body.uid ?? '').trim();
    if (!uid) return NextResponse.json({ error: 'uid requis' }, { status: 400 });
    if (uid === caller.uid) {
      return NextResponse.json({ error: 'Vous ne pouvez pas modifier votre propre compte ici.' }, { status: 400 });
    }

    const auth = getAdminAuth();
    const db = getAdminFirestore();

    const userRef = db.collection(COLLECTIONS.users).doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: 'Admin introuvable.' }, { status: 404 });
    const current = userSnap.data() ?? {};
    const currentRole = (current.role ?? 'admin') as string;
    // Programmes actuels (rétrocompat : programIds[] ou programId unique).
    const currentProgramIds = normalizeIds(current.programIds ?? current.programId);

    if (currentRole === 'super_admin') {
      return NextResponse.json({ error: 'Le super admin ne peut pas être modifié.' }, { status: 400 });
    }

    // Rôle cible : fourni ou inchangé.
    const nextRole = (body.role ?? currentRole) as 'admin' | 'partner_admin';
    if (nextRole !== 'admin' && nextRole !== 'partner_admin') {
      return NextResponse.json({ error: 'Rôle invalide.' }, { status: 400 });
    }

    // Champs d'assignation cibles selon le rôle cible.
    const nextProgramIds = nextRole === 'admin' ? normalizeIds(body.programIds ?? body.programId) : [];
    const nextPartnerId = nextRole === 'partner_admin' ? (body.partnerId ?? '').trim() : '';
    const newPassword = (body.password ?? '').trim();

    if (nextRole === 'admin' && nextProgramIds.length === 0) {
      return NextResponse.json({ error: 'Au moins un programme à assigner est requis.' }, { status: 400 });
    }
    if (nextRole === 'partner_admin' && !nextPartnerId) {
      return NextResponse.json({ error: 'Un partenaire à assigner est requis.' }, { status: 400 });
    }
    if (newPassword && newPassword.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }, { status: 400 });
    }

    // Vérifie l'existence de la/les cible(s) d'assignation.
    if (nextRole === 'admin') {
      for (const pid of nextProgramIds) {
        const programSnap = await db.collection(COLLECTIONS.programs).doc(pid).get();
        if (!programSnap.exists) return NextResponse.json({ error: `Programme introuvable : ${pid}.` }, { status: 404 });
      }
    } else {
      const partnerSnap = await db.collection(COLLECTIONS.partners).doc(nextPartnerId).get();
      if (!partnerSnap.exists) return NextResponse.json({ error: 'Partenaire introuvable.' }, { status: 404 });
    }

    // Réinitialisation du mot de passe (optionnelle).
    if (newPassword) {
      await auth.updateUser(uid, { password: newPassword });
    }

    // Mise à jour des claims selon le rôle cible.
    if (nextRole === 'partner_admin') {
      await auth.setCustomUserClaims(uid, { admin: true, partner_admin: true, partnerId: nextPartnerId });
    } else {
      await auth.setCustomUserClaims(uid, { admin: true });
    }

    // Libère les programmes retirés (présents avant, absents après).
    const nextSet = new Set(nextRole === 'admin' ? nextProgramIds : []);
    const removed = currentProgramIds.filter((pid) => !nextSet.has(pid));
    await Promise.all(removed.map((pid) =>
      db.collection(COLLECTIONS.programs).doc(pid).set({ ownerId: null, updatedAt: Date.now() }, { merge: true })
    ));

    // Assigne les programmes cibles à cet admin.
    if (nextRole === 'admin') {
      await Promise.all(nextProgramIds.map((pid) =>
        db.collection(COLLECTIONS.programs).doc(pid).set({ ownerId: uid, updatedAt: Date.now() }, { merge: true })
      ));
    }

    // Met à jour le doc utilisateur (assignations mutuellement exclusives selon le rôle).
    await userRef.set(
      {
        role: nextRole,
        programIds: nextRole === 'admin' ? nextProgramIds : null,
        programId: nextRole === 'admin' ? nextProgramIds[0] : null, // rétrocompat
        partnerId: nextRole === 'partner_admin' ? nextPartnerId : null,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    return NextResponse.json({
      uid,
      role: nextRole,
      programIds: nextRole === 'admin' ? nextProgramIds : null,
      partnerId: nextRole === 'partner_admin' ? nextPartnerId : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Modification impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  try {
    const uid = new URL(req.url).searchParams.get('uid');
    if (!uid) return NextResponse.json({ error: 'uid requis' }, { status: 400 });
    if (uid === caller.uid) {
      return NextResponse.json({ error: 'Vous ne pouvez pas révoquer votre propre accès.' }, { status: 400 });
    }

    const auth = getAdminAuth();
    const db = getAdminFirestore();

    const userSnap = await db.collection(COLLECTIONS.users).doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : undefined;
    const targetRole = userData?.role as string | undefined;
    const programIds = normalizeIds(userData?.programIds ?? userData?.programId);

    // Un admin de partenaire ne peut révoquer qu'un admin de programme de SON partenaire.
    if (caller.isPartner && !caller.isSuper) {
      if (targetRole !== 'admin' || programIds.length === 0) {
        return NextResponse.json({ error: 'Action non autorisée.' }, { status: 403 });
      }
      const partnerProgramIds = await getPartnerProgramIds(caller.partnerId);
      if (!programIds.some((pid) => partnerProgramIds.has(pid))) {
        return NextResponse.json({ error: 'Cet admin ne dépend pas de votre partenaire.' }, { status: 403 });
      }
    }

    // Retire tous les claims admin et libère tous les programmes gérés.
    await auth.setCustomUserClaims(uid, { admin: false, super_admin: false, partner_admin: false });
    await db.collection(COLLECTIONS.users).doc(uid).set(
      { role: 'revoked', programIds: null, programId: null, partnerId: null, updatedAt: Date.now() },
      { merge: true }
    );
    await Promise.all(programIds.map((pid) =>
      db.collection(COLLECTIONS.programs).doc(pid).set({ ownerId: null, updatedAt: Date.now() }, { merge: true })
    ));

    return NextResponse.json({ uid, revoked: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Révocation impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ===== Helpers =====

/**
 * Normalise une valeur (string | string[] | null) en tableau d'ids nettoyé et dédupliqué.
 * Sert la rétrocompatibilité programId (unique) → programIds (multiple).
 */
function normalizeIds(value: unknown): string[] {
  const arr = Array.isArray(value) ? value : value ? [value] : [];
  const cleaned = arr.map((v) => String(v).trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

/** Crée le compte Auth ou le réutilise s'il existe déjà (met à jour mdp + nom). */
async function upsertAuthUser(email: string, password: string, displayName: string): Promise<string> {
  const auth = getAdminAuth();
  try {
    const created = await auth.createUser({ email, password, displayName });
    return created.uid;
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'auth/email-already-exists') {
      const existing = await auth.getUserByEmail(email);
      await auth.updateUser(existing.uid, { password, displayName });
      return existing.uid;
    }
    throw err;
  }
}

/** Ensemble des ids de programmes appartenant à un partenaire. */
async function getPartnerProgramIds(partnerId: string | null): Promise<Set<string>> {
  if (!partnerId) return new Set();
  const db = getAdminFirestore();
  const snap = await db.collection(COLLECTIONS.programs).where('partnerId', '==', partnerId).get();
  return new Set(snap.docs.map((d) => d.id));
}
