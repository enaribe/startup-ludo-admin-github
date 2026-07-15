'use client';

import { useEffect, useState } from 'react';
import { Share2, Copy, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getGlobalStats, type GlobalStats } from '@/lib/firestore-service';
import { useAuth } from '@/lib/auth-context';
import { auth } from '@/lib/firebase';
import StatsView from '@/components/dashboard/StatsView';
import DateRangePicker from '@/components/ui/DateRangePicker';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function AppStatsPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filtre par plage de dates (null = global).
  const [range, setRange] = useState<{ from: Date | null; to: Date | null }>({ from: null, to: null });

  // Partage
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fromMs = range.from?.getTime();
  const toMs = range.to?.getTime();

  useEffect(() => {
    if (!isSuperAdmin) { setLoading(false); return; }
    let cancelled = false;
    setRefreshing(true);
    (async () => {
      try {
        const arg = fromMs || toMs
          ? { from: range.from ?? undefined, to: range.to ?? undefined }
          : undefined;
        const result = await getGlobalStats(arg);
        if (!cancelled) setStats(result);
      } finally {
        if (!cancelled) { setLoading(false); setRefreshing(false); }
      }
    })();
    return () => { cancelled = true; };
    // range.from/to via leurs ms primitifs pour éviter une dépendance sur la référence Date.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, fromMs, toMs]);

  const authHeader = async (): Promise<HeadersInit> => {
    const token = await auth.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  };

  const openShare = async () => {
    setShareOpen(true);
    setShareLoading(true);
    setShareUrl('');
    try {
      const res = await fetch('/api/share/stats', { method: 'POST', headers: await authHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Génération impossible');
      setShareUrl(`${window.location.origin}/share/stats/${data.token}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur');
      setShareOpen(false);
    } finally {
      setShareLoading(false);
    }
  };

  const revokeShare = async () => {
    setShareLoading(true);
    try {
      const res = await fetch('/api/share/stats', { method: 'DELETE', headers: await authHeader() });
      if (!res.ok) throw new Error((await res.json()).error || 'Révocation impossible');
      toast.success('Lien révoqué');
      setShareOpen(false);
      setShareUrl('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur');
    } finally {
      setShareLoading(false);
    }
  };

  const copyShareUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Accès réservé au super administrateur.
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Impossible de charger les statistiques.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Statistiques de l&apos;application</h1>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 14, marginTop: 4 }}>
            Vue globale de Startup Ludo — tous partenaires et programmes confondus.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
          <button className="btn-secondary" onClick={openShare} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Share2 size={16} /> Partager
          </button>
        </div>
      </div>

      {stats.rangeMetrics && (
        <div
          className="glass-card p-4"
          style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', fontSize: 13, color: 'var(--color-text)' }}
        >
          <span style={{ color: 'var(--color-text-muted)' }}>
            Période
            {stats.rangeMetrics.fromMs ? ` du ${new Date(stats.rangeMetrics.fromMs).toLocaleDateString('fr-FR')}` : ''}
            {stats.rangeMetrics.toMs ? ` au ${new Date(stats.rangeMetrics.toMs).toLocaleDateString('fr-FR')}` : ''}
            {' :'}
          </span>
          <span><strong>{stats.rangeMetrics.newUsers.toLocaleString('fr-FR')}</strong> nouveaux joueurs</span>
          <span><strong>{stats.rangeMetrics.games.toLocaleString('fr-FR')}</strong> parties</span>
          <span><strong>{stats.rangeMetrics.enrollments.toLocaleString('fr-FR')}</strong> inscriptions programme</span>
        </div>
      )}

      <div style={{ opacity: refreshing ? 0.5 : 1, transition: 'opacity .15s', pointerEvents: refreshing ? 'none' : undefined }}>
        <StatsView stats={stats} interactive />
      </div>

      {/* Modal de partage */}
      {shareOpen && (
        <div
          onClick={() => setShareOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
        >
          <div className="glass-card p-6" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text)' }}>Partager les statistiques</h3>
              <button onClick={() => setShareOpen(false)} style={{ color: 'var(--color-text-muted)' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Lien public en lecture seule. Toute personne disposant du lien peut voir ces statistiques.
            </p>

            {shareLoading ? (
              <div className="flex items-center justify-center py-6"><LoadingSpinner /></div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                  <input
                    readOnly
                    value={shareUrl}
                    style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13 }}
                  />
                  <button className="btn-secondary" onClick={copyShareUrl} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                    {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copié' : 'Copier'}
                  </button>
                </div>
                <button
                  onClick={revokeShare}
                  style={{ fontSize: 13, color: '#E5484D', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Révoquer ce lien
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
