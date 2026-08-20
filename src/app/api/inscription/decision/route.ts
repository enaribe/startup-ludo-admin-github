/**
 * Décision sur une demande d'inscription (plan I4/I5).
 *
 * QUI DÉCIDE QUOI — la frontière est le type de la demande :
 *   - `teacher`  : la DIRECTION de l'établissement visé (ou le super admin).
 *     L'approbation POSE LES CLAIMS enseignant (avec les classes choisies) et
 *     synchronise `classes.teacherIds` — même geste que la création directe.
 *   - `sponsor` / `partner` : le SUPER ADMIN uniquement, avec le périmètre
 *     (éditions / partnerId) posé à l'approbation.
 *   - `establishment` (demande SANS code de licence — école qui découvre
 *     CONCREE) : le SUPER ADMIN uniquement. L'approbation CRÉE l'établissement
 *     (nom = `orgName` de la demande, quotas prudents par défaut, code de
 *     licence généré pour archive) et pose les claims de direction — mêmes
 *     claims que le chemin « code de licence » de l'inscription. CONCREE
 *     ajuste ensuite quotas et échéance sur la fiche de l'établissement.
 * Un refus porte toujours son motif — il s'affiche au candidat et part par
 * e-mail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { verifierAppelant } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/firebase';
import { envoyerEmail, gabaritEmail } from '@/lib/email-service';

export async function POST(request: NextRequest) {
  const appelant = await verifierAppelant(request);
  if (!appelant) return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const uid = String(body.uid ?? '').trim();
  const decision = String(body.decision ?? '');
  const motif = String(body.motif ?? '').trim();
  const classIds = Array.isArray(body.classIds) ? body.classIds.map(String) : [];
  const editionIds = Array.isArray(body.editionIds) ? body.editionIds.map(String) : [];
  const partnerId = String(body.partnerId ?? '').trim();

  if (!uid || !['approve', 'reject'].includes(decision)) {
    return NextResponse.json({ error: 'Demande et décision valides requises.' }, { status: 400 });
  }
  if (decision === 'reject' && !motif) {
    return NextResponse.json({ error: 'Un refus doit porter son motif.' }, { status: 400 });
  }

  const db = getAdminFirestore();
  const auth = getAdminAuth();
  const ref = db.collection(COLLECTIONS.signupRequests).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Demande introuvable.' }, { status: 404 });
  const demande = snap.data() as {
    type: string; status: string; email?: string; displayName?: string; establishmentId?: string;
    orgName?: string;
  };
  if (demande.status !== 'pending') {
    return NextResponse.json({ error: `Demande déjà ${demande.status === 'approved' ? 'approuvée' : 'traitée'}.` }, { status: 409 });
  }

  // ── Frontière de décision ──
  const estDecideurEnseignant =
    demande.type === 'teacher' &&
    (appelant.isSuper || (appelant.isEstablishmentAdmin && appelant.establishmentId === demande.establishmentId));
  const estDecideurConcree = demande.type !== 'teacher' && appelant.isSuper;
  if (!estDecideurEnseignant && !estDecideurConcree) {
    return NextResponse.json({ error: 'Cette demande ne relève pas de votre périmètre.' }, { status: 403 });
  }

  const maintenant = Date.now();

  if (decision === 'reject') {
    await ref.update({ status: 'rejected', motif, decidedAt: maintenant, decidedBy: appelant.uid });
    if (demande.email) {
      void envoyerEmail({
        to: demande.email,
        subject: 'Votre demande Startup Ludo',
        html: gabaritEmail('Demande non retenue', `Motif : ${motif}<br/><br/>Vous pouvez corriger et soumettre une nouvelle demande depuis la page d’inscription.`),
      });
    }
    return NextResponse.json({ ok: true, status: 'rejected' });
  }

  // ═══ Approbation : pose des claims selon le type ═══
  if (demande.type === 'teacher') {
    if (!demande.establishmentId) {
      return NextResponse.json({ error: 'Demande sans établissement — refusez-la.' }, { status: 409 });
    }
    await auth.setCustomUserClaims(uid, {
      admin: true, teacher: true, establishment_admin: false,
      establishmentId: demande.establishmentId, classIds,
    });
    await db.collection(COLLECTIONS.users).doc(uid).set(
      {
        email: demande.email ?? '', displayName: demande.displayName ?? '',
        role: 'teacher', establishmentId: demande.establishmentId,
        teachingClassIds: classIds, createdAt: maintenant, updatedAt: maintenant,
      },
      { merge: true }
    );
    // Relation inverse classes.teacherIds — même invariant que /api/admins.
    for (const classId of classIds) {
      await db.collection(COLLECTIONS.classes).doc(classId).update({
        teacherIds: [...new Set([...( (await db.collection(COLLECTIONS.classes).doc(classId).get()).data()?.teacherIds ?? []), uid])],
        updatedAt: maintenant,
      }).catch(() => {});
    }
  } else if (demande.type === 'sponsor') {
    await auth.setCustomUserClaims(uid, { admin: true, sponsor: true, editionIds });
    await db.collection(COLLECTIONS.users).doc(uid).set(
      { email: demande.email ?? '', displayName: demande.displayName ?? '', role: 'sponsor', editionIds, createdAt: maintenant, updatedAt: maintenant },
      { merge: true }
    );
  } else if (demande.type === 'partner') {
    if (!partnerId) return NextResponse.json({ error: 'Le périmètre partenaire (partnerId) est requis.' }, { status: 400 });
    await auth.setCustomUserClaims(uid, { admin: true, partner_admin: true, partnerId });
    await db.collection(COLLECTIONS.users).doc(uid).set(
      { email: demande.email ?? '', displayName: demande.displayName ?? '', role: 'partner_admin', partnerId, createdAt: maintenant, updatedAt: maintenant },
      { merge: true }
    );
  } else if (demande.type === 'establishment') {
    // Demande SANS code de licence : l'approbation crée l'établissement.
    const nomEtab = (demande.orgName ?? '').trim() || (demande.displayName ?? '').trim();
    if (!nomEtab) {
      return NextResponse.json({ error: 'Demande sans nom d’établissement — refusez-la.' }, { status: 409 });
    }
    // Identifiant : celui saisi par le super admin, sinon un slug du nom,
    // suffixé si déjà pris (jamais d'écrasement silencieux d'un client).
    const voulu = String(body.establishmentId ?? '').trim().toLowerCase();
    const base =
      voulu ||
      nomEtab
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) ||
      'etablissement';
    let etabId = base;
    for (let i = 2; (await db.collection(COLLECTIONS.establishments).doc(etabId).get()).exists; i += 1) {
      etabId = `${base}-${i}`;
    }

    // Quotas PRUDENTS par défaut (0 = illimité dans ce modèle, donc jamais 0
    // ici) et pas d'échéance : CONCREE cadre la licence sur la fiche après
    // l'échange commercial. Le code généré sert d'archive — il est déjà
    // consommé (`licenseAccountUid` posé).
    await db.collection(COLLECTIONS.establishments).doc(etabId).set({
      name: nomEtab,
      level: 'formation',
      city: '',
      country: '',
      licenseCode: `EST-${etabId.slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, '')}-${String(maintenant).slice(-4)}`,
      licenseValidUntil: null,
      maxTeachers: 5,
      maxLearners: 150,
      isActive: true,
      licenseAccountUid: uid,
      createdAt: maintenant,
      updatedAt: maintenant,
    });
    await auth.setCustomUserClaims(uid, {
      admin: true, establishment_admin: true, teacher: false,
      establishmentId: etabId, classIds: [],
    });
    await db.collection(COLLECTIONS.users).doc(uid).set(
      {
        email: demande.email ?? '', displayName: demande.displayName ?? '',
        role: 'establishment_admin', establishmentId: etabId, teachingClassIds: [],
        createdAt: maintenant, updatedAt: maintenant,
      },
      { merge: true }
    );
    await ref.update({ establishmentId: etabId });
  }

  await ref.update({ status: 'approved', decidedAt: maintenant, decidedBy: appelant.uid });
  if (demande.email) {
    void envoyerEmail({
      to: demande.email,
      subject: 'Votre espace Startup Ludo est prêt',
      html: gabaritEmail('Compte activé', 'Reconnectez-vous à votre espace : vos accès sont en place. À très vite !'),
    });
  }
  return NextResponse.json({ ok: true, status: 'approved', reconnexion: true });
}
