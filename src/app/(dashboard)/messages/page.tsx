'use client';

/**
 * Messages — formulaire de contact du site vitrine startupludo web
 * (collection `contactMessages`). Ouverture d'un message → marqué « lu » ;
 * statuts : nouveau → lu → répondu.
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Mail, Search, Trash2 } from 'lucide-react';
import {
  getContactMessages,
  updateContactMessageStatus,
  deleteContactMessage,
  type ContactMessage,
  type ContactStatus,
} from '@/lib/firestore-service';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import { timeAgo } from '@/components/leads/shared';
import toast from 'react-hot-toast';

const STATUS_META: Record<ContactStatus, { label: string; color: string; bg: string }> = {
  new: { label: 'Nouveau', color: '#F5A623', bg: 'rgba(245,166,35,0.14)' },
  read: { label: 'Lu', color: '#5B8DEF', bg: 'rgba(91,141,239,0.14)' },
  answered: { label: 'Répondu', color: '#3FAE6B', bg: 'rgba(63,174,107,0.14)' },
};

type FilterKey = 'all' | 'new' | 'unanswered';

export default function MessagesPage() {
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ContactMessage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMessages(await getContactMessages());
    } catch {
      toast.error('Erreur de chargement des messages');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const total = messages.length;
    const fresh = messages.filter((m) => m.status === 'new').length;
    const answered = messages.filter((m) => m.status === 'answered').length;
    return { total, fresh, answered };
  }, [messages]);

  const filtered = useMemo(() => {
    let out = messages;
    if (filter === 'new') out = out.filter((m) => m.status === 'new');
    else if (filter === 'unanswered') out = out.filter((m) => m.status !== 'answered');
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((m) =>
        [m.name, m.email, m.subject, m.message].some((v) => (v ?? '').toLowerCase().includes(q)),
      );
    }
    return out;
  }, [messages, filter, search]);

  const setStatus = useCallback(async (message: ContactMessage, status: ContactStatus) => {
    setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, status } : m)));
    setSelected((prev) => (prev?.id === message.id ? { ...prev, status } : prev));
    try {
      await updateContactMessageStatus(message.id, status);
    } catch {
      toast.error('Erreur de mise à jour');
      load();
    }
  }, [load]);

  /** Ouvre le détail et marque « lu » si le message était nouveau. */
  const openMessage = (message: ContactMessage) => {
    setSelected(message);
    if (message.status === 'new') setStatus(message, 'read');
  };

  const remove = async (message: ContactMessage) => {
    if (!window.confirm(`Supprimer le message de ${message.name} ?`)) return;
    setMessages((prev) => prev.filter((m) => m.id !== message.id));
    setSelected(null);
    try {
      await deleteContactMessage(message.id);
      toast.success('Message supprimé');
    } catch {
      toast.error('Erreur de suppression');
      load();
    }
  };

  if (loading && messages.length === 0) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>Messages</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {stats.fresh} nouveaux · {stats.total} au total · {stats.answered} répondus
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {([
          { key: 'all', label: 'Tous' },
          { key: 'new', label: 'Nouveaux' },
          { key: 'unanswered', label: 'Sans réponse' },
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
            placeholder="Rechercher nom, email, objet…"
            style={{ paddingLeft: 32, minWidth: 240 }}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Mail size={48} />}
          title="Aucun message"
          description="Les messages envoyés depuis la page contact du site apparaîtront ici."
        />
      ) : (
        <div className="glass-card" style={{ overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-surface)', textAlign: 'left' }}>
                {['Reçu', 'De', 'Objet', 'Message', 'Statut', ''].map((h, i) => (
                  <th key={i} style={{ padding: '12px 14px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} onClick={() => openMessage(m)} style={{ borderTop: '1px solid var(--color-card-border)', cursor: 'pointer' }}>
                  <td style={{ padding: '12px 14px', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {m.createdAt ? timeAgo(m.createdAt) : '—'}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ color: 'var(--color-text-primary)', fontWeight: m.status === 'new' ? 700 : 600 }}>{m.name}</div>
                    <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{m.email}</div>
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--color-text-secondary)' }}>{m.subject || '—'}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--color-text-muted)', maxWidth: 320 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.message}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px' }} onClick={(e) => e.stopPropagation()}>
                    <select
                      value={m.status}
                      onChange={(e) => setStatus(m, e.target.value as ContactStatus)}
                      style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: STATUS_META[m.status].color, background: STATUS_META[m.status].bg }}
                    >
                      {(Object.keys(STATUS_META) as ContactStatus[]).map((s) => (
                        <option key={s} value={s} style={{ color: '#000' }}>{STATUS_META[s].label}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ padding: '12px 14px' }} onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => remove(m)}
                      title="Supprimer"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', opacity: 0.7, display: 'flex' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Détail d'un message */}
      <Modal open={selected !== null} onClose={() => setSelected(null)} title={selected ? `Message — ${selected.name}` : ''}>
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Reçu {selected.createdAt ? new Date(selected.createdAt).toLocaleString('fr-FR') : '—'} · {selected.email}
              {selected.phone ? ` · ${selected.phone}` : ''}
            </p>
            {selected.subject && (
              <p style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{selected.subject}</p>
            )}
            <p style={{ color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {selected.message}
            </p>
            <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
              <a
                className="btn-primary"
                href={`mailto:${selected.email}${selected.subject ? `?subject=${encodeURIComponent(`Re: ${selected.subject}`)}` : ''}`}
                style={{ textDecoration: 'none' }}
                onClick={() => setStatus(selected, 'answered')}
              >
                Répondre par email
              </a>
              <button className="btn-secondary" onClick={() => setStatus(selected, 'answered')}>
                Marquer répondu
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
