'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Plus, Pencil, Trash2, Rocket } from 'lucide-react';
import { getPartners, getPrograms, deletePartner } from '@/lib/firestore-service';
import type { ProgramPartner, PartnerProgram } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import toast from 'react-hot-toast';

export default function PartnersPage() {
  const router = useRouter();
  const [partners, setPartners] = useState<ProgramPartner[]>([]);
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ProgramPartner | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, prog] = await Promise.all([getPartners(), getPrograms()]);
      setPartners(p);
      setPrograms(prog);
    } catch (error) {
      console.error('Failed to load partners:', error);
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // compte les programmes où le partenaire est principal OU co-partenaire
  const programCount = (partnerId: string) =>
    programs.filter((prog) => prog.partnerId === partnerId || prog.coPartnerIds?.includes(partnerId)).length;

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePartner(deleteTarget.id);
      setPartners((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success('Partenaire supprimé');
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
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
          {partners.length} partenaire{partners.length !== 1 ? 's' : ''}
        </p>
        <button className="btn-primary flex items-center gap-2" onClick={() => router.push('/partners/new')}>
          <Plus size={16} />
          Nouveau Partenaire
        </button>
      </div>

      {partners.length === 0 ? (
        <EmptyState
          icon={<Building2 size={48} />}
          title="Aucun partenaire"
          description="Créez votre premier partenaire (ex: Mastercard Foundation, YEAH, Consortium Jeunesse Sénégal)."
          action={
            <button className="btn-primary flex items-center gap-2" onClick={() => router.push('/partners/new')}>
              <Plus size={16} />
              Créer un partenaire
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {partners.map((partner) => (
            <div key={partner.id} className="glass-card overflow-hidden">
              <div style={{ height: 3, background: partner.primaryColor || '#FFB347' }} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {partner.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={partner.logoUrl} alt={partner.name} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Building2 size={18} color="rgba(255,255,255,0.4)" />
                      </div>
                    )}
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: '#FFFFFF', marginBottom: 2 }}>{partner.name}</h3>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{partner.id}</p>
                    </div>
                  </div>
                  <span className={`badge ${partner.isActive !== false ? 'badge-success' : 'badge-error'}`}>
                    {partner.isActive !== false ? 'Actif' : 'Inactif'}
                  </span>
                </div>
                {partner.description && (
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12, lineHeight: 1.4 }}>
                    {partner.description.slice(0, 100)}{partner.description.length > 100 ? '...' : ''}
                  </p>
                )}
                <div className="flex gap-4 mb-4">
                  <div className="flex items-center gap-1.5" style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                    <Rocket size={12} color={partner.primaryColor || '#FFB347'} />
                    {programCount(partner.id)} programme{programCount(partner.id) !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="btn-secondary flex-1 flex items-center justify-center gap-2" onClick={() => router.push(`/partners/${partner.id}`)} style={{ padding: '8px 12px', fontSize: 12 }}>
                    <Pencil size={13} />
                    Modifier
                  </button>
                  <button onClick={() => setDeleteTarget(partner)} className="p-2 rounded-lg" style={{ background: 'rgba(244,67,54,0.08)', color: '#F44336', border: 'none', cursor: 'pointer' }}>
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
        title="Supprimer le partenaire"
        message={`Supprimer "${deleteTarget?.name}" ? Les programmes rattachés ne seront pas supprimés mais resteront orphelins.`}
        confirmLabel="Supprimer"
        danger
        loading={deleting}
      />
    </div>
  );
}
