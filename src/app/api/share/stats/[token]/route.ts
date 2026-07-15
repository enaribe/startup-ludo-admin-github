/**
 * Lecture publique des statistiques globales partagées.
 *
 *  GET /api/share/stats/<token>  → { stats }
 *
 * Pas d'authentification : protégé uniquement par le token secret stocké dans
 * `sharedStats/global`. Lecture seule. Calcul via l'admin SDK.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';

const SHARED_STATS_DOC = 'sharedStats/global';
const DAY = 86_400_000;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: 'Lien invalide' }, { status: 400 });

  try {
    const db = getAdminFirestore();

    // Vérifie le token de partage global.
    const shareSnap = await db.doc(SHARED_STATS_DOC).get();
    const validToken = shareSnap.exists ? (shareSnap.data()?.shareToken as string | undefined) : undefined;
    if (!validToken || validToken !== token) {
      return NextResponse.json({ error: 'Lien expiré ou révoqué.' }, { status: 404 });
    }

    const now = Date.now();

    // Joueurs actifs sur TOUTE l'app (parties programme ET libres) : userStats.lastGameAt.
    const activeSince = (windowDays: number) =>
      db
        .collection(COLLECTIONS.userStats)
        .where('lastGameAt', '>=', Timestamp.fromMillis(now - windowDays * DAY))
        .count()
        .get();

    // Counts + collections nécessaires (admin SDK).
    const [usersCount, gamesCount, sessionsCount, active7dCount, active30dCount, programsSnap, partnersSnap, enrollmentsSnap] =
      await Promise.all([
        db.collection(COLLECTIONS.users).count().get(),
        db.collection(COLLECTIONS.gameSessions).count().get(),
        db.collection(COLLECTIONS.programSessions).count().get(),
        activeSince(7),
        activeSince(30),
        db.collection(COLLECTIONS.programs).get(),
        db.collection(COLLECTIONS.partners).get(),
        db.collection(COLLECTIONS.programEnrollments).get(),
      ]);

    const programs = programsSnap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? '' }));
    const enrollments = enrollmentsSnap.docs.map((d) => d.data() as {
      userId: string;
      programId: string;
      formData?: unknown;
      enrolledAt: number;
      lastPlayedAt: number | null;
    });

    const totalEnrollments = enrollments.length;
    const formsSubmitted = enrollments.filter((e) => e.formData != null).length;
    const conversionRate =
      totalEnrollments > 0 ? Math.round((formsSubmitted / totalEnrollments) * 100) : 0;

    const enrollmentTimeline: { label: string; count: number }[] = [];
    for (let i = 29; i >= 0; i -= 1) {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - i);
      const startMs = start.getTime();
      const endMs = startMs + DAY;
      const count = enrollments.filter((e) => e.enrolledAt >= startMs && e.enrolledAt < endMs).length;
      enrollmentTimeline.push({ label: `${start.getDate()}/${start.getMonth() + 1}`, count });
    }

    const byProgram = new Map<string, number>();
    enrollments.forEach((e) => byProgram.set(e.programId, (byProgram.get(e.programId) ?? 0) + 1));
    const topPrograms = programs
      .map((p) => ({ name: p.name, count: byProgram.get(p.id) ?? 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const stats = {
      totalUsers: usersCount.data().count,
      totalGames: gamesCount.data().count,
      totalPrograms: programs.length,
      totalPartners: partnersSnap.size,
      totalEnrollments,
      formsSubmitted,
      activeUsers7d: active7dCount.data().count,
      activeUsers30d: active30dCount.data().count,
      programSessions: sessionsCount.data().count,
      conversionRate,
      enrollmentTimeline,
      topPrograms,
    };

    return NextResponse.json({ stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
