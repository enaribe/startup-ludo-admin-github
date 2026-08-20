/**
 * Inscription libre du back-office (plan I1/I3).
 *
 * Le compte Firebase Auth est créé CÔTÉ CLIENT (l'utilisateur possède déjà
 * son mot de passe) ; cette route enregistre la DEMANDE et applique le seul
 * chemin d'activation immédiate : le code de licence établissement, consommé
 * en TRANSACTION (un code = un seul compte direction — deux écoles qui se
 * partageraient un code seraient départagées par le serveur, pas par la
 * chance).
 *
 * Tous les autres types restent `pending` sans AUCUN claim : un compte en
 * attente est un compte vide, c'est toute la sécurité du modèle.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';
import { envoyerEmail, gabaritEmail } from '@/lib/email-service';

type TypeInscription = 'establishment' | 'teacher' | 'sponsor' | 'partner';

export async function POST(request: NextRequest) {
  // Authentification : le jeton du compte fraîchement créé (aucun claim requis).
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });

  let uid = '';
  let email = '';
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email ?? '';
  } catch {
    return NextResponse.json({ error: 'Session invalide.' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const type = String(body.type ?? '') as TypeInscription;
  const displayName = String(body.displayName ?? '').trim();
  const orgName = String(body.orgName ?? '').trim();
  const code = String(body.code ?? '').trim().toUpperCase();

  if (!['establishment', 'teacher', 'sponsor', 'partner'].includes(type) || !displayName) {
    return NextResponse.json({ error: 'Type de compte et nom requis.' }, { status: 400 });
  }

  const db = getAdminFirestore();
  const auth = getAdminAuth();
  const maintenant = Date.now();

  // Une seule demande par compte — une demande refusée peut être re-soumise.
  const demandeRef = db.collection(COLLECTIONS.signupRequests).doc(uid);
  const existante = await demandeRef.get();
  if (existante.exists && existante.data()?.status === 'pending') {
    return NextResponse.json({ error: 'Votre demande est déjà en cours d’examen.' }, { status: 409 });
  }
  if (existante.exists && existante.data()?.status === 'approved') {
    return NextResponse.json({ error: 'Ce compte est déjà activé.' }, { status: 409 });
  }

  // ═══ Chemin ÉTABLISSEMENT ═══
  //   - AVEC code de licence (client existant) → activation immédiate ;
  //   - SANS code (école qui découvre CONCREE) → demande `pending`, examinée
  //     par CONCREE dans /moderation — l'approbation crée l'établissement.
  if (type === 'establishment' && !code) {
    if (!orgName) {
      return NextResponse.json(
        { error: 'Le nom de votre établissement est requis pour une demande sans code de licence.' },
        { status: 400 }
      );
    }
    // Tombe dans le bloc « demande en attente » ci-dessous.
  } else if (type === 'establishment') {
    try {
      const etabId = await db.runTransaction(async (tx) => {
        const snap = await tx.get(
          db.collection(COLLECTIONS.establishments).where('licenseCode', '==', code).limit(1)
        );
        if (snap.empty) throw new ErreurLisible('Code de licence inconnu. Vérifiez le courrier reçu de CONCREE.');
        const docEtab = snap.docs[0];
        if (docEtab.data().licenseAccountUid) {
          throw new ErreurLisible('Ce code de licence a déjà servi à créer le compte de direction.');
        }
        if (docEtab.data().isActive === false) {
          throw new ErreurLisible('Cette licence est suspendue — contactez CONCREE.');
        }
        tx.update(docEtab.ref, { licenseAccountUid: uid, updatedAt: maintenant });
        tx.set(demandeRef, {
          type, displayName, orgName: docEtab.data().name ?? orgName, email,
          status: 'approved', establishmentId: docEtab.id,
          createdAt: maintenant, decidedAt: maintenant, decidedBy: 'license-code',
        });
        return docEtab.id;
      });

      await auth.setCustomUserClaims(uid, {
        admin: true, establishment_admin: true, teacher: false,
        establishmentId: etabId, classIds: [],
      });
      await db.collection(COLLECTIONS.users).doc(uid).set(
        { email, displayName, role: 'establishment_admin', establishmentId: etabId, createdAt: maintenant, updatedAt: maintenant },
        { merge: true }
      );
      void envoyerEmail({
        to: email,
        subject: 'Votre espace établissement Startup Ludo est prêt',
        html: gabaritEmail('Bienvenue !', `Votre licence est activée pour <strong>${orgName || etabId}</strong>. Reconnectez-vous pour accéder au Mode Classe : créez vos classes et vos comptes enseignants.`),
      });
      return NextResponse.json({ ok: true, status: 'approved', reconnexion: true });
    } catch (error) {
      if (error instanceof ErreurLisible) return NextResponse.json({ error: error.message }, { status: 409 });
      console.error('Inscription établissement :', error);
      return NextResponse.json({ error: 'Activation impossible — réessayez.' }, { status: 500 });
    }
  }

  // ═══ Chemin ENSEIGNANT : code établissement → demande visible par la direction ═══
  let establishmentId = '';
  if (type === 'teacher') {
    if (!code) return NextResponse.json({ error: 'Le code établissement est requis (demandez-le à votre direction).' }, { status: 400 });
    const snap = await db
      .collection(COLLECTIONS.establishments)
      .where('teacherJoinCode', '==', code)
      .limit(1)
      .get();
    if (snap.empty) {
      return NextResponse.json({ error: 'Code établissement inconnu ou désactivé.' }, { status: 409 });
    }
    establishmentId = snap.docs[0].id;
  }

  // ═══ Demande en attente (enseignant / annonceur / partenaire) ═══
  await demandeRef.set({
    type, displayName, orgName, email,
    status: 'pending',
    ...(establishmentId ? { establishmentId } : {}),
    createdAt: maintenant,
  });
  void envoyerEmail({
    to: email,
    subject: 'Demande reçue — Startup Ludo',
    html: gabaritEmail('Demande bien reçue', type === 'teacher'
      ? 'Votre direction va valider votre compte et vous affecter vos classes — vous recevrez un e-mail dès l’activation.'
      : 'L’équipe CONCREE examine votre demande (48 h ouvrées) — vous recevrez un e-mail dès l’activation.'),
  });
  return NextResponse.json({ ok: true, status: 'pending' });
}

class ErreurLisible extends Error {}
