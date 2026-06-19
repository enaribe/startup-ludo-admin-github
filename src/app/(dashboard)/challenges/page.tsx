'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, Plus, Pencil, Trash2, Layers, Target } from 'lucide-react';
import { getChallengePrograms, deleteChallengeProgram } from '@/lib/firestore-service';
import type { ChallengeProgram } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import toast from 'react-hot-toast';

export default function ChallengesPage() {
  const router = useRouter();
  const [programs, setPrograms] = useState<ChallengeProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ChallengeProgram | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPrograms = useCallback(async () => {
    try {
      const data = await getChallengePrograms();
      setPrograms(data);
    } catch (error) {
      console.error('Failed to load programs:', error);
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPrograms(); }, [loadPrograms]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteChallengeProgram(deleteTarget.id);
      setPrograms((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success('Programme supprime');
    } catch {
      toast.error('Erreur de suppression');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {programs.length} programme{programs.length !== 1 ? 's' : ''}
        </p>
        <button className="btn-primary flex items-center gap-2" onClick={() => router.push('/challenges/new')}>
          <Plus size={16} />
          Nouveau Programme
        </button>
      </div>

      {programs.length === 0 ? (
        <EmptyState
          icon={<Trophy size={48} />}
          title="Aucun programme"
          description="Creez votre premier programme de challenges (ex: YEAH)."
          action={
            <button className="btn-primary flex items-center gap-2" onClick={() => router.push('/challenges/new')}>
              <Plus size={16} />
              Creer un programme
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {programs.map((prog) => (
            <div key={prog.id} className="glass-card overflow-hidden">
              <div style={{ height: 3, background: '#9B59B6' }} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>{prog.name}</h3>
                    <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{prog.id}</p>
                  </div>
                  <span className={`badge ${prog.enabled !== false ? 'badge-success' : 'badge-error'}`}>
                    {prog.enabled !== false ? 'Actif' : 'Inactif'}
                  </span>
                </div>
                {prog.description && (
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.4 }}>
                    {prog.description.slice(0, 100)}{prog.description.length > 100 ? '...' : ''}
                  </p>
                )}
                <div className="flex gap-4 mb-4">
                  <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    <Layers size={12} color="#9B59B6" />
                    {prog.levels?.length ?? 0} niveaux
                  </div>
                  <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    <Target size={12} color="#FFB347" />
                    {prog.sectors?.length ?? 0} secteurs
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-secondary flex-1 flex items-center justify-center gap-2" onClick={() => router.push(`/challenges/${prog.id}`)} style={{ padding: '8px 12px', fontSize: 12 }}>
                    <Pencil size={13} />
                    Modifier
                  </button>
                  <button onClick={() => setDeleteTarget(prog)} className="p-2 rounded-lg" style={{ background: 'rgba(244,67,54,0.08)', color: '#F44336', border: 'none', cursor: 'pointer' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Supprimer le programme"
        message={`Supprimer "${deleteTarget?.name}" ? Action irreversible.`}
        confirmLabel="Supprimer"
        danger
        loading={deleting}
      />
    </div>
  );
}
