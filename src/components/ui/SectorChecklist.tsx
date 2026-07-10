'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, AlertCircle, RefreshCw } from 'lucide-react';

interface SectorCard {
  id: string;
  text: string;
  rarity?: 'common' | 'rare' | 'legendary';
}

interface SectorChecklistProps {
  /** Secteurs actuellement sélectionnés (on stocke le `text` du secteur, ex. "Fintech"). */
  value: string[];
  /** Appelé à chaque changement de sélection. */
  onChange: (sectors: string[]) => void;
}

/**
 * Liste à cocher inline des secteurs de l'application.
 * Charge les secteurs depuis /api/ideation (cartes de type `sector`),
 * même source que le modal de génération IA. La valeur stockée est `sector.text`
 * pour rester cohérent avec l'existant (SectorSelectionModal).
 */
export default function SectorChecklist({ value, onChange }: SectorChecklistProps) {
  const [sectors, setSectors] = useState<SectorCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadSectors = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ideation');
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Erreur de chargement');
      }
      const json = await res.json();
      const deck = json.decks?.[0];
      if (!deck) throw new Error('Aucun deck trouve');
      const sectorCards: SectorCard[] = deck.cards.filter((c: { type: string }) => c.type === 'sector');
      setSectors(sectorCards);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur reseau');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSectors();
  }, []);

  const toggle = (sectorText: string) => {
    onChange(
      value.includes(sectorText)
        ? value.filter((s) => s !== sectorText)
        : [...value, sectorText]
    );
  };

  // Secteurs présents dans l'édition mais absents de la liste (secteurs libres/legacy)
  const orphanSectors = value.filter((v) => !sectors.some((s) => s.text === v));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="label" style={{ marginBottom: 0 }}>Secteurs</label>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            {value.length} sélectionné{value.length !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={loadSectors}
            disabled={loading}
            title="Recharger la liste"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg mb-2" style={{
          background: 'rgba(244,67,54,0.1)',
          border: '1px solid rgba(244,67,54,0.2)',
        }}>
          <AlertCircle size={16} color="#F44336" className="flex-shrink-0 mt-0.5" />
          <p style={{ fontSize: 12, color: '#F44336', lineHeight: 1.4 }}>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin" style={{ color: '#FFBC40' }} />
        </div>
      ) : sectors.length === 0 && !error ? (
        <div className="flex items-center justify-center py-8">
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Aucun secteur disponible</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-72 overflow-y-auto p-1">
          {sectors.map((sector) => {
            const isSelected = value.includes(sector.text);
            return (
              <button
                key={sector.id}
                type="button"
                onClick={() => toggle(sector.text)}
                className="p-3 rounded-lg transition-all text-left"
                style={{
                  background: isSelected ? 'rgba(255,188,64,0.15)' : 'var(--color-surface)',
                  border: `1px solid ${isSelected ? 'rgba(255,188,64,0.4)' : 'var(--color-card-border)'}`,
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                {isSelected && (
                  <div
                    className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: '#FFBC40' }}
                  >
                    <Check size={12} color="#FFFFFF" strokeWidth={3} />
                  </div>
                )}
                <p style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: isSelected ? '#FFBC40' : 'var(--color-text-primary)',
                  paddingRight: isSelected ? 24 : 0,
                }}>
                  {sector.text}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Secteurs libres/legacy déjà enregistrés mais absents de la liste */}
      {orphanSectors.length > 0 && (
        <div className="mt-2">
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>
            Secteurs personnalisés (hors liste) :
          </p>
          <div className="flex flex-wrap gap-1.5">
            {orphanSectors.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                className="px-2 py-1 rounded-full flex items-center gap-1"
                title="Retirer"
                style={{
                  fontSize: 11,
                  background: 'rgba(255,188,64,0.12)',
                  border: '1px solid rgba(255,188,64,0.3)',
                  color: '#FFBC40',
                  cursor: 'pointer',
                }}
              >
                {s}
                <Check size={10} strokeWidth={3} />
              </button>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}
