/**
 * Lecture publique d'un programme partagé.
 *
 *  GET /api/share/<token>  → { program, leads, sessionsByUser }
 *
 * Pas d'authentification : l'accès est protégé uniquement par le token secret
 * (24 octets aléatoires) stocké sur le programme. Lecture seule.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Lien invalide' }, { status: 400 });

  try {
    const db = getAdminFirestore();

    // Résout le token → programme.
    const progSnap = await db
      .collection(COLLECTIONS.programs)
      .where('shareToken', '==', token)
      .limit(1)
      .get();
    if (progSnap.empty) {
      return NextResponse.json({ error: 'Lien expiré ou révoqué.' }, { status: 404 });
    }
    const progDoc = progSnap.docs[0];
    const p = progDoc.data();
    const programId = progDoc.id;

    // Programme : on n'expose que ce qui est nécessaire à l'affichage.
    const program = {
      id: programId,
      name: p.name ?? '',
      endForm: p.endForm ?? null,
    };

    // Leads (inscriptions avec formulaire).
    const leadsSnap = await db
      .collection(COLLECTIONS.programEnrollments)
      .where('programId', '==', programId)
      .get();
    const leads = leadsSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((e) => (e as { formData?: unknown }).formData != null);

    // Sessions de jeu groupées par joueur (pour le détail).
    const sessSnap = await db
      .collection(COLLECTIONS.programSessions)
      .where('programId', '==', programId)
      .get();
    const sessionsByUser: Record<string, unknown[]> = {};
    sessSnap.docs.forEach((d) => {
      const s = { id: d.id, ...d.data() } as { userId?: string };
      const uid = s.userId ?? '';
      if (!uid) return;
      (sessionsByUser[uid] ??= []).push(s);
    });

    return NextResponse.json({ program, leads, sessionsByUser });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
