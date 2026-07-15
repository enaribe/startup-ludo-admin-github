'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Users as UsersIcon, Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { getUsersWithStats, type AdminUser } from '@/lib/firestore-service';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import toast from 'react-hot-toast';

type SortKey = 'displayName' | 'email' | 'createdAt' | 'level' | 'xp' | 'totalGames' | 'gamesWon';
const PAGE_SIZE = 25;

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: 'displayName', label: 'Nom' },
  { key: 'email', label: 'Email' },
  { key: 'createdAt', label: 'Inscription', numeric: true },
  { key: 'level', label: 'Niveau', numeric: true },
  { key: 'xp', label: 'XP', numeric: true },
  { key: 'totalGames', label: 'Parties', numeric: true },
  { key: 'gamesWon', label: 'Gagnées', numeric: true },
];

export default function UsersPage() {
  const router = useRouter();
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);

  // Réservé au super admin.
  useEffect(() => {
    if (!authLoading && !isSuperAdmin) router.replace('/');
  }, [authLoading, isSuperAdmin, router]);

  const load = useCallback(async () => {
    try {
      setUsers(await getUsersWithStats());
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (isSuperAdmin) load(); }, [isSuperAdmin, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va ?? '').localeCompare(String(vb ?? '')) * dir;
      }
      // null (ex. createdAt manquant) rejeté en fin de tri.
      const na = va ?? -Infinity;
      const nb = vb ?? -Infinity;
      return (na === nb ? 0 : na < nb ? -1 : 1) * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  // Reset de page au changement de filtre/tri.
  useEffect(() => { setPage(0); }, [search, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Par défaut : desc pour les numériques (récents/plus élevés d'abord), asc pour le texte.
      setSortDir(COLUMNS.find((c) => c.key === key)?.numeric ? 'desc' : 'asc');
    }
  };

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  }
  if (!isSuperAdmin) return null;

  const th: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, color: 'var(--color-text)', borderTop: '1px solid var(--color-border)', whiteSpace: 'nowrap' };

  return (
    <div>
      <div className="flex items-center justify-between mb-6" style={{ gap: 16, flexWrap: 'wrap' }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {sorted.length.toLocaleString('fr-FR')} utilisateur{sorted.length !== 1 ? 's' : ''}
          {search && ` (sur ${users.length.toLocaleString('fr-FR')})`}
        </p>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un nom ou un email…"
            style={{ padding: '8px 12px 8px 32px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-text)', fontSize: 13, minWidth: 260 }}
          />
        </div>
      </div>

      {users.length === 0 ? (
        <EmptyState icon={<UsersIcon size={48} />} title="Aucun utilisateur" description="Aucun joueur inscrit pour le moment." />
      ) : (
        <>
          <div className="glass-card" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col.key} style={th} onClick={() => toggleSort(col.key)}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {col.label}
                        {sortKey === col.key && (sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paged.map((u) => (
                  <tr key={u.id}>
                    <td style={{ ...td, fontWeight: 500 }}>{u.displayName}</td>
                    <td style={{ ...td, color: 'var(--color-text-secondary)' }}>{u.email}</td>
                    <td style={td}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : '—'}</td>
                    <td style={td}>{u.level}</td>
                    <td style={td}>{u.xp.toLocaleString('fr-FR')}</td>
                    <td style={td}>{u.totalGames}</td>
                    <td style={td}>{u.gamesWon}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-3 mt-4">
              <button className="btn-secondary" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 13, opacity: safePage === 0 ? 0.5 : 1 }}>
                <ChevronLeft size={15} /> Précédent
              </button>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Page {safePage + 1} / {pageCount}</span>
              <button className="btn-secondary" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 13, opacity: safePage >= pageCount - 1 ? 0.5 : 1 }}>
                Suivant <ChevronRight size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
