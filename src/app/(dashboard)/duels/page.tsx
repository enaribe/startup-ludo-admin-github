'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Swords, ExternalLink } from 'lucide-react';
import { getEditions } from '@/lib/firestore-service';
import type { EditionData } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';

const EDITION_COLORS: Record<string, string> = {
  classic: '#FFBC40', agriculture: '#4CAF50', education: '#4A90E2',
  sante: '#F44336', tourisme: '#FFB347', culture: '#9B59B6',
};

export default function DuelsPage() {
  const router = useRouter();
  const [editions, setEditions] = useState<EditionData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { setEditions(await getEditions()); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalDuels = editions.reduce((sum, e) => sum + (e.duels?.length ?? 0), 0);

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  return (
    <div>
      <div className="mb-6">
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
          {totalDuels} question{totalDuels !== 1 ? 's' : ''} de duel au total
        </p>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
          Les duels sont geres dans chaque edition. Cliquez pour modifier.
        </p>
      </div>

      {editions.length === 0 ? (
        <EmptyState icon={<Swords size={40} />} title="Aucune edition" description="Creez une edition pour ajouter des duels." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editions.map((ed) => {
            const color = EDITION_COLORS[ed.id] || '#FFBC40';
            const duelCount = ed.duels?.length ?? 0;
            return (
              <button
                key={ed.id}
                onClick={() => router.push(`/editions/${ed.id}`)}
                className="glass-card p-5 text-left transition-all duration-200"
                style={{ cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${color}40`; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Swords size={16} color={color} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>{ed.name}</span>
                  </div>
                  <ExternalLink size={14} color="rgba(255,255,255,0.3)" />
                </div>
                <div style={{ fontSize: 28, fontFamily: "'Luckiest Guy', cursive", color, marginBottom: 4 }}>
                  {duelCount}
                </div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  question{duelCount !== 1 ? 's' : ''} de duel
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
