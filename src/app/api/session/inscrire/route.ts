/**
 * AUTO-INSCRIPTION À UNE SÉANCE — la porte d'entrée unique de l'élève.
 *
 *  POST /api/session/inscrire
 *      Header : `Authorization: Bearer <idToken>`
 *      Body   : { code: string, nom?: string }
 *      → 200 { sessionId, classId, className, sessionTitle, editionId,
 *              demarree, learnerId, displayName, nouveau }
 *      → 400 nom manquant alors qu'il est requis, ou nom inexploitable
 *      → 401 pas connecté, ou compte anonyme
 *      → 403 ce compte est rattaché à une AUTRE classe
 *      → 404 code inconnu, expiré, ou séance close
 *      → 429 trop de tentatives depuis cette IP
 *
 * ═══ POURQUOI CETTE ROUTE REMPLACE `/api/class/link` ═══
 *
 * L'ancien parcours demandait DEUX choses à l'enseignant avant la première
 * séance : saisir ou importer la liste de ses élèves, et diffuser un code de
 * rattachement DISTINCT du code de séance. Trois conséquences mesurées :
 *
 *   1. Deux codes au même alphabet, indistinguables : le mobile devait tenter
 *      la séance puis retomber sur la classe, et un élève qui voulait juste
 *      jouer se retrouvait parfois à rechoisir son nom.
 *   2. Rien ne fonctionnait sans la liste pré-saisie — une classe sans élèves
 *      renvoyait un refus (« errorEmptyClass ») au moment le plus coûteux :
 *      pendant le cours, devant trente élèves.
 *   3. L'élève choisissait son nom dans une liste, donc il pouvait prendre
 *      celui d'un camarade, et il fallait une transaction pour arbitrer la
 *      course entre deux élèves visant le même nom.
 *
 * Désormais l'élève SAISIT son nom, une fois, et l'enseignant arbitre dans la
 * salle d'attente — au seul moment où il peut vraiment le faire, puisqu'il a la
 * classe devant lui. Le nom du compte n'est pas utilisé : c'est souvent un
 * pseudo, et le rapport comme les certificats sont nominatifs.
 *
 * ═══ CE QUI NE CHANGE PAS : L'ANCRAGE DE SÉCURITÉ ═══
 *
 * C'est le point à ne pas perdre de vue en lisant cette route. Comme
 * `/api/class/link` avant elle, elle écrit `classLinks/{uid}` et
 * `learners/{lid}.linkedUid` avec l'ADMIN SDK, et ces deux documents sont
 * fermés en écriture au client par les règles Firestore. C'est eux
 * qu'interroge `estCetEleve()` pour autoriser l'élève à écrire sa
 * participation. L'auto-inscription change QUI crée la ligne d'élève ; elle ne
 * déplace pas la frontière de confiance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';
import {
  enregistrerEchec,
  MESSAGE_CODE_INVALIDE,
  normaliserCode,
  resoudreSeanceParCode,
  verifierQuota,
} from '../../class/_shared';
import { decouperNom, nomAffiche, normaliserNomSaisi } from '@/lib/nom-eleve';

interface CorpsBrut {
  code?: unknown;
  nom?: unknown;
}

export async function POST(req: NextRequest) {
  // Quota AVANT toute lecture : un balayage de codes ne doit rien coûter.
  const quota = verifierQuota(req);
  if (!quota.autorise) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.' },
      { status: 429, headers: { 'Retry-After': String(quota.retryAfterSeconds) } }
    );
  }

  // ── 1. Authentification ──────────────────────────────────────────────
  const entete = req.headers.get('authorization') || '';
  const jeton = entete.match(/^Bearer (.+)$/)?.[1];
  if (!jeton) {
    return NextResponse.json(
      { error: 'Vous devez être connecté pour rejoindre une séance.' },
      { status: 401 }
    );
  }

  let uid: string;
  try {
    const decode = await getAdminAuth().verifyIdToken(jeton);
    // Un compte anonyme n'a pas d'identité durable : le rattachement — qui vaut
    // pour l'année — serait perdu à la première réinstallation, et aucun
    // certificat nominatif ne serait possible.
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

  // ── 2. Corps ─────────────────────────────────────────────────────────
  let corps: CorpsBrut;
  try {
    corps = (await req.json()) as CorpsBrut;
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const code = normaliserCode(typeof corps.code === 'string' ? corps.code : null);
  if (!code) {
    enregistrerEchec(req);
    return NextResponse.json({ error: MESSAGE_CODE_INVALIDE }, { status: 404 });
  }

  try {
    const db = getAdminFirestore();

    // ── 3. La séance est-elle ouverte ? ────────────────────────────────
    const seance = await resoudreSeanceParCode(db, code);
    if (!seance) {
      enregistrerEchec(req);
      return NextResponse.json({ error: MESSAGE_CODE_INVALIDE }, { status: 404 });
    }

    const refLien = db.collection('classLinks').doc(uid);
    const refLearners = db.collection(COLLECTIONS.classLearners(seance.classId));

    /*
      ── 4. CE COMPTE EST-IL DÉJÀ RATTACHÉ ? ───────────────────────────

      C'est ce qui rend la saisie du nom UNIQUE dans l'année, et non répétée à
      chaque séance. Le rattachement est reconnu par l'`uid`, jamais par le nom
      saisi : deux élèves homonymes restent deux élèves distincts, et un élève
      qui réécrit son nom différemment la fois suivante n'en crée pas un second.

      Conséquence voulue : cette route est IDEMPOTENTE pour un élève déjà
      rattaché à la bonne classe. L'app peut rejouer l'appel après une coupure
      réseau sans rien dupliquer, et sans redemander le nom.
    */
    const snapLien = await refLien.get();
    if (snapLien.exists) {
      const lien = snapLien.data() as { classId?: string; learnerId?: string };

      // Rattaché à une AUTRE classe : refus explicite, nommant la classe de la
      // séance. Un `classLinks/{uid}` ne porte qu'UN `classId` — l'écraser
      // romprait le rattachement d'origine et ferait perdre l'historique de
      // l'élève dans sa première classe.
      if (lien.classId && lien.classId !== seance.classId) {
        return NextResponse.json(
          {
            error: seance.className
              ? `Votre compte est rattaché à une autre classe. Cette séance est réservée à ${seance.className}.`
              : 'Votre compte est rattaché à une autre classe.',
          },
          { status: 403 }
        );
      }

      if (lien.learnerId) {
        const snapLearner = await refLearners.doc(lien.learnerId).get();
        const data = snapLearner.data() as
          | { firstName?: string; lastName?: string; isActive?: boolean }
          | undefined;

        /*
          Un élève EXCLU par l'enseignant garde son `classLinks`, mais son
          learner est `isActive: false`. On le laisse se réinscrire — il sera à
          nouveau visible dans la salle d'attente, et l'enseignant tranchera de
          nouveau. Bloquer ici donnerait un élève définitivement dehors sur un
          geste de l'enseignant peut-être erroné, sans aucun recours pendant le
          cours.
        */
        if (snapLearner.exists && data?.isActive !== false) {
          return NextResponse.json({
            ...projeterSeance(seance),
            learnerId: lien.learnerId,
            displayName: nomAffiche(data?.firstName ?? '', data?.lastName ?? ''),
            nouveau: false,
          });
        }
      }
    }

    // ── 5. Première inscription : le nom est requis ────────────────────
    const nomBrut = typeof corps.nom === 'string' ? corps.nom : '';
    const nom = normaliserNomSaisi(nomBrut);
    if (!nom) {
      /*
        400 ET NON 404 : l'app distingue les deux pour savoir quoi afficher.
        Un 404 renvoie l'élève à la saisie du code ; ce 400 lui demande son nom.
        Le mobile appelle d'abord sans `nom` précisément pour savoir s'il doit
        l'afficher — un élève déjà rattaché ne doit pas être interrogé.
      */
      return NextResponse.json(
        {
          error: nomBrut.trim()
            ? 'Ce nom est trop court ou contient des caractères non autorisés.'
            : 'Indiquez votre nom pour rejoindre la séance.',
          besoinNom: true,
        },
        { status: 400 }
      );
    }

    const { firstName, lastName } = decouperNom(nom);
    const maintenant = Date.now();
    const refLearner = refLearners.doc();

    /*
      ── 6. CRÉATION TRANSACTIONNELLE ──────────────────────────────────

      La transaction ne sert plus à arbitrer une course sur un nom — il n'y a
      plus de liste à se disputer. Elle garantit maintenant que le learner, le
      miroir `classLinks` et le compteur de la classe sont écrits ENSEMBLE : un
      miroir sans learner donnerait un élève autorisé à écrire une participation
      sous un id qui n'existe pas, et un learner sans miroir donnerait un élève
      visible de l'enseignant mais incapable de jouer.

      Elle relit aussi `classLinks` : entre l'étape 4 et ici, un second appel du
      même compte (double tap, reprise réseau) peut avoir créé le lien.
    */
    const resultat = await db.runTransaction(async (tx) => {
      const snapLienFrais = await tx.get(refLien);
      if (snapLienFrais.exists) {
        const lien = snapLienFrais.data() as { classId?: string; learnerId?: string };
        if (lien.classId === seance.classId && lien.learnerId) {
          // Course gagnée par l'autre appel : on rend SON learner, pas un second.
          const snapExistant = await tx.get(refLearners.doc(lien.learnerId));
          const d = snapExistant.data() as { firstName?: string; lastName?: string } | undefined;
          return {
            learnerId: lien.learnerId,
            displayName: nomAffiche(d?.firstName ?? firstName, d?.lastName ?? lastName),
            nouveau: false,
          };
        }
        if (lien.classId && lien.classId !== seance.classId) {
          return { conflit: true } as const;
        }
      }

      tx.set(refLearner, {
        firstName,
        lastName,
        linkedUid: uid,
        linkedAt: maintenant,
        isActive: true,
        /*
          Trace de l'origine : ce learner n'a pas été saisi par l'enseignant,
          l'élève s'est inscrit lui-même pendant cette séance. L'enseignant le
          voit dans la salle d'attente et peut l'exclure ; le rapport de séance
          peut aussi signaler les inscriptions du jour.
        */
        selfEnrolled: true,
        enrolledInSessionId: seance.sessionId,
        createdAt: maintenant,
        updatedAt: maintenant,
      });

      tx.set(
        refLien,
        { classId: seance.classId, learnerId: refLearner.id, linkedAt: maintenant },
        { merge: true }
      );

      /*
        `users/{uid}.classIds` est tenu à jour pour l'affichage (« mes classes »)
        — mais AUCUN droit ne s'y appuie : l'élève écrit lui-même ce document,
        donc une règle fondée dessus serait auto-délivrée. La vérité reste
        `classLinks`. `set(merge)` et non `update` : le document peut ne pas
        exister sur un compte tout juste créé.
      */
      tx.set(
        db.collection(COLLECTIONS.users).doc(uid),
        { classIds: FieldValue.arrayUnion(seance.classId), updatedAt: maintenant },
        { merge: true }
      );

      /*
        `learnerCount` est dénormalisé sur la classe pour l'affichage en grille
        et pour le quota d'établissement. L'incrémenter ici évite de compter la
        sous-collection à chaque lecture — mais c'est aussi la raison pour
        laquelle l'exclusion doit le DÉCRÉMENTER (cf. `/api/class/retirer`).
      */
      tx.set(
        db.collection(COLLECTIONS.classes).doc(seance.classId),
        { learnerCount: FieldValue.increment(1), updatedAt: maintenant },
        { merge: true }
      );

      return { learnerId: refLearner.id, displayName: nomAffiche(firstName, lastName), nouveau: true };
    });

    if ('conflit' in resultat) {
      return NextResponse.json(
        { error: 'Votre compte est rattaché à une autre classe.' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ...projeterSeance(seance),
      learnerId: resultat.learnerId,
      displayName: resultat.displayName,
      nouveau: resultat.nouveau,
    });
  } catch (error) {
    console.error('Auto-inscription à une séance :', error);
    return NextResponse.json({ error: 'Erreur lors de l’inscription.' }, { status: 500 });
  }
}

/** Champs de la séance renvoyés à l'app — jamais `teacherId` ni l'établissement. */
function projeterSeance(seance: {
  sessionId: string;
  classId: string;
  className: string;
  sessionTitle: string;
  editionId: string;
  demarree: boolean;
}) {
  return {
    sessionId: seance.sessionId,
    classId: seance.classId,
    className: seance.className,
    sessionTitle: seance.sessionTitle,
    editionId: seance.editionId,
    demarree: seance.demarree,
  };
}
