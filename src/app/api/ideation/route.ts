import { NextResponse } from 'next/server';
import { adminFirestore } from '@/lib/firebase-admin';
import { COLLECTIONS } from '@/lib/firebase';

export async function GET() {
  try {
    const snapshot = await adminFirestore.collection(COLLECTIONS.ideationCards).get();
    const decks = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    return NextResponse.json({ decks });
  } catch (error) {
    console.error('[API] Ideation decks fetch error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch ideation decks' },
      { status: 500 }
    );
  }
}
