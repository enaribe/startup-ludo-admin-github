'use client';

import { useState } from 'react';
import { X, Save } from 'lucide-react';
import type { Duel, DuelOption } from '@/types';
import { generateId } from '@/lib/utils';
import LangTabs, { type ContentLang } from '@/components/events/LangTabs';

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

export default function DuelEditor({ duel, onSave, onClose }: DuelEditorProps) {
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
    translations: duel?.translations,
  });
  const [lang, setLang] = useState<ContentLang>('fr');

  // FR = champs originaux ; EN = translations.en (question + textes des options, points inchangés).
  const tr = formData.translations?.en;
  const question = lang === 'fr' ? formData.question : (tr?.question ?? '');
  const optionText = (i: number) => (lang === 'fr' ? formData.options[i]?.text ?? '' : (tr?.options?.[i] ?? ''));

  const setQuestion = (v: string) =>
    lang === 'fr'
      ? setFormData((p) => ({ ...p, question: v }))
      : setFormData((p) => ({ ...p, translations: { ...p.translations, en: { question: v, options: p.translations?.en?.options ?? p.options.map(() => '') } } }));

  const isValid = formData.question.trim() &&
    formData.options.every(opt => opt.text.trim()) &&
    formData.options.length === 3;

  const handleSave = () => {
    if (!isValid) return;
    onSave(formData);
    onClose();
  };

  const updateOption = (index: number, field: keyof DuelOption, value: string | number) => {
    if (field === 'text' && lang === 'en') {
      const cur = formData.translations?.en?.options ?? formData.options.map(() => '');
      const next = [...cur];
      next[index] = String(value);
      setFormData((p) => ({ ...p, translations: { ...p.translations, en: { question: p.translations?.en?.question ?? '', options: next } } }));
      return;
    }
    const newOptions = [...formData.options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    setFormData({ ...formData, options: newOptions });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" style={{ background: 'var(--color-card)', border: '1px solid var(--color-card-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--color-card-border)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
            {duel ? 'Modifier le Duel' : 'Nouveau Duel'}
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
            {/* Question */}
            <div>
              <label className="label">Question {lang === 'fr' ? '*' : '(EN)'}</label>
              <textarea
                className="input-field"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={lang === 'fr' ? 'Comment optimiser votre stratégie marketing...' : 'English translation…'}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Champ masqué : non consommé par le mobile (le mobile ne filtre jamais par sectorId). sectorId conservé dans le state/Firestore. */}

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
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8 }}>
                Les 3 réponses sont valides mais rapportent des points différents (meilleure: 30pts, moyenne: 20pts, faible: 10pts)
              </p>
              {formData.options.map((option, index) => (
                <div key={index} className="mb-3 p-3 rounded-lg" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)' }}>
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
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                      {option.points === 30 ? 'Meilleure réponse' : option.points === 20 ? 'Bonne réponse' : 'Réponse acceptable'}
                    </span>
                  </div>
                  <input
                    className="input-field"
                    value={optionText(index)}
                    onChange={(e) => updateOption(index, 'text', e.target.value)}
                    placeholder={lang === 'fr' ? `Option ${index + 1}` : `Option ${index + 1} (EN)`}
                    style={{ marginBottom: 0 }}
                  />
                </div>
              ))}
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
