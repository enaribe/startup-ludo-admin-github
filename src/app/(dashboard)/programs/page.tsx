'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Rocket, Plus, Pencil, Trash2, Package, Users } from 'lucide-react';
import { getPrograms, getPartners, deleteProgram } from '@/lib/firestore-service';
import type { PartnerProgram, ProgramPartner } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import toast from 'react-hot-toast';

export default function ProgramsPage() {
  const router = useRouter();
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [partners, setPartners] = useState<ProgramPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<PartnerProgram | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [prog, p] = await Promise.all([getPrograms(), getPartners()]);
      setPrograms(prog.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
      setPartners(p);
    } catch (error) {
      console.error('Failed to load programs:', error);
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const partnerName = (partnerId: string) =>
    partners.find((p) => p.id === partnerId)?.name ?? partnerId ?? '—';

  const contentCount = (prog: PartnerProgram) =>
    (prog.contentPacks ?? []).reduce(
      (sum, pack) =>
        sum +
        (pack.quizzes?.length ?? 0) +
        (pack.duels?.length ?? 0) +
        (pack.fundings?.length ?? 0) +
        (pack.opportunities?.length ?? 0) +
        (pack.challengeEvents?.length ?? 0),
      0
    );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProgram(deleteTarget.id);
      setPrograms((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success('Programme supprimé');
    } catch {
      toast.error('Erreur de suppression');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  const noPartners = partners.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
          {programs.length} programme{programs.length !== 1 ? 's' : ''}
        </p>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => router.push('/programs/new')}
          disabled={noPartners}
          title={noPartners ? 'Créez d’abord un partenaire' : undefined}
        >
          <Plus size={16} />
          Nouveau Programme
        </button>
      </div>

      {noPartners && (
        <div className="glass-card p-4 mb-6" style={{ borderLeft: '3px solid #FFB347' }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
            Aucun partenaire défini. Créez d’abord un{' '}
            <button onClick={() => router.push('/partners/new')} style={{ background: 'none', border: 'none', color: '#FFB347', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>partenaire</button>{' '}
            avant d’ajouter un programme.
          </p>
        </div>
      )}

      {programs.length === 0 ? (
        <EmptyState
          icon={<Rocket size={48} />}
          title="Aucun programme"
          description="Créez votre premier programme partenaire (ex: Young Africa Works, YEAH, Meliteji Wasu)."
          action={
            !noPartners ? (
              <button className="btn-primary flex items-center gap-2" onClick={() => router.push('/programs/new')}>
                <Plus size={16} />
                Créer un programme
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {programs.map((prog) => (
            <div key={prog.id} className="glass-card overflow-hidden">
              <div style={{ height: 3, background: prog.primaryColor || '#FFB347' }} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p style={{ fontSize: 11, color: prog.primaryColor || '#FFB347', marginBottom: 2, fontWeight: 600 }}>
                      {partnerName(prog.partnerId)}
                      {(prog.coPartnerIds?.length ?? 0) > 0 && (
                        <span style={{ color: 'rgba(255,255,255,0.45)', fontWeight: 400 }}>
                          {' '}· en partenariat avec {prog.coPartnerIds!.map(partnerName).join(', ')}
                        </span>
                      )}
                    </p>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: '#FFFFFF', marginBottom: 2 }}>{prog.name}</h3>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{prog.id}</p>
                  </div>
                  <span className={`badge ${prog.isActive !== false ? 'badge-success' : 'badge-error'}`}>
                    {prog.isActive !== false ? 'Actif' : 'Inactif'}
                  </span>
                </div>
                {prog.description && (
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12, lineHeight: 1.4 }}>
                    {prog.description.slice(0, 100)}{prog.description.length > 100 ? '...' : ''}
                  </p>
                )}
                <div className="flex gap-4 mb-4">
                  <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    <Package size={12} color="#9B59B6" />
                    {prog.contentPacks?.length ?? 0} pack{(prog.contentPacks?.length ?? 0) !== 1 ? 's' : ''} · {contentCount(prog)} cartes
                  </div>
                  <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    <Users size={12} color="#FFB347" />
                    {prog.playerCount ?? 0} joueurs
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-secondary flex-1 flex items-center justify-center gap-2" onClick={() => router.push(`/programs/${prog.id}`)} style={{ padding: '8px 12px', fontSize: 12 }}>
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
        message={`Supprimer "${deleteTarget?.name}" ? Action irréversible.`}
        confirmLabel="Supprimer"
        danger
        loading={deleting}
      />
    </div>
  );
}
