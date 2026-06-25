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
      return {
        uid: d.id,
        email: data.email ?? '',
        displayName: data.displayName ?? '',
        role: data.role ?? 'admin',
        programId: data.programId ?? null,
        partnerId: data.partnerId ?? null,
      };
    });

    // Un admin de partenaire ne voit que les admins de SES programmes.
    if (caller.isPartner && !caller.isSuper) {
      const partnerProgramIds = await getPartnerProgramIds(caller.partnerId);
      admins = admins.filter((a) => a.role === 'admin' && a.programId && partnerProgramIds.has(a.programId));
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
    const programId = (body.programId ?? '').trim();
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

    // ===== Création d'un admin de programme =====
    if (!programId) return NextResponse.json({ error: 'Un programme à assigner est requis.' }, { status: 400 });

    const programRef = db.collection(COLLECTIONS.programs).doc(programId);
    const programSnap = await programRef.get();
    if (!programSnap.exists) return NextResponse.json({ error: 'Programme introuvable.' }, { status: 404 });

    // Un admin de partenaire ne peut déléguer que sur un programme de SON partenaire.
    if (caller.isPartner && !caller.isSuper) {
      const programPartnerId = programSnap.data()?.partnerId as string | undefined;
      if (!programPartnerId || programPartnerId !== caller.partnerId) {
        return NextResponse.json({ error: 'Ce programme n’appartient pas à votre partenaire.' }, { status: 403 });
      }
    }

    const uid = await upsertAuthUser(email, password, displayName);
    await auth.setCustomUserClaims(uid, { admin: true });
    await db.collection(COLLECTIONS.users).doc(uid).set(
      { email, displayName, role: 'admin', programId, partnerId: null, createdAt: Date.now(), updatedAt: Date.now() },
      { merge: true }
    );
    await programRef.set({ ownerId: uid, updatedAt: Date.now() }, { merge: true });

    return NextResponse.json({ uid, email, displayName, role: 'admin', programId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Création impossible';
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
    const programId = userData?.programId as string | undefined;

    // Un admin de partenaire ne peut révoquer qu'un admin de programme de SON partenaire.
    if (caller.isPartner && !caller.isSuper) {
      if (targetRole !== 'admin' || !programId) {
        return NextResponse.json({ error: 'Action non autorisée.' }, { status: 403 });
      }
      const partnerProgramIds = await getPartnerProgramIds(caller.partnerId);
      if (!partnerProgramIds.has(programId)) {
        return NextResponse.json({ error: 'Cet admin ne dépend pas de votre partenaire.' }, { status: 403 });
      }
    }

    // Retire tous les claims admin et libère le programme éventuel.
    await auth.setCustomUserClaims(uid, { admin: false, super_admin: false, partner_admin: false });
    await db.collection(COLLECTIONS.users).doc(uid).set(
      { role: 'revoked', programId: null, partnerId: null, updatedAt: Date.now() },
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

// ===== Helpers =====

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
