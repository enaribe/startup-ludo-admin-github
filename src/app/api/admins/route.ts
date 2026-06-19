/**
 * Admins API — gestion des comptes admin de programme (super admin uniquement).
 *
 * Sécurité : chaque requête doit porter l'ID token Firebase de l'appelant
 * dans l'en-tête `Authorization: Bearer <idToken>`. Le serveur vérifie que
 * l'appelant est super_admin avant toute opération.
 *
 *  GET    /api/admins            → liste des comptes admin (role admin | super_admin)
 *  POST   /api/admins            → crée un compte admin + claim + doc users + assigne le programme
 *  DELETE /api/admins?uid=...    → révoque le rôle admin (retire claims + role)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';

const SUPER_ADMIN_EMAIL = 'startupludo@concree.com';

/** Vérifie l'ID token et exige le rôle super_admin. Renvoie le token décodé ou null. */
async function requireSuperAdmin(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    const isSuper = decoded.super_admin === true || decoded.email === SUPER_ADMIN_EMAIL;
    return isSuper ? decoded : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const caller = await requireSuperAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  try {
    const db = getAdminFirestore();
    const snap = await db.collection(COLLECTIONS.users).where('role', 'in', ['admin', 'super_admin']).get();
    const admins = snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        email: data.email ?? '',
        displayName: data.displayName ?? '',
        role: data.role ?? 'admin',
        programId: data.programId ?? null,
      };
    });
    return NextResponse.json({ admins });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur de chargement' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const caller = await requireSuperAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  try {
    const body = await req.json();
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    const displayName = (body.displayName ?? '').trim();
    const programId = (body.programId ?? '').trim();

    if (!email || !password || !displayName) {
      return NextResponse.json({ error: 'Email, mot de passe et nom sont requis.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }, { status: 400 });
    }
    if (!programId) {
      return NextResponse.json({ error: 'Un programme à assigner est requis.' }, { status: 400 });
    }

    const auth = getAdminAuth();
    const db = getAdminFirestore();

    // Le programme doit exister.
    const programRef = db.collection(COLLECTIONS.programs).doc(programId);
    const programSnap = await programRef.get();
    if (!programSnap.exists) {
      return NextResponse.json({ error: 'Programme introuvable.' }, { status: 404 });
    }

    // Crée le compte Auth (ou réutilise s'il existe déjà).
    let uid: string;
    try {
      const created = await auth.createUser({ email, password, displayName });
      uid = created.uid;
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'auth/email-already-exists') {
        const existing = await auth.getUserByEmail(email);
        uid = existing.uid;
        await auth.updateUser(uid, { password, displayName });
      } else {
        throw err;
      }
    }

    // Claim admin (permet d'écrire SON programme via les règles).
    await auth.setCustomUserClaims(uid, { admin: true });

    // Doc users/{uid}.
    await db.collection(COLLECTIONS.users).doc(uid).set(
      {
        email,
        displayName,
        role: 'admin',
        programId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    // Assigne le programme à cet admin (ownerId).
    await programRef.set({ ownerId: uid, updatedAt: Date.now() }, { merge: true });

    return NextResponse.json({ uid, email, displayName, role: 'admin', programId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Création impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const caller = await requireSuperAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  try {
    const uid = new URL(req.url).searchParams.get('uid');
    if (!uid) return NextResponse.json({ error: 'uid requis' }, { status: 400 });
    if (uid === caller.uid) {
      return NextResponse.json({ error: 'Vous ne pouvez pas révoquer votre propre accès.' }, { status: 400 });
    }

    const auth = getAdminAuth();
    const db = getAdminFirestore();

    // Retire les claims admin et libère le programme.
    await auth.setCustomUserClaims(uid, { admin: false, super_admin: false });
    const userSnap = await db.collection(COLLECTIONS.users).doc(uid).get();
    const programId = userSnap.exists ? (userSnap.data()?.programId as string | undefined) : undefined;
    await db.collection(COLLECTIONS.users).doc(uid).set(
      { role: 'revoked', programId: null, updatedAt: Date.now() },
      { merge: true }
    );
    if (programId) {
      await db.collection(COLLECTIONS.programs).doc(programId).set(
        { ownerId: null, updatedAt: Date.now() },
        { merge: true }
      );
    }

    return NextResponse.json({ uid, revoked: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Révocation impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
