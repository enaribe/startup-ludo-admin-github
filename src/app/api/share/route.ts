/**
 * Share API — gestion du token de partage public d'un programme.
 *
 * Sécurité : requête authentifiée (ID token Firebase de l'admin dans
 * `Authorization: Bearer <idToken>`). L'appelant doit pouvoir gérer le programme :
 *   - super_admin   : tout programme
 *   - partner_admin : programmes de son partenaire
 *   - admin         : le programme dont il est ownerId
 *
 *  POST   /api/share   { programId }  → génère (ou réutilise) le token de partage
 *  DELETE /api/share?programId=...    → révoque le partage
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

async function requireAdmin(req: NextRequest): Promise<Caller | null> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    const isSuper = decoded.super_admin === true || decoded.email === SUPER_ADMIN_EMAIL;
    const isPartner = decoded.partner_admin === true;
    const isProgramAdmin = decoded.admin === true;
    if (!isSuper && !isPartner && !isProgramAdmin) return null;
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

/** Vérifie que l'appelant peut gérer ce programme. */
async function canManageProgram(caller: Caller, program: FirebaseFirestore.DocumentData): Promise<boolean> {
  if (caller.isSuper) return true;
  if (caller.isPartner) return !!program.partnerId && program.partnerId === caller.partnerId;
  return program.ownerId === caller.uid;
}

/** Token URL-safe (sans dépendance externe ; collision négligeable sur 24 octets). */
function generateToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  try {
    const { programId } = await req.json();
    if (!programId) return NextResponse.json({ error: 'programId requis' }, { status: 400 });

    const db = getAdminFirestore();
    const ref = db.collection(COLLECTIONS.programs).doc(programId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Programme introuvable.' }, { status: 404 });

    const program = snap.data()!;
    if (!(await canManageProgram(caller, program))) {
      return NextResponse.json({ error: 'Ce programme ne fait pas partie de votre périmètre.' }, { status: 403 });
    }

    // Réutilise le token existant pour conserver un lien stable.
    const token = (program.shareToken as string | undefined) || generateToken();
    if (!program.shareToken) {
      await ref.set({ shareToken: token, updatedAt: Date.now() }, { merge: true });
    }

    return NextResponse.json({ token });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Génération impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  try {
    const programId = new URL(req.url).searchParams.get('programId');
    if (!programId) return NextResponse.json({ error: 'programId requis' }, { status: 400 });

    const db = getAdminFirestore();
    const ref = db.collection(COLLECTIONS.programs).doc(programId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Programme introuvable.' }, { status: 404 });

    if (!(await canManageProgram(caller, snap.data()!))) {
      return NextResponse.json({ error: 'Ce programme ne fait pas partie de votre périmètre.' }, { status: 403 });
    }

    await ref.set({ shareToken: null, updatedAt: Date.now() }, { merge: true });
    return NextResponse.json({ revoked: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Révocation impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
