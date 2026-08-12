/**
 * Admins API — gestion des comptes admin.
 *
 * Sécurité : chaque requête porte l'ID token Firebase de l'appelant dans
 * `Authorization: Bearer <idToken>`. Deux profils peuvent appeler :
 *   - super_admin          : peut tout faire (admin programme, admin partenaire, sponsor,
 *                            admin d'établissement OU enseignant).
 *   - partner_admin        : peut créer/révoquer des admins de programme, mais UNIQUEMENT
 *                            pour des programmes de SON partenaire (délégation bornée serveur).
 *                            Il ne peut PAS créer de compte sponsor ni de rôle scolaire.
 *   - establishment_admin  : peut créer/modifier/révoquer des comptes `teacher`, et
 *                            UNIQUEMENT dans SON établissement. Le périmètre
 *                            `establishmentId` est FORCÉ depuis son token, jamais lu
 *                            du corps de la requête (sinon il pourrait rattacher un
 *                            enseignant à un autre établissement).
 *
 *  GET    /api/admins            → liste des comptes admin (scopée au partenaire / à l'établissement)
 *  POST   /api/admins            → crée un compte (programme, partenaire, sponsor, établissement ou enseignant)
 *  PATCH  /api/admins            → modifie un compte (rôle, périmètre, mot de passe)
 *  DELETE /api/admins?uid=...    → révoque un compte (avec contrôle de périmètre)
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';

const SUPER_ADMIN_EMAIL = 'startupludo@concree.com';

/** Rôles gérables par cette API (le super_admin lui-même n'est jamais créé ici). */
type ManagedRole = 'admin' | 'partner_admin' | 'sponsor' | 'establishment_admin' | 'teacher';

const MANAGED_ROLES: ManagedRole[] = ['admin', 'partner_admin', 'sponsor', 'establishment_admin', 'teacher'];
function isManagedRole(value: string): value is ManagedRole {
  return (MANAGED_ROLES as string[]).includes(value);
}

interface Caller {
  uid: string;
  isSuper: boolean;
  isPartner: boolean;
  partnerId: string | null;
  /** True si l'appelant est un admin d'établissement (délégation Mode Classe). */
  isEstablishment: boolean;
  /**
   * Établissement de l'appelant, LU DANS SON TOKEN uniquement. C'est la source
   * de vérité du périmètre : jamais celle du corps de la requête.
   */
  establishmentId: string | null;
}

/**
 * Vérifie l'ID token et exige un rôle habilité à gérer des comptes :
 * super_admin, partner_admin ou establishment_admin.
 */
async function requireAdmin(req: NextRequest): Promise<Caller | null> {
  const header = req.headers.get('authorization') || '';
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(match[1]);
    const isSuper = decoded.super_admin === true || decoded.email === SUPER_ADMIN_EMAIL;
    const isPartner = decoded.partner_admin === true;
    const isEstablishment = decoded.establishment_admin === true;
    if (!isSuper && !isPartner && !isEstablishment) return null;
    return {
      uid: decoded.uid,
      isSuper,
      isPartner,
      partnerId: (decoded.partnerId as string | undefined) ?? null,
      isEstablishment,
      establishmentId: (decoded.establishmentId as string | undefined) ?? null,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  try {
    const db = getAdminFirestore();
    const snap = await db.collection(COLLECTIONS.users)
      .where('role', 'in', ['admin', 'super_admin', 'partner_admin', 'sponsor', 'establishment_admin', 'teacher'])
      .get();

    let admins = snap.docs.map((d) => {
      const data = d.data();
      const programIds = normalizeIds(data.programIds ?? data.programId);
      return {
        uid: d.id,
        email: data.email ?? '',
        displayName: data.displayName ?? '',
        role: data.role ?? 'admin',
        programIds,
        programId: programIds[0] ?? null, // rétrocompat
        partnerId: data.partnerId ?? null,
        // Périmètre d'un compte sponsor : éditions assignées.
        editionIds: normalizeIds(data.editionIds ?? data.editionId),
        // Périmètre des rôles scolaires (Mode Classe).
        establishmentId: data.establishmentId ?? null,
        // Orthogonal au rôle : un establishment_admin qui enseigne en a aussi.
        teachingClassIds: normalizeIds(data.teachingClassIds ?? data.classIds),
        // Statut « 1re connexion en attente » — affiché tel quel par /enseignants.
        mustChangePassword: data.mustChangePassword === true,
      };
    });

    // Un admin de partenaire ne voit que les admins de SES programmes.
    if (caller.isPartner && !caller.isSuper) {
      const partnerProgramIds = await getPartnerProgramIds(caller.partnerId);
      admins = admins.filter((a) => a.role === 'admin' && a.programIds.some((pid) => partnerProgramIds.has(pid)));
    }

    // Un admin d'établissement ne voit que les enseignants de SON établissement
    // (jamais les autres rôles du back-office, ni les autres établissements).
    if (caller.isEstablishment && !caller.isSuper) {
      admins = admins.filter((a) => a.role === 'teacher' && !!caller.establishmentId && a.establishmentId === caller.establishmentId);
    }

    return NextResponse.json({ admins });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erreur de chargement' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  try {
    const body = await req.json();
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';
    const displayName = (body.displayName ?? '').trim();
    const rawRole = String(body.role ?? 'admin');
    if (!isManagedRole(rawRole)) {
      return NextResponse.json({ error: 'Rôle invalide.' }, { status: 400 });
    }
    const role: ManagedRole = rawRole;
    // Multi-programmes : accepte programIds[] (ou programId unique pour rétrocompat).
    const programIds = normalizeIds(body.programIds ?? body.programId);
    const partnerId = (body.partnerId ?? '').trim();
    // Multi-éditions (compte sponsor) : accepte editionIds[] ou editionId unique.
    const editionIds = normalizeIds(body.editionIds ?? body.editionId);
    // Classes enseignées : orthogonales au rôle (un directeur peut enseigner).
    const teachingClassIds = normalizeIds(body.teachingClassIds ?? body.classIds);

    if (!email || !password || !displayName) {
      return NextResponse.json({ error: 'Email, mot de passe et nom sont requis.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }, { status: 400 });
    }

    // ===== Autorisations par rôle cible =====
    // Seul le super admin peut créer un admin de partenaire.
    if (role === 'partner_admin' && !caller.isSuper) {
      return NextResponse.json({ error: 'Seul un super admin peut créer un admin de partenaire.' }, { status: 403 });
    }
    // Idem pour un compte sponsor : la délégation partenaire ne couvre pas les éditions.
    if (role === 'sponsor' && !caller.isSuper) {
      return NextResponse.json({ error: 'Seul un super admin peut créer un compte sponsor.' }, { status: 403 });
    }
    // L'établissement est une vente : seul le super admin crée son directeur.
    if (role === 'establishment_admin' && !caller.isSuper) {
      return NextResponse.json({ error: 'Seul un super admin peut créer un admin d’établissement.' }, { status: 403 });
    }
    // Un enseignant se crée par le super admin OU par l'admin de SON établissement.
    // Un admin de partenaire n'a aucun droit sur les rôles scolaires.
    if (role === 'teacher' && !caller.isSuper && !caller.isEstablishment) {
      return NextResponse.json({ error: 'Seul un super admin ou un admin d’établissement peut créer un enseignant.' }, { status: 403 });
    }
    // Réciproquement : un admin d'établissement ne crée QUE des enseignants.
    if (caller.isEstablishment && !caller.isSuper && role !== 'teacher') {
      return NextResponse.json({ error: 'Un admin d’établissement ne peut créer que des comptes enseignant.' }, { status: 403 });
    }

    const auth = getAdminAuth();
    const db = getAdminFirestore();

    // ===== Création d'un rôle scolaire (Mode Classe) =====
    if (role === 'establishment_admin' || role === 'teacher') {
      // ⚠️ RÈGLE CRITIQUE : pour un admin d'établissement, le périmètre vient de
      // SON token — jamais du corps de la requête. Sinon il pourrait créer un
      // enseignant rattaché à un autre établissement. Seul le super admin, qui
      // n'a pas de périmètre propre, peut désigner l'établissement cible.
      const establishmentId = caller.isSuper
        ? String(body.establishmentId ?? '').trim()
        : (caller.establishmentId ?? '');

      if (!establishmentId) {
        return NextResponse.json(
          { error: caller.isSuper ? 'Un établissement à assigner est requis.' : 'Votre compte n’est rattaché à aucun établissement.' },
          { status: 400 }
        );
      }

      // ⚠️ Les classes affectées doivent appartenir à CET établissement, sinon
      // on poserait un claim `classIds` donnant accès à la classe d'un autre
      // client. On le vérifie AVANT toute écriture.
      const erreurClasses = await assertClassesDeLEtablissement(teachingClassIds, establishmentId);
      if (erreurClasses) return NextResponse.json({ error: erreurClasses }, { status: 400 });

      // ===== Licence et quota (lot 3) =====
      // Le super admin n'y est pas soumis : il doit pouvoir dépanner un client
      // dont la licence vient d'expirer ou dont le quota est saturé.
      if (!caller.isSuper) {
        const blocage = await verifierLicenceEtQuota(establishmentId, email);
        if (blocage) return NextResponse.json({ error: blocage }, { status: 403 });
      }

      const uid = await upsertAuthUser(email, password, displayName);
      // ⚠️ `upsertAuthUser` RÉUTILISE un compte existant si l'e-mail est déjà
      // pris (compte révoqué qu'on recrée, ou saisie en double). Ses anciennes
      // classes doivent donc servir de point de départ au diff, sinon il
      // resterait inscrit comme enseignant sur des classes qu'on ne lui donne
      // plus — un enseignant fantôme sur la fiche de classe.
      const ancienSnap = await db.collection(COLLECTIONS.users).doc(uid).get();
      const anciennesClasses = normalizeIds(
        ancienSnap.data()?.teachingClassIds ?? ancienSnap.data()?.classIds
      );
      // establishmentId ET classIds dans les claims : les règles Firestore ne
      // peuvent pas lire users/{uid}, tout le périmètre doit passer par le token.
      await auth.setCustomUserClaims(uid, buildSchoolClaims(role, establishmentId, teachingClassIds));
      await db.collection(COLLECTIONS.users).doc(uid).set(
        {
          email, displayName, role,
          establishmentId,
          // Orthogonal au rôle : conservé même pour un establishment_admin.
          teachingClassIds,
          // Périmètres des autres rôles : nettoyés, pour éviter tout héritage.
          programIds: null, programId: null, partnerId: null, editionIds: null,
          mustChangePassword: true, // 1re connexion : forcer le changement de mot de passe
          createdAt: Date.now(), updatedAt: Date.now(),
        },
        { merge: true }
      );
      // 3e source de vérité : la relation inverse `classes/{id}.teacherIds[]`.
      // Sans elle, la classe ignorerait qui l'enseigne (cf. SPEC §2.1).
      await synchroniserTeacherIds(uid, anciennesClasses, teachingClassIds);
      return NextResponse.json({ uid, email, displayName, role, establishmentId, teachingClassIds });
    }

    // ===== Création d'un compte sponsor (périmètre = liste d'éditions) =====
    if (role === 'sponsor') {
      if (editionIds.length === 0) {
        return NextResponse.json({ error: 'Au moins une édition à assigner est requise.' }, { status: 400 });
      }
      // Vérifie l'existence de CHAQUE édition avant d'écrire quoi que ce soit.
      for (const eid of editionIds) {
        const editionSnap = await db.collection(COLLECTIONS.editions).doc(eid).get();
        if (!editionSnap.exists) return NextResponse.json({ error: `Édition introuvable : ${eid}.` }, { status: 404 });
      }

      const uid = await upsertAuthUser(email, password, displayName);
      // editionIds dans les claims → exploitable par les règles Firestore.
      await auth.setCustomUserClaims(uid, { admin: true, sponsor: true, editionIds });
      await db.collection(COLLECTIONS.users).doc(uid).set(
        {
          email, displayName, role: 'sponsor',
          editionIds,
          programIds: null, programId: null, partnerId: null,
          mustChangePassword: true, // 1re connexion : forcer le changement de mot de passe
          createdAt: Date.now(), updatedAt: Date.now(),
        },
        { merge: true }
      );
      return NextResponse.json({ uid, email, displayName, role: 'sponsor', editionIds });
    }

    // ===== Création d'un admin de partenaire =====
    if (role === 'partner_admin') {
      if (!partnerId) return NextResponse.json({ error: 'Un partenaire à assigner est requis.' }, { status: 400 });
      const partnerSnap = await db.collection(COLLECTIONS.partners).doc(partnerId).get();
      if (!partnerSnap.exists) return NextResponse.json({ error: 'Partenaire introuvable.' }, { status: 404 });

      const uid = await upsertAuthUser(email, password, displayName);
      // partnerId dans les claims → exploité par les règles Firestore.
      await auth.setCustomUserClaims(uid, { admin: true, partner_admin: true, partnerId });
      await db.collection(COLLECTIONS.users).doc(uid).set(
        { email, displayName, role: 'partner_admin', partnerId, programId: null, mustChangePassword: true, createdAt: Date.now(), updatedAt: Date.now() },
        { merge: true }
      );
      return NextResponse.json({ uid, email, displayName, role, partnerId });
    }

    // ===== Création d'un admin de programme (un ou plusieurs) =====
    if (programIds.length === 0) return NextResponse.json({ error: 'Au moins un programme à assigner est requis.' }, { status: 400 });

    // Vérifie l'existence + le périmètre de CHAQUE programme avant d'écrire quoi que ce soit.
    const programRefs = [];
    for (const pid of programIds) {
      const programRef = db.collection(COLLECTIONS.programs).doc(pid);
      const programSnap = await programRef.get();
      if (!programSnap.exists) return NextResponse.json({ error: `Programme introuvable : ${pid}.` }, { status: 404 });
      if (caller.isPartner && !caller.isSuper) {
        const programPartnerId = programSnap.data()?.partnerId as string | undefined;
        if (!programPartnerId || programPartnerId !== caller.partnerId) {
          return NextResponse.json({ error: 'Un des programmes n’appartient pas à votre partenaire.' }, { status: 403 });
        }
      }
      programRefs.push(programRef);
    }

    const uid = await upsertAuthUser(email, password, displayName);
    await auth.setCustomUserClaims(uid, { admin: true });
    await db.collection(COLLECTIONS.users).doc(uid).set(
      {
        email, displayName, role: 'admin',
        programIds,
        programId: programIds[0], // rétrocompat lecture (anciens consommateurs)
        partnerId: null,
        mustChangePassword: true, // 1re connexion : forcer le changement de mot de passe
        createdAt: Date.now(), updatedAt: Date.now(),
      },
      { merge: true }
    );
    // Chaque programme AJOUTE cet admin à ses gestionnaires (multi-admin).
    await Promise.all(programRefs.map((ref) =>
      ref.set({ ownerIds: FieldValue.arrayUnion(uid), updatedAt: Date.now() }, { merge: true })
    ));

    return NextResponse.json({ uid, email, displayName, role: 'admin', programIds });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Création impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  // Seul le super admin — ou un admin d'établissement sur SES enseignants (contrôlé
  // plus bas, une fois la cible chargée) — peut éditer un compte. Un admin de
  // partenaire en reste exclu : changer de rôle / de partenaire dépasse sa délégation.
  if (!caller.isSuper && !caller.isEstablishment) {
    return NextResponse.json({ error: 'Seul un super admin peut modifier un admin.' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const uid = (body.uid ?? '').trim();
    if (!uid) return NextResponse.json({ error: 'uid requis' }, { status: 400 });
    if (uid === caller.uid) {
      return NextResponse.json({ error: 'Vous ne pouvez pas modifier votre propre compte ici.' }, { status: 400 });
    }

    const auth = getAdminAuth();
    const db = getAdminFirestore();

    const userRef = db.collection(COLLECTIONS.users).doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: 'Admin introuvable.' }, { status: 404 });
    const current = userSnap.data() ?? {};
    const currentRole = (current.role ?? 'admin') as string;
    // Programmes actuels (rétrocompat : programIds[] ou programId unique).
    const currentProgramIds = normalizeIds(current.programIds ?? current.programId);

    if (currentRole === 'super_admin') {
      return NextResponse.json({ error: 'Le super admin ne peut pas être modifié.' }, { status: 400 });
    }

    // Rôle cible : fourni ou inchangé.
    const rawNextRole = String(body.role ?? currentRole);
    if (!isManagedRole(rawNextRole)) {
      return NextResponse.json({ error: 'Rôle invalide.' }, { status: 400 });
    }
    const nextRole: ManagedRole = rawNextRole;

    // ===== Délégation à l'admin d'établissement =====
    // ⚠️ Il ne peut toucher QUE des enseignants DÉJÀ dans son établissement, et
    // ne peut pas les faire changer de rôle ni d'établissement. Les deux bornes
    // (rôle avant ET rôle après) sont vérifiées : sans la première, il pourrait
    // « récupérer » un compte d'un autre rôle en le passant teacher.
    if (caller.isEstablishment && !caller.isSuper) {
      const targetEstablishmentId = (current.establishmentId as string | undefined) ?? null;
      if (currentRole !== 'teacher' || nextRole !== 'teacher') {
        return NextResponse.json({ error: 'Un admin d’établissement ne peut modifier que des comptes enseignant.' }, { status: 403 });
      }
      if (!caller.establishmentId || targetEstablishmentId !== caller.establishmentId) {
        return NextResponse.json({ error: 'Cet enseignant ne dépend pas de votre établissement.' }, { status: 403 });
      }
    }

    // Champs d'assignation cibles selon le rôle cible.
    const nextProgramIds = nextRole === 'admin' ? normalizeIds(body.programIds ?? body.programId) : [];
    const nextPartnerId = nextRole === 'partner_admin' ? (body.partnerId ?? '').trim() : '';
    const nextEditionIds = nextRole === 'sponsor' ? normalizeIds(body.editionIds ?? body.editionId) : [];
    const isNextSchoolRole = nextRole === 'establishment_admin' || nextRole === 'teacher';
    // ⚠️ Périmètre scolaire : forcé depuis le token de l'appelant s'il est admin
    // d'établissement (il ne peut pas déplacer un enseignant ailleurs) ; seul le
    // super admin peut le désigner. À défaut de valeur fournie, on conserve
    // l'établissement courant du compte.
    const nextEstablishmentId = !isNextSchoolRole
      ? ''
      : caller.isSuper
        ? String(body.establishmentId ?? current.establishmentId ?? '').trim()
        : (caller.establishmentId ?? '');
    // Classes : orthogonales au rôle, donc mises à jour dès qu'elles sont fournies
    // (sinon on garde celles du compte). Elles n'ont de sens que pour un rôle scolaire.
    const nextClassIds = !isNextSchoolRole
      ? []
      : normalizeIds(body.teachingClassIds ?? body.classIds ?? current.teachingClassIds ?? current.classIds);
    const newPassword = (body.password ?? '').trim();

    if (nextRole === 'admin' && nextProgramIds.length === 0) {
      return NextResponse.json({ error: 'Au moins un programme à assigner est requis.' }, { status: 400 });
    }
    if (nextRole === 'partner_admin' && !nextPartnerId) {
      return NextResponse.json({ error: 'Un partenaire à assigner est requis.' }, { status: 400 });
    }
    if (nextRole === 'sponsor' && nextEditionIds.length === 0) {
      return NextResponse.json({ error: 'Au moins une édition à assigner est requise.' }, { status: 400 });
    }
    if (isNextSchoolRole && !nextEstablishmentId) {
      return NextResponse.json({ error: 'Un établissement à assigner est requis.' }, { status: 400 });
    }
    if (newPassword && newPassword.length < 8) {
      return NextResponse.json({ error: 'Le mot de passe doit faire au moins 8 caractères.' }, { status: 400 });
    }

    // Vérifie l'existence de la/les cible(s) d'assignation.
    if (nextRole === 'admin') {
      for (const pid of nextProgramIds) {
        const programSnap = await db.collection(COLLECTIONS.programs).doc(pid).get();
        if (!programSnap.exists) return NextResponse.json({ error: `Programme introuvable : ${pid}.` }, { status: 404 });
      }
    } else if (nextRole === 'sponsor') {
      for (const eid of nextEditionIds) {
        const editionSnap = await db.collection(COLLECTIONS.editions).doc(eid).get();
        if (!editionSnap.exists) return NextResponse.json({ error: `Édition introuvable : ${eid}.` }, { status: 404 });
      }
    } else if (isNextSchoolRole) {
      // Les classes visées doivent appartenir à l'établissement cible : sinon on
      // poserait un claim `classIds` ouvrant la classe d'un autre client.
      const erreurClasses = await assertClassesDeLEtablissement(nextClassIds, nextEstablishmentId);
      if (erreurClasses) return NextResponse.json({ error: erreurClasses }, { status: 400 });
      // Licence : un établissement expiré ne doit plus voir son périmètre évoluer.
      // Le quota, lui, n'a pas à être revérifié — on ne crée pas de compte ici, et
      // un compte existant ne doit jamais devenir immodifiable parce que le quota
      // a été baissé après coup (le directeur doit pouvoir corriger ses classes).
      if (!caller.isSuper) {
        const blocage = await verifierLicence(nextEstablishmentId);
        if (blocage) return NextResponse.json({ error: blocage }, { status: 403 });
      }
    } else {
      const partnerSnap = await db.collection(COLLECTIONS.partners).doc(nextPartnerId).get();
      if (!partnerSnap.exists) return NextResponse.json({ error: 'Partenaire introuvable.' }, { status: 404 });
    }

    // Réinitialisation du mot de passe (optionnelle).
    if (newPassword) {
      await auth.updateUser(uid, { password: newPassword });
    }

    // Mise à jour des claims selon le rôle cible.
    if (nextRole === 'partner_admin') {
      await auth.setCustomUserClaims(uid, { admin: true, partner_admin: true, partnerId: nextPartnerId });
    } else if (nextRole === 'sponsor') {
      await auth.setCustomUserClaims(uid, { admin: true, sponsor: true, editionIds: nextEditionIds });
    } else if (nextRole === 'establishment_admin' || nextRole === 'teacher') {
      // setCustomUserClaims REMPLACE l'intégralité des claims : les claims des
      // autres rôles (partner_admin, sponsor, partnerId, editionIds) disparaissent
      // donc automatiquement lors d'un changement de rôle.
      await auth.setCustomUserClaims(uid, buildSchoolClaims(nextRole, nextEstablishmentId, nextClassIds));
    } else {
      await auth.setCustomUserClaims(uid, { admin: true });
    }

    // Retire cet admin des programmes qu'il ne gère plus (présents avant, absents après).
    // On ne « libère » que CET admin : les autres gestionnaires du programme restent.
    // On ne nettoie le legacy `ownerId` que s'il pointait précisément vers cet admin.
    const nextSet = new Set(nextRole === 'admin' ? nextProgramIds : []);
    const removed = currentProgramIds.filter((pid) => !nextSet.has(pid));
    await Promise.all(removed.map(async (pid) => {
      const ref = db.collection(COLLECTIONS.programs).doc(pid);
      const snap = await ref.get();
      const legacyOwnerId = snap.data()?.ownerId as string | undefined;
      await ref.set(
        {
          ownerIds: FieldValue.arrayRemove(uid),
          ...(legacyOwnerId === uid ? { ownerId: FieldValue.delete() } : {}),
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    }));

    // Ajoute cet admin aux programmes cibles (sans déloger les co-admins).
    if (nextRole === 'admin') {
      await Promise.all(nextProgramIds.map((pid) =>
        db.collection(COLLECTIONS.programs).doc(pid).set(
          { ownerIds: FieldValue.arrayUnion(uid), updatedAt: Date.now() },
          { merge: true }
        )
      ));
    }

    // Relation inverse des classes (`classes/{id}.teacherIds[]`), sur le modèle
    // de `programs.ownerIds` juste au-dessus : diff entre l'avant et l'après.
    // Un compte qui QUITTE un rôle scolaire a `nextClassIds` vide : il est donc
    // retiré de toutes ses classes, sans traitement particulier.
    const currentClassIds = normalizeIds(current.teachingClassIds ?? current.classIds);
    await synchroniserTeacherIds(uid, currentClassIds, nextClassIds);

    // Met à jour le doc utilisateur (assignations mutuellement exclusives selon le rôle).
    // Si le mot de passe a été réinitialisé, on reforce son changement à la
    // prochaine connexion de l'admin concerné.
    await userRef.set(
      {
        role: nextRole,
        programIds: nextRole === 'admin' ? nextProgramIds : null,
        programId: nextRole === 'admin' ? nextProgramIds[0] : null, // rétrocompat
        partnerId: nextRole === 'partner_admin' ? nextPartnerId : null,
        editionIds: nextRole === 'sponsor' ? nextEditionIds : null,
        // Périmètre scolaire : remis à null si le compte quitte un rôle scolaire,
        // pour ne laisser aucun périmètre orphelin derrière un changement de rôle.
        establishmentId: isNextSchoolRole ? nextEstablishmentId : null,
        teachingClassIds: isNextSchoolRole ? nextClassIds : null,
        ...(newPassword ? { mustChangePassword: true } : {}),
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    return NextResponse.json({
      uid,
      role: nextRole,
      programIds: nextRole === 'admin' ? nextProgramIds : null,
      partnerId: nextRole === 'partner_admin' ? nextPartnerId : null,
      editionIds: nextRole === 'sponsor' ? nextEditionIds : null,
      establishmentId: isNextSchoolRole ? nextEstablishmentId : null,
      teachingClassIds: isNextSchoolRole ? nextClassIds : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Modification impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const caller = await requireAdmin(req);
  if (!caller) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });

  try {
    const uid = new URL(req.url).searchParams.get('uid');
    if (!uid) return NextResponse.json({ error: 'uid requis' }, { status: 400 });
    if (uid === caller.uid) {
      return NextResponse.json({ error: 'Vous ne pouvez pas révoquer votre propre accès.' }, { status: 400 });
    }

    const auth = getAdminAuth();
    const db = getAdminFirestore();

    const userSnap = await db.collection(COLLECTIONS.users).doc(uid).get();
    const userData = userSnap.exists ? userSnap.data() : undefined;
    const targetRole = userData?.role as string | undefined;
    const programIds = normalizeIds(userData?.programIds ?? userData?.programId);
    // Classes enseignées avant révocation : il faudra l'en retirer (relation inverse).
    const teachingClassIds = normalizeIds(userData?.teachingClassIds ?? userData?.classIds);

    // Un admin de partenaire ne peut révoquer qu'un admin de programme de SON partenaire.
    if (caller.isPartner && !caller.isSuper) {
      if (targetRole !== 'admin' || programIds.length === 0) {
        return NextResponse.json({ error: 'Action non autorisée.' }, { status: 403 });
      }
      const partnerProgramIds = await getPartnerProgramIds(caller.partnerId);
      if (!programIds.some((pid) => partnerProgramIds.has(pid))) {
        return NextResponse.json({ error: 'Cet admin ne dépend pas de votre partenaire.' }, { status: 403 });
      }
    }

    // Un admin d'établissement ne révoque QUE des enseignants de SON établissement.
    if (caller.isEstablishment && !caller.isSuper) {
      const targetEstablishmentId = (userData?.establishmentId as string | undefined) ?? null;
      if (targetRole !== 'teacher') {
        return NextResponse.json({ error: 'Action non autorisée.' }, { status: 403 });
      }
      if (!caller.establishmentId || targetEstablishmentId !== caller.establishmentId) {
        return NextResponse.json({ error: 'Cet enseignant ne dépend pas de votre établissement.' }, { status: 403 });
      }
    }

    // Retire tous les claims admin et libère tous les programmes gérés.
    await auth.setCustomUserClaims(uid, {
      admin: false, super_admin: false, partner_admin: false, sponsor: false, editionIds: null,
      // Rôles scolaires : les claims de périmètre doivent tomber aussi, sinon
      // un enseignant révoqué garderait l'accès Firestore à ses classes.
      establishment_admin: false, teacher: false, establishmentId: null, classIds: null,
    });
    await db.collection(COLLECTIONS.users).doc(uid).set(
      {
        role: 'revoked',
        programIds: null, programId: null, partnerId: null, editionIds: null,
        establishmentId: null, teachingClassIds: null,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
    // Retire cet admin des gestionnaires de chaque programme (sans toucher aux co-admins).
    await Promise.all(programIds.map(async (pid) => {
      const ref = db.collection(COLLECTIONS.programs).doc(pid);
      const snap = await ref.get();
      const legacyOwnerId = snap.data()?.ownerId as string | undefined;
      await ref.set(
        {
          ownerIds: FieldValue.arrayRemove(uid),
          ...(legacyOwnerId === uid ? { ownerId: FieldValue.delete() } : {}),
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    }));
    // Idem pour les classes : un enseignant révoqué doit disparaître de la liste
    // des enseignants de CHACUNE de ses classes, sans quoi la fiche de classe
    // afficherait un enseignant fantôme (et le lot 4 lui enverrait des séances).
    await synchroniserTeacherIds(uid, teachingClassIds, []);

    return NextResponse.json({ uid, revoked: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Révocation impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ===== Helpers =====

/**
 * Normalise une valeur (string | string[] | null) en tableau d'ids nettoyé et dédupliqué.
 * Sert la rétrocompatibilité programId (unique) → programIds (multiple).
 */
function normalizeIds(value: unknown): string[] {
  const arr = Array.isArray(value) ? value : value ? [value] : [];
  const cleaned = arr.map((v) => String(v).trim()).filter(Boolean);
  return Array.from(new Set(cleaned));
}

/**
 * Claims d'un rôle scolaire (Mode Classe).
 *
 * `admin: true` est posé comme sur tous les rôles du back-office (cohérence avec
 * l'existant) — mais les règles Firestore EXCLUENT explicitement les rôles
 * scolaires de `isAdmin()`, sinon un enseignant hériterait des pleins droits sur
 * les éditions, programmes et partenaires (cf. firestore.rules).
 *
 * `establishmentId` et `classIds` sont indispensables dans le token : les règles
 * Firestore ne peuvent pas lire `users/{uid}`, tout le périmètre doit y passer.
 * `classIds` est posé pour les DEUX rôles — un directeur peut enseigner.
 */
function buildSchoolClaims(
  role: 'establishment_admin' | 'teacher',
  establishmentId: string,
  classIds: string[]
): Record<string, unknown> {
  return {
    admin: true,
    establishment_admin: role === 'establishment_admin',
    teacher: role === 'teacher',
    establishmentId,
    classIds,
  };
}

/** Crée le compte Auth ou le réutilise s'il existe déjà (met à jour mdp + nom). */
async function upsertAuthUser(email: string, password: string, displayName: string): Promise<string> {
  const auth = getAdminAuth();
  try {
    const created = await auth.createUser({ email, password, displayName });
    return created.uid;
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'auth/email-already-exists') {
      const existing = await auth.getUserByEmail(email);
      await auth.updateUser(existing.uid, { password, displayName });
      return existing.uid;
    }
    throw err;
  }
}

/**
 * Synchronise la relation inverse `classes/{id}.teacherIds[]` avec le périmètre
 * d'un compte scolaire — 3e source de vérité, à côté du claim `classIds` et de
 * `users/{uid}.teachingClassIds`.
 *
 * Le diff (avant / après) évite deux erreurs symétriques : réécrire le tableau
 * entier délogerait les co-enseignants d'une classe, et ne faire que des ajouts
 * laisserait un enseignant désaffecté visible sur son ancienne classe.
 * `arrayUnion` / `arrayRemove` rendent chaque écriture idempotente : rejouer la
 * synchronisation ne fait aucun dégât, ce qui est la porte de sortie en cas
 * d'échec partiel (cf. commentaire d'appel).
 *
 * Les classes supprimées entre-temps sont ignorées : le `merge: true` recréerait
 * un document fantôme, on vérifie donc l'existence avant d'écrire.
 */
async function synchroniserTeacherIds(
  uid: string,
  classIdsAvant: string[],
  classIdsApres: string[]
): Promise<void> {
  const apres = new Set(classIdsApres);
  const avant = new Set(classIdsAvant);
  const ajoutes = classIdsApres.filter((cid) => !avant.has(cid));
  const retires = classIdsAvant.filter((cid) => !apres.has(cid));
  if (ajoutes.length === 0 && retires.length === 0) return;

  const db = getAdminFirestore();
  const ecrire = async (cid: string, operation: FieldValue) => {
    const ref = db.collection(COLLECTIONS.classes).doc(cid);
    const snap = await ref.get();
    if (!snap.exists) return; // classe supprimée depuis l'affectation : on ignore.
    await ref.update({ teacherIds: operation, updatedAt: Date.now() });
  };

  await Promise.all([
    ...ajoutes.map((cid) => ecrire(cid, FieldValue.arrayUnion(uid))),
    ...retires.map((cid) => ecrire(cid, FieldValue.arrayRemove(uid))),
  ]);
}

/**
 * Vérifie que chaque classe visée existe ET appartient bien à l'établissement.
 * Renvoie un message d'erreur, ou `null` si tout est bon.
 *
 * ⚠️ Indispensable : sans ce contrôle, un directeur pourrait affecter un de ses
 * enseignants à la classe d'un AUTRE établissement — le claim `classIds` posé
 * derrière lui en donnerait l'accès en lecture, règles Firestore comprises
 * (`maClasse(cid)` ne regarde que l'id du document, pas son établissement).
 */
async function assertClassesDeLEtablissement(
  classIds: string[],
  establishmentId: string
): Promise<string | null> {
  if (classIds.length === 0) return null;
  const db = getAdminFirestore();
  for (const cid of classIds) {
    const snap = await db.collection(COLLECTIONS.classes).doc(cid).get();
    if (!snap.exists) return `Classe introuvable : ${cid}.`;
    if (snap.data()?.establishmentId !== establishmentId) {
      return 'Une des classes sélectionnées n’appartient pas à votre établissement.';
    }
  }
  return null;
}

/**
 * Licence de l'établissement : renvoie un message d'erreur si elle a expiré,
 * `null` sinon. Une licence sans échéance (`licenseValidUntil` absent) est
 * considérée valide — c'est le cas d'un contrat en cours de négociation, on ne
 * bloque pas un client sur une donnée jamais saisie.
 */
async function verifierLicence(establishmentId: string): Promise<string | null> {
  const db = getAdminFirestore();
  const snap = await db.collection(COLLECTIONS.establishments).doc(establishmentId).get();
  if (!snap.exists) return 'Établissement introuvable.';
  const data = snap.data() ?? {};

  if (data.isActive === false) {
    return 'Votre établissement est suspendu. Contactez l’équipe CONCREE.';
  }
  const echeance = typeof data.licenseValidUntil === 'number' ? data.licenseValidUntil : null;
  if (echeance && echeance < Date.now()) {
    const jour = new Date(echeance).toLocaleDateString('fr-FR');
    return `La licence de votre établissement a expiré le ${jour}. Contactez l’équipe CONCREE pour la renouveler.`;
  }
  return null;
}

/**
 * Licence **et** quota de comptes enseignants, à la création d'un compte scolaire.
 *
 * `maxTeachers` vaut 0 = illimité (convention de la fiche établissement, lot 2).
 * Le décompte porte sur les comptes `teacher` **et** `establishment_admin` de
 * l'établissement : ce sont tous des sièges vendus. Les comptes `revoked` en
 * sont exclus de fait, la requête filtrant sur le rôle.
 *
 * ⚠️ Cette vérification n'est PAS transactionnelle : deux créations simultanées
 * pourraient toutes deux passer sous la limite. Le geste étant manuel et rare
 * (un directeur crée ses enseignants un par un), le risque est d'un compte en
 * trop, corrigeable par une révocation — pas d'une faille de sécurité.
 *
 * `emailCible` sert à ne PAS compter deux fois un compte qu'on réécrit :
 * `upsertAuthUser` réutilise un compte existant quand l'e-mail est déjà pris
 * (le directeur réinitialise le mot de passe d'un enseignant en repassant par
 * la création). Sans cette exception, un établissement pile à son quota ne
 * pourrait plus toucher à ses propres comptes.
 */
async function verifierLicenceEtQuota(
  establishmentId: string,
  emailCible: string
): Promise<string | null> {
  const erreurLicence = await verifierLicence(establishmentId);
  if (erreurLicence) return erreurLicence;

  const db = getAdminFirestore();
  const snap = await db.collection(COLLECTIONS.establishments).doc(establishmentId).get();
  const maxTeachers = Number(snap.data()?.maxTeachers ?? 0);
  if (!Number.isFinite(maxTeachers) || maxTeachers <= 0) return null; // 0 = illimité.

  const tous = await db.collection(COLLECTIONS.users)
    .where('establishmentId', '==', establishmentId)
    .where('role', 'in', ['teacher', 'establishment_admin'])
    .get();
  // Le compte qu'on s'apprête à réécrire occupe déjà son siège : on l'exclut.
  const comptes = tous.docs.filter((d) => (d.data()?.email ?? '') !== emailCible);
  if (comptes.length >= maxTeachers) {
    return `Quota atteint : votre licence autorise ${maxTeachers} compte${maxTeachers > 1 ? 's' : ''} enseignant${maxTeachers > 1 ? 's' : ''} (${comptes.length} déjà créé${comptes.length > 1 ? 's' : ''}). Révoquez un compte inutilisé ou contactez l’équipe CONCREE.`;
  }
  return null;
}

/** Ensemble des ids de programmes appartenant à un partenaire. */
async function getPartnerProgramIds(partnerId: string | null): Promise<Set<string>> {
  if (!partnerId) return new Set();
  const db = getAdminFirestore();
  const snap = await db.collection(COLLECTIONS.programs).where('partnerId', '==', partnerId).get();
  return new Set(snap.docs.map((d) => d.id));
}
