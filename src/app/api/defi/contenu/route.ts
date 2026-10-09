/**
 * Enregistrement du contenu de jeu d'un défi.
 *
 *  POST /api/defi/contenu
 *      Authorization: Bearer <idToken super admin>
 *      { id, contenu: { quizzes, duels, fundings, opportunities, challengeEvents } }
 *      → 200 { ok: true, cartes: number }
 *      → 404 si le défi n'existe pas
 *      → 409 si le défi est clos
 *
 * ═══ POURQUOI UNE ROUTE SÉPARÉE DE `/enregistrer` ═══
 *
 * Le contenu peut peser plusieurs dizaines de kilo-octets : le mêler aux champs
 * éditoriaux obligerait à le renvoyer à chaque correction de titre, et un oubli
 * côté client l'effacerait. Deux routes, deux responsabilités.
 *
 * ⚠️ UN DÉFI CLOS NE CHANGE PLUS DE CONTENU. Son champion a été désigné sur une
 * épreuve donnée ; en modifier les cartes après coup rendrait le classement
 * inexplicable.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifierAppelant } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/firebase';

/** Les cinq listes de `GameContentPack`, dans l'ordre du type. */
const LISTES = ['quizzes', 'duels', 'fundings', 'opportunities', 'challengeEvents'] as const;

export async function POST(request: NextRequest) {
  const appelant = await verifierAppelant(request);
  if (!appelant) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }
  if (!appelant.isSuper) {
    return NextResponse.json({ error: 'Réservé au super administrateur.' }, { status: 403 });
  }

  let id = '';
  let brut: Record<string, unknown> = {};
  try {
    const corps = (await request.json()) as { id?: unknown; contenu?: unknown };
    id = String(corps.id ?? '').trim();
    brut = (corps.contenu ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: 'Identifiant du défi requis.' }, { status: 400 });
  }

  /*
    On ne garde QUE les cinq listes connues, et seulement si ce sont des
    tableaux. Écrire le corps tel quel laisserait passer n'importe quel champ
    jusqu'à Firestore — et le mobile, qui lit ce document, n'a pas à se défendre
    contre une forme qu'on contrôle ici.
  */
  const contenu: Record<string, unknown[]> = {};
  let cartes = 0;
  for (const cle of LISTES) {
    const liste = Array.isArray(brut[cle]) ? (brut[cle] as unknown[]) : [];
    contenu[cle] = liste;
    cartes += liste.length;
  }

  if (cartes === 0) {
    return NextResponse.json(
      { error: 'Le contenu est vide — générez les cartes avant d’enregistrer.' },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const ref = db.collection(COLLECTIONS.weeklyChallenges).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Défi introuvable.' }, { status: 404 });
  }
  if (snap.data()?.statut === 'clos') {
    return NextResponse.json(
      { error: 'Ce défi est clos : son contenu ne peut plus changer.' },
      { status: 409 }
    );
  }

  await ref.set({ contenu, majAt: Date.now() }, { merge: true });

  return NextResponse.json({ ok: true, cartes });
}
