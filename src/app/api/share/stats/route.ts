/**
 * Share Stats API — token de partage public des statistiques GLOBALES.
 * Réservé au super admin. Le token est stocké dans le doc `sharedStats/global`.
 *
 *  POST   /api/share/stats   → génère (ou réutilise) le token de partage
 *  DELETE /api/share/stats   → révoque le partage
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';

const SUPER_ADMIN_EMAIL = 'startupludo@concree.com';
const SHARED_STATS_DOC = 'sharedStats/global';

async function requireSuperAdmin(req: NextRequest): Promise<boolean> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return false;
  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    return decoded.super_admin === true || decoded.email === SUPER_ADMIN_EMAIL;
  } catch {
    return false;
  }
}

/** Token URL-safe (24 octets hex). */
function generateToken(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: NextRequest) {
  if (!(await requireSuperAdmin(req))) {
    return NextResponse.json({ error: 'Accès réservé au super administrateur.' }, { status: 403 });
  }

  try {
    const db = getAdminFirestore();
    const ref = db.doc(SHARED_STATS_DOC);
    const snap = await ref.get();

    const existing = snap.exists ? (snap.data()?.shareToken as string | undefined) : undefined;
    const token = existing || generateToken();
    if (!existing) {
      await ref.set({ shareToken: token, updatedAt: Date.now() }, { merge: true });
    }

    return NextResponse.json({ token });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Génération impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await requireSuperAdmin(req))) {
    return NextResponse.json({ error: 'Accès réservé au super administrateur.' }, { status: 403 });
  }

  try {
    const db = getAdminFirestore();
    await db.doc(SHARED_STATS_DOC).set({ shareToken: null, updatedAt: Date.now() }, { merge: true });
    return NextResponse.json({ revoked: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Révocation impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
