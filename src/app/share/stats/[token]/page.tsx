'use client';

import { use, useEffect, useState } from 'react';
import StatsView, { type GlobalStatsData } from '@/components/dashboard/StatsView';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function ShareStatsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [stats, setStats] = useState<GlobalStatsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/share/stats/${token}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Lien indisponible');
        return json.stats as GlobalStatsData;
      })
      .then((s) => { if (alive) setStats(s); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Erreur'); });
    return () => { alive = false; };
  }, [token]);

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)', padding: 24 }}>
        <div className="glass-card p-8" style={{ textAlign: 'center', maxWidth: 420 }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>Lien indisponible</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>{error}</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg)' }}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', padding: '32px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div className="mb-6">
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Statistiques · Startup Ludo
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
            Vue globale · partagée en lecture seule
          </p>
        </div>
        <StatsView stats={stats} />
      </div>
    </div>
  );
}
