'use client';

import { useState } from 'react';
import { X, Save } from 'lucide-react';
import type { Duel, DuelOption } from '@/types';
import { generateId } from '@/lib/utils';

interface DuelEditorProps {
  duel?: Duel | null;
  onSave: (duel: Duel) => void;
  onClose: () => void;
  sectors?: { id: string; name: string }[];
}

const CATEGORIES = [
  'business-model', 'financement', 'marketing', 'operations',
  'legal', 'ressources-humaines', 'strategie', 'innovation'
];

export default function DuelEditor({ duel, onSave, onClose, sectors }: DuelEditorProps) {
  const [formData, setFormData] = useState<Duel>({
    id: duel?.id || `duel_${generateId()}`,
    question: duel?.question || '',
    options: duel?.options || [
      { text: '', points: 30 },
      { text: '', points: 20 },
      { text: '', points: 10 },
    ],
    category: duel?.category || 'business-model',
    sectorId: duel?.sectorId || '',
  });

  const isValid = formData.question.trim() &&
    formData.options.every(opt => opt.text.trim()) &&
    formData.options.length === 3;

  const handleSave = () => {
    if (!isValid) return;
    onSave(formData);
    onClose();
  };

  const updateOption = (index: number, field: keyof DuelOption, value: string | number) => {
    const newOptions = [...formData.options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    setFormData({ ...formData, options: newOptions });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>
            {duel ? 'Modifier le Duel' : 'Nouveau Duel'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="flex flex-col gap-4">
            {/* Question */}
            <div>
              <label className="label">Question *</label>
              <textarea
                className="input-field"
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                placeholder="Comment optimiser votre stratégie marketing..."
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Sector */}
            <div>
              <label className="label">Secteur (optionnel)</label>
              <select
                className="input-field"
                value={formData.sectorId || ''}
                onChange={(e) => setFormData({ ...formData, sectorId: e.target.value || undefined })}
              >
                <option value="">Tous les secteurs (général)</option>
                {(sectors || []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                Si un secteur est sélectionné, ce contenu ne sera affiché qu&apos;aux joueurs ayant choisi ce secteur
              </p>
            </div>

            {/* Category */}
            <div>
              <label className="label">Catégorie</label>
              <select
                className="input-field"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Options */}
            <div>
              <label className="label">Réponses (3 options, toutes valides) *</label>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                Les 3 réponses sont valides mais rapportent des points différents (meilleure: 30pts, moyenne: 20pts, faible: 10pts)
              </p>
              {formData.options.map((option, index) => (
                <div key={index} className="mb-3 p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: option.points === 30 ? '#4CAF50' : option.points === 20 ? '#FFBC40' : '#FF9800',
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: option.points === 30 ? 'rgba(76,175,80,0.15)' : option.points === 20 ? 'rgba(255,188,64,0.15)' : 'rgba(255,152,0,0.15)',
                      }}
                    >
                      {option.points} points
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      {option.points === 30 ? 'Meilleure réponse' : option.points === 20 ? 'Bonne réponse' : 'Réponse acceptable'}
                    </span>
                  </div>
                  <input
                    className="input-field"
                    value={option.text}
                    onChange={(e) => updateOption(index, 'text', e.target.value)}
                    placeholder={`Option ${index + 1}`}
                    style={{ marginBottom: 0 }}
                  />
                </div>
              ))}
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
