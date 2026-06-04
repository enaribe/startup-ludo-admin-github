'use client';

import { useEffect, useState, useCallback } from 'react';
import { FolderKanban, Plus, Save, Trash2, Sparkles } from 'lucide-react';
import { getDefaultProjects, saveDefaultProject, deleteDefaultProject } from '@/lib/firestore-service';
import type { DefaultProject as BaseDefaultProject, EditionId } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import AIGenerateModal from '@/components/ui/AIGenerateModal';
import { generateId } from '@/lib/utils';
import toast from 'react-hot-toast';

// Type local pour cette page (avec edition optionnel pour backward compatibility)
interface DefaultProject extends BaseDefaultProject {
  edition?: EditionId;
}

const EDITIONS: { id: EditionId; name: string; color: string }[] = [
  { id: 'classic', name: 'Classic', color: '#FFBC40' },
  { id: 'agriculture', name: 'Agriculture', color: '#4CAF50' },
  { id: 'education', name: 'Education', color: '#4A90E2' },
  { id: 'sante', name: 'Sante', color: '#F44336' },
  { id: 'tourisme', name: 'Tourisme', color: '#FFB347' },
  { id: 'culture', name: 'Culture', color: '#9B59B6' },
];

export default function DefaultProjectsPage() {
  const [projects, setProjects] = useState<DefaultProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [editProject, setEditProject] = useState<DefaultProject | null>(null);
  const [isNewProject, setIsNewProject] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DefaultProject | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeEdition, setActiveEdition] = useState<EditionId>('classic');
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const handleAIGenerated = async (generated: unknown) => {
    const items = Array.isArray(generated) ? generated : [];
    const newProjects: DefaultProject[] = items.map((item: Record<string, unknown>) => ({
      id: (item.id as string) || `proj_${generateId()}`,
      name: (item.name as string) || '',
      description: (item.description as string) || '',
      sector: (item.sector as string) || '',
      target: (item.target as string) || 'Entrepreneurs',
      mission: (item.mission as string) || 'Innovation',
      edition: activeEdition,
    }));
    setProjects((prev) => [...prev, ...newProjects]);
    // Persistance immediate de chaque projet genere.
    try {
      await Promise.all(
        newProjects.map((p) =>
          saveDefaultProject(p.id, {
            name: p.name,
            description: p.description,
            sector: p.sector,
            target: p.target,
            mission: p.mission,
          })
        )
      );
      toast.success(`${newProjects.length} projets generes et enregistres !`);
    } catch {
      toast.error('Erreur lors de l’enregistrement des projets generes');
    }
  };

  const loadProjects = useCallback(async () => {
    try {
      const data = await getDefaultProjects();
      setProjects(data);
    } catch { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  const filteredProjects = projects.filter((p) => p.edition === activeEdition);

  const handleOpenNew = () => {
    setIsNewProject(true);
    setEditProject({ id: `proj_${generateId()}`, name: '', description: '', sector: '', target: '', mission: '', edition: activeEdition });
  };

  const handleSave = async () => {
    if (!editProject || !editProject.name.trim()) { toast.error('Nom requis'); return; }
    setSaving(true);
    try {
      await saveDefaultProject(editProject.id, {
        name: editProject.name,
        description: editProject.description,
        sector: editProject.sector,
        target: editProject.target,
        mission: editProject.mission,
      });
      if (isNewProject) {
        setProjects((prev) => [...prev, editProject]);
      } else {
        setProjects((prev) => prev.map((p) => p.id === editProject.id ? editProject : p));
      }
      toast.success(isNewProject ? 'Projet cree !' : 'Projet modifie !');
      setEditProject(null);
      setIsNewProject(false);
    } catch { toast.error('Erreur'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDefaultProject(deleteTarget.id);
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      toast.success('Projet supprime');
    } catch { toast.error('Erreur'); }
    finally { setDeleteTarget(null); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
          {projects.length} projet{projects.length !== 1 ? 's' : ''} par defaut au total
        </p>
        <div className="flex gap-2">
          <button
            className="btn-secondary flex items-center gap-1.5"
            onClick={() => setAiModalOpen(true)}
            style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.3)', color: '#FFBC40' }}
          >
            <Sparkles size={13} />
            Generer avec IA
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={handleOpenNew}>
            <Plus size={16} />
            Nouveau Projet
          </button>
        </div>
      </div>

      {/* Edition tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl overflow-x-auto" style={{ background: 'rgba(0,0,0,0.2)' }}>
        {EDITIONS.map((ed) => {
          const count = projects.filter((p) => p.edition === ed.id).length;
          return (
            <button
              key={ed.id}
              onClick={() => setActiveEdition(ed.id)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all whitespace-nowrap"
              style={{
                background: activeEdition === ed.id ? `${ed.color}20` : 'transparent',
                color: activeEdition === ed.id ? ed.color : 'rgba(255,255,255,0.5)',
                border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: activeEdition === ed.id ? 600 : 400,
              }}
            >
              {ed.name} ({count})
            </button>
          );
        })}
      </div>

      {/* Projects grid */}
      {filteredProjects.length === 0 ? (
        <EmptyState
          icon={<FolderKanban size={40} />}
          title="Aucun projet par defaut"
          description={`Ajoutez des projets fictifs pour l'edition ${activeEdition}.`}
          action={
            <button className="btn-primary flex items-center gap-2" onClick={handleOpenNew}>
              <Plus size={16} />
              Ajouter
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((proj) => {
            const edColor = EDITIONS.find((e) => e.id === proj.edition)?.color || '#FFBC40';
            return (
              <div key={proj.id} className="glass-card p-4">
                <div className="flex items-start justify-between mb-2">
                  <h4 style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>{proj.name}</h4>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditProject(proj); setIsNewProject(false); }} className="p-1.5 rounded-md" style={{ background: 'rgba(255,188,64,0.1)', color: '#FFBC40', border: 'none', cursor: 'pointer' }}>
                      <Save size={12} />
                    </button>
                    <button onClick={() => setDeleteTarget(proj)} className="p-1.5 rounded-md" style={{ background: 'rgba(244,67,54,0.1)', color: '#F44336', border: 'none', cursor: 'pointer' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                {proj.sector && <span className="badge" style={{ background: `${edColor}15`, color: edColor, marginBottom: 8 }}>{proj.sector}</span>}
                {proj.description && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{proj.description}</p>}
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      <Modal
        open={!!editProject}
        onClose={() => { setEditProject(null); setIsNewProject(false); }}
        title={isNewProject ? 'Nouveau Projet' : 'Modifier le Projet'}
        maxWidth="480px"
      >
        {editProject && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="label">Nom</label>
              <input className="input-field" value={editProject.name} onChange={(e) => setEditProject({ ...editProject, name: e.target.value })} placeholder="AgriFresh" />
            </div>
            <div>
              <label className="label">Secteur</label>
              <input className="input-field" value={editProject.sector} onChange={(e) => setEditProject({ ...editProject, sector: e.target.value })} placeholder="agritech" />
            </div>
            <div>
              <label className="label">Edition</label>
              <select className="input-field" value={editProject.edition} onChange={(e) => setEditProject({ ...editProject, edition: e.target.value as EditionId })}>
                {EDITIONS.map((ed) => <option key={ed.id} value={ed.id}>{ed.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input-field" value={editProject.description} onChange={(e) => setEditProject({ ...editProject, description: e.target.value })} rows={3} style={{ resize: 'vertical' }} />
            </div>
            <div className="flex justify-end gap-3 mt-2">
              <button className="btn-secondary" onClick={() => { setEditProject(null); setIsNewProject(false); }}>Annuler</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* AI Generate Modal */}
      <AIGenerateModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        type="default_projects"
        context={{ edition: activeEdition, sectors: EDITIONS.find((e) => e.id === activeEdition)?.name || '' }}
        onGenerated={handleAIGenerated}
      />

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Supprimer" message={`Supprimer "${deleteTarget?.name}" ?`} confirmLabel="Supprimer" danger />
    </div>
  );
}
