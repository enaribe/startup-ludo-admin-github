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
