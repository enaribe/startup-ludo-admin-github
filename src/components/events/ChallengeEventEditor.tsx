'use client';

import { useState } from 'react';
import { X, Save } from 'lucide-react';
import type { ChallengeEvent } from '@/types';
import { generateId } from '@/lib/utils';
import LangTabs, { type ContentLang } from '@/components/events/LangTabs';
import { titleDescLang } from '@/components/events/useTitleDescTranslation';

interface ChallengeEventEditorProps {
  challengeEvent?: ChallengeEvent | null;
  onSave: (challengeEvent: ChallengeEvent) => void;
  onClose: () => void;
  sectors?: { id: string; name: string }[];
}

export default function ChallengeEventEditor({ challengeEvent, onSave, onClose, sectors }: ChallengeEventEditorProps) {
  const [formData, setFormData] = useState<ChallengeEvent>({
    id: challengeEvent?.id || `chal_${generateId()}`,
    title: challengeEvent?.title || '',
    description: challengeEvent?.description || '',
    tokens: challengeEvent?.tokens || -20,
    sectorId: challengeEvent?.sectorId || '',
    translations: challengeEvent?.translations,
  });
  const [lang, setLang] = useState<ContentLang>('fr');
  const { title, description, setTitle, setDescription } = titleDescLang(formData, lang, setFormData);

  const isValid = formData.title.trim() && formData.description.trim();

  const handleSave = () => {
    if (!isValid) return;
    onSave(formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col" style={{ background: 'var(--color-card)', border: '1px solid var(--color-card-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-card-border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            {challengeEvent ? 'Modifier le Défi' : 'Nouveau Défi'}
          </h3>
          <div className="flex items-center gap-3">
            <LangTabs lang={lang} onChange={setLang} />
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="flex flex-col gap-4">
            {/* Title */}
            <div>
              <label className="label">Titre {lang === 'fr' ? '*' : '(EN)'}</label>
              <input
                className="input-field"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={lang === 'fr' ? 'Panne de matériel' : 'English title…'}
              />
            </div>

            {/* Description */}
            <div>
              <label className="label">Description {lang === 'fr' ? '*' : '(EN)'}</label>
              <textarea
                className="input-field"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={lang === 'fr' ? 'Votre équipement principal est tombé en panne...' : 'English description…'}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Champ masqué : non consommé par le mobile (points fixes côté jeu). tokens conservé dans formData (défaut -20). */}

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
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Si un secteur est sélectionné, ce contenu ne sera affiché qu&apos;aux joueurs ayant choisi ce secteur
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex justify-end gap-2" style={{ borderTop: '1px solid var(--color-card-border)' }}>
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
