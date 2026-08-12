/**
 * Service Mode Classe — séances (`classSessions`) et contenu pédagogique associé.
 *
 * Écrit avec le SDK **client** Firebase, comme `school-service.ts` : les écrans
 * du back-office passent par les règles Firestore, seule vraie borne de sécurité.
 *
 * TROIS INVARIANTS, tenus par les règles et reflétés ici :
 *   1. une séance appartient à SON enseignant (`teacherId`) et à UNE de ses
 *      classes (claim `classIds`) — un enseignant ne crée pas de séance pour la
 *      classe d'un collègue ;
 *   2. `establishmentId` est recopié sur la séance pour que le directeur puisse
 *      lister les séances de son établissement par requête filtrée — la seule
 *      forme qu'autorise sa règle ;
 *   3. l'élève ne voit QUE les séances `running` de sa classe : le passage de
 *      `scheduled` à `running` est donc l'acte qui ouvre la séance, pas un
 *      simple changement d'étiquette.
 *
 * CE QUI N'EST PAS ICI, volontairement : aucun code de séance. Le code à
 * 6 caractères vit sur la classe (lot 4a) et ne sert qu'au rattachement.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { firestore, COLLECTIONS } from './firebase';
import type { ClassSession, ClassSessionContent, ClassSessionStatus } from '@/types';

/** Durée minimale d'une séance, en minutes (SPEC §3.2). */
export const DUREE_SEANCE_MIN = 20;
/** Durée maximale d'une séance, en minutes (SPEC §3.2). */
export const DUREE_SEANCE_MAX = 45;
/** Durée proposée par défaut, en minutes. */
export const DUREE_SEANCE_DEFAUT = 30;

/** Ramène une durée saisie dans la plage autorisée. */
export function bornerDuree(minutes: number): number {
  if (!Number.isFinite(minutes)) return DUREE_SEANCE_DEFAUT;
  return Math.min(DUREE_SEANCE_MAX, Math.max(DUREE_SEANCE_MIN, Math.round(minutes)));
}

/** Erreur métier d'une séance (licence, périmètre, état) — message affichable tel quel. */
export class SeanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeanceError';
  }
}

/**
 * Vérifie que la licence de l'établissement autorise le lancement d'une séance.
 *
 * `licenseValidUntil` était déclaré au lot 2 avec la mention « APPLIQUÉ au lot 4 » :
 * c'est ici. Le lancement d'une séance est le bon point de contrôle — c'est
 * l'acte qui consomme le produit, alors que consulter ses classes ou préparer un
 * contenu ne coûte rien et ne doit pas être bloqué à un client dont la licence
 * vient d'expirer (il pourrait être en cours de renouvellement).
 *
 * ⚠️ Contrôle CÔTÉ CLIENT, comme le quota d'élèves du lot 2 : il tient le geste
 * normal, pas un appel Firestore direct. La licence est un engagement commercial,
 * pas une frontière de sécurité — le périmètre `establishmentId`, lui, est bien
 * tenu par les règles.
 *
 * @throws SeanceError si l'établissement est suspendu ou sa licence expirée.
 */
export async function assertLicenceValide(establishmentId: string): Promise<void> {
  if (!establishmentId) return;
  const snap = await getDoc(doc(firestore, COLLECTIONS.establishments, establishmentId));
  if (!snap.exists()) return;
  const data = snap.data() as { isActive?: boolean; licenseValidUntil?: number | null };

  if (data.isActive === false) {
    throw new SeanceError(
      'Votre établissement est suspendu : le lancement de séance est désactivé. Contactez l’équipe CONCREE.'
    );
  }
  const echeance = Number(data.licenseValidUntil ?? 0);
  if (echeance > 0 && echeance < Date.now()) {
    const le = new Date(echeance).toLocaleDateString('fr-FR');
    throw new SeanceError(
      `La licence de votre établissement a expiré le ${le}. Contactez l’équipe CONCREE pour la renouveler.`
    );
  }
}

/**
 * Champs fournis à la création d'une séance. `status`, `createdAt` et les
 * horodatages d'exécution sont posés par le service, jamais par l'appelant.
 */
export type NouvelleSeance = Omit<
  ClassSession,
  'id' | 'status' | 'createdAt' | 'updatedAt' | 'startedAt' | 'endedAt'
>;

/**
 * Retire les clés `undefined` d'un objet avant écriture.
 *
 * Firestore rejette `undefined` (contrairement à `null`). Les champs optionnels
 * de `ClassSession` (`programId`, `levelIndex`, `scheduledAt`…) sont absents
 * dans la majorité des cas : sans ce nettoyage, une séance sur une édition seule
 * échouerait à l'écriture.
 */
function sansIndefinis<T extends Record<string, unknown>>(data: T): Record<string, unknown> {
  const sortie: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(data)) {
    if (valeur !== undefined) sortie[cle] = valeur;
  }
  return sortie;
}

/**
 * Crée une séance.
 *
 * Le `status` initial se déduit de `scheduledAt` : une séance datée dans le
 * futur naît `scheduled`, une séance sans date naît `running` (« Lancer
 * maintenant » du récapitulatif). C'est le service qui tranche, pour qu'aucun
 * écran ne puisse créer une séance déjà `ended` ou `running` par erreur.
 *
 * @param sessionId Identifiant du document (généré par l'appelant).
 * @param data      Périmètre et contenu de la séance.
 * @param lancer    True pour ouvrir immédiatement la séance aux élèves.
 */
export async function createClassSession(
  sessionId: string,
  data: NouvelleSeance,
  lancer: boolean
): Promise<ClassSession> {
  // La licence n'est contrôlée qu'au lancement : préparer une séance reste
  // possible pendant un renouvellement, la jouer non.
  if (lancer) await assertLicenceValide(data.establishmentId);

  const maintenant = Date.now();
  const session: ClassSession = {
    ...data,
    id: sessionId,
    durationMinutes: bornerDuree(data.durationMinutes),
    status: lancer ? 'running' : 'scheduled',
    ...(lancer ? { startedAt: maintenant } : {}),
    createdAt: maintenant,
    updatedAt: maintenant,
  };

  const { id: _id, ...aEcrire } = session;
  void _id;
  await setDoc(doc(firestore, COLLECTIONS.classSessions, sessionId), sansIndefinis(aEcrire));
  return session;
}

/** Charge une séance, ou `null` si elle n'existe pas. */
export async function getClassSession(sessionId: string): Promise<ClassSession | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.classSessions, sessionId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ClassSession;
}

/**
 * Séances d'une classe, de la plus récente à la plus ancienne.
 *
 * Le tri est fait en mémoire et non par `orderBy('createdAt')` : combiné au
 * `where`, celui-ci exigerait un index composite à déployer. Le volume est celui
 * d'une classe sur une année scolaire (quelques dizaines), le coût est nul.
 */
export async function getSessionsByClass(classId: string): Promise<ClassSession[]> {
  const snap = await getDocs(
    query(collection(firestore, COLLECTIONS.classSessions), where('classId', '==', classId))
  );
  return trierParDateDecroissante(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClassSession)));
}

/**
 * Séances créées par un enseignant, toutes classes confondues — c'est
 * l'historique de `/seances`, et la source de la voie « réutiliser une séance »
 * du wizard.
 *
 * C'est la raison d'être de la collection racine : une sous-collection de la
 * classe obligerait à interroger chaque classe séparément.
 */
export async function getSessionsByTeacher(teacherId: string): Promise<ClassSession[]> {
  const snap = await getDocs(
    query(collection(firestore, COLLECTIONS.classSessions), where('teacherId', '==', teacherId))
  );
  return trierParDateDecroissante(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClassSession)));
}

/**
 * Séances d'un établissement — vue du directeur.
 *
 * La règle Firestore compare le champ `establishmentId` du document au claim de
 * l'appelant : la requête DOIT donc porter ce même `where`, sans quoi elle est
 * refusée en bloc (même contrainte que la grille des classes du lot 2).
 */
export async function getSessionsByEstablishment(establishmentId: string): Promise<ClassSession[]> {
  const snap = await getDocs(
    query(
      collection(firestore, COLLECTIONS.classSessions),
      where('establishmentId', '==', establishmentId)
    )
  );
  return trierParDateDecroissante(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClassSession)));
}

/** Tri décroissant sur la date de début, à défaut la date de création. */
function trierParDateDecroissante(sessions: ClassSession[]): ClassSession[] {
  return sessions.sort(
    (a, b) =>
      (b.startedAt ?? b.scheduledAt ?? b.createdAt ?? 0) -
      (a.startedAt ?? a.scheduledAt ?? a.createdAt ?? 0)
  );
}

/**
 * Ouvre la séance aux élèves (`running`) et pose `startedAt`.
 *
 * Refuse de relancer une séance terminée : `endedAt` serait conservé alors que
 * la séance redeviendrait visible côté élève, et le rapport du lot 6 porterait
 * sur une plage de temps fausse. Pour rejouer un contenu, on duplique la séance.
 */
export async function startSession(sessionId: string): Promise<void> {
  const session = await getClassSession(sessionId);
  if (!session) throw new SeanceError('Séance introuvable.');
  if (session.status === 'ended') {
    throw new SeanceError('Cette séance est terminée. Créez-en une nouvelle à partir du même contenu.');
  }
  if (session.status === 'running') return;
  await assertLicenceValide(session.establishmentId);
  await updateDoc(doc(firestore, COLLECTIONS.classSessions, sessionId), {
    status: 'running' satisfies ClassSessionStatus,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

/**
 * Termine la séance. Les élèves cessent immédiatement de la voir (leur règle de
 * lecture exige `status == 'running'`).
 */
export async function endSession(sessionId: string): Promise<void> {
  await updateDoc(doc(firestore, COLLECTIONS.classSessions, sessionId), {
    status: 'ended' satisfies ClassSessionStatus,
    endedAt: Date.now(),
    updatedAt: Date.now(),
  });
}

/**
 * Met à jour les champs fournis d'une séance.
 *
 * `establishmentId`, `classId` et `teacherId` sont volontairement hors du type
 * acceptable : les déplacer reviendrait à changer le propriétaire de la séance,
 * ce que la règle Firestore refuse de toute façon. Mieux vaut que le compilateur
 * l'interdise avant l'aller-retour réseau.
 */
export async function updateSession(
  sessionId: string,
  patch: Partial<Omit<ClassSession, 'id' | 'establishmentId' | 'classId' | 'teacherId'>>
): Promise<void> {
  const données = sansIndefinis({ ...patch, updatedAt: Date.now() });
  await updateDoc(doc(firestore, COLLECTIONS.classSessions, sessionId), données);
}

/** Supprime une séance (brouillon abandonné). Ses sous-collections restent orphelines. */
export async function deleteClassSession(sessionId: string): Promise<void> {
  await deleteDoc(doc(firestore, COLLECTIONS.classSessions, sessionId));
}

// ===== COURS SOURCE DE L'ENSEIGNANT =====
// Même forme que `programs/{id}/sourceDocs` (cf. saveSourceDocText /
// getSourceDocsText dans firestore-service.ts) : métadonnées dans le document,
// texte découpé en chunks dans une sous-sous-collection pour tenir sous la
// limite Firestore de 1 Mo par document.

/** Taille d'un chunk de texte source, en caractères (marge sous la limite de 1 Mo). */
const TAILLE_CHUNK = 700_000;

/** Métadonnées d'un cours déposé sur une séance. */
export interface SeanceSourceDoc {
  /** Identifiant du document source. */
  id: string;
  /** Nom du fichier déposé. */
  name: string;
  /** URL Storage du fichier original, si conservé. */
  url?: string;
  /** Nombre de caractères extraits. */
  charCount: number;
  /** Nombre de pages (0 hors PDF). */
  pages: number;
  /** Nombre de chunks de texte. */
  chunkCount: number;
  /** Date d'extraction, en millisecondes epoch. */
  extractedAt?: number;
}

/** Enregistre le texte extrait d'un cours déposé sur une séance. */
export async function saveSessionSourceDoc(
  sessionId: string,
  docId: string,
  meta: { name: string; url?: string; pages: number },
  text: string
): Promise<SeanceSourceDoc> {
  const base = collection(firestore, COLLECTIONS.classSessionSourceDocs(sessionId));
  const docRef = doc(base, docId);

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += TAILLE_CHUNK) {
    chunks.push(text.slice(i, i + TAILLE_CHUNK));
  }

  await setDoc(docRef, {
    name: meta.name,
    url: meta.url ?? null,
    charCount: text.length,
    pages: meta.pages,
    chunkCount: chunks.length,
    extractedAt: Date.now(),
  });
  await Promise.all(
    chunks.map((content, i) => setDoc(doc(docRef, 'chunks', String(i)), { i, content }))
  );

  return {
    id: docId,
    name: meta.name,
    url: meta.url,
    charCount: text.length,
    pages: meta.pages,
    chunkCount: chunks.length,
  };
}

/** Métadonnées de tous les cours déposés sur une séance. */
export async function getSessionSourceDocs(sessionId: string): Promise<SeanceSourceDoc[]> {
  const snap = await getDocs(collection(firestore, COLLECTIONS.classSessionSourceDocs(sessionId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SeanceSourceDoc));
}

/**
 * Concatène le texte de tous les cours d'une séance — c'est ce texte qui est
 * injecté comme `sourceText` dans le prompt de génération.
 */
export async function getSessionSourceText(sessionId: string): Promise<string> {
  const base = collection(firestore, COLLECTIONS.classSessionSourceDocs(sessionId));
  const docsSnap = await getDocs(base);
  const parties: string[] = [];
  for (const d of docsSnap.docs) {
    const chunksSnap = await getDocs(query(collection(d.ref, 'chunks'), orderBy('i')));
    const texte = chunksSnap.docs.map((c) => c.data().content as string).join('');
    if (texte) parties.push(`### ${d.data().name}\n\n${texte}`);
  }
  return parties.join('\n\n---\n\n');
}

/** Supprime un cours déposé (métadonnées + chunks). */
export async function deleteSessionSourceDoc(sessionId: string, docId: string): Promise<void> {
  const docRef = doc(firestore, COLLECTIONS.classSessionSourceDocs(sessionId), docId);
  const chunksSnap = await getDocs(collection(docRef, 'chunks'));
  await Promise.all(chunksSnap.docs.map((c) => deleteDoc(c.ref)));
  await deleteDoc(docRef);
}

// ===== CONTENU GÉNÉRÉ =====

/** Identifiant fixe du document de contenu d'une séance. */
const DOC_CONTENU = 'generated';

/** Contenu vide, base d'un état d'édition. */
export const CONTENU_VIDE: ClassSessionContent = {
  quizzes: [],
  duels: [],
  fundings: [],
  opportunities: [],
  challengeEvents: [],
};

/**
 * Écrit le contenu généré (ou corrigé par l'enseignant) d'une séance.
 *
 * @param revu True quand l'écriture vient d'une correction manuelle : on
 *             horodate `reviewedAt`, ce qui permettra au rapport du lot 6 de
 *             distinguer un pack relu d'un pack sorti brut de l'IA.
 */
export async function saveSessionContent(
  sessionId: string,
  content: ClassSessionContent,
  revu = false
): Promise<void> {
  const maintenant = Date.now();
  await setDoc(
    doc(firestore, COLLECTIONS.classSessionContent(sessionId), DOC_CONTENU),
    sansIndefinis({
      ...content,
      generatedAt: content.generatedAt ?? maintenant,
      ...(revu ? { reviewedAt: maintenant } : {}),
    }),
    { merge: true }
  );
}

/** Charge le contenu d'une séance, ou `null` si aucun contenu n'a été généré. */
export async function getSessionContent(sessionId: string): Promise<ClassSessionContent | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.classSessionContent(sessionId), DOC_CONTENU));
  if (!snap.exists()) return null;
  return { ...CONTENU_VIDE, ...snap.data() } as ClassSessionContent;
}

/** Nombre total de cartes d'un pack, tous types confondus. */
export function compterCartes(content: ClassSessionContent): number {
  return (
    content.quizzes.length +
    content.duels.length +
    content.fundings.length +
    content.opportunities.length +
    content.challengeEvents.length
  );
}
