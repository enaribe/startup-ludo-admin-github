'use client';

import { useEffect, useState, useCallback } from 'react';
import { Lightbulb, Plus, Trash2, Target, Rocket, Map, Sparkles } from 'lucide-react';
import { getIdeationDecks, saveIdeationDeck } from '@/lib/firestore-service';
import type { IdeationDeck, IdeationCard } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import AIGenerateModal from '@/components/ui/AIGenerateModal';
import SaveStatusIndicator from '@/components/ui/SaveStatusIndicator';
import { useAutoSave } from '@/hooks/useAutoSave';
import type { GenerationType } from '@/lib/ai-prompts';
import { generateId } from '@/lib/utils';
import toast from 'react-hot-toast';

const CARD_TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  target: { label: 'Cible', color: '#4A90E2', icon: <Target size={14} /> },
  mission: { label: 'Mission', color: '#FF6B6B', icon: <Rocket size={14} /> },
  sector: { label: 'Secteur', color: '#50C878', icon: <Map size={14} /> },
};

export default function IdeationPage() {
  const [decks, setDecks] = useState<IdeationDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<'target' | 'mission' | 'sector'>('target');
  const [deleteTarget, setDeleteTarget] = useState<{ deckId: string; cardIndex: number } | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  const AI_TYPE_MAP: Record<string, GenerationType> = {
    target: 'ideation_targets',
    mission: 'ideation_missions',
    sector: 'ideation_sectors',
  };

  const handleAIGenerated = (generated: unknown) => {
    if (!deck) return;
    const items = Array.isArray(generated) ? generated : [];
    const newCards: IdeationCard[] = items.map((item: Record<string, unknown>) => ({
      id: (item.id as string) || `card_${generateId()}`,
      type: activeType,
      text: (item.text as string) || '',
      icon: '',
    }));
    const updated: IdeationDeck = { ...deck, cards: [...deck.cards, ...newCards] };
    setDecks([updated]);
    toast.success(`${newCards.length} cartes ajoutees`);
  };

  const loadDecks = useCallback(async () => {
    try {
      const data = await getIdeationDecks();
      // If no decks exist, create defaults
      if (data.length === 0) {
        setDecks([
          { id: 'default', name: 'Deck Principal', cards: [] },
        ]);
      } else {
        setDecks(data);
      }
    } catch (error) {
      console.error('Load error:', error);
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadDecks(); }, [loadDecks]);

  const deck = decks[0]; // For now, single deck
  const cards = deck?.cards ?? [];
  const filteredCards = cards.filter((c) => c.type === activeType);

  // Sauvegarde automatique du deck a chaque modification.
  const persistDeck = useCallback(
    (d: IdeationDeck) => saveIdeationDeck(d.id, { name: d.name, cards: d.cards }),
    []
  );
  const { status: saveStatus } = useAutoSave({
    data: deck,
    save: persistDeck,
    enabled: !loading && !!deck,
  });

  const addCard = () => {
    if (!deck) return;
    const updated: IdeationDeck = {
      ...deck,
      cards: [...deck.cards, { id: `card_${generateId()}`, type: activeType, text: '', icon: '' }],
    };
    setDecks([updated]);
  };

  const updateCard = (index: number, field: keyof IdeationCard, value: string) => {
    if (!deck) return;
    const globalIndex = cards.findIndex((c, i) => c.type === activeType && cards.slice(0, i + 1).filter((x) => x.type === activeType).length === index + 1);
    if (globalIndex === -1) return;
    const updated = { ...deck, cards: [...deck.cards] };
    updated.cards[globalIndex] = { ...updated.cards[globalIndex], [field]: value } as IdeationCard;
    setDecks([updated]);
  };

  const removeCard = () => {
    if (!deck || !deleteTarget) return;
    const typeCards = cards.filter((c) => c.type === activeType);
    const cardToRemove = typeCards[deleteTarget.cardIndex];
    if (!cardToRemove) return;
    const updated = { ...deck, cards: deck.cards.filter((c) => c.id !== cardToRemove.id) };
    setDecks([updated]);
    setDeleteTarget(null);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            {cards.length} carte{cards.length !== 1 ? 's' : ''} au total
            ({cards.filter((c) => c.type === 'target').length} cibles, {cards.filter((c) => c.type === 'mission').length} missions, {cards.filter((c) => c.type === 'sector').length} secteurs)
          </p>
        </div>
        <SaveStatusIndicator status={saveStatus} />
      </div>

      {/* Type tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)' }}>
        {(Object.entries(CARD_TYPE_CONFIG) as [string, typeof CARD_TYPE_CONFIG[string]][]).map(([type, cfg]) => {
          const count = cards.filter((c) => c.type === type).length;
          return (
            <button
              key={type}
              onClick={() => setActiveType(type as 'target' | 'mission' | 'sector')}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all"
              style={{
                background: activeType === type ? `${cfg.color}20` : 'transparent',
                color: activeType === type ? cfg.color : 'rgba(255,255,255,0.5)',
                border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeType === type ? 600 : 400,
              }}
            >
              {cfg.icon}
              {cfg.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Cards */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
            {filteredCards.length} {CARD_TYPE_CONFIG[activeType]?.label.toLowerCase()}{filteredCards.length !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-2">
            <button
              className="btn-secondary flex items-center gap-1.5"
              onClick={() => setAiModalOpen(true)}
              style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.3)', color: '#FFBC40' }}
            >
              <Sparkles size={13} />
              IA
            </button>
            <button className="btn-primary flex items-center gap-2" onClick={addCard} style={{ fontSize: 13, padding: '8px 16px' }}>
              <Plus size={14} />
              Ajouter
            </button>
          </div>
        </div>
        {filteredCards.length === 0 ? (
          <EmptyState
            icon={<Lightbulb size={40} />}
            title={`Aucune carte ${CARD_TYPE_CONFIG[activeType]?.label.toLowerCase()}`}
            description="Ajoutez des cartes d'ideation pour ce type."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredCards.map((card, i) => {
              const cfg = CARD_TYPE_CONFIG[card.type];
              return (
                <div key={card.id} className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: `1px solid ${cfg?.color}20` }}>
                  <div className="flex items-start justify-between mb-2">
                    <span style={{ fontSize: 10, fontWeight: 600, color: cfg?.color }}>#{i + 1}</span>
                    <button onClick={() => setDeleteTarget({ deckId: deck!.id, cardIndex: i })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336' }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <textarea
                    className="input-field"
                    value={card.text}
                    onChange={(e) => updateCard(i, 'text', e.target.value)}
                    placeholder="Texte de la carte..."
                    rows={2}
                    style={{ fontSize: 12, resize: 'vertical' }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Generate Modal */}
      <AIGenerateModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        type={AI_TYPE_MAP[activeType]}
        onGenerated={handleAIGenerated}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={removeCard}
        title="Supprimer la carte"
        message="Supprimer cette carte d'ideation ?"
        confirmLabel="Supprimer"
        danger
      />
    </div>
  );
}
