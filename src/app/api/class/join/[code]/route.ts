/**
 * Résolution d'un code de rattachement — **la seule porte d'entrée de l'élève**.
 *
 *  GET /api/class/join/<code>
 *      → 200 { classId, className, learners: [{ id, displayName, taken }] }
 *      → 404 si le code est inconnu OU la fenêtre expirée
 *      → 429 si l'IP a trop tenté
 *
 * ══ POURQUOI CETTE ROUTE EXISTE ══════════════════════════════════════════
 * Un élève n'est pas membre de l'établissement : il n'a aucun claim scolaire,
 * et les règles Firestore lui ferment `classes/{cid}` comme `learners`. Il lui
 * faut donc une porte — celle-ci, volontairement **étroite dans le temps ET
 * dans le contenu** :
 *
 *   • dans le TEMPS  : la fenêtre dure 15 min par défaut. Un code qui fuit est
 *                      déjà expiré. C'est plus solide que de protéger un code
 *                      permanent, et c'est ce qui protège une liste nominative
 *                      d'élèves MINEURS.
 *   • dans le CONTENU: la projection est minimale — prénom + initiale du nom.
 *                      L'élève se reconnaît, l'état civil complet n'est pas
 *                      exposé. Aucun `establishmentId`, aucun `externalId`,
 *                      aucun `linkedUid`, aucun agrégat de progression.
 *   • dans le VOLUME : limite de tentatives par IP, sans quoi la brièveté de la
 *                      fenêtre ne servirait à rien — 32^6 codes se balaient vite
 *                      quand une fenêtre est ouverte quelque part.
 *
 * L'Admin SDK est utilisé ici : la route contourne donc les règles Firestore.
 * C'est délibéré et c'est tout l'intérêt — les règles restent fermées à l'élève,
 * et seule cette projection minimale sort. Toute donnée ajoutée à la réponse est
 * une donnée exposée sans authentification : ne rien élargir sans y réfléchir.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';
import {
  enregistrerEchec,
  MESSAGE_CODE_INVALIDE,
  normaliserCode,
  resoudreClasseParCode,
  verifierQuota,
} from '../../_shared';

/** Un élève tel qu'il est présenté à l'app mobile — projection minimale. */
interface LearnerPublic {
  /** Id du document dans `classes/{cid}/learners`, à renvoyer à `/api/class/link`. */
  id: string;
  /** « Fatou D. » — prénom + initiale du nom. Jamais l'état civil complet. */
  displayName: string;
  /** True = déjà rattaché à un compte : le nom est grisé côté mobile. */
  taken: boolean;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  // Quota AVANT toute lecture Firestore : un balayage ne doit rien coûter.
  const quota = verifierQuota(req);
  if (!quota.autorise) {
    return NextResponse.json(
      { error: 'Trop de tentatives. Patientez quelques minutes avant de réessayer.' },
      { status: 429, headers: { 'Retry-After': String(quota.retryAfterSeconds) } }
    );
  }

  const { code } = await params;
  const codeNormalise = normaliserCode(code);
  if (!codeNormalise) {
    enregistrerEchec(req);
    return NextResponse.json({ error: MESSAGE_CODE_INVALIDE }, { status: 404 });
  }

  try {
    const db = getAdminFirestore();
    const classe = await resoudreClasseParCode(db, codeNormalise);
    // Code inconnu et code expiré renvoient le MÊME 404, avec le même message :
    // distinguer les deux dirait à un attaquant qu'il a trouvé un code valide,
    // et transformerait le balayage en oracle.
    if (!classe) {
      enregistrerEchec(req);
      return NextResponse.json({ error: MESSAGE_CODE_INVALIDE }, { status: 404 });
    }

    const snap = await db.collection(COLLECTIONS.classLearners(classe.classId)).get();
    const learners: LearnerPublic[] = snap.docs
      .map((d) => {
        const data = d.data() as {
          firstName?: string;
          lastName?: string;
          linkedUid?: string | null;
          isActive?: boolean;
        };
        return { id: d.id, data };
      })
      // Un élève retiré (`isActive: false`) n'apparaît jamais : son nom ne doit
      // pas être réclamable, et il n'a plus à figurer dans la liste projetée.
      .filter((e) => e.data.isActive !== false)
      .map((e) => ({
        id: e.id,
        displayName: nomAffiche(e.data.firstName ?? '', e.data.lastName ?? ''),
        taken: !!e.data.linkedUid,
      }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));

    return NextResponse.json({
      classId: classe.classId,
      className: classe.className,
      learners,
    });
  } catch (error) {
    console.error('Résolution d’un code de rattachement :', error);
    return NextResponse.json({ error: 'Erreur de chargement' }, { status: 500 });
  }
}

/**
 * « Fatou », « Diop » → « Fatou D. »
 *
 * L'élève se reconnaît dans la liste, mais un curieux qui obtiendrait le code
 * pendant les quelques minutes d'ouverture ne repart pas avec la liste nominative
 * complète d'une classe de mineurs. Sur un homonyme de prénom, deux « Fatou D. »
 * peuvent coexister : c'est assumé — l'élève choisit dans une liste courte, en
 * classe, avec son enseignant à côté ; et une erreur se corrige par un retrait
 * (qui libère `linkedUid`) puis une réouverture de fenêtre.
 */
function nomAffiche(prenom: string, nom: string): string {
  const p = prenom.trim();
  const initiale = nom.trim().charAt(0).toUpperCase();
  if (!p) return initiale ? `${initiale}.` : 'Élève';
  return initiale ? `${p} ${initiale}.` : p;
}
