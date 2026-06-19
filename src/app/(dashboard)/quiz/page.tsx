'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { HelpCircle, ExternalLink } from 'lucide-react';
import { getEditions } from '@/lib/firestore-service';
import type { EditionData } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';

const EDITION_COLORS: Record<string, string> = {
  classic: '#FFBC40', agriculture: '#4CAF50', education: '#4A90E2',
  sante: '#F44336', tourisme: '#FFB347', culture: '#9B59B6',
};

export default function QuizPage() {
  const router = useRouter();
  const [editions, setEditions] = useState<EditionData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setEditions(await getEditions()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalQuiz = editions.reduce((sum, e) => sum + (e.quizzes?.length ?? 0), 0);

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  return (
    <div>
      <div className="mb-6">
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {totalQuiz} question{totalQuiz !== 1 ? 's' : ''} de quiz au total, reparties dans {editions.length} edition{editions.length !== 1 ? 's' : ''}
        </p>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
          Les quiz sont geres directement dans chaque edition. Cliquez sur une edition pour modifier ses quiz.
        </p>
      </div>

      {editions.length === 0 ? (
        <EmptyState
          icon={<HelpCircle size={40} />}
          title="Aucune edition"
          description="Creez d'abord une edition pour ajouter des quiz."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editions.map((ed) => {
            const color = EDITION_COLORS[ed.id] || '#FFBC40';
            const quizCount = ed.quizzes?.length ?? 0;
            return (
              <button
                key={ed.id}
                onClick={() => router.push(`/editions/${ed.id}`)}
                className="glass-card p-5 text-left transition-all duration-200"
                style={{ cursor: 'pointer', border: '1px solid var(--color-card-border)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${color}40`; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-card-border)'; }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <HelpCircle size={16} color={color} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{ed.name}</span>
                  </div>
                  <ExternalLink size={14} color="var(--color-text-muted)" />
                </div>
                <div style={{ fontSize: 28, fontFamily: "'Luckiest Guy', cursive", color, marginBottom: 4 }}>
                  {quizCount}
                </div>
                <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  question{quizCount !== 1 ? 's' : ''} de quiz
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
