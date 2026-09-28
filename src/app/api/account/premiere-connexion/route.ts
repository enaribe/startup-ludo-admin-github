/**
 * Account — clôture de l'invitation à la première connexion.
 *
 * Efface `invitedAt` sur le doc `users` de l'APPELANT : la pastille « Invité »
 * de la liste des enseignants disparaît dès que le compte a été pris en main.
 *
 * ═══ POURQUOI UNE ROUTE, ET PAS UNE ÉCRITURE CLIENT ═══
 *
 * Les règles Firestore ne laissent pas un compte écrire librement son doc
 * `users` — c'est ce qui empêche un enseignant de s'auto-délivrer un rôle ou un
 * périmètre. L'Admin SDK écrit donc à sa place, sur le seul champ concerné.
 *
 * ═══ POURQUOI PAS `complete-password-change` ═══
 *
 * Cette route-là est appelée à la fin d'un changement de mot de passe FORCÉ
 * (`mustChangePassword`), un parcours qu'un enseignant invité ne traverse
 * jamais : il définit son mot de passe via le lien Firebase reçu par e-mail,
 * hors de l'application. Sans la route ci-dessous, sa pastille « Invité »
 * resterait affichée pour toujours.
 *
 * Sans effet si le compte n'a pas d'`invitedAt` : appelable à chaque connexion.
 *
 *  POST /api/account/premiere-connexion
 *       Authorization: Bearer <idToken>
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';

export async function POST(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    const userRef = getAdminFirestore().collection(COLLECTIONS.users).doc(decoded.uid);
    const snap = await userRef.get();

    // Rien à faire : ni compte inconnu ni invitation en cours. On répond `ok`
    // plutôt qu'une erreur — l'appelant l'invoque à chaque connexion, sans
    // savoir s'il y a une invitation à clore.
    if (!snap.exists || typeof snap.data()?.invitedAt !== 'number') {
      return NextResponse.json({ ok: true, efface: false });
    }

    await userRef.set(
      { invitedAt: FieldValue.delete(), updatedAt: Date.now() },
      { merge: true }
    );
    return NextResponse.json({ ok: true, efface: true });
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 401 });
  }
}
