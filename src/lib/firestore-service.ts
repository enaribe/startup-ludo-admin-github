/**
 * Firestore Service - CRUD operations for admin dashboard
 * Handles all data read/write to Firebase
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  getCountFromServer,
  serverTimestamp,
  type DocumentData,
} from 'firebase/firestore';
import { firestore, COLLECTIONS } from './firebase';
import type {
  EditionData,
  EditionId,
  ChallengeProgram,
  ProgramPartner,
  PartnerProgram,
  ProgramEnrollment,
  ProgramLeadStatus,
  ProgramSessionDoc,
  IdeationDeck,
  DefaultProject,
  Achievement,
  ProgressionConfig,
  BoardConfig,
  DashboardStats,
} from '@/types';

// ===== EDITIONS =====

export async function getEditions(): Promise<EditionData[]> {
  const snap = await getDocs(collection(firestore, COLLECTIONS.editions));
  return snap.docs.map((d) => ({ id: d.id as EditionId, ...d.data() } as EditionData));
}

export async function getEdition(editionId: string): Promise<EditionData | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.editions, editionId));
  if (!snap.exists()) return null;
  return { id: snap.id as EditionId, ...snap.data() } as EditionData;
}

export async function saveEdition(editionId: string, data: Omit<EditionData, 'id'>): Promise<void> {
  await setDoc(doc(firestore, COLLECTIONS.editions, editionId), {
    ...data,
    updatedAt: Date.now(),
  });
}

export async function deleteEdition(editionId: string): Promise<void> {
  await deleteDoc(doc(firestore, COLLECTIONS.editions, editionId));
}

// ===== CHALLENGES =====

export async function getChallengePrograms(): Promise<ChallengeProgram[]> {
  const snap = await getDocs(collection(firestore, COLLECTIONS.challenges));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChallengeProgram));
}

export async function getChallengeProgram(programId: string): Promise<ChallengeProgram | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.challenges, programId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ChallengeProgram;
}

export async function saveChallengeProgram(programId: string, data: Omit<ChallengeProgram, 'id'>): Promise<void> {
  await setDoc(doc(firestore, COLLECTIONS.challenges, programId), {
    ...data,
    updatedAt: Date.now(),
  });
}

export async function deleteChallengeProgram(programId: string): Promise<void> {
  await deleteDoc(doc(firestore, COLLECTIONS.challenges, programId));
}

// ===== PARTNERS (programmes partenaires) =====

export async function getPartners(): Promise<ProgramPartner[]> {
  const snap = await getDocs(collection(firestore, COLLECTIONS.partners));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProgramPartner));
}

export async function getPartner(partnerId: string): Promise<ProgramPartner | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.partners, partnerId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as ProgramPartner;
}

export async function savePartner(partnerId: string, data: Omit<ProgramPartner, 'id'>): Promise<void> {
  await setDoc(doc(firestore, COLLECTIONS.partners, partnerId), {
    ...data,
    updatedAt: Date.now(),
  });
}

export async function deletePartner(partnerId: string): Promise<void> {
  await deleteDoc(doc(firestore, COLLECTIONS.partners, partnerId));
}

// ===== PROGRAMS (programmes partenaires) =====

export async function getPrograms(): Promise<PartnerProgram[]> {
  const snap = await getDocs(collection(firestore, COLLECTIONS.programs));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PartnerProgram));
}

export async function getProgramsByPartner(partnerId: string): Promise<PartnerProgram[]> {
  const snap = await getDocs(
    query(collection(firestore, COLLECTIONS.programs), where('partnerId', '==', partnerId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PartnerProgram));
}

/** Programmes gérés par un admin (multi-tenant). */
export async function getProgramsByOwner(ownerId: string): Promise<PartnerProgram[]> {
  const snap = await getDocs(
    query(collection(firestore, COLLECTIONS.programs), where('ownerId', '==', ownerId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PartnerProgram));
}

/**
 * Programmes visibles selon le rôle de l'admin connecté — source unique de scoping :
 *  - super_admin   → tous les programmes
 *  - partner_admin → tous les programmes de son partenaire
 *  - admin         → uniquement les programmes dont il est propriétaire (ownerId)
 */
export async function getScopedPrograms(admin: {
  role: 'admin' | 'super_admin' | 'partner_admin';
  uid: string;
  partnerId?: string | null;
} | null): Promise<PartnerProgram[]> {
  if (!admin) return [];
  if (admin.role === 'super_admin') return getPrograms();
  if (admin.role === 'partner_admin') return admin.partnerId ? getProgramsByPartner(admin.partnerId) : [];
  return getProgramsByOwner(admin.uid);
}

export async function getProgram(programId: string): Promise<PartnerProgram | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.programs, programId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as PartnerProgram;
}

export async function saveProgram(programId: string, data: Omit<PartnerProgram, 'id'>): Promise<void> {
  await setDoc(doc(firestore, COLLECTIONS.programs, programId), {
    ...data,
    updatedAt: Date.now(),
  });
}

export async function deleteProgram(programId: string): Promise<void> {
  await deleteDoc(doc(firestore, COLLECTIONS.programs, programId));
}

/**
 * Duplique un programme : crée une copie indépendante avec un nouvel id/slug.
 * - ownerId et shareToken sont réinitialisés (la copie n'appartient à personne, pas de lien de partage).
 * - Les contentPacks reçoivent de nouveaux ids et pointent vers le nouveau programme.
 * - La sous-collection sourceDocs n'est PAS copiée (documents sources à re-uploader si besoin).
 * Retourne le programme dupliqué (avec son nouvel id).
 */
export async function duplicateProgram(sourceId: string): Promise<PartnerProgram> {
  const src = await getProgram(sourceId);
  if (!src) throw new Error('Programme introuvable.');

  // Nouvel id de document.
  const newRef = doc(collection(firestore, COLLECTIONS.programs));
  const newId = newRef.id;

  const { id: _oldId, ...rest } = src;
  const suffix = newId.slice(0, 5);

  const clonedPacks = (rest.contentPacks ?? []).map((pack, i) => ({
    ...pack,
    id: `pack_${newId}_${i}`,
    programId: newId,
  }));

  const data: Omit<PartnerProgram, 'id'> = {
    ...rest,
    slug: `${rest.slug || 'programme'}-copie-${suffix}`,
    name: `${rest.name} (copie)`,
    ownerId: null,
    shareToken: null,
    contentPacks: clonedPacks,
    // Repart en brouillon inactif pour éviter une publication accidentelle.
    isActive: false,
    updatedAt: Date.now(),
  };

  await setDoc(newRef, data);
  return { id: newId, ...data };
}

// ===== LEADS / CANDIDATS (programEnrollments) =====

/** Candidatures d'un programme ayant un formulaire rempli (= leads). */
export async function getLeadsByProgram(programId: string): Promise<ProgramEnrollment[]> {
  const snap = await getDocs(
    query(collection(firestore, COLLECTIONS.programEnrollments), where('programId', '==', programId))
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ProgramEnrollment))
    .filter((e) => e.formData != null);
}

/** Met à jour le statut CRM d'un lead. */
export async function updateLeadStatus(enrollmentId: string, leadStatus: ProgramLeadStatus): Promise<void> {
  await setDoc(
    doc(firestore, COLLECTIONS.programEnrollments, enrollmentId),
    { leadStatus, updatedAt: Date.now() },
    { merge: true }
  );
}

/** Toutes les inscriptions d'un programme (avec ou sans formulaire) — pour les stats. */
export async function getEnrollmentsByProgram(programId: string): Promise<ProgramEnrollment[]> {
  const snap = await getDocs(
    query(collection(firestore, COLLECTIONS.programEnrollments), where('programId', '==', programId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProgramEnrollment));
}

/** Sessions de jeu d'un programme — pour le funnel d'engagement. */
export async function getSessionsByProgram(programId: string): Promise<ProgramSessionDoc[]> {
  const snap = await getDocs(
    query(collection(firestore, COLLECTIONS.programSessions), where('programId', '==', programId))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProgramSessionDoc));
}

/** Sessions d'un joueur sur un programme donné — pour le suivi détaillé d'un lead. */
export async function getSessionsByUserProgram(
  userId: string,
  programId: string
): Promise<ProgramSessionDoc[]> {
  const snap = await getDocs(
    query(
      collection(firestore, COLLECTIONS.programSessions),
      where('programId', '==', programId),
      where('userId', '==', userId)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProgramSessionDoc));
}

// ===== DOCUMENTS SOURCES (texte extrait, base de génération) =====
// Stocké en sous-collection programs/{id}/sourceDocs/{docId}. Le texte est
// découpé en chunks (sous-sous-collection /chunks) pour rester sous la limite
// Firestore de 1 Mo par document.

const SOURCE_CHUNK_SIZE = 700_000; // caractères/chunk (marge sous 1 Mo)

export interface SourceDocMeta {
  id: string;
  name: string;
  url?: string;
  charCount: number;
  pages: number;
  chunkCount: number;
  extractedAt?: number;
}

/** Enregistre le texte extrait d'un document source (métadonnées + chunks). */
export async function saveSourceDocText(
  programId: string,
  docId: string,
  meta: { name: string; url?: string; pages: number },
  text: string
): Promise<SourceDocMeta> {
  const base = collection(firestore, COLLECTIONS.programs, programId, 'sourceDocs');
  const docRef = doc(base, docId);

  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += SOURCE_CHUNK_SIZE) {
    chunks.push(text.slice(i, i + SOURCE_CHUNK_SIZE));
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

  return { id: docId, name: meta.name, url: meta.url, charCount: text.length, pages: meta.pages, chunkCount: chunks.length };
}

/** Supprime un document source (métadonnées + chunks). */
export async function deleteSourceDoc(programId: string, docId: string): Promise<void> {
  const docRef = doc(firestore, COLLECTIONS.programs, programId, 'sourceDocs', docId);
  const chunksSnap = await getDocs(collection(docRef, 'chunks'));
  await Promise.all(chunksSnap.docs.map((c) => deleteDoc(c.ref)));
  await deleteDoc(docRef);
}

/** Concatène le texte de tous les documents sources d'un programme (pour la génération). */
export async function getSourceDocsText(programId: string): Promise<string> {
  const base = collection(firestore, COLLECTIONS.programs, programId, 'sourceDocs');
  const docsSnap = await getDocs(base);
  const parts: string[] = [];
  for (const d of docsSnap.docs) {
    const chunksSnap = await getDocs(query(collection(d.ref, 'chunks'), orderBy('i')));
    const text = chunksSnap.docs.map((c) => c.data().content as string).join('');
    if (text) parts.push(`### ${d.data().name}\n\n${text}`);
  }
  return parts.join('\n\n---\n\n');
}

// ===== IDEATION CARDS =====

export async function getIdeationDecks(): Promise<IdeationDeck[]> {
  const snap = await getDocs(collection(firestore, COLLECTIONS.ideationCards));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as IdeationDeck));
}

export async function saveIdeationDeck(deckId: string, data: Omit<IdeationDeck, 'id'>): Promise<void> {
  await setDoc(doc(firestore, COLLECTIONS.ideationCards, deckId), {
    ...data,
    updatedAt: Date.now(),
  });
}

export async function deleteIdeationDeck(deckId: string): Promise<void> {
  await deleteDoc(doc(firestore, COLLECTIONS.ideationCards, deckId));
}

// ===== DEFAULT PROJECTS =====

export async function getDefaultProjects(): Promise<DefaultProject[]> {
  const snap = await getDocs(collection(firestore, COLLECTIONS.defaultProjects));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DefaultProject));
}

export async function saveDefaultProject(projectId: string, data: Omit<DefaultProject, 'id'>): Promise<void> {
  await setDoc(doc(firestore, COLLECTIONS.defaultProjects, projectId), data);
}

export async function deleteDefaultProject(projectId: string): Promise<void> {
  await deleteDoc(doc(firestore, COLLECTIONS.defaultProjects, projectId));
}

// ===== ACHIEVEMENTS =====

export async function getAchievements(): Promise<Achievement[]> {
  const snap = await getDocs(collection(firestore, COLLECTIONS.achievements));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Achievement));
}

export async function saveAchievement(achievementId: string, data: Omit<Achievement, 'id'>): Promise<void> {
  await setDoc(doc(firestore, COLLECTIONS.achievements, achievementId), data);
}

export async function deleteAchievement(achievementId: string): Promise<void> {
  await deleteDoc(doc(firestore, COLLECTIONS.achievements, achievementId));
}

// ===== PROGRESSION =====

export async function getProgressionConfig(): Promise<ProgressionConfig | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.gameData, 'progression'));
  if (!snap.exists()) return null;
  return snap.data() as ProgressionConfig;
}

export async function saveProgressionConfig(config: ProgressionConfig): Promise<void> {
  await setDoc(doc(firestore, COLLECTIONS.gameData, 'progression'), {
    ...config,
    updatedAt: Date.now(),
  });
}

// ===== BOARD CONFIG =====

export async function getBoardConfig(): Promise<BoardConfig | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.gameData, 'boardConfig'));
  if (!snap.exists()) return null;
  return snap.data() as BoardConfig;
}

export async function saveBoardConfig(config: BoardConfig): Promise<void> {
  await setDoc(doc(firestore, COLLECTIONS.gameData, 'boardConfig'), {
    ...config,
    updatedAt: Date.now(),
  });
}

// ===== DASHBOARD STATS =====

export async function getDashboardStats(): Promise<DashboardStats> {
  const [usersCount, gamesCount, enrollmentsCount, editionsSnap] = await Promise.all([
    getCountFromServer(collection(firestore, COLLECTIONS.users)),
    getCountFromServer(collection(firestore, COLLECTIONS.gameSessions)),
    getCountFromServer(collection(firestore, COLLECTIONS.challengeEnrollments)),
    getDocs(collection(firestore, COLLECTIONS.editions)),
  ]);

  return {
    totalUsers: usersCount.data().count,
    activeUsers: 0, // TODO: calculate from recent sessions
    totalGames: gamesCount.data().count,
    totalChallengeEnrollments: enrollmentsCount.data().count,
    editionsCount: editionsSnap.size,
  };
}

// ===== USERS (read-only for admin) =====

export async function getUsers(maxCount = 50): Promise<DocumentData[]> {
  const q = query(collection(firestore, COLLECTIONS.users), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getUserStats(userId: string): Promise<DocumentData | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.userStats, userId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
