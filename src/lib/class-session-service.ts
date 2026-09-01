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
  deleteField,
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
 * ⚠️ « Lancer maintenant » ouvre la SALLE D'ATTENTE, pas la partie : la séance
 * naît `running` avec son code d'entrée, mais sans `startedPlayingAt`. Les
 * apprenants rejoignent, l'enseignant démarre quand la salle est prête.
 *
 * @param sessionId Identifiant du document (généré par l'appelant).
 * @param data      Périmètre et contenu de la séance.
 * @param lancer    True pour ouvrir immédiatement la salle d'attente.
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
  const duree = bornerDuree(data.durationMinutes);
  // Le code naît AVEC la séance ouverte : sans lui, la salle d'attente
  // s'afficherait sans rien à projeter.
  const joinCode = lancer ? await tirerCodeLibre() : null;

  const session: ClassSession = {
    ...data,
    id: sessionId,
    durationMinutes: duree,
    status: lancer ? 'running' : 'scheduled',
    ...(lancer
      ? {
          startedAt: maintenant,
          joinCode,
          joinCodeExpiresAt: expirationCode(duree, maintenant),
        }
      : {}),
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

// ═══════════════════════════════════════════════════════════════════════════
// CODE DE SALLE D'ATTENTE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Expiration du code d'entrée, en ms epoch, pour une séance de `dureeMinutes`.
 *
 * La marge de 20 min couvre la salle d'attente (avant le départ) et les
 * retardataires qui rejoignent en cours de partie.
 *
 * ⚠️ DÉCLARÉE EN `function` ET NON EN `const` : `createClassSession`, plus haut
 * dans le fichier, s'en sert. Un `const` n'est pas hissé — l'appel échouerait à
 * l'exécution avec « Cannot access before initialization ».
 */
function expirationCode(dureeMinutes: number, depuis: number): number {
  return depuis + (dureeMinutes + 20) * 60_000;
}

/** Tire un code au hasard dans l'alphabet lisible (sans O/0 ni I/1). */
function genererCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return code;
}

/**
 * Le code est-il déjà porté par une classe ou une séance dont la fenêtre court ?
 *
 * Passe par `/api/class/verifier-code` : le contrôle est un LISTING, que les
 * règles refusent à un enseignant (sa permission porte sur l'ID du document,
 * pas sur un champ). La route vérifie les DEUX collections — codes de classe et
 * codes de séance partagent le même espace, l'élève les saisit au même endroit.
 *
 * En cas d'échec réseau, on considère le code comme pris : l'appelant en tire un
 * autre. Mieux vaut un tirage de plus qu'un doublon actif.
 */
async function codeDejaActif(code: string): Promise<boolean> {
  try {
    const { getAuth } = await import('firebase/auth');
    const token = await getAuth().currentUser?.getIdToken();
    if (!token) return true;
    const reponse = await fetch('/api/class/verifier-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    });
    if (!reponse.ok) return true;
    const data = (await reponse.json()) as { actif?: boolean };
    return data.actif === true;
  } catch {
    return true;
  }
}

/**
 * Tire un code libre pour une salle d'attente.
 * @throws SeanceError si aucun code libre n'est trouvé en 5 essais. Au-delà,
 *         mieux vaut échouer qu'écrire un doublon : deux séances partageant un
 *         code enverraient des élèves dans la mauvaise partie.
 */
async function tirerCodeLibre(): Promise<string> {
  for (let essai = 0; essai < 5; essai += 1) {
    const candidat = genererCode();
    if (!(await codeDejaActif(candidat))) return candidat;
  }
  throw new SeanceError(
    'Impossible de générer un code d’entrée disponible. Réessayez dans quelques instants.'
  );
}

/**
 * Ouvre la SALLE D'ATTENTE d'une séance : la séance passe `running`, un code
 * d'entrée est généré, mais la partie n'a PAS commencé (`startedPlayingAt`
 * absent). Les élèves rejoignent et s'accumulent ; l'enseignant démarre quand
 * la salle est prête (`demarrerPartie`).
 *
 * Refuse de relancer une séance terminée : `endedAt` serait conservé alors que
 * la séance redeviendrait visible côté élève, et le rapport du lot 6 porterait
 * sur une plage de temps fausse. Pour rejouer un contenu, on duplique la séance.
 *
 * ⚠️ COURSE POSSIBLE sur l'unicité du code, entre la vérification et l'écriture.
 * Le risque est accepté (probabilité négligeable, fenêtre de quelques
 * millisecondes) ; le supprimer imposerait une transaction sur toute la
 * collection, hors de portée des règles côté client. Même arbitrage que
 * `ouvrirFenetreRattachement`.
 *
 * @returns Le code à projeter, et son expiration.
 */
export async function startSession(sessionId: string): Promise<{ joinCode: string; joinCodeExpiresAt: number }> {
  const session = await getClassSession(sessionId);
  if (!session) throw new SeanceError('Séance introuvable.');
  if (session.status === 'ended') {
    throw new SeanceError('Cette séance est terminée. Créez-en une nouvelle à partir du même contenu.');
  }
  // Déjà ouverte avec un code valide : on rend le code existant plutôt que d'en
  // tirer un nouveau — les élèves ont peut-être déjà celui qui est projeté.
  if (session.status === 'running' && session.joinCode && (session.joinCodeExpiresAt ?? 0) > Date.now()) {
    return { joinCode: session.joinCode, joinCodeExpiresAt: session.joinCodeExpiresAt as number };
  }

  await assertLicenceValide(session.establishmentId);
  const joinCode = await tirerCodeLibre();
  const maintenant = Date.now();
  const joinCodeExpiresAt =
    expirationCode(bornerDuree(session.durationMinutes), maintenant);

  await updateDoc(doc(firestore, COLLECTIONS.classSessions, sessionId), {
    status: 'running' satisfies ClassSessionStatus,
    startedAt: session.startedAt ?? maintenant,
    joinCode,
    joinCodeExpiresAt,
    updatedAt: maintenant,
  });
  return { joinCode, joinCodeExpiresAt };
}

/**
 * « Démarrer la partie » — la salle d'attente se ferme, le jeu commence.
 *
 * Ne touche NI au statut NI au code : la séance était déjà `running` (c'est ce
 * qui rendait le code valide), et le code reste actif pour les retardataires.
 * Seul `startedPlayingAt` est posé — c'est lui que le mobile attend pour lancer
 * le plateau.
 */
export async function demarrerPartie(sessionId: string): Promise<number> {
  const maintenant = Date.now();
  await updateDoc(doc(firestore, COLLECTIONS.classSessions, sessionId), {
    startedPlayingAt: maintenant,
    updatedAt: maintenant,
  });
  return maintenant;
}

/**
 * Termine la séance. Les élèves cessent immédiatement de la voir (leur règle de
 * lecture exige `status == 'running'`).
 *
 * Le code d'entrée est effacé dans la même écriture : un code de séance terminée
 * ne doit plus rien ouvrir, et il redevient disponible pour une autre séance.
 */
export async function endSession(sessionId: string): Promise<void> {
  await updateDoc(doc(firestore, COLLECTIONS.classSessions, sessionId), {
    status: 'ended' satisfies ClassSessionStatus,
    endedAt: Date.now(),
    joinCode: null,
    joinCodeExpiresAt: null,
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
  patch: Partial<Omit<ClassSession, 'id' | 'establishmentId' | 'classId' | 'teacherId' | 'scheduledAt'>> & {
    /**
     * `null` EFFACE la programmation (la séance repasse en lancement manuel) —
     * `undefined` ne touche à rien. La distinction compte : `sansIndefinis`
     * retire les `undefined`, un `null` naïf resterait stocké et « Programmée
     * pour » afficherait une date invalide.
     */
    scheduledAt?: number | null;
  }
): Promise<void> {
  const { scheduledAt, ...reste } = patch;
  const données: Record<string, unknown> = sansIndefinis({ ...reste, updatedAt: Date.now() });
  if (scheduledAt !== undefined) {
    données.scheduledAt = scheduledAt === null ? deleteField() : scheduledAt;
  }
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
