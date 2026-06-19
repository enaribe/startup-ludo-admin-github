'use client';

import { useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';

type EventType = 'quiz' | 'duel' | 'funding' | 'opportunity' | 'challenge';

interface QuickGenerateModalProps {
  open: boolean;
  onClose: () => void;
  eventType: EventType;
  onGenerate: (count: number) => Promise<void>;
  context?: {
    subLevelTitle?: string;
    subLevelDescription?: string;
    levelTitle?: string;
  };
}

const EVENT_LABELS: Record<EventType, { singular: string; plural: string; icon: string }> = {
  quiz: { singular: 'Quiz', plural: 'Quiz', icon: '❓' },
  duel: { singular: 'Duel', plural: 'Duels', icon: '⚔️' },
  funding: { singular: 'Financement', plural: 'Financements', icon: '💰' },
  opportunity: { singular: 'Opportunité', plural: 'Opportunités', icon: '✨' },
  challenge: { singular: 'Défi', plural: 'Défis', icon: '⚡' },
};

export default function QuickGenerateModal({
  open,
  onClose,
  eventType,
  onGenerate,
  context
}: QuickGenerateModalProps) {
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);

  if (!open) return null;

  const eventInfo = EVENT_LABELS[eventType];

  const handleGenerate = async () => {
    if (count < 1 || count > 50) return;
    setGenerating(true);
    try {
      await onGenerate(count);
      onClose();
    } catch (error) {
      console.error('Generation error:', error);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div
        className="rounded-2xl w-full max-w-md p-6 flex flex-col gap-4"
        style={{ background: 'var(--color-card)', border: '1px solid var(--color-card-border)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-2xl"
              style={{ background: 'rgba(255,188,64,0.15)', border: '1px solid rgba(255,188,64,0.3)' }}
            >
              {eventInfo.icon}
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
                Générer des {eventInfo.plural}
              </h3>
              {context?.subLevelTitle && (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
                  {context.subLevelTitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={generating}
            style={{ background: 'none', border: 'none', cursor: generating ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Context info */}
        {context?.subLevelDescription && (
          <div
            className="p-3 rounded-lg"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)' }}
          >
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
              {context.subLevelDescription}
            </p>
          </div>
        )}

        {/* Count selector */}
        <div>
          <label className="label">Nombre de {eventInfo.plural.toLowerCase()} à générer</label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="1"
              max="20"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={generating}
              className="flex-1"
              style={{
                accentColor: '#FFBC40',
                cursor: generating ? 'not-allowed' : 'pointer',
              }}
            />
            <input
              type="number"
              min="1"
              max="50"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              disabled={generating}
              className="input-field"
              style={{ width: 80, textAlign: 'center' }}
            />
          </div>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
            L'IA générera automatiquement {count} {count === 1 ? eventInfo.singular.toLowerCase() : eventInfo.plural.toLowerCase()} adapté{count === 1 ? '' : 's'} au contexte
          </p>
        </div>

        {/* Info */}
        <div
          className="p-3 rounded-lg flex items-start gap-2"
          style={{ background: 'rgba(33,150,243,0.1)', border: '1px solid rgba(33,150,243,0.2)' }}
        >
          <Sparkles size={16} color="#2196F3" style={{ marginTop: 2, flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: '#2196F3', margin: 0, lineHeight: 1.5 }}>
            La génération se fera en arrière-plan. Vous pourrez continuer à travailler pendant ce temps.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={onClose}
            disabled={generating}
            className="btn-secondary flex-1"
            style={{ fontSize: 13, opacity: generating ? 0.5 : 1 }}
          >
            Annuler
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || count < 1}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
            style={{
              fontSize: 13,
              opacity: generating || count < 1 ? 0.7 : 1,
              cursor: generating || count < 1 ? 'not-allowed' : 'pointer'
            }}
          >
            {generating ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Génération...
              </>
            ) : (
              <>
                <Sparkles size={14} />
                Générer {count} {count === 1 ? eventInfo.singular.toLowerCase() : eventInfo.plural.toLowerCase()}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
