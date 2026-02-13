'use client';

import { useState } from 'react';
import { X, Save } from 'lucide-react';
import type { ChallengeEvent } from '@/types';
import { generateId } from '@/lib/utils';

interface ChallengeEventEditorProps {
  challengeEvent?: ChallengeEvent | null;
  onSave: (challengeEvent: ChallengeEvent) => void;
  onClose: () => void;
}

export default function ChallengeEventEditor({ challengeEvent, onSave, onClose }: ChallengeEventEditorProps) {
  const [formData, setFormData] = useState<ChallengeEvent>({
    id: challengeEvent?.id || `chal_${generateId()}`,
    title: challengeEvent?.title || '',
    description: challengeEvent?.description || '',
    tokens: challengeEvent?.tokens || -20,
  });

  const isValid = formData.title.trim() && formData.description.trim() && formData.tokens !== 0;

  const handleSave = () => {
    if (!isValid) return;
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>
            {challengeEvent ? 'Modifier le Défi' : 'Nouveau Défi'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="flex flex-col gap-4">
            {/* Title */}
            <div>
              <label className="label">Titre *</label>
              <input
                className="input-field"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Panne de matériel"
              />
            </div>

            {/* Description */}
            <div>
              <label className="label">Description *</label>
              <textarea
                className="input-field"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Votre équipement principal est tombé en panne, vous devez payer les réparations..."
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Tokens */}
            <div>
              <label className="label">Tokens (pénalité) *</label>
              <input
                type="number"
                className="input-field"
                value={formData.tokens}
                onChange={(e) => setFormData({ ...formData, tokens: Number(e.target.value) })}
                max={0}
                placeholder="-20"
              />
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                Nombre de tokens négatifs (obstacle). Utilisez une valeur négative (ex: -20)
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 13 }}>
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid}
            className="btn-primary flex items-center gap-2"
            style={{
              fontSize: 13,
              opacity: isValid ? 1 : 0.5,
              cursor: isValid ? 'pointer' : 'not-allowed',
            }}
          >
            <Save size={14} />
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
