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
  Timestamp,
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

/** Liste des admins gérant un programme (nouveau `ownerIds` + legacy `ownerId`). */
export function programOwnerIds(program: Pick<PartnerProgram, 'ownerIds' | 'ownerId'>): string[] {
  const arr = Array.isArray(program.ownerIds) ? program.ownerIds : [];
  const withLegacy = program.ownerId ? [...arr, program.ownerId] : arr;
  return Array.from(new Set(withLegacy.map((v) => String(v).trim()).filter(Boolean)));
}

/** Programmes gérés par un admin (multi-admin).
 *  Fusionne le nouveau modèle (`ownerIds` array-contains) et l'ancien (`ownerId` ==)
 *  pour rester rétrocompatible avec les programmes non encore migrés. */
export async function getProgramsByOwner(ownerId: string): Promise<PartnerProgram[]> {
  const col = collection(firestore, COLLECTIONS.programs);
  const [byArray, byLegacy] = await Promise.all([
    getDocs(query(col, where('ownerIds', 'array-contains', ownerId))),
    getDocs(query(col, where('ownerId', '==', ownerId))),
  ]);
  const map = new Map<string, PartnerProgram>();
  for (const d of [...byArray.docs, ...byLegacy.docs]) {
    map.set(d.id, { id: d.id, ...d.data() } as PartnerProgram);
  }
  return Array.from(map.values());
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
    ownerIds: [],
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

// ===== GLOBAL STATS (super admin) =====

export interface GlobalStats {
  totalUsers: number;
  totalGames: number;
  totalPrograms: number;
  totalPartners: number;
  totalEnrollments: number;
  formsSubmitted: number;
  activeUsers7d: number;
  activeUsers30d: number;
  programSessions: number;
  conversionRate: number; // % d'inscriptions ayant soumis le formulaire
  /** Inscriptions par jour (30 derniers jours) pour le graphe d'évolution. */
  enrollmentTimeline: { label: string; count: number }[];
  /** Top programmes par nombre d'inscriptions. */
  topPrograms: { name: string; count: number }[];
  /**
   * Métriques restreintes à la plage de dates demandée (présent uniquement si un
   * range est fourni). Les KPI « total » ci-dessus restent globaux.
   */
  rangeMetrics?: {
    newUsers: number;    // users.createdAt ∈ [from, to]
    games: number;       // gameSessions.createdAt ∈ [from, to]
    enrollments: number; // programEnrollments.enrolledAt ∈ [from, to]
    /** Bornes appliquées (pour l'affichage), en ms epoch. */
    fromMs: number | null;
    toMs: number | null;
  };
}

/** Plage de dates optionnelle pour restreindre certaines métriques. */
export interface StatsDateRange {
  from?: Date;
  to?: Date;
}

/**
 * Statistiques GLOBALES de l'application (toutes structures confondues).
 * Réservé au super admin. Counts efficaces via getCountFromServer + agrégations
 * sur les inscriptions/sessions programme pour l'engagement et l'évolution.
 *
 * Si un `range` est fourni, on calcule EN PLUS des métriques restreintes à la
 * plage (nouveaux inscrits, parties, inscriptions programme) et la timeline est
 * bornée sur la plage. Les KPI « total », les actifs 7j/30j (fenêtres glissantes)
 * et le top programmes restent globaux. Sans range, comportement historique
 * strictement inchangé (garantit la non-régression du partage public).
 */
export async function getGlobalStats(range?: StatsDateRange): Promise<GlobalStats> {
  const hasRange = !!(range?.from || range?.to);

  const [
    usersCount,
    gamesCount,
    programSessionsCount,
    programs,
    partners,
    enrollmentsSnap,
  ] = await Promise.all([
    getCountFromServer(collection(firestore, COLLECTIONS.users)),
    getCountFromServer(collection(firestore, COLLECTIONS.gameSessions)),
    getCountFromServer(collection(firestore, COLLECTIONS.programSessions)),
    getPrograms(),
    getPartners(),
    getDocs(collection(firestore, COLLECTIONS.programEnrollments)),
  ]);

  const enrollments = enrollmentsSnap.docs.map((d) => d.data() as ProgramEnrollment);
  const totalEnrollments = enrollments.length;
  const formsSubmitted = enrollments.filter((e) => e.formData != null).length;
  const conversionRate =
    totalEnrollments > 0 ? Math.round((formsSubmitted / totalEnrollments) * 100) : 0;

  // Joueurs actifs : basés sur lastPlayedAt (dernière partie de programme jouée).
  const now = Date.now();
  const DAY = 86_400_000;
  const active = (windowDays: number) => {
    const cutoff = now - windowDays * DAY;
    const ids = new Set<string>();
    enrollments.forEach((e) => {
      if (e.lastPlayedAt != null && e.lastPlayedAt >= cutoff) ids.add(e.userId);
    });
    return ids.size;
  };

  // Bornes de la plage (ms). Sans borne, on ouvre à l'infini du côté concerné.
  const fromMs = range?.from ? range.from.getTime() : null;
  const toMs = range?.to ? range.to.getTime() : null;
  const inRange = (ms: number) =>
    (fromMs === null || ms >= fromMs) && (toMs === null || ms <= toMs);

  // Évolution des inscriptions. Sans range : 30 derniers jours (historique).
  // Avec range : bornée sur [from, to], par jour si la plage ≤ 60 jours, sinon
  // agrégée par semaine pour éviter un nombre de barres démesuré.
  const enrollmentTimeline: { label: string; count: number }[] = [];
  if (!hasRange) {
    for (let i = 29; i >= 0; i -= 1) {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - i);
      const startMs = start.getTime();
      const endMs = startMs + DAY;
      const count = enrollments.filter((e) => e.enrolledAt >= startMs && e.enrolledAt < endMs).length;
      enrollmentTimeline.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, count });
    }
  } else {
    const startDay = new Date(fromMs ?? now);
    startDay.setHours(0, 0, 0, 0);
    const endDay = new Date(toMs ?? now);
    endDay.setHours(0, 0, 0, 0);
    const spanDays = Math.max(1, Math.round((endDay.getTime() - startDay.getTime()) / DAY) + 1);
    const bucketDays = spanDays <= 60 ? 1 : 7;
    for (let cursor = startDay.getTime(); cursor <= endDay.getTime(); cursor += bucketDays * DAY) {
      const bucketStart = cursor;
      const bucketEnd = cursor + bucketDays * DAY;
      const count = enrollments.filter((e) => e.enrolledAt >= bucketStart && e.enrolledAt < bucketEnd).length;
      const d = new Date(bucketStart);
      enrollmentTimeline.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, count });
    }
  }

  // Top programmes par nombre d'inscriptions.
  const byProgram = new Map<string, number>();
  enrollments.forEach((e) => byProgram.set(e.programId, (byProgram.get(e.programId) ?? 0) + 1));
  const topPrograms = programs
    .map((p) => ({ name: p.name, count: byProgram.get(p.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Métriques restreintes à la plage (calcul additionnel uniquement si demandé).
  let rangeMetrics: GlobalStats['rangeMetrics'];
  if (hasRange) {
    // users.createdAt et gameSessions.createdAt sont des Timestamp : on filtre côté
    // serveur via getCountFromServer sur une query bornée.
    // NB : quelques comptes ADMIN écrivent createdAt en number(ms) ; ils ne sont
    // pas comparables à un Timestamp Firestore et seront donc exclus du count
    // filtré — négligeable pour un KPI « nouveaux joueurs ».
    const dateWheres = [
      ...(range?.from ? [where('createdAt', '>=', Timestamp.fromDate(range.from))] : []),
      ...(range?.to ? [where('createdAt', '<=', Timestamp.fromDate(range.to))] : []),
    ];
    const [newUsersCount, gamesInRangeCount] = await Promise.all([
      getCountFromServer(query(collection(firestore, COLLECTIONS.users), ...dateWheres)),
      getCountFromServer(query(collection(firestore, COLLECTIONS.gameSessions), ...dateWheres)),
    ]);
    // programEnrollments.enrolledAt est un number(ms) : filtrage en mémoire (docs
    // déjà chargés ci-dessus).
    const enrollmentsInRange = enrollments.filter((e) => inRange(e.enrolledAt)).length;
    rangeMetrics = {
      newUsers: newUsersCount.data().count,
      games: gamesInRangeCount.data().count,
      enrollments: enrollmentsInRange,
      fromMs,
      toMs,
    };
  }

  return {
    totalUsers: usersCount.data().count,
    totalGames: gamesCount.data().count,
    totalPrograms: programs.length,
    totalPartners: partners.length,
    totalEnrollments,
    formsSubmitted,
    activeUsers7d: active(7),
    activeUsers30d: active(30),
    programSessions: programSessionsCount.data().count,
    conversionRate,
    enrollmentTimeline,
    topPrograms,
    ...(rangeMetrics ? { rangeMetrics } : {}),
  };
}

// ===== USERS (read-only for admin) =====

/** Utilisateur enrichi de ses stats de jeu, pour la liste admin. */
export interface AdminUser {
  id: string;               // uid (= doc id)
  displayName: string;
  email: string;
  createdAt: number | null; // ms epoch, normalisé (voir getUsersWithStats)
  level: number;
  xp: number;
  totalGames: number;
  gamesWon: number;
}

/** Normalise un champ date hétérogène (Timestamp | {seconds} | number ms) en ms. */
function toMillis(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const s = (value as { seconds: number }).seconds;
    return typeof s === 'number' ? s * 1000 : null;
  }
  return null;
}

/**
 * Liste des utilisateurs joints à leurs stats de jeu (collection userStats,
 * même doc id = uid). Bornée à `maxCount` documents, triés par inscription
 * décroissante. Au-delà de cette borne, passer à une pagination serveur
 * (startAfter) — hors périmètre actuel.
 */
export async function getUsersWithStats(maxCount = 500): Promise<AdminUser[]> {
  // On charge les users récents en priorité. orderBy('createdAt') écarte les rares
  // docs sans createdAt trié (comptes admin en number) — acceptable ici.
  const usersSnap = await getDocs(
    query(collection(firestore, COLLECTIONS.users), orderBy('createdAt', 'desc'), limit(maxCount)),
  );

  // Une seule lecture batch de userStats, indexée par uid (évite N getDoc).
  const statsSnap = await getDocs(collection(firestore, COLLECTIONS.userStats));
  const statsById = new Map<string, DocumentData>();
  statsSnap.docs.forEach((d) => statsById.set(d.id, d.data()));

  return usersSnap.docs.map((d) => {
    const u = d.data();
    const s = statsById.get(d.id) ?? {};
    return {
      id: d.id,
      displayName: (u.displayName as string) || 'Sans nom',
      email: (u.email as string) || '—',
      createdAt: toMillis(u.createdAt),
      level: (s.level as number) ?? (u.level as number) ?? 0,
      xp: (s.xp as number) ?? (u.xp as number) ?? 0,
      totalGames: (s.totalGames as number) ?? 0,
      gamesWon: (s.gamesWon as number) ?? 0,
    };
  });
}

export async function getUserStats(userId: string): Promise<DocumentData | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.userStats, userId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}
