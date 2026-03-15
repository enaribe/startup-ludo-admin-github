'use client';

import { useState } from 'react';
import { X, Upload, Sparkles, Check, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import type { Quiz, Duel, Funding, Opportunity, ChallengeEvent } from '@/types';
import { generateId } from '@/lib/utils';

export interface ImportedContent {
  quizzes: Quiz[];
  duels: Duel[];
  fundings: Funding[];
  opportunities: Opportunity[];
  challengeEvents: ChallengeEvent[];
}

interface ImportContentModalProps {
  subLevelTitle?: string;
  levelTitle?: string;
  programName?: string;
  /** If set, only import this specific content type */
  importFilter?: keyof ImportedContent;
  onImport: (content: ImportedContent, mode: 'replace' | 'append') => void;
  onClose: () => void;
}

type ImportMode = 'replace' | 'append';

function assignIds(content: Partial<ImportedContent>): ImportedContent {
  const prefix = Date.now();
  return {
    quizzes: (content.quizzes || []).map((q, i) => ({ ...q, id: `quiz_${prefix}_${i}` })),
    duels: (content.duels || []).map((d, i) => ({ ...d, id: `duel_${prefix}_${i}` })),
    fundings: (content.fundings || []).map((f, i) => ({ ...f, id: `fund_${prefix}_${i}` })),
    opportunities: (content.opportunities || []).map((o, i) => ({ ...o, id: `opp_${prefix}_${i}` })),
    challengeEvents: (content.challengeEvents || []).map((c, i) => ({ ...c, id: `chal_${prefix}_${i}` })),
  };
}

const TYPE_CONFIG = [
  { key: 'quizzes' as const, label: 'Quiz', color: '#2196F3', dot: '🟦' },
  { key: 'duels' as const, label: 'Duels', color: '#9C27B0', dot: '🟪' },
  { key: 'fundings' as const, label: 'Financements', color: '#FF9800', dot: '🟧' },
  { key: 'opportunities' as const, label: 'Opportunités', color: '#4CAF50', dot: '🟩' },
  { key: 'challengeEvents' as const, label: 'Défis', color: '#F44336', dot: '🟥' },
];

const FILTER_LABELS: Record<keyof ImportedContent, string> = {
  quizzes: 'Quiz',
  duels: 'Duels',
  fundings: 'Financements',
  opportunities: 'Opportunités',
  challengeEvents: 'Défis',
};

const FILTER_PLACEHOLDERS: Record<keyof ImportedContent, string> = {
  quizzes: `Exemple :

Quiz 1 : Qu'est-ce qu'un business model ?
A) Un modèle de financement (bonne réponse)
B) Un plan marketing
C) Une fiche produit

Quiz 2 : Quel est le rôle d'un pitch deck ?
A) Présenter le projet aux investisseurs (bonne réponse)
B) Gérer la comptabilité
C) Recruter des employés`,
  duels: `Exemple :

Question 1 : Comment valider une idée de startup ?
- Faire une étude de marché approfondie (meilleure réponse)
- Demander à ses amis (réponse acceptable)
- Lancer directement sans tester (mauvaise approche)

Question 2 : Quelle stratégie de pricing adopter ?
- Analyser la concurrence et le marché (meilleure)
- Copier le prix du concurrent (acceptable)
- Mettre le prix le plus bas possible (risqué)`,
  fundings: `Exemple :

Subvention BPI France - Aide à l'innovation pour les startups tech. Montant : 50 000€
Prêt d'honneur Réseau Entreprendre - Prêt sans intérêt ni garantie. 30 000€
Crowdfunding Ulule - Campagne de financement participatif réussie. 15 000€`,
  opportunities: `Exemple :

Partenariat avec une grande entreprise - Un grand groupe propose un partenariat stratégique. +3 jetons
Couverture médiatique - Un article dans un média national parle de ta startup. +2 jetons
Nouveau marché - Tu découvres un marché inexploité pour ton produit. +4 jetons`,
  challengeEvents: `Exemple :

Retard de livraison fournisseur - Ton fournisseur principal a un retard de 3 semaines. -2 jetons
Bug critique en production - Un bug majeur affecte tes utilisateurs. -3 jetons
Départ d'un associé - Un cofondateur quitte le projet. -4 jetons`,
};

export default function ImportContentModal({
  subLevelTitle,
  levelTitle,
  programName,
  importFilter,
  onImport,
  onClose,
}: ImportContentModalProps) {
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportedContent | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<keyof ImportedContent>>(
    importFilter
      ? new Set([importFilter])
      : new Set(['quizzes', 'duels', 'fundings', 'opportunities', 'challengeEvents'])
  );
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const visibleTypes = importFilter
    ? TYPE_CONFIG.filter(t => t.key === importFilter)
    : TYPE_CONFIG;

  const filterLabel = importFilter ? FILTER_LABELS[importFilter] : null;

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleType = (key: keyof ImportedContent) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleAnalyze = async () => {
    if (!rawText.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'sublevel_content_import',
          prompt: rawText,
          context: {
            subLevelTitle: subLevelTitle || '',
            levelTitle: levelTitle || '',
            programName: programName || '',
            importFilter: importFilter || '',
          },
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Erreur lors de l\'analyse');

      const data = json.data as Partial<ImportedContent>;
      const withIds = assignIds(data);
      setPreview(withIds);

      // Auto-expand sections with content
      const toExpand = new Set<string>();
      visibleTypes.forEach(({ key }) => {
        if ((withIds[key] || []).length > 0) toExpand.add(key);
      });
      setExpandedSections(toExpand);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!preview) return;
    const filtered: ImportedContent = {
      quizzes: selectedTypes.has('quizzes') ? preview.quizzes : [],
      duels: selectedTypes.has('duels') ? preview.duels : [],
      fundings: selectedTypes.has('fundings') ? preview.fundings : [],
      opportunities: selectedTypes.has('opportunities') ? preview.opportunities : [],
      challengeEvents: selectedTypes.has('challengeEvents') ? preview.challengeEvents : [],
    };
    onImport(filtered, importMode);
  };

  const totalSelected = preview
    ? visibleTypes.filter(t => selectedTypes.has(t.key)).reduce((sum, t) => sum + (preview[t.key]?.length || 0), 0)
    : 0;

  const placeholderText = importFilter
    ? FILTER_PLACEHOLDERS[importFilter]
    : `Exemple :

Quiz 1 : Qu'est-ce qu'un business model ?
A) Un modèle de financement (bonne réponse)
B) Un plan marketing
C) Une fiche produit

Opportunité : Tu décroches un contrat inattendu. +3 jetons
Défi : Retard de livraison fournisseur. Perds 2 jetons...`;

  const descriptionText = importFilter
    ? `Colle ton texte contenant des ${FILTER_LABELS[importFilter].toLowerCase()}. L'IA va l'analyser et extraire uniquement les ${FILTER_LABELS[importFilter].toLowerCase()}.`
    : 'Colle ton texte (questions, cours, notes...). L\'IA va l\'analyser et extraire le contenu structuré.';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full flex flex-col rounded-2xl"
        style={{
          maxWidth: 680,
          maxHeight: '90vh',
          background: '#0f2a45',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'rgba(255, 188, 64, 0.15)' }}
            >
              <Upload size={16} color="#FFBC40" />
            </div>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>
                Importer {filterLabel ? `des ${filterLabel.toLowerCase()}` : 'via l\'IA'}
              </h2>
              {subLevelTitle && (
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  {programName && `${programName} › `}{levelTitle && `${levelTitle} › `}{subLevelTitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Step 1 — Paste text */}
          <div className="px-5 pt-4 pb-3">
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
              {descriptionText}
            </p>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder={placeholderText}
              rows={10}
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                color: '#fff',
                fontSize: 12,
                padding: '10px 12px',
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: 1.6,
                outline: 'none',
              }}
            />
          </div>

          <div className="px-5 pb-4">
            <button
              onClick={handleAnalyze}
              disabled={loading || !rawText.trim()}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition"
              style={{
                background: loading || !rawText.trim() ? 'rgba(255,255,255,0.08)' : '#FFBC40',
                color: loading || !rawText.trim() ? 'rgba(255,255,255,0.3)' : '#0C243E',
                border: 'none',
                cursor: loading || !rawText.trim() ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <Sparkles size={15} />
              {loading ? 'Analyse en cours...' : 'Analyser avec l\'IA'}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div
              className="mx-5 mb-4 flex items-start gap-2 rounded-xl p-3"
              style={{ background: 'rgba(244,67,54,0.1)', border: '1px solid rgba(244,67,54,0.2)' }}
            >
              <AlertCircle size={14} color="#F44336" style={{ marginTop: 1, flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: '#F44336' }}>{error}</p>
            </div>
          )}

          {/* Step 2 — Preview */}
          {preview && (
            <div className="px-5 pb-4 border-t border-white/10 pt-4">
              <p style={{ fontSize: 12, fontWeight: 600, color: '#FFBC40', marginBottom: 12 }}>
                {importFilter
                  ? `Résultat — ${FILTER_LABELS[importFilter]} extraits`
                  : 'Résultat de l\'analyse — sélectionne ce que tu veux importer'}
              </p>

              {visibleTypes.map(({ key, label, color }) => {
                const items = preview[key] || [];
                if (items.length === 0) return null;
                const isSelected = selectedTypes.has(key);
                const isExpanded = expandedSections.has(key);

                return (
                  <div
                    key={key}
                    className="mb-2 rounded-xl overflow-hidden"
                    style={{
                      border: `1px solid ${isSelected ? color + '40' : 'rgba(255,255,255,0.06)'}`,
                      background: isSelected ? color + '08' : 'rgba(0,0,0,0.15)',
                    }}
                  >
                    <div
                      className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
                      onClick={() => !importFilter && toggleType(key)}
                    >
                      {!importFilter && (
                        <div
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded"
                          style={{
                            background: isSelected ? color : 'rgba(255,255,255,0.1)',
                            border: `1px solid ${isSelected ? color : 'rgba(255,255,255,0.2)'}`,
                          }}
                        >
                          {isSelected && <Check size={11} color="#fff" />}
                        </div>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? color : 'rgba(255,255,255,0.5)' }}>
                        {label}
                      </span>
                      <span
                        className="ml-1 rounded-full px-2 py-0.5 text-xs"
                        style={{ background: color + '20', color }}
                      >
                        {items.length}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); toggleSection(key); }}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}
                      >
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-white/5 px-3 pb-3 pt-2 flex flex-col gap-2">
                        {key === 'quizzes' && (preview.quizzes).map((q, i) => (
                          <div key={i} className="rounded-lg p-2.5" style={{ background: 'rgba(0,0,0,0.2)' }}>
                            <p style={{ fontSize: 12, color: '#fff', marginBottom: 4 }}>{q.question}</p>
                            <div className="flex flex-col gap-0.5">
                              {q.options.map((opt, oi) => (
                                <span key={oi} style={{ fontSize: 11, color: q.correctAnswer === oi ? '#4CAF50' : 'rgba(255,255,255,0.4)' }}>
                                  {q.correctAnswer === oi ? '✓' : '·'} {opt}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                        {key === 'duels' && (preview.duels).map((d, i) => (
                          <div key={i} className="rounded-lg p-2.5" style={{ background: 'rgba(0,0,0,0.2)' }}>
                            <p style={{ fontSize: 12, color: '#fff', marginBottom: 4 }}>{d.question}</p>
                            <div className="flex flex-col gap-0.5">
                              {d.options.map((opt, oi) => (
                                <span key={oi} style={{ fontSize: 11, color: opt.points === 30 ? '#4CAF50' : opt.points === 20 ? '#FFBC40' : 'rgba(255,255,255,0.4)' }}>
                                  {opt.points}pts — {opt.text}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                        {(key === 'fundings' || key === 'opportunities' || key === 'challengeEvents') &&
                          (preview[key] as (Funding | Opportunity | ChallengeEvent)[]).map((item, i) => (
                            <div key={i} className="rounded-lg p-2.5" style={{ background: 'rgba(0,0,0,0.2)' }}>
                              <div className="flex justify-between">
                                <p style={{ fontSize: 12, color: '#fff' }}>{item.title}</p>
                                <span style={{ fontSize: 11, color: item.tokens > 0 ? '#4CAF50' : '#F44336', fontWeight: 600 }}>
                                  {item.tokens > 0 ? '+' : ''}{item.tokens} tokens
                                </span>
                              </div>
                              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{item.description}</p>
                            </div>
                          ))
                        }
                      </div>
                    )}
                  </div>
                );
              })}

              {visibleTypes.every(t => (preview[t.key] || []).length === 0) && (
                <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.2)' }}>
                  <p style={{ fontSize: 12, color: '#FF9800' }}>
                    Aucun contenu structuré détecté. Essaie de coller un texte plus explicite (questions avec réponses, fiches...).
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {preview && totalSelected > 0 && (
          <div className="px-5 py-4 border-t border-white/10 shrink-0">
            {/* Mode */}
            <div className="flex items-center gap-3 mb-3">
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Mode :</p>
              <div className="flex gap-2">
                {(['append', 'replace'] as ImportMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setImportMode(mode)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium transition"
                    style={{
                      background: importMode === mode ? 'rgba(255,188,64,0.15)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${importMode === mode ? 'rgba(255,188,64,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      color: importMode === mode ? '#FFBC40' : 'rgba(255,255,255,0.4)',
                      cursor: 'pointer',
                    }}
                  >
                    {mode === 'append' ? 'Ajouter au contenu existant' : 'Remplacer le contenu'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={handleImport}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2 font-semibold text-sm"
                style={{ background: '#FFBC40', color: '#0C243E', border: 'none', cursor: 'pointer' }}
              >
                <Check size={15} />
                Importer {totalSelected} élément{totalSelected > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
