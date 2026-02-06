'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Plus, Pencil, Trash2, HelpCircle, Swords, Coins, Star, Zap, Download, Loader2 } from 'lucide-react';
import { getEditions, deleteEdition } from '@/lib/firestore-service';
import type { EditionData } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { SEED_EDITIONS } from '@/lib/seed-data';
import toast from 'react-hot-toast';

const EDITION_COLORS: Record<string, string> = {
  classic: '#FFBC40',
  agriculture: '#4CAF50',
  education: '#4A90E2',
  sante: '#F44336',
  tourisme: '#FFB347',
  culture: '#9B59B6',
};

export default function EditionsPage() {
  const router = useRouter();
  const [editions, setEditions] = useState<EditionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<EditionData | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ editions: SEED_EDITIONS }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error || 'Erreur');
        return;
      }
      toast.success(json.message);
      loadEditions();
    } catch (err) {
      toast.error('Erreur reseau');
    } finally {
      setSeeding(false);
    }
  };

  const loadEditions = useCallback(async () => {
    try {
      const data = await getEditions();
      setEditions(data);
    } catch (error) {
      console.error('Failed to load editions:', error);
      toast.error('Erreur lors du chargement des editions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEditions();
  }, [loadEditions]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteEdition(deleteTarget.id);
      setEditions((prev) => prev.filter((e) => e.id !== deleteTarget.id));
      toast.success(`Edition "${deleteTarget.name}" supprimee`);
    } catch (error) {
      console.error('Delete failed:', error);
      toast.error('Erreur lors de la suppression');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            {editions.length} edition{editions.length !== 1 ? 's' : ''} configuree{editions.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={handleSeed}
            disabled={seeding}
            style={{ fontSize: 12, padding: '8px 14px' }}
          >
            {seeding ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {seeding ? 'Import...' : 'Importer editions'}
          </button>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => router.push('/editions/new')}
          >
            <Plus size={16} />
            Nouvelle Edition
          </button>
        </div>
      </div>

      {/* Grid */}
      {editions.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={48} />}
          title="Aucune edition"
          description="Creez votre premiere edition avec des quiz, duels et evenements."
          action={
            <button className="btn-primary flex items-center gap-2" onClick={() => router.push('/editions/new')}>
              <Plus size={16} />
              Creer une edition
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {editions.map((edition) => {
            const color = EDITION_COLORS[edition.id] || '#FFBC40';
            return (
              <div
                key={edition.id}
                className="glass-card overflow-hidden transition-all duration-200"
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${color}40`; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              >
                {/* Color bar */}
                <div style={{ height: 3, background: color }} />

                <div className="p-5">
                  {/* Title + Status */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: '#FFFFFF', marginBottom: 2 }}>
                        {edition.name}
                      </h3>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                        {edition.id}
                      </p>
                    </div>
                    <span className={`badge ${edition.enabled !== false ? 'badge-success' : 'badge-error'}`}>
                      {edition.enabled !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* Description */}
                  {edition.description && (
                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12, lineHeight: 1.4 }}>
                      {edition.description.length > 80 ? edition.description.slice(0, 80) + '...' : edition.description}
                    </p>
                  )}

                  {/* Stats */}
                  <div className="flex flex-wrap gap-3 mb-4">
                    <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      <HelpCircle size={12} color="#4A90E2" />
                      {edition.quizzes?.length ?? 0} quiz
                    </div>
                    <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      <Swords size={12} color="#FF6B6B" />
                      {edition.duels?.length ?? 0} duels
                    </div>
                    <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      <Coins size={12} color="#50C878" />
                      {edition.fundings?.length ?? 0} fundings
                    </div>
                    <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      <Star size={12} color="#FFB347" />
                      {edition.opportunities?.length ?? 0} opportunites
                    </div>
                    <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      <Zap size={12} color="#9B59B6" />
                      {edition.challenges?.length ?? 0} challenges
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-secondary flex-1 flex items-center justify-center gap-2"
                      onClick={() => router.push(`/editions/${edition.id}`)}
                      style={{ padding: '8px 12px', fontSize: 12 }}
                    >
                      <Pencil size={13} />
                      Modifier
                    </button>
                    <button
                      className="p-2 rounded-lg transition-colors"
                      onClick={() => setDeleteTarget(edition)}
                      style={{ background: 'rgba(244,67,54,0.08)', color: '#F44336', border: 'none', cursor: 'pointer' }}
                      title="Supprimer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Supprimer l'edition"
        message={`Etes-vous sur de vouloir supprimer "${deleteTarget?.name}" ? Cette action est irreversible.`}
        confirmLabel="Supprimer"
        danger
        loading={deleting}
      />
    </div>
  );
}
