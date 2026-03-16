'use client';

import { useState } from 'react';
import { X, Save } from 'lucide-react';
import type { Opportunity } from '@/types';
import { generateId } from '@/lib/utils';

interface OpportunityEditorProps {
  opportunity?: Opportunity | null;
  onSave: (opportunity: Opportunity) => void;
  onClose: () => void;
  sectors?: { id: string; name: string }[];
}

export default function OpportunityEditor({ opportunity, onSave, onClose, sectors }: OpportunityEditorProps) {
  const [formData, setFormData] = useState<Opportunity>({
    id: opportunity?.id || `opp_${generateId()}`,
    title: opportunity?.title || '',
    description: opportunity?.description || '',
    tokens: opportunity?.tokens || 30,
    sectorId: opportunity?.sectorId || '',
  });

  const isValid = formData.title.trim() && formData.description.trim() && formData.tokens > 0;

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
            {opportunity ? 'Modifier l\'Opportunité' : 'Nouvelle Opportunité'}
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
                placeholder="Partenariat stratégique"
              />
            </div>

            {/* Description */}
            <div>
              <label className="label">Description *</label>
              <textarea
                className="input-field"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Vous avez signé un partenariat avec une grande entreprise..."
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Tokens */}
            <div>
              <label className="label">Tokens (récompense) *</label>
              <input
                type="number"
                className="input-field"
                value={formData.tokens}
                onChange={(e) => setFormData({ ...formData, tokens: Number(e.target.value) })}
                min={1}
                placeholder="30"
              />
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                Nombre de tokens positifs ajoutés au joueur
              </p>
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
