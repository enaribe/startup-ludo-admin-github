/**
 * Métadonnées du document source d'un défi.
 *
 *  POST /api/defi/source
 *      Authorization: Bearer <idToken super admin>
 *      { id, source: { nom, pages, caracteres, deposeAt } | null }
 *      → 200 { ok: true }
 *      → 404 si le défi n'existe pas
 *      → 409 si le défi est clos
 *
 * Le TEXTE du document n'est pas écrit ici : il vit dans
 * `weeklyChallenges/{id}/sourceDocs`, écrit côté client par
 * `deposerDocumentDefi()` car les règles autorisent déjà le super admin.
 *
 * Cette route n'écrit que les métadonnées posées SUR le défi, parce qu'elles
 * conditionnent son ouverture — et qu'un champ qui gouverne un état ne doit pas
 * dépendre du bon vouloir du client.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifierAppelant } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  const appelant = await verifierAppelant(request);
  if (!appelant) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }
  if (!appelant.isSuper) {
    return NextResponse.json({ error: 'Réservé au super administrateur.' }, { status: 403 });
  }

  let id = '';
  let brut: Record<string, unknown> | null = null;
  try {
    const corps = (await request.json()) as { id?: unknown; source?: unknown };
    id = String(corps.id ?? '').trim();
    brut =
      corps.source && typeof corps.source === 'object'
        ? (corps.source as Record<string, unknown>)
        : null;
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: 'Identifiant du défi requis.' }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection(COLLECTIONS.weeklyChallenges).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Défi introuvable.' }, { status: 404 });
  }
  if (snap.data()?.statut === 'clos') {
    return NextResponse.json(
      { error: 'Ce défi est clos : son document ne peut plus changer.' },
      { status: 409 }
    );
  }

  // On ne garde que les quatre champs connus : le corps vient du navigateur, et
  // le mobile lit ce document sans avoir à se défendre d'une forme imprévue.
  const source =
    brut === null
      ? null
      : {
          nom: String(brut.nom ?? '').trim(),
          pages: Number(brut.pages ?? 0) || 0,
          caracteres: Number(brut.caracteres ?? 0) || 0,
          deposeAt: Number(brut.deposeAt ?? Date.now()) || Date.now(),
        };

  if (source && !source.nom) {
    return NextResponse.json({ error: 'Nom du document manquant.' }, { status: 400 });
  }

  await ref.set({ source, majAt: Date.now() }, { merge: true });

  return NextResponse.json({ ok: true });
}
