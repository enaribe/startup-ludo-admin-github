/**
 * Résolution d'un code de SALLE D'ATTENTE — la porte d'entrée du QR projeté.
 *
 *  GET /api/session/join/<code>
 *      → 200 { sessionId, classId, className, sessionTitle, editionId,
 *              demarree, learners: [{ id, displayName, taken }] }
 *      → 404 si le code est inconnu, expiré, ou si la séance n'est plus ouverte
 *      → 429 si l'IP a trop tenté
 *
 * ══ CE QUE CETTE ROUTE FAIT, ET SURTOUT CE QU'ELLE NE FAIT PAS ═══════════
 *
 * Elle DÉSIGNE une séance et projette la liste des noms de sa classe, pour que
 * l'élève non encore rattaché puisse choisir le sien. Elle **n'autorise rien** :
 *   • le rattachement passe par `POST /api/class/link`, inchangé ;
 *   • l'écriture de la participation est bornée par la règle Firestore
 *     `estCetEleve()`, qui exige `classLinks/{uid}.classId == session.classId`.
 * Un élève d'une autre classe qui scanne le QR obtient donc bien la réponse
 * ci-dessous — puis se voit refuser l'entrée par la base. Le mobile affiche le
 * refus explicite en comparant `classId` à son rattachement, mais la garantie
 * n'est pas dans l'interface : elle est dans les règles.
 *
 * Les trois protections de `/api/class/join/[code]` sont reprises telles quelles,
 * via `_shared.ts` — et c'est volontaire, le limiteur DOIT être commun aux deux
 * routes, sinon un attaquant balaierait les codes par l'une pendant que l'autre
 * le bloque :
 *   • TEMPS   : le code meurt avec la séance (clôture) ou à son expiration ;
 *   • CONTENU : prénom + initiale, jamais l'état civil complet, aucun
 *               `establishmentId`, aucun `externalId`, aucun agrégat ;
 *   • VOLUME  : limite de tentatives par IP.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';
import {
  enregistrerEchec,
  MESSAGE_CODE_INVALIDE,
  normaliserCode,
  resoudreSeanceParCode,
  verifierQuota,
} from '../../../class/_shared';

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
    const seance = await resoudreSeanceParCode(db, codeNormalise);
    // Code inconnu, code expiré et séance close renvoient le MÊME 404, avec le
    // même message : distinguer les cas dirait à un attaquant qu'il a trouvé un
    // code valide, et transformerait le balayage en oracle.
    if (!seance) {
      enregistrerEchec(req);
      return NextResponse.json({ error: MESSAGE_CODE_INVALIDE }, { status: 404 });
    }

    const snap = await db.collection(COLLECTIONS.classLearners(seance.classId)).get();
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
      sessionId: seance.sessionId,
      classId: seance.classId,
      className: seance.className,
      sessionTitle: seance.sessionTitle,
      editionId: seance.editionId,
      demarree: seance.demarree,
      learners,
    });
  } catch (error) {
    console.error('Résolution d’un code de séance :', error);
    return NextResponse.json({ error: 'Erreur de chargement' }, { status: 500 });
  }
}

/**
 * « Fatou », « Diop » → « Fatou D. »
 *
 * L'élève se reconnaît dans la liste, mais un curieux qui obtiendrait le code
 * pendant la séance ne repart pas avec la liste nominative complète d'une classe
 * de mineurs. Même règle que `/api/class/join/[code]` — les deux portes doivent
 * projeter exactement la même chose, sans quoi l'une deviendrait la faille de
 * l'autre.
 */
function nomAffiche(prenom: string, nom: string): string {
  const p = prenom.trim();
  const initiale = nom.trim().charAt(0).toUpperCase();
  if (!p) return initiale ? `${initiale}.` : 'Élève';
  return initiale ? `${p} ${initiale}.` : p;
}
