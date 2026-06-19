'use client';

import { useState, useEffect, useRef } from 'react';
import { Sparkles, Loader2, AlertCircle, Check } from 'lucide-react';
import Modal from './Modal';
import type { GenerationType } from '@/lib/ai-prompts';
import { PROMPTS } from '@/lib/ai-prompts';

interface AIGenerateModalProps {
  open: boolean;
  onClose: () => void;
  type: GenerationType;
  context?: Record<string, unknown>;
  onGenerated: (data: unknown) => void;
  /** Pre-filled prompt that auto-triggers generation on open */
  autoPrompt?: string;
}

export default function AIGenerateModal({ open, onClose, type, context, onGenerated, autoPrompt }: AIGenerateModalProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [preview, setPreview] = useState<any>(null);
  const autoTriggered = useRef(false);

  const config = PROMPTS[type];

  // Auto-generate when autoPrompt is provided and modal opens
  useEffect(() => {
    if (open && autoPrompt && !autoTriggered.current) {
      autoTriggered.current = true;
      setPrompt(autoPrompt);
      // Trigger generation after a short delay for UI to render
      const timer = setTimeout(() => {
        doGenerate(autoPrompt);
      }, 300);
      return () => clearTimeout(timer);
    }
    if (!open) {
      autoTriggered.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoPrompt]);

  const doGenerate = async (promptText: string) => {
    setLoading(true);
    setError('');
    setPreview(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, prompt: promptText.trim(), context }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Erreur de generation');
        return;
      }

      setPreview(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur reseau');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    setPreview(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, prompt: prompt.trim(), context }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error || 'Erreur de generation');
        return;
      }

      setPreview(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur reseau');
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = () => {
    if (preview) {
      onGenerated(preview);
      setPrompt('');
      setPreview(null);
      setError('');
      onClose();
    }
  };

  const handleClose = () => {
    setPrompt('');
    setPreview(null);
    setError('');
    onClose();
  };

  const previewCount = Array.isArray(preview) ? preview.length :
    typeof preview === 'object' && preview !== null ? 1 : 0;

  return (
    <Modal open={open} onClose={handleClose} title="Generer avec l'IA" maxWidth="640px">
      <div className="flex flex-col gap-4">
        {/* Type badge */}
        <div className="flex items-center gap-2">
          <Sparkles size={16} color="#FFBC40" />
          <span style={{ fontSize: 13, fontWeight: 600, color: '#FFBC40' }}>{config?.label}</span>
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>— {config?.description}</span>
        </div>

        {/* Prompt input */}
        <div>
          <label className="label">{autoPrompt ? 'Contexte (auto)' : 'Votre demande'}</label>
          <textarea
            className="input-field"
            value={prompt}
            onChange={(e) => !autoPrompt && setPrompt(e.target.value)}
            placeholder={config?.placeholder}
            rows={autoPrompt ? 2 : 3}
            style={{
              resize: autoPrompt ? 'none' : 'vertical',
              fontSize: autoPrompt ? 12 : 13,
              opacity: autoPrompt ? 0.7 : 1,
            }}
            disabled={loading || !!autoPrompt}
            readOnly={!!autoPrompt}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey && !loading) handleGenerate();
            }}
          />
          {!autoPrompt && (
            <p style={{ fontSize: 10, color: 'var(--color-text-muted)', marginTop: 4 }}>
              Cmd+Enter pour generer
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg" style={{
            background: 'rgba(244,67,54,0.1)',
            border: '1px solid rgba(244,67,54,0.2)',
          }}>
            <AlertCircle size={16} color="#F44336" className="flex-shrink-0 mt-0.5" />
            <p style={{ fontSize: 12, color: '#F44336', lineHeight: 1.4 }}>{error}</p>
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Check size={14} color="#4CAF50" />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#4CAF50' }}>
                  Genere avec succes !
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                {previewCount} element{previewCount !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="rounded-lg overflow-hidden" style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-card-border)',
              maxHeight: 250,
              overflow: 'auto',
            }}>
              <pre style={{
                fontSize: 11,
                color: 'var(--color-text-secondary)',
                padding: 12,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: "'SF Mono', 'Menlo', monospace",
                lineHeight: 1.5,
                margin: 0,
              }}>
                {JSON.stringify(preview, null, 2)}
              </pre>
            </div>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
              Cliquez "Utiliser" pour injecter ces donnees. Vous pourrez les modifier ensuite.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid var(--color-card-border)' }}>
          <button className="btn-secondary" onClick={handleClose} style={{ fontSize: 13 }}>
            Annuler
          </button>
          <div className="flex gap-2">
            {preview && (
              <button
                className="btn-secondary flex items-center gap-1.5"
                onClick={() => { setPreview(null); if (autoPrompt) doGenerate(autoPrompt); }}
                style={{ fontSize: 13 }}
              >
                Regenerer
              </button>
            )}
            {!preview ? (
              <button
                className="btn-primary flex items-center gap-2"
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                style={{ fontSize: 13 }}
              >
                {loading ? (
                  <>
                    <Loader2 size={14} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />
                    Generation...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Generer
                  </>
                )}
              </button>
            ) : (
              <button
                className="btn-primary flex items-center gap-2"
                onClick={handleAccept}
                style={{ fontSize: 13, background: '#4CAF50' }}
              >
                <Check size={14} />
                Utiliser ({previewCount})
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </Modal>
  );
}
