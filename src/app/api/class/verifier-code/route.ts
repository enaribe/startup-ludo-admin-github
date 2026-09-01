/**
 * Vérification d'unicité d'un code de rattachement.
 *
 * POURQUOI une route serveur : contrôler qu'un code n'est pas déjà actif exige
 * un `where('joinCode', '==', …)` sur la collection `classes` — c'est un
 * LISTING. Or les règles Firestore n'autorisent pas un enseignant à lister les
 * classes : sa permission porte sur l'ID du document (claim `classIds`), pas sur
 * un champ. La requête est donc refusée en bloc depuis son navigateur.
 *
 * L'ouvrir dans les règles serait pire : n'importe quel compte pourrait alors
 * énumérer les classes de tous les établissements en devinant des codes.
 * L'Admin SDK contourne les règles pour ce seul contrôle, et ne renvoie
 * qu'un booléen — aucune donnée de classe ne sort d'ici.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifierAppelant } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  // Réservé aux comptes du back-office : c'est un geste d'enseignant ou de
  // direction, jamais d'élève.
  const appelant = await verifierAppelant(request);
  if (!appelant) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }
  if (!appelant.isSchoolRole && !appelant.isSuper) {
    return NextResponse.json(
      { error: 'Réservé aux enseignants et aux directions d’établissement.' },
      { status: 403 }
    );
  }

  let code = '';
  try {
    const body = (await request.json()) as { code?: unknown };
    code = String(body.code ?? '').trim().toUpperCase();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  if (code.length !== 6) {
    return NextResponse.json({ error: 'Code invalide.' }, { status: 400 });
  }

  const db = getAdminFirestore();

  // ⚠️ DEUX COLLECTIONS, UN SEUL ESPACE DE CODES. Le code de SÉANCE (salle
  // d'attente) et le code de RATTACHEMENT partagent le même alphabet et le même
  // champ de saisie côté élève : un doublon entre les deux enverrait l'élève
  // dans la mauvaise porte. On vérifie donc les deux avant de déclarer un code
  // libre.
  const [classes, seances] = await Promise.all([
    db.collection(COLLECTIONS.classes).where('joinCode', '==', code).limit(1).get(),
    db.collection(COLLECTIONS.classSessions).where('joinCode', '==', code).limit(1).get(),
  ]);

  // Un code n'est « pris » que si sa fenêtre court encore : une classe ou une
  // séance qui a fermé la sienne libère son code pour tout le monde.
  const maintenant = Date.now();
  const encoreActif = (docs: Array<{ data: () => Record<string, unknown> }>) =>
    docs.length > 0 && Number(docs[0]?.data()?.joinCodeExpiresAt ?? 0) > maintenant;

  return NextResponse.json({ actif: encoreActif(classes.docs) || encoreActif(seances.docs) });
}
