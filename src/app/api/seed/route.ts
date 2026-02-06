/**
 * Seed API Route - Import data into Firestore using Admin SDK
 * POST /api/seed
 * Body: { editions?: Array<EditionData>, challenges?: Array<ChallengeData>, ideationDecks?: Array<IdeationDeck> }
 *
 * Uses firebase-admin to bypass security rules (server-side only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ideationId = searchParams.get('deleteIdeation');
    if (ideationId) {
      await adminFirestore.collection(COLLECTIONS.ideationCards).doc(ideationId).delete();
      return NextResponse.json({ message: `Deleted ideationCards/${ideationId}` });
    }
    return NextResponse.json({ error: 'No delete target specified' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { editions, challenges, ideationDecks } = body;

    const results: { collection: string; id: string; status: string; counts?: Record<string, number> }[] = [];

    // ===== EDITIONS =====
    if (Array.isArray(editions) && editions.length > 0) {
      for (const edition of editions) {
        const { id, ...data } = edition;
        if (!id) {
          results.push({ collection: 'editions', id: '?', status: 'skipped: no id' });
          continue;
        }

        await adminFirestore.collection(COLLECTIONS.editions).doc(id).set({
          name: data.name || '',
          description: data.description || '',
          icon: data.icon || 'game-controller-outline',
          color: data.color || '#FFBC40',
          sectors: data.sectors || [],
          quizzes: data.quizzes || [],
          duels: data.duels || [],
          fundings: data.fundings || [],
          opportunities: data.opportunities || [],
          challenges: data.challenges || [],
          startupIdeas: data.startupIdeas || [],
          enabled: true,
          updatedAt: Date.now(),
        });

        results.push({
          collection: 'editions',
          id,
          status: 'ok',
          counts: {
            quizzes: (data.quizzes || []).length,
            duels: (data.duels || []).length,
            fundings: (data.fundings || []).length,
            opportunities: (data.opportunities || []).length,
            challenges: (data.challenges || []).length,
          },
        });
      }
    }

    // ===== CHALLENGES =====
    if (Array.isArray(challenges) && challenges.length > 0) {
      for (const challenge of challenges) {
        const { id, ...data } = challenge;
        if (!id) {
          results.push({ collection: 'challenges', id: '?', status: 'skipped: no id' });
          continue;
        }

        await adminFirestore.collection(COLLECTIONS.challenges).doc(id).set({
          ...data,
          updatedAt: Date.now(),
        });

        results.push({
          collection: 'challenges',
          id,
          status: 'ok',
          counts: {
            levels: (data.levels || []).length,
            sectors: (data.sectors || []).length,
          },
        });
      }
    }

    // ===== IDEATION DECKS =====
    if (Array.isArray(ideationDecks) && ideationDecks.length > 0) {
      for (const deck of ideationDecks) {
        const { id, ...data } = deck;
        if (!id) {
          results.push({ collection: 'ideationCards', id: '?', status: 'skipped: no id' });
          continue;
        }

        await adminFirestore.collection(COLLECTIONS.ideationCards).doc(id).set({
          name: data.name || '',
          cards: data.cards || [],
          updatedAt: Date.now(),
        });

        results.push({
          collection: 'ideationCards',
          id,
          status: 'ok',
          counts: {
            cards: (data.cards || []).length,
          },
        });
      }
    }

    if (results.length === 0) {
      return NextResponse.json({ error: 'No data provided. Send { editions: [...] }, { challenges: [...] }, and/or { ideationDecks: [...] }' }, { status: 400 });
    }

    const okCount = results.filter((r) => r.status === 'ok').length;
    return NextResponse.json({
      message: `${okCount}/${results.length} documents imported`,
      results,
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}
