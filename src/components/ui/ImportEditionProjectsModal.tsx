'use client';

import { useState } from 'react';
import { X, Upload, Sparkles, Check, AlertCircle } from 'lucide-react';
import type { DefaultProject } from '@/types';
import { generateId } from '@/lib/utils';
import { appelerGeneration } from '@/lib/ai-client';

interface ImportEditionProjectsModalProps {
  editionName?: string;
  sectors: string[];
  onImport: (projects: DefaultProject[], mode: 'replace' | 'append') => void;
  onClose: () => void;
}

type ImportMode = 'replace' | 'append';

function normalizeProjects(raw: unknown): DefaultProject[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && 'defaultProjects' in (raw as object)
      ? (raw as { defaultProjects: unknown }).defaultProjects
      : [];
  if (!Array.isArray(arr)) return [];

  const prefix = Date.now();
  return arr.map((item, i) => {
    const o = item as Record<string, unknown>;
    const id =
      typeof o.id === 'string' && o.id.trim()
        ? o.id.trim()
        : `proj_${prefix}_${i}`;
    const name = typeof o.name === 'string' ? o.name : '';
    const description = typeof o.description === 'string' ? o.description : '';
    const sector = typeof o.sector === 'string' ? o.sector : '';
    const target = typeof o.target === 'string' ? o.target : '';
    const mission = typeof o.mission === 'string' ? o.mission : '';
    const icon = typeof o.icon === 'string' ? o.icon : undefined;
    let initialBudget: number | undefined;
    if (typeof o.initialBudget === 'number' && Number.isFinite(o.initialBudget)) {
      initialBudget = o.initialBudget;
    }
    return {
      id,
      name,
      description,
      sector,
      target,
      mission,
      ...(initialBudget !== undefined ? { initialBudget } : {}),
      ...(icon ? { icon } : {}),
    };
  });
}

export default function ImportEditionProjectsModal({
  editionName,
  sectors,
  onImport,
  onClose,
}: ImportEditionProjectsModalProps) {
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DefaultProject[] | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('append');

  const handleAnalyze = async () => {
    if (!rawText.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const res = await appelerGeneration({
        type: 'edition_projects_import',
        prompt: rawText,
        context: {
          editionName: editionName || '',
          sectors: sectors.length ? sectors.join(', ') : '',
        },
      });

      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Erreur lors de l\'analyse');

      const projects = normalizeProjects(json.data);
      const withStableIds = projects.map((p, i) => ({
        ...p,
        id: p.id || `proj_${generateId()}_${i}`,
      }));
      setPreview(withStableIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!preview || preview.length === 0) return;
    onImport(preview, importMode);
  };

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
          background: '#FFFFFF',
          border: '1px solid var(--color-card-border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--color-card-border)' }}
        >
          <div className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: 'rgba(255, 188, 64, 0.15)' }}
            >
              <Upload size={16} color="#FFBC40" />
            </div>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Importer des projets par défaut
              </h2>
              {editionName && (
                <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                  {editionName}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-5 pt-4 pb-3">
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              Colle une liste de startups, fiches projet ou notes. L&apos;IA extrait les projets pour les joueurs sans startup personnelle.
            </p>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Exemple :

Projet 1 — AgriSmart (AgriTech)
Pitch : plateforme IoT pour petits producteurs au Sénégal.
Cible : coopératives agricoles. Mission : augmenter les rendements.
Budget initial : 120 000 €.

Projet 2 — EcoPay (FinTech)
...`}
              rows={10}
              style={{
                width: '100%',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-card-border)',
                borderRadius: 10,
                color: 'var(--color-text-primary)',
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
                background: loading || !rawText.trim() ? 'var(--color-surface)' : '#FFBC40',
                color: loading || !rawText.trim() ? 'var(--color-text-muted)' : '#FFFFFF',
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

          {error && (
            <div
              className="mx-5 mb-4 flex items-start gap-2 rounded-xl p-3"
              style={{ background: 'rgba(244,67,54,0.1)', border: '1px solid rgba(244,67,54,0.2)' }}
            >
              <AlertCircle size={14} color="#F44336" style={{ marginTop: 1, flexShrink: 0 }} />
              <p style={{ fontSize: 12, color: '#F44336' }}>{error}</p>
            </div>
          )}

          {preview && preview.length > 0 && (
            <div
              className="px-5 pb-4 pt-4"
              style={{ borderTop: '1px solid var(--color-card-border)' }}
            >
              <p style={{ fontSize: 12, fontWeight: 600, color: '#FFBC40', marginBottom: 12 }}>
                Résultat — {preview.length} projet{preview.length > 1 ? 's' : ''}
              </p>
              <div className="flex flex-col gap-2 max-h-[40vh] overflow-y-auto">
                {preview.map((p, i) => (
                  <div
                    key={`${p.id}-${i}`}
                    className="rounded-lg p-2.5"
                    style={{ background: 'var(--color-surface)' }}
                  >
                    <p style={{ fontSize: 12, color: 'var(--color-text-primary)', fontWeight: 600 }}>{p.name || '(sans nom)'}</p>
                    <p style={{ fontSize: 10, color: 'var(--color-text-muted)', marginBottom: 4 }}>{p.id}</p>
                    <p style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{p.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview && preview.length === 0 && !loading && (
            <div className="px-5 pb-4">
              <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.2)' }}>
                <p style={{ fontSize: 12, color: '#FF9800' }}>
                  Aucun projet détecté. Essaie un texte plus explicite (noms de startups, pitch, secteur).
                </p>
              </div>
            </div>
          )}
        </div>

        {preview && preview.length > 0 && (
          <div
            className="px-5 py-4 shrink-0"
            style={{ borderTop: '1px solid var(--color-card-border)' }}
          >
            <div className="flex items-center gap-3 mb-3">
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Mode :</p>
              <div className="flex gap-2">
                {(['append', 'replace'] as ImportMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setImportMode(mode)}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium transition"
                    style={{
                      background: importMode === mode ? 'rgba(255,188,64,0.15)' : 'var(--color-surface)',
                      border: `1px solid ${importMode === mode ? 'rgba(255,188,64,0.4)' : 'var(--color-card-border)'}`,
                      color: importMode === mode ? '#FFBC40' : 'var(--color-text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    {mode === 'append' ? 'Ajouter aux projets existants' : 'Remplacer tous les projets'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="rounded-xl px-4 py-2 text-sm"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={handleImport}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2 font-semibold text-sm"
                style={{ background: '#FFBC40', color: '#FFFFFF', border: 'none', cursor: 'pointer' }}
              >
                <Check size={15} />
                Importer {preview.length} projet{preview.length > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
