/**
 * Account — finalisation du changement de mot de passe forcé.
 *
 * Appelé par l'admin APRÈS avoir changé son mot de passe côté client
 * (firebase/auth updatePassword). Repasse son propre flag `mustChangePassword`
 * à `false` dans son doc `users` via l'Admin SDK.
 *
 * Sécurité : l'appelant doit porter son ID token Firebase dans
 * `Authorization: Bearer <idToken>`. On ne modifie QUE le doc de l'appelant.
 *
 *  POST /api/account/complete-password-change
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';

export async function POST(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    const uid = decoded.uid;

    const db = getAdminFirestore();
    const userRef = db.collection(COLLECTIONS.users).doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) return NextResponse.json({ error: 'Compte introuvable' }, { status: 404 });

    await userRef.set({ mustChangePassword: false, updatedAt: Date.now() }, { merge: true });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 401 });
  }
}
