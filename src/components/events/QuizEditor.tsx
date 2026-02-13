'use client';

import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import type { Quiz, DifficultyLevel } from '@/types';
import { generateId } from '@/lib/utils';

interface QuizEditorProps {
  quiz?: Quiz | null;
  onSave: (quiz: Quiz) => void;
  onClose: () => void;
}

const CATEGORIES = [
  'business-model', 'financement', 'marketing', 'operations',
  'legal', 'ressources-humaines', 'strategie', 'innovation'
];

const DIFFICULTIES: DifficultyLevel[] = ['facile', 'moyen', 'difficile'];

export default function QuizEditor({ quiz, onSave, onClose }: QuizEditorProps) {
  const [formData, setFormData] = useState<Quiz>({
    id: quiz?.id || `quiz_${generateId()}`,
    question: quiz?.question || '',
    options: quiz?.options || ['', '', ''],
    correctAnswer: quiz?.correctAnswer ?? 0,
    category: quiz?.category || 'business-model',
    difficulty: quiz?.difficulty || 'moyen',
    explanation: quiz?.explanation || '',
    rewardTokens: quiz?.rewardTokens || 10,
    penaltyTokens: quiz?.penaltyTokens || 5,
    timeLimit: quiz?.timeLimit || 30,
  });

  const isValid = formData.question.trim() &&
    formData.options.every(opt => opt.trim()) &&
    formData.options.length === 3;

  const handleSave = () => {
    if (!isValid) return;
    onSave(formData);
    onClose();
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...formData.options];
    newOptions[index] = value;
    setFormData({ ...formData, options: newOptions });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>
            {quiz ? 'Modifier le Quiz' : 'Nouveau Quiz'}
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
                placeholder="Quelle est la meilleure stratégie pour..."
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Options */}
            <div>
              <label className="label">Réponses (3 options) *</label>
              {formData.options.map((option, index) => (
                <div key={index} className="mb-2 flex items-center gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={formData.correctAnswer === index}
                      onChange={() => setFormData({ ...formData, correctAnswer: index })}
                      style={{ cursor: 'pointer' }}
                    />
                    <input
                      className="input-field flex-1"
                      value={option}
                      onChange={(e) => updateOption(index, e.target.value)}
                      placeholder={`Option ${index + 1}`}
                      style={{ marginBottom: 0 }}
                    />
                  </div>
                  {formData.correctAnswer === index && (
                    <span style={{ fontSize: 11, color: '#4CAF50', fontWeight: 600 }}>✓ Correcte</span>
                  )}
                </div>
              ))}
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                Cochez la bonne réponse
              </p>
            </div>

            {/* Category & Difficulty */}
            <div className="grid grid-cols-2 gap-4">
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
              <div>
                <label className="label">Difficulté</label>
                <select
                  className="input-field"
                  value={formData.difficulty}
                  onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as DifficultyLevel })}
                >
                  {DIFFICULTIES.map((diff) => (
                    <option key={diff} value={diff}>{diff}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Explanation */}
            <div>
              <label className="label">Explication (optionnel)</label>
              <textarea
                className="input-field"
                value={formData.explanation}
                onChange={(e) => setFormData({ ...formData, explanation: e.target.value })}
                placeholder="Pourquoi cette réponse est correcte..."
                rows={2}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Rewards */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="label">Récompense (tokens)</label>
                <input
                  type="number"
                  className="input-field"
                  value={formData.rewardTokens}
                  onChange={(e) => setFormData({ ...formData, rewardTokens: Number(e.target.value) })}
                  min={0}
                />
              </div>
              <div>
                <label className="label">Pénalité (tokens)</label>
                <input
                  type="number"
                  className="input-field"
                  value={formData.penaltyTokens}
                  onChange={(e) => setFormData({ ...formData, penaltyTokens: Number(e.target.value) })}
                  min={0}
                />
              </div>
              <div>
                <label className="label">Temps (secondes)</label>
                <input
                  type="number"
                  className="input-field"
                  value={formData.timeLimit}
                  onChange={(e) => setFormData({ ...formData, timeLimit: Number(e.target.value) })}
                  min={10}
                />
              </div>
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
