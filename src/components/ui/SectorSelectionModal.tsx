'use client';

import { useState, useEffect } from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';
import Modal from './Modal';

interface SectorCard {
  id: string;
  text: string;
  xpMultiplier?: number;
  rarity?: 'common' | 'rare' | 'legendary';
}

interface SectorSelectionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (selectedSectors: string[]) => void;
}

export default function SectorSelectionModal({ open, onClose, onConfirm }: SectorSelectionModalProps) {
  const [sectors, setSectors] = useState<SectorCard[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      loadSectors();
    } else {
      // Reset selection when modal closes
      setSelectedSectors([]);
    }
  }, [open]);

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
      if (!deck) {
        throw new Error('Aucun deck trouve');
      }
      // Filter only sector cards
      const sectorCards = deck.cards.filter((c: { type: string }) => c.type === 'sector');
      setSectors(sectorCards);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur reseau');
    } finally {
      setLoading(false);
    }
  };

  const toggleSector = (sectorText: string) => {
    setSelectedSectors((prev) =>
      prev.includes(sectorText)
        ? prev.filter((s) => s !== sectorText)
        : [...prev, sectorText]
    );
  };

  const handleConfirm = () => {
    if (selectedSectors.length === 0) return;
    onConfirm(selectedSectors);
  };

  return (
    <Modal open={open} onClose={onClose} title="Sélectionner les secteurs" maxWidth="640px">
      <div className="flex flex-col gap-4">
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
          Sélectionnez un ou plusieurs secteurs pour générer une édition thématique.
          L'IA créera automatiquement tous les quiz, duels, événements, etc. adaptés à ces secteurs.
        </p>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg" style={{
            background: 'rgba(244,67,54,0.1)',
            border: '1px solid rgba(244,67,54,0.2)',
          }}>
            <AlertCircle size={16} color="#F44336" className="flex-shrink-0 mt-0.5" />
            <p style={{ fontSize: 12, color: '#F44336', lineHeight: 1.4 }}>{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin" style={{ color: '#FFBC40' }} />
          </div>
        ) : sectors.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
              Aucun secteur disponible
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-96 overflow-y-auto p-1">
            {sectors.map((sector) => {
              const isSelected = selectedSectors.includes(sector.text);
              return (
                <button
                  key={sector.id}
                  onClick={() => toggleSector(sector.text)}
                  className="p-3 rounded-lg transition-all text-left"
                  style={{
                    background: isSelected ? 'rgba(255,188,64,0.15)' : 'rgba(0,0,0,0.2)',
                    border: `1px solid ${isSelected ? 'rgba(255,188,64,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    cursor: 'pointer',
                    position: 'relative',
                  }}
                >
                  {isSelected && (
                    <div
                      className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ background: '#FFBC40' }}
                    >
                      <Check size={12} color="#0A1929" strokeWidth={3} />
                    </div>
                  )}
                  <p style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: isSelected ? '#FFBC40' : '#FFFFFF',
                    paddingRight: isSelected ? 24 : 0,
                  }}>
                    {sector.text}
                  </p>
                  {sector.rarity && (
                    <span
                      className="inline-block mt-1 px-1.5 py-0.5 rounded text-xs"
                      style={{
                        background: sector.rarity === 'legendary' ? 'rgba(155,89,182,0.2)' :
                                   sector.rarity === 'rare' ? 'rgba(255,188,64,0.2)' :
                                   'rgba(255,255,255,0.1)',
                        color: sector.rarity === 'legendary' ? '#9B59B6' :
                               sector.rarity === 'rare' ? '#FFBC40' :
                               'rgba(255,255,255,0.5)',
                        fontSize: 9,
                      }}
                    >
                      {sector.rarity}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {selectedSectors.length} secteur{selectedSectors.length !== 1 ? 's' : ''} sélectionné{selectedSectors.length !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-2">
            <button
              className="btn-secondary"
              onClick={onClose}
              style={{ fontSize: 13 }}
            >
              Annuler
            </button>
            <button
              className="btn-primary"
              onClick={handleConfirm}
              disabled={selectedSectors.length === 0}
              style={{ fontSize: 13 }}
            >
              Générer ({selectedSectors.length})
            </button>
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
