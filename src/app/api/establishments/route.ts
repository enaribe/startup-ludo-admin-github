/**
 * Establishments API — ouverture d'un compte établissement (Mode Classe, lot 6).
 *
 * POURQUOI CETTE ROUTE — jusqu'ici, vendre à une école exigeait **trois gestes
 * manuels dont deux en ligne de commande** : `scripts/seed-establishment.mjs`
 * (ou la console Firebase) pour le document `establishments/{id}`, puis
 * `scripts/set-admin-claims.mjs` pour le compte de direction. Autrement dit, un
 * développeur devait intervenir à chaque vente. Cette route replie les deux
 * gestes en un seul appel, déclenché depuis `/etablissements`.
 *
 * POURQUOI L'ADMIN SDK — la création du compte de direction (`createUser` +
 * `setCustomUserClaims`) n'est possible QUE côté serveur : le SDK client ne
 * pose pas de custom claims. Comme le document et le compte doivent naître
 * ensemble, le document passe lui aussi par l'Admin SDK, dans la même requête.
 *
 * SÉCURITÉ — réservée au **super admin**. C'est le seul rôle qui puisse créer un
 * établissement (cf. `firestore.rules` : `allow create, delete: if isSuperAdmin()`
 * sur `establishments/{eid}`), et c'est cohérent avec `/api/admins`, qui refuse
 * déjà `role: 'establishment_admin'` à tout autre appelant. Le contrôle réutilise
 * `verifierAppelant()` de `@/lib/api-auth` : le périmètre est lu dans l'ID token,
 * jamais dans le corps de la requête.
 *
 *  POST  /api/establishments  → crée le document + le compte de direction
 *  PATCH /api/establishments  → renouvelle la licence, ou active/désactive
 *
 * ⚠️ PAS DE DELETE, volontairement. Supprimer un établissement laisserait ses
 * classes, ses élèves et ses séances orphelins (Firestore ne cascade pas), et
 * les comptes scolaires conserveraient un claim `establishmentId` pointant vers
 * un document disparu. La désactivation (`isActive: false`) est le geste prévu :
 * elle bloque le lancement de séance (contrôle du lot 3) sans rien détruire.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';
import { verifierAppelant } from '@/lib/api-auth';
import { SCHOOL_LEVELS, type SchoolLevel } from '@/types';

/**
 * Exige un appelant super admin, ou renvoie la réponse d'erreur à retourner.
 *
 * On distingue 401 (pas de jeton / jeton invalide) et 403 (jeton valide mais
 * rôle insuffisant) : un appelant dont la session a simplement expiré doit
 * pouvoir le comprendre sans croire qu'on lui a retiré ses droits.
 */
async function exigerSuperAdmin(
  req: NextRequest
): Promise<{ ok: true } | { ok: false; reponse: NextResponse }> {
  const caller = await verifierAppelant(req);
  if (!caller) {
    return {
      ok: false,
      reponse: NextResponse.json({ error: 'Authentification requise.' }, { status: 401 }),
    };
  }
  if (!caller.isSuper) {
    return {
      ok: false,
      reponse: NextResponse.json(
        { error: 'Seul un super admin peut gérer les établissements.' },
        { status: 403 }
      ),
    };
  }
  return { ok: true };
}

/** Le niveau reçu fait-il partie des niveaux connus ? */
function estNiveauValide(valeur: string): valeur is SchoolLevel {
  return (SCHOOL_LEVELS as string[]).includes(valeur);
}

/**
 * Normalise un quota : entier positif, `0` = illimité (convention de la fiche
 * établissement, lot 2). Toute valeur absurde (négative, NaN, décimale) retombe
 * sur 0 plutôt que d'être rejetée — un quota mal saisi ne doit pas bloquer une
 * vente, et « illimité » est le défaut le moins pénalisant pour le client.
 */
function normaliserQuota(valeur: unknown): number {
  const n = Number(valeur);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Normalise une échéance de licence en millisecondes epoch, ou `null`.
 * `null` signifie « aucune échéance » : la licence est alors considérée valide
 * (cf. `verifierLicence` dans `/api/admins`) — c'est le cas d'un contrat en
 * cours de négociation.
 */
function normaliserEcheance(valeur: unknown): number | null {
  const n = Number(valeur);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

/**
 * Identifiant de document valide ? Minuscules, chiffres et tirets uniquement.
 *
 * Le slug est un identifiant de document Firestore ET un segment d'URL
 * (`/etablissement?id=…`) : on interdit tout ce qui pourrait casser l'un ou
 * l'autre (`/`, espaces, accents, points). L'écran propose déjà un slug propre ;
 * ce contrôle sert de filet contre une saisie manuelle.
 */
function estIdentifiantValide(id: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) && id.length >= 2 && id.length <= 60;
}

/**
 * POST — crée l'établissement ET son compte de direction.
 *
 * ORDRE DES OPÉRATIONS, et pourquoi il compte :
 *   1. tous les contrôles qui n'écrivent rien (champs requis, identifiant libre,
 *      e-mail non déjà rattaché à un AUTRE établissement) ;
 *   2. écriture du document `establishments/{id}` ;
 *   3. création (ou réutilisation) du compte Auth, pose des claims, écriture de
 *      `users/{uid}` ;
 *   4. si (3) échoue, **le document créé en (2) est supprimé** — un établissement
 *      sans compte de direction serait invisible et inutilisable pour le client,
 *      et bloquerait la re-création (identifiant déjà pris). Le rollback n'a lieu
 *      que si (2) a bien créé le document dans CETTE requête : on ne supprime
 *      jamais un document préexistant (cf. `documentCree`).
 *
 * ⚠️ Ce n'est pas une transaction Firestore : Auth et Firestore sont deux
 * systèmes distincts, aucune transaction ne peut les couvrir tous les deux. Le
 * compensating delete de l'étape 4 est la meilleure garantie disponible.
 */
export async function POST(req: NextRequest) {
  const garde = await exigerSuperAdmin(req);
  if (!garde.ok) return garde.reponse;

  /** Vrai dès que le document a été écrit : conditionne le rollback. */
  let documentCree = false;
  let identifiant = '';

  try {
    const body: unknown = await req.json();
    const corps = (body ?? {}) as Record<string, unknown>;

    // ===== Établissement =====
    identifiant = String(corps.id ?? '').trim().toLowerCase();
    const nom = String(corps.name ?? '').trim();
    const niveauBrut = String(corps.level ?? '').trim();
    const ville = String(corps.city ?? '').trim();
    const pays = String(corps.country ?? '').trim();

    // ===== Licence =====
    const codeLicence = String(corps.licenseCode ?? '').trim();
    const echeance = normaliserEcheance(corps.licenseValidUntil);
    const maxTeachers = normaliserQuota(corps.maxTeachers);
    const maxLearners = normaliserQuota(corps.maxLearners);

    // ===== Compte de direction =====
    const nomDirection = String(corps.adminDisplayName ?? '').trim();
    const emailDirection = String(corps.adminEmail ?? '').trim().toLowerCase();
    const motDePasse = String(corps.adminPassword ?? '');

    if (!identifiant || !nom || !ville || !pays) {
      return NextResponse.json(
        { error: 'Identifiant, nom, ville et pays de l’établissement sont requis.' },
        { status: 400 }
      );
    }
    if (!estIdentifiantValide(identifiant)) {
      return NextResponse.json(
        {
          error:
            'Identifiant invalide : minuscules, chiffres et tirets uniquement (ex. « ism-dakar »), entre 2 et 60 caractères.',
        },
        { status: 400 }
      );
    }
    if (!estNiveauValide(niveauBrut)) {
      return NextResponse.json({ error: 'Niveau d’enseignement invalide.' }, { status: 400 });
    }
    const niveau: SchoolLevel = niveauBrut;

    if (!nomDirection || !emailDirection || !motDePasse) {
      return NextResponse.json(
        { error: 'Nom, e-mail et mot de passe temporaire du compte de direction sont requis.' },
        { status: 400 }
      );
    }
    if (motDePasse.length < 8) {
      return NextResponse.json(
        { error: 'Le mot de passe temporaire doit faire au moins 8 caractères.' },
        { status: 400 }
      );
    }

    const auth = getAdminAuth();
    const db = getAdminFirestore();
    const refEtablissement = db.collection(COLLECTIONS.establishments).doc(identifiant);

    // ⚠️ UNICITÉ DE L'IDENTIFIANT, AVANT TOUTE ÉCRITURE. Sans ce contrôle, le
    // `set()` de l'étape 2 écraserait silencieusement un établissement existant
    // — et avec lui sa licence, ses quotas et son état d'activation. Le lien
    // entre ses classes et son directeur, eux, survivraient : le client se
    // retrouverait avec les données d'un autre.
    const dejaLa = await refEtablissement.get();
    if (dejaLa.exists) {
      const nomExistant = String(dejaLa.data()?.name ?? identifiant);
      return NextResponse.json(
        {
          error: `L’identifiant « ${identifiant} » est déjà utilisé par l’établissement « ${nomExistant} ». Choisissez-en un autre.`,
        },
        { status: 409 }
      );
    }

    // ⚠️ E-MAIL DÉJÀ PORTEUR D'UN AUTRE RÔLE SCOLAIRE — on réutilise volontiers
    // un compte existant (`upsertCompteDirection` plus bas, même parti pris que
    // `/api/admins`), MAIS jamais s'il est déjà rattaché à un autre
    // établissement : le rebasculer ici lui retirerait sans prévenir l'accès à
    // ses classes actuelles, et le client d'origine perdrait son directeur ou
    // son enseignant du jour au lendemain.
    const conflit = await verifierConflitDeRole(emailDirection, identifiant);
    if (conflit) return NextResponse.json({ error: conflit }, { status: 409 });

    // ===== 2. Document établissement =====
    const maintenant = Date.now();
    await refEtablissement.set({
      name: nom,
      level: niveau,
      city: ville,
      country: pays,
      licenseCode: codeLicence,
      licenseValidUntil: echeance,
      maxTeachers,
      maxLearners,
      isActive: true,
      createdAt: maintenant,
      updatedAt: maintenant,
    });
    documentCree = true;

    // ===== 3. Compte de direction =====
    const uid = await upsertCompteDirection(emailDirection, motDePasse, nomDirection);

    // `establishmentId` DOIT être dans les claims : les règles Firestore ne
    // peuvent pas lire `users/{uid}`, tout le périmètre passe par le token.
    // `classIds: []` est posé dès maintenant — un directeur peut enseigner, et
    // `/api/admins` fera ensuite le diff à partir d'un tableau, pas d'un `null`.
    await auth.setCustomUserClaims(uid, {
      admin: true,
      establishment_admin: true,
      teacher: false,
      establishmentId: identifiant,
      classIds: [],
    });

    await db.collection(COLLECTIONS.users).doc(uid).set(
      {
        email: emailDirection,
        displayName: nomDirection,
        role: 'establishment_admin',
        establishmentId: identifiant,
        teachingClassIds: [],
        // Périmètres des autres rôles : nettoyés, pour éviter tout héritage sur
        // un compte réutilisé (ex. un ancien admin de programme).
        programIds: null,
        programId: null,
        partnerId: null,
        editionIds: null,
        // 1re connexion : le mot de passe temporaire devra être changé.
        mustChangePassword: true,
        createdAt: maintenant,
        updatedAt: maintenant,
      },
      { merge: true }
    );

    return NextResponse.json({
      establishment: {
        id: identifiant,
        name: nom,
        level: niveau,
        city: ville,
        country: pays,
        licenseCode: codeLicence,
        licenseValidUntil: echeance,
        maxTeachers,
        maxLearners,
        isActive: true,
        createdAt: maintenant,
        updatedAt: maintenant,
      },
      admin: { uid, email: emailDirection, displayName: nomDirection },
    });
  } catch (error) {
    // ===== 4. Rollback : pas d'établissement orphelin sans direction =====
    // Le document ne vaut rien sans son compte de direction : personne ne peut
    // s'y connecter, et son identifiant resterait pris, empêchant de rejouer la
    // création après correction. On le supprime donc — et seulement lui, jamais
    // le compte Auth, qui peut préexister à cette requête (`upsertCompteDirection`).
    let noteRollback = '';
    if (documentCree && identifiant) {
      try {
        await getAdminFirestore().collection(COLLECTIONS.establishments).doc(identifiant).delete();
        noteRollback = ' Aucun établissement n’a été créé : vous pouvez réessayer avec le même identifiant.';
      } catch {
        // Le rollback lui-même a échoué (Firestore indisponible) : on le DIT, au
        // lieu de laisser croire que rien n'a été écrit. Le super admin saura
        // qu'il doit vérifier — et l'identifiant lui sera de toute façon refusé
        // au prochain essai, avec un message explicite.
        noteRollback = ` ⚠️ Le document « ${identifiant} » a pu rester créé sans compte de direction : vérifiez la liste avant de réessayer.`;
      }
    }
    const message = error instanceof Error ? error.message : 'Création impossible';
    return NextResponse.json({ error: message + noteRollback }, { status: 500 });
  }
}

/**
 * PATCH — actions sur un établissement existant :
 *   - renouveler la licence (`licenseValidUntil`, et éventuellement les quotas
 *     et le code) ;
 *   - désactiver / réactiver (`isActive`).
 *
 * Ces deux gestes passent par le serveur plutôt que par `saveEstablishment()`
 * (SDK client, lot 2) parce qu'ils sont **réservés au super admin** : les règles
 * Firestore autorisent l'`update` d'un établissement à son propre directeur
 * (`isEstabAdmin() && myEstablishment() == eid`), qui pourrait donc, depuis la
 * console, prolonger sa propre licence ou relever ses quotas. Passer par une
 * route super-admin-only ferme cette porte pour le geste commercial.
 *
 * Chaque champ est optionnel : on n'écrit que ce qui est fourni, pour ne pas
 * réinitialiser un quota en renouvelant une date.
 */
export async function PATCH(req: NextRequest) {
  const garde = await exigerSuperAdmin(req);
  if (!garde.ok) return garde.reponse;

  try {
    const body: unknown = await req.json();
    const corps = (body ?? {}) as Record<string, unknown>;
    const identifiant = String(corps.id ?? '').trim();
    if (!identifiant) {
      return NextResponse.json({ error: 'Identifiant d’établissement requis.' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const ref = db.collection(COLLECTIONS.establishments).doc(identifiant);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Établissement introuvable.' }, { status: 404 });
    }

    // `update` et non `set(merge)` : le document DOIT exister (vérifié juste
    // au-dessus). Un merge recréerait un établissement fantôme sur un
    // identifiant erroné, sans nom ni licence — donc illisible partout.
    const patch: Record<string, unknown> = { updatedAt: Date.now() };

    if (corps.isActive !== undefined) {
      patch.isActive = corps.isActive === true;
    }
    if (corps.licenseValidUntil !== undefined) {
      patch.licenseValidUntil = normaliserEcheance(corps.licenseValidUntil);
    }
    if (corps.licenseCode !== undefined) {
      patch.licenseCode = String(corps.licenseCode ?? '').trim();
    }
    if (corps.maxTeachers !== undefined) {
      patch.maxTeachers = normaliserQuota(corps.maxTeachers);
    }
    if (corps.maxLearners !== undefined) {
      patch.maxLearners = normaliserQuota(corps.maxLearners);
    }

    if (Object.keys(patch).length === 1) {
      return NextResponse.json({ error: 'Aucune modification demandée.' }, { status: 400 });
    }

    await ref.update(patch);
    return NextResponse.json({ id: identifiant, ...patch });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Modification impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ===== Helpers =====

/**
 * L'e-mail est-il déjà porteur d'un rôle scolaire dans un AUTRE établissement ?
 * Renvoie un message d'erreur explicite, ou `null` si la voie est libre.
 *
 * POURQUOI CE REFUS — `upsertCompteDirection` réutilise un compte Auth existant
 * (e-mail déjà pris) : c'est ce qu'on veut pour un compte révoqué qu'on recrée,
 * ou pour un super admin qui se rattache un établissement de test. Mais poser
 * silencieusement `establishmentId: 'nouveau'` sur le directeur d'un client
 * existant lui ferait perdre l'accès à SON établissement — les claims sont
 * remplacés en bloc par `setCustomUserClaims`. Deux clients seraient cassés
 * d'un coup, pour une simple faute de frappe sur l'e-mail.
 *
 * Un compte `revoked`, en revanche, ne bloque pas : c'est précisément le cas
 * qu'on veut pouvoir rejouer.
 */
async function verifierConflitDeRole(
  email: string,
  establishmentIdCible: string
): Promise<string | null> {
  const auth = getAdminAuth();
  let uid: string;
  try {
    const existant = await auth.getUserByEmail(email);
    uid = existant.uid;
  } catch {
    return null; // Aucun compte à cet e-mail : rien à vérifier.
  }

  const db = getAdminFirestore();
  const snap = await db.collection(COLLECTIONS.users).doc(uid).get();
  if (!snap.exists) return null; // Compte Auth sans doc `users` : rien à écraser.

  const data = snap.data() ?? {};
  const role = String(data.role ?? '');
  const establishmentId = data.establishmentId ? String(data.establishmentId) : '';

  if ((role === 'establishment_admin' || role === 'teacher') && establishmentId && establishmentId !== establishmentIdCible) {
    const libelle = role === 'teacher' ? 'enseignant' : 'direction';
    return `L’adresse « ${email} » est déjà le compte de ${libelle} de l’établissement « ${establishmentId} ». Utilisez une autre adresse : rattacher ce compte ici lui retirerait l’accès à son établissement actuel.`;
  }

  return null;
}

/**
 * Crée le compte Auth de la direction, ou le réutilise si l'e-mail est déjà pris
 * (mot de passe et nom sont alors mis à jour).
 *
 * Copie assumée de `upsertAuthUser` de `/api/admins` : le dupliquer plutôt que
 * l'exporter garde les deux routes indépendantes, et cette version-ci n'a pas
 * vocation à diverger. Le conflit de rôle a déjà été écarté par
 * `verifierConflitDeRole` en amont.
 */
async function upsertCompteDirection(
  email: string,
  password: string,
  displayName: string
): Promise<string> {
  const auth = getAdminAuth();
  try {
    const cree = await auth.createUser({ email, password, displayName });
    return cree.uid;
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'auth/email-already-exists') {
      const existant = await auth.getUserByEmail(email);
      await auth.updateUser(existant.uid, { password, displayName });
      return existant.uid;
    }
    throw err;
  }
}
