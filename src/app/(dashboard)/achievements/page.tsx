'use client';

import { useEffect, useState, useCallback } from 'react';
import { Award, Plus, Trash2, Pencil, Sparkles } from 'lucide-react';
import { getAchievements, saveAchievement, deleteAchievement } from '@/lib/firestore-service';
import type { Achievement } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import AIGenerateModal from '@/components/ui/AIGenerateModal';
import { generateId } from '@/lib/utils';
import toast from 'react-hot-toast';

const CATEGORIES = [
  { id: 'games', label: 'Jeux', color: '#FFBC40' },
  { id: 'social', label: 'Social', color: '#4A90E2' },
  { id: 'challenge', label: 'Challenge', color: '#9B59B6' },
  { id: 'collection', label: 'Collection', color: '#50C878' },
  { id: 'special', label: 'Special', color: '#FF6B6B' },
];

const RARITIES = [
  { id: 'common', label: 'Commun', color: '#95A5A6' },
  { id: 'rare', label: 'Rare', color: '#4A90E2' },
  { id: 'epic', label: 'Epique', color: '#9B59B6' },
  { id: 'legendary', label: 'Legendaire', color: '#FFBC40' },
];

const EMPTY_ACHIEVEMENT: Achievement = {
  id: '',
  title: '',
  description: '',
  icon: 'trophy-outline',
  category: 'games',
  condition: { type: '', target: 1 },
  xpReward: 50,
  rarity: 'common',
  enabled: true,
};

export default function AchievementsPage() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<Achievement | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Achievement | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const handleAIGenerated = async (generated: unknown) => {
    const items = Array.isArray(generated) ? generated : [];
    const newAchievements: Achievement[] = items.map((item: Record<string, unknown>) => ({
      id: (item.id as string) || `ach_${generateId()}`,
      title: (item.title as string) || '',
      description: (item.description as string) || '',
      icon: (item.icon as string) || 'trophy-outline',
      category: (item.category as Achievement['category']) || 'games',
      condition: (item.condition as Achievement['condition']) || { type: '', target: 1 },
      xpReward: (item.xpReward as number) || 50,
      rarity: (item.rarity as Achievement['rarity']) || 'common',
      enabled: true,
    }));
    setAchievements((prev) => [...prev, ...newAchievements]);
    // Persistance immediate de chaque achievement genere.
    try {
      await Promise.all(newAchievements.map(({ id, ...rest }) => saveAchievement(id, rest)));
      toast.success(`${newAchievements.length} achievements generes et enregistres !`);
    } catch {
      toast.error('Erreur lors de l’enregistrement des achievements generes');
    }
  };

  const load = useCallback(async () => {
    try {
      const data = await getAchievements();
      setAchievements(data);
    } catch { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = activeCategory === 'all' ? achievements : achievements.filter((a) => a.category === activeCategory);

  const handleOpenNew = () => {
    setIsNew(true);
    setEditItem({ ...EMPTY_ACHIEVEMENT, id: `ach_${generateId()}` });
  };

  const handleSave = async () => {
    if (!editItem || !editItem.title.trim()) { toast.error('Titre requis'); return; }
    setSaving(true);
    try {
      const { id, ...rest } = editItem;
      await saveAchievement(id, rest);
      if (isNew) {
        setAchievements((prev) => [...prev, editItem]);
      } else {
        setAchievements((prev) => prev.map((a) => a.id === editItem.id ? editItem : a));
      }
      toast.success(isNew ? 'Achievement cree !' : 'Modifie !');
      setEditItem(null);
      setIsNew(false);
    } catch { toast.error('Erreur'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAchievement(deleteTarget.id);
      setAchievements((prev) => prev.filter((a) => a.id !== deleteTarget.id));
      toast.success('Supprime');
    } catch { toast.error('Erreur'); }
    finally { setDeleteTarget(null); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
          {achievements.length} achievement{achievements.length !== 1 ? 's' : ''}
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
            Nouveau
          </button>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl overflow-x-auto" style={{ background: 'rgba(0,0,0,0.2)' }}>
        <button
          onClick={() => setActiveCategory('all')}
          className="px-3 py-2 rounded-lg transition-all whitespace-nowrap"
          style={{
            background: activeCategory === 'all' ? 'rgba(255,255,255,0.1)' : 'transparent',
            color: activeCategory === 'all' ? '#FFFFFF' : 'rgba(255,255,255,0.5)',
            border: 'none', cursor: 'pointer', fontSize: 12,
          }}
        >
          Tous ({achievements.length})
        </button>
        {CATEGORIES.map((cat) => {
          const count = achievements.filter((a) => a.category === cat.id).length;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className="px-3 py-2 rounded-lg transition-all whitespace-nowrap"
              style={{
                background: activeCategory === cat.id ? `${cat.color}20` : 'transparent',
                color: activeCategory === cat.id ? cat.color : 'rgba(255,255,255,0.5)',
                border: 'none', cursor: 'pointer', fontSize: 12,
              }}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Award size={40} />} title="Aucun achievement" description="Creez des badges et recompenses." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((ach) => {
            const rarityConfig = RARITIES.find((r) => r.id === ach.rarity);
            const catConfig = CATEGORIES.find((c) => c.id === ach.category);
            return (
              <div key={ach.id} className="glass-card p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${rarityConfig?.color || '#95A5A6'}15`, fontSize: 16 }}>
                      🏆
                    </div>
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>{ach.title}</h4>
                      <div className="flex gap-1.5 mt-1">
                        <span className="badge" style={{ background: `${catConfig?.color || '#888'}15`, color: catConfig?.color, fontSize: 9 }}>{catConfig?.label}</span>
                        <span className="badge" style={{ background: `${rarityConfig?.color || '#888'}15`, color: rarityConfig?.color, fontSize: 9 }}>{rarityConfig?.label}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditItem(ach); setIsNew(false); }} className="p-1 rounded" style={{ background: 'rgba(255,188,64,0.1)', color: '#FFBC40', border: 'none', cursor: 'pointer' }}>
                      <Pencil size={12} />
                    </button>
                    <button onClick={() => setDeleteTarget(ach)} className="p-1 rounded" style={{ background: 'rgba(244,67,54,0.1)', color: '#F44336', border: 'none', cursor: 'pointer' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 8, lineHeight: 1.4 }}>{ach.description}</p>
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Condition: {ach.condition.type} &ge; {ach.condition.target}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#FFBC40' }}>+{ach.xpReward} XP</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit modal */}
      <Modal open={!!editItem} onClose={() => { setEditItem(null); setIsNew(false); }} title={isNew ? 'Nouveau Achievement' : 'Modifier'} maxWidth="520px">
        {editItem && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="label">Titre</label>
                <input className="input-field" value={editItem.title} onChange={(e) => setEditItem({ ...editItem, title: e.target.value })} />
              </div>
              <div style={{ width: 100 }}>
                <label className="label">XP</label>
                <input type="number" className="input-field" value={editItem.xpReward} onChange={(e) => setEditItem({ ...editItem, xpReward: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input-field" value={editItem.description} onChange={(e) => setEditItem({ ...editItem, description: e.target.value })} rows={2} style={{ resize: 'vertical' }} />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="label">Categorie</label>
                <select className="input-field" value={editItem.category} onChange={(e) => setEditItem({ ...editItem, category: e.target.value as Achievement['category'] })}>
                  {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="label">Rarete</label>
                <select className="input-field" value={editItem.rarity} onChange={(e) => setEditItem({ ...editItem, rarity: e.target.value as Achievement['rarity'] })}>
                  {RARITIES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="label">Type de condition</label>
                <input className="input-field" value={editItem.condition.type} onChange={(e) => setEditItem({ ...editItem, condition: { ...editItem.condition, type: e.target.value } })} placeholder="games_played, wins, etc." />
              </div>
              <div style={{ width: 100 }}>
                <label className="label">Cible</label>
                <input type="number" className="input-field" value={editItem.condition.target} onChange={(e) => setEditItem({ ...editItem, condition: { ...editItem.condition, target: Number(e.target.value) } })} />
              </div>
            </div>
            <div>
              <label className="label">Icone (Ionicons)</label>
              <input className="input-field" value={editItem.icon} onChange={(e) => setEditItem({ ...editItem, icon: e.target.value })} placeholder="trophy-outline" />
            </div>
            <div className="flex items-center gap-3">
              <label className="label" style={{ marginBottom: 0 }}>Active</label>
              <button
                onClick={() => setEditItem({ ...editItem, enabled: !editItem.enabled })}
                className="relative w-10 h-5 rounded-full"
                style={{ background: editItem.enabled ? '#4CAF50' : 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer' }}
              >
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white" style={{ left: editItem.enabled ? 22 : 2, transition: 'left 0.2s' }} />
              </button>
            </div>
            <div className="flex justify-end gap-3 mt-2">
              <button className="btn-secondary" onClick={() => { setEditItem(null); setIsNew(false); }}>Annuler</button>
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Sauvegarde...' : 'Sauvegarder'}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* AI Generate Modal */}
      <AIGenerateModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        type="achievements"
        onGenerated={handleAIGenerated}
      />

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} title="Supprimer" message={`Supprimer "${deleteTarget?.title}" ?`} confirmLabel="Supprimer" danger />
    </div>
  );
}
