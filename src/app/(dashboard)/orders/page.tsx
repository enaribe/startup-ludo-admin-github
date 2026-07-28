'use client';

/**
 * Commandes — précommandes envoyées depuis le site vitrine startupludo web
 * (collection `preorders`). Suivi de statut : nouvelle → contactée →
 * confirmée → livrée / annulée. Export CSV.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Download, ShoppingCart, Search, Trash2 } from 'lucide-react';
import {
  getPreorders,
  updatePreorderStatus,
  deletePreorder,
  type Preorder,
  type PreorderStatus,
} from '@/lib/firestore-service';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import { timeAgo } from '@/components/leads/shared';
import toast from 'react-hot-toast';

const STATUS_META: Record<PreorderStatus, { label: string; color: string; bg: string }> = {
  new: { label: 'Nouvelle', color: '#F5A623', bg: 'rgba(245,166,35,0.14)' },
  contacted: { label: 'Contactée', color: '#5B8DEF', bg: 'rgba(91,141,239,0.14)' },
  confirmed: { label: 'Confirmée', color: '#3FAE6B', bg: 'rgba(63,174,107,0.14)' },
  delivered: { label: 'Livrée', color: '#9B8CFF', bg: 'rgba(155,140,255,0.14)' },
  cancelled: { label: 'Annulée', color: '#F44336', bg: 'rgba(244,67,54,0.12)' },
};

const PRODUCT_META: Record<string, { label: string; color: string; bg: string }> = {
  classique: { label: 'Édition Classique', color: '#FFBC40', bg: 'rgba(255,188,64,0.14)' },
  kids: { label: 'Édition Kids', color: '#F76A5E', bg: 'rgba(247,106,94,0.14)' },
  xxl: { label: 'XXL', color: '#5B8DEF', bg: 'rgba(91,141,239,0.14)' },
};

type FilterKey = 'all' | 'new' | 'boxes' | 'xxl';

export default function OrdersPage() {
  const [orders, setOrders] = useState<Preorder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Preorder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrders(await getPreorders());
    } catch {
      toast.error('Erreur de chargement des commandes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const total = orders.length;
    const fresh = orders.filter((o) => o.status === 'new').length;
    const confirmed = orders.filter((o) => o.status === 'confirmed' || o.status === 'delivered').length;
    const units = orders
      .filter((o) => o.status !== 'cancelled' && o.product !== 'xxl')
      .reduce((sum, o) => sum + (o.quantity ?? 1), 0);
    return { total, fresh, confirmed, units };
  }, [orders]);

  const filtered = useMemo(() => {
    let out = orders;
    if (filter === 'new') out = out.filter((o) => o.status === 'new');
    else if (filter === 'boxes') out = out.filter((o) => o.product !== 'xxl');
    else if (filter === 'xxl') out = out.filter((o) => o.product === 'xxl');
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((o) =>
        [o.name, o.email, o.phone, o.city, o.organization].some((v) => (v ?? '').toLowerCase().includes(q)),
      );
    }
    return out;
  }, [orders, filter, search]);

  const setStatus = async (order: Preorder, status: PreorderStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status } : o)));
    if (selected?.id === order.id) setSelected({ ...order, status });
    try {
      await updatePreorderStatus(order.id, status);
    } catch {
      toast.error('Erreur de mise à jour');
      load();
    }
  };

  const remove = async (order: Preorder) => {
    if (!window.confirm(`Supprimer la commande de ${order.name} ?`)) return;
    setOrders((prev) => prev.filter((o) => o.id !== order.id));
    setSelected(null);
    try {
      await deletePreorder(order.id);
      toast.success('Commande supprimée');
    } catch {
      toast.error('Erreur de suppression');
      load();
    }
  };

  const exportCsv = () => {
    const header = ['Date', 'Produit', 'Nom', 'Email', 'Téléphone', 'Quantité', 'Ville', 'Organisation', 'Message', 'Statut'];
    const rows = [
      header,
      ...filtered.map((o) => [
        o.createdAt ? new Date(o.createdAt).toISOString() : '',
        o.product,
        o.name,
        o.email,
        o.phone ?? '',
        String(o.quantity ?? 1),
        o.city ?? '',
        o.organization ?? '',
        o.message ?? '',
        STATUS_META[o.status].label,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'precommandes.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && orders.length === 0) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>Commandes</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {stats.fresh} nouvelles · {stats.total} au total · {stats.confirmed} confirmées · {stats.units} boîtes précommandées
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download size={16} /> Exporter CSV
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {([
          { key: 'all', label: 'Toutes' },
          { key: 'new', label: 'Nouvelles' },
          { key: 'boxes', label: 'Boîtes' },
          { key: 'xxl', label: 'Projets XXL' },
        ] as { key: FilterKey; label: string }[]).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={filter === f.key ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 16px', fontSize: 13 }}
          >
            {f.label}
          </button>
        ))}
        <div className="flex items-center gap-2" style={{ marginLeft: 'auto', position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, color: 'var(--color-text-muted)' }} />
          <input
            className="input-field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher nom, email, ville…"
            style={{ paddingLeft: 32, minWidth: 240 }}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart size={48} />}
          title="Aucune commande"
          description="Les précommandes passées sur le site startupludo apparaîtront ici."
        />
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-surface)', textAlign: 'left' }}>
                {['Reçue', 'Produit', 'Client', 'Contact', 'Qté', 'Ville', 'Statut', ''].map((h, i) => (
                  <th key={i} style={{ padding: '12px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const product = PRODUCT_META[o.product] ?? { label: o.product, color: '#9AA7B4', bg: 'rgba(154,167,180,0.14)' };
                return (
                  <tr key={o.id} onClick={() => setSelected(o)} style={{ borderTop: '1px solid var(--color-card-border)', cursor: 'pointer' }}>
                    <td style={{ padding: '12px 14px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {o.createdAt ? timeAgo(o.createdAt) : '—'}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: product.color, background: product.bg }}>
                        {product.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--color-text-primary)', fontWeight: 600 }}>{o.name}</td>
                    <td style={{ padding: '12px 14px', color: 'var(--color-text-secondary)' }}>
                      <div>{o.email}</div>
                      {o.phone && <div style={{ color: '#5B8DEF', fontSize: 12 }}>{o.phone}</div>}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--color-text-primary)' }}>
                      {o.product === 'xxl' ? '—' : (o.quantity ?? 1)}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--color-text-secondary)' }}>{o.city || '—'}</td>
                    <td style={{ padding: '12px 14px' }} onClick={(e) => e.stopPropagation()}>
                      <select
                        value={o.status}
                        onChange={(e) => setStatus(o, e.target.value as PreorderStatus)}
                        style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: STATUS_META[o.status].color, background: STATUS_META[o.status].bg }}
                      >
                        {(Object.keys(STATUS_META) as PreorderStatus[]).map((s) => (
                          <option key={s} value={s} style={{ color: '#000' }}>{STATUS_META[s].label}</option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '12px 14px' }} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => remove(o)}
                        title="Supprimer"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', opacity: 0.7, display: 'flex' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Détail d'une commande */}
      <Modal open={selected !== null} onClose={() => setSelected(null)} title={selected ? `Commande — ${selected.name}` : ''}>
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
            <DetailRow label="Produit" value={(PRODUCT_META[selected.product] ?? { label: selected.product }).label} />
            <DetailRow label="Reçue" value={selected.createdAt ? new Date(selected.createdAt).toLocaleString('fr-FR') : '—'} />
            <DetailRow label="Email" value={selected.email} />
            {selected.phone && <DetailRow label="Téléphone" value={selected.phone} />}
            {selected.product !== 'xxl' && <DetailRow label="Quantité" value={String(selected.quantity ?? 1)} />}
            {selected.city && <DetailRow label="Ville / pays" value={selected.city} />}
            {selected.organization && <DetailRow label="Organisation" value={selected.organization} />}
            {selected.role && <DetailRow label="Fonction" value={selected.role} />}
            {selected.orgType && <DetailRow label="Type d'organisation" value={selected.orgType} />}
            {selected.format && <DetailRow label="Format envisagé" value={selected.format} />}
            {selected.message && (
              <div>
                <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-muted)', marginBottom: 4 }}>Message</p>
                <p style={{ color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap' }}>{selected.message}</p>
              </div>
            )}
            <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
              <select
                value={selected.status}
                onChange={(e) => setStatus(selected, e.target.value as PreorderStatus)}
                className="input-field"
                style={{ maxWidth: 200 }}
              >
                {(Object.keys(STATUS_META) as PreorderStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
              <a className="btn-secondary" href={`mailto:${selected.email}`} style={{ textDecoration: 'none' }}>
                Répondre par email
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ color: 'var(--color-text-primary)', fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
