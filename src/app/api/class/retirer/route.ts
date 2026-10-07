/**
 * Retrait d'un élève d'une classe — et rupture du lien côté mobile.
 *
 *  POST /api/class/retirer
 *      Authorization: Bearer <idToken d'un rôle scolaire>
 *      { classId, learnerId }
 *      → 200 { ok: true, lienSupprime: boolean }
 *      → 403 si la classe n'est pas dans le périmètre de l'appelant
 *      → 404 si la classe ou l'élève n'existe pas
 *
 * ═══ POURQUOI UNE ROUTE SERVEUR POUR UN SIMPLE RETRAIT ═══
 *
 * `removeLearner()` tourne côté client et faisait DEUX tiers du travail :
 * `isActive: false` et `linkedUid: null`. Le troisième lui était interdit —
 * effacer `classLinks/{uid}`, le miroir en `allow write: if false` que seul
 * l'Admin SDK peut toucher.
 *
 * Conséquence observée le 07/10/2026 : un élève retiré continuait de voir sa
 * classe et ses séances sur le mobile. C'est `classLinks` que l'app lit pour
 * savoir à quelle classe un compte appartient, et c'est lui que les règles
 * Firestore interrogent pour autoriser la lecture des séances. Tant qu'il
 * survit, le retrait n'existe que dans le back-office.
 *
 * La dette était connue et écrite dans `school-service.ts`. Cette route la
 * solde : les trois écritures partent ensemble, dans une transaction.
 *
 * ⚠️ LE PÉRIMÈTRE VIENT DU TOKEN, jamais du corps de la requête. Un enseignant
 * ne peut retirer un élève que d'une classe de son claim `classIds` ; un
 * directeur, que d'une classe de son établissement. Sans ce contrôle, l'id de
 * classe suffirait à vider la classe d'un autre établissement.
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
  if (!appelant.isSchoolRole && !appelant.isSuper) {
    return NextResponse.json({ error: 'Réservé aux comptes scolaires.' }, { status: 403 });
  }

  let classId = '';
  let learnerId = '';
  try {
    const body = (await request.json()) as { classId?: unknown; learnerId?: unknown };
    classId = String(body.classId ?? '').trim();
    learnerId = String(body.learnerId ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  if (!classId || !learnerId) {
    return NextResponse.json({ error: 'Classe et élève requis.' }, { status: 400 });
  }

  const db = getAdminFirestore();
  const refClasse = db.collection(COLLECTIONS.classes).doc(classId);
  const classeSnap = await refClasse.get();
  if (!classeSnap.exists) {
    return NextResponse.json({ error: 'Classe introuvable.' }, { status: 404 });
  }

  // ── Périmètre : le token décide, pas la requête ──
  if (!appelant.isSuper) {
    const etabClasse = classeSnap.data()?.establishmentId as string | undefined;
    const dansMonEtablissement =
      appelant.isEstablishmentAdmin &&
      !!appelant.establishmentId &&
      etabClasse === appelant.establishmentId;
    // L'enseignant est borné à SES classes ; le directeur, à son établissement
    // — un directeur n'a pas forcément la classe dans son claim `classIds`.
    const uneDeMesClasses = appelant.classIds.includes(classId);
    if (!dansMonEtablissement && !uneDeMesClasses) {
      return NextResponse.json({ error: 'Cette classe n’est pas dans votre périmètre.' }, { status: 403 });
    }
  }

  const refLearner = refClasse.collection('learners').doc(learnerId);
  const learnerSnap = await refLearner.get();
  if (!learnerSnap.exists) {
    return NextResponse.json({ error: 'Élève introuvable.' }, { status: 404 });
  }

  // L'uid lié AVANT l'écriture : le retrait efface `linkedUid`, et le miroir
  // deviendrait introuvable ensuite.
  const uidLie = (learnerSnap.data()?.linkedUid as string | null | undefined) ?? null;
  const maintenant = Date.now();

  await db.runTransaction(async (tx) => {
    tx.update(refLearner, {
      isActive: false,
      linkedUid: null,
      linkedAt: null,
      updatedAt: maintenant,
    });

    if (uidLie) {
      /*
        LE MIROIR, DANS LA MÊME TRANSACTION.

        C'est lui que le mobile lit (`getMonRattachement`) et que les règles
        Firestore interrogent (`eleveRattacheA`). Le supprimer ferme l'accès à
        la classe ET aux séances en un seul geste — séparer les deux écritures
        laisserait une fenêtre où l'élève est retiré côté back-office mais voit
        encore sa classe.
      */
      tx.delete(db.collection('classLinks').doc(uidLie));

      // `users/{uid}.classIds` : simple déclaration du client (il peut
      // l'écrire lui-même), mais la laisser incohérente ferait réapparaître la
      // classe dans un écran qui s'y fierait.
      tx.set(
        db.collection(COLLECTIONS.users).doc(uidLie),
        { classIds: [], updatedAt: maintenant },
        { merge: true }
      );
    }
  });

  return NextResponse.json({ ok: true, lienSupprime: !!uidLie });
}
