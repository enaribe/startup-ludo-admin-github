/**
 * Rattachement définitif d'un compte élève à un nom de sa classe.
 *
 *  POST /api/class/link
 *      Authorization: Bearer <idToken Firebase de l'ÉLÈVE>
 *      { code: "ABC234", learnerId: "..." }
 *      → 200 { classId, className, learnerId, displayName }
 *      → 401 jeton absent ou invalide
 *      → 404 code inconnu ou fenêtre fermée
 *      → 409 nom déjà réclamé, ou compte déjà rattaché à un autre nom
 *      → 429 trop de tentatives
 *
 * ══ CE QUE CETTE ROUTE ÉCRIT ═════════════════════════════════════════════
 *   1. `classes/{cid}/learners/{lid}` : `linkedUid` + `linkedAt`
 *   2. `users/{uid}.classIds[]`       : arrayUnion — c'est CE champ qui
 *      permettra à l'élève de voir ses séances au lot 5, sans jamais ressaisir
 *      de code. Le rattachement est permanent ; le code, lui, expire.
 *
 * Les deux écritures sont dans la MÊME transaction : un `linkedUid` posé sans
 * le `classIds` correspondant donnerait un élève rattaché en base mais qui ne
 * voit aucune séance — panne invisible et incompréhensible pour l'enseignant.
 *
 * L'Admin SDK contourne les règles Firestore : c'est délibéré (l'élève n'a
 * aucun droit d'écriture sur `learners`, et il ne doit pas en avoir). Toute la
 * sécurité tient donc dans les contrôles ci-dessous — jeton vérifié, fenêtre
 * valide, learner libre, compte non déjà rattaché — et dans la transaction.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';
import {
  enregistrerEchec,
  MESSAGE_CODE_INVALIDE,
  normaliserCode,
  resoudreClasseParCode,
  verifierQuota,
} from '../_shared';

/** Corps attendu, avant validation. */
interface CorpsBrut {
  code?: unknown;
  learnerId?: unknown;
}

export async function POST(req: NextRequest) {
  // Le limiteur est PARTAGÉ avec `/api/class/join` (même module `_shared`) :
  // sans cela, un attaquant balaierait les codes par cette route pendant que
  // l'autre le bloque.
  const quota = verifierQuota(req);
  if (!quota.autorise) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.' },
      { status: 429, headers: { 'Retry-After': String(quota.retryAfterSeconds) } }
    );
  }

  // ── 1. Authentification de l'élève ───────────────────────────────────
  // L'élève a un VRAI compte (cf. SPEC §1) : pas d'anonyme, pas d'invité.
  // Sans cette vérification, n'importe qui pourrait réclamer les 30 noms d'une
  // classe et bloquer toute la séance.
  const entete = req.headers.get('authorization') || '';
  const jeton = entete.match(/^Bearer (.+)$/)?.[1];
  if (!jeton) {
    return NextResponse.json(
      { error: 'Vous devez être connecté pour rejoindre une classe.' },
      { status: 401 }
    );
  }

  let uid: string;
  try {
    const decode = await getAdminAuth().verifyIdToken(jeton);
    // Un compte anonyme n'a pas d'identité durable : ni certificat nominatif ni
    // suivi individuel ne seraient possibles, et le rattachement — permanent —
    // serait perdu à la première réinstallation.
    if (decode.firebase?.sign_in_provider === 'anonymous') {
      return NextResponse.json(
        { error: 'Créez un compte pour rejoindre votre classe.' },
        { status: 401 }
      );
    }
    uid = decode.uid;
  } catch {
    enregistrerEchec(req);
    return NextResponse.json({ error: 'Session expirée. Reconnectez-vous.' }, { status: 401 });
  }

  // ── 2. Validation du corps ───────────────────────────────────────────
  let corps: CorpsBrut;
  try {
    corps = (await req.json()) as CorpsBrut;
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const code = normaliserCode(typeof corps.code === 'string' ? corps.code : null);
  const learnerId = typeof corps.learnerId === 'string' ? corps.learnerId.trim() : '';
  if (!code || !learnerId) {
    enregistrerEchec(req);
    return NextResponse.json({ error: MESSAGE_CODE_INVALIDE }, { status: 404 });
  }

  try {
    const db = getAdminFirestore();

    // ── 3. La fenêtre est-elle ouverte ? ───────────────────────────────
    const classe = await resoudreClasseParCode(db, code);
    if (!classe) {
      enregistrerEchec(req);
      return NextResponse.json({ error: MESSAGE_CODE_INVALIDE }, { status: 404 });
    }

    const refLearners = db.collection(COLLECTIONS.classLearners(classe.classId));
    const refLearner = refLearners.doc(learnerId);
    const refUser = db.collection(COLLECTIONS.users).doc(uid);

    // ── 4. Rattachement TRANSACTIONNEL ─────────────────────────────────
    //
    // ⚠️ POURQUOI UNE TRANSACTION EST INDISPENSABLE
    // Trente élèves saisissent le code dans la même minute. Sans transaction,
    // deux d'entre eux qui touchent « Fatou D. » au même instant lisent tous
    // les deux `linkedUid: null`, puis écrivent tous les deux : le second
    // ÉCRASE le premier. Résultat — un élève joue sous le nom d'un camarade,
    // le vrai Fatou est éjecté sans message, et le bilan de classe comme les
    // certificats nominatifs sont faux pour l'année.
    //
    // La transaction Firestore rejoue automatiquement l'opération si le
    // document a changé entre la lecture et l'écriture : le second à écrire
    // relit `linkedUid` — désormais non nul — et sort en `NomDejaPris`.
    // C'est le point où le vol d'identité est bloqué, et il n'y en a pas d'autre.
    const resultat = await db.runTransaction(async (tx) => {
      // ⚠️ TOUTES les lectures avant TOUTE écriture : Firestore l'impose.
      const snapLearner = await tx.get(refLearner);
      // Le compte est-il déjà rattaché à un AUTRE nom de CETTE classe ? La
      // requête est bornée à la sous-collection de la classe résolue : on ne
      // balaie jamais les autres classes (un élève peut légitimement être
      // rattaché à plusieurs classes, c'est le cas d'usage multi-matières).
      const snapDejaLie = await tx.get(refLearners.where('linkedUid', '==', uid).limit(1));

      if (!snapLearner.exists) return { erreur: 'Introuvable' } as const;
      const learner = snapLearner.data() as {
        firstName?: string;
        lastName?: string;
        linkedUid?: string | null;
        isActive?: boolean;
      };

      // Un élève retiré n'est pas réclamable : son nom ne figure d'ailleurs pas
      // dans la liste renvoyée par `/api/class/join`.
      if (learner.isActive === false) return { erreur: 'Introuvable' } as const;

      // Idempotence : ce compte a déjà CE nom → succès, pas erreur. L'app
      // mobile peut rejouer l'appel après une coupure réseau sans casser.
      if (learner.linkedUid === uid) {
        return { erreur: null, displayName: nomAffiche(learner.firstName, learner.lastName) } as const;
      }

      // Le nom appartient à quelqu'un d'autre.
      if (learner.linkedUid) return { erreur: 'NomDejaPris' } as const;

      // Le compte est déjà rattaché à un autre nom de cette même classe.
      if (!snapDejaLie.empty) {
        const autre = snapDejaLie.docs[0]!.data() as { firstName?: string; lastName?: string };
        return {
          erreur: 'CompteDejaRattache',
          autreNom: nomAffiche(autre.firstName, autre.lastName),
        } as const;
      }

      const maintenant = Date.now();
      tx.update(refLearner, { linkedUid: uid, linkedAt: maintenant, updatedAt: maintenant });
      // `set(merge)` et non `update` : le document `users/{uid}` existe pour
      // tout joueur, mais un `update` échouerait s'il manquait (compte tout
      // juste créé, doc pas encore écrit par l'app) — et ferait échouer tout le
      // rattachement pour une raison sans rapport.
      tx.set(
        refUser,
        { classIds: FieldValue.arrayUnion(classe.classId), updatedAt: maintenant },
        { merge: true }
      );

      // Miroir `classLinks/{uid}` — indispensable, et volontairement séparé de
      // `users/{uid}.classIds`.
      //
      // POURQUOI : `users/{uid}` est modifiable par son propriétaire
      // (`allow update: if isOwner(userId)` dans firestore.rules), donc son
      // `classIds` est une DÉCLARATION du client, pas une vérité serveur. Une
      // règle de sécurité fondée dessus serait auto-délivrée : l'élève y
      // ajouterait l'id d'une classe devinée pour la lire.
      // `classLinks` est en `allow write: if false` — écrit UNIQUEMENT ici, par
      // l'Admin SDK. C'est lui que la règle d'accès aux séances interroge
      // (`classSessions`, lot 4b) pour vérifier un rattachement RÉEL.
      // Dans la même transaction : un miroir désynchronisé donnerait un élève
      // rattaché qui ne voit aucune séance, ou l'inverse.
      tx.set(
        db.collection('classLinks').doc(uid),
        { classId: classe.classId, learnerId, linkedAt: maintenant },
        { merge: true }
      );

      return { erreur: null, displayName: nomAffiche(learner.firstName, learner.lastName) } as const;
    });

    if (resultat.erreur === 'Introuvable') {
      enregistrerEchec(req);
      return NextResponse.json(
        { error: 'Ce nom ne figure pas dans la classe. Demandez à votre enseignant.' },
        { status: 404 }
      );
    }
    if (resultat.erreur === 'NomDejaPris') {
      return NextResponse.json(
        {
          error:
            'Ce nom vient d’être choisi par un autre élève. Sélectionnez le vôtre dans la liste.',
        },
        { status: 409 }
      );
    }
    if (resultat.erreur === 'CompteDejaRattache') {
      return NextResponse.json(
        {
          error: `Votre compte est déjà rattaché à « ${resultat.autreNom} » dans cette classe. Si ce n’est pas vous, demandez à votre enseignant de vous retirer de la liste puis de rouvrir le rattachement.`,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      classId: classe.classId,
      className: classe.className,
      learnerId,
      displayName: resultat.displayName,
    });
  } catch (error) {
    console.error('Rattachement d’un élève :', error);
    return NextResponse.json({ error: 'Erreur lors du rattachement' }, { status: 500 });
  }
}

/** « Fatou », « Diop » → « Fatou D. » — même projection que `/api/class/join`. */
function nomAffiche(prenom?: string, nom?: string): string {
  const p = (prenom ?? '').trim();
  const initiale = (nom ?? '').trim().charAt(0).toUpperCase();
  if (!p) return initiale ? `${initiale}.` : 'Élève';
  return initiale ? `${p} ${initiale}.` : p;
}
