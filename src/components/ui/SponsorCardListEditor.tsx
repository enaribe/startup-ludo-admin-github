'use client';

import { Plus, Trash2 } from 'lucide-react';
import ImageUploadField from '@/components/ui/ImageUploadField';
import type { SponsorEventCard } from '@/types';

interface SponsorCardListEditorProps {
  /** Titre de la liste (ex. "Opportunités sponsor"). */
  title: string;
  /** Aide contextuelle sous le titre. */
  hint?: string;
  cards: SponsorEventCard[];
  onChange: (cards: SponsorEventCard[]) => void;
  /** Base du chemin Storage pour les logos (ex. "editions/agriculture/sponsor-opp"). */
  storagePathBase: string;
  /** Jetons par défaut d'une nouvelle carte (2 opportunité / 4 financement). */
  defaultTokens: number;
  disabled?: boolean;
  disabledHint?: string;
}

/**
 * Éditeur de cartes d'événements sponsor (opportunités / financements)
 * injectées en partie côté mobile pour les éditions sponsorisées.
 */
export default function SponsorCardListEditor({
  title,
  hint,
  cards,
  onChange,
  storagePathBase,
  defaultTokens,
  disabled,
  disabledHint,
}: SponsorCardListEditorProps) {
  const updateCard = (index: number, patch: Partial<SponsorEventCard>) => {
    onChange(cards.map((card, i) => (i === index ? { ...card, ...patch } : card)));
  };

  const addCard = () => {
    onChange([
      ...cards,
      {
        id: `sponsor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        text: '',
        tokens: defaultTokens,
        logoUrl: '',
        linkUrl: '',
      },
    ]);
  };

  const removeCard = (index: number) => {
    onChange(cards.filter((_, i) => i !== index));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="label" style={{ marginBottom: 0 }}>{title}</label>
        <button
          type="button"
          className="btn-secondary flex items-center gap-1.5"
          onClick={addCard}
          style={{ fontSize: 12, padding: '5px 10px' }}
        >
          <Plus size={13} />
          Ajouter
        </button>
      </div>
      {hint && (
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 8 }}>{hint}</p>
      )}

      {cards.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '6px 0' }}>
          Aucune carte — cette catégorie n&apos;apparaîtra pas en partie.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {cards.map((card, index) => (
            <div
              key={card.id}
              className="p-3 rounded-lg"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)' }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 flex flex-col gap-3">
                  <textarea
                    className="input-field"
                    rows={2}
                    placeholder="Texte de la carte (ex. Le DER t'accorde une subvention pour ton projet !)"
                    value={card.text}
                    onChange={(e) => updateCard(index, { text: e.target.value })}
                  />
                  <div>
                    <label className="label" style={{ fontSize: 11 }}>Lien de l&apos;opportunité (optionnel)</label>
                    <input
                      className="input-field"
                      type="url"
                      placeholder="https://… (site du sponsor, formulaire de candidature)"
                      value={card.linkUrl || ''}
                      onChange={(e) => updateCard(index, { linkUrl: e.target.value })}
                    />
                    <p style={{ fontSize: 10.5, color: 'var(--color-text-muted)', marginTop: 3 }}>
                      Avec un lien, le joueur peut sauvegarder la carte en partie et l&apos;ouvrir depuis son profil.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div>
                      <label className="label" style={{ fontSize: 11 }}>Jetons</label>
                      <input
                        className="input-field"
                        type="number"
                        min={1}
                        max={10}
                        value={card.tokens ?? defaultTokens}
                        onChange={(e) => updateCard(index, { tokens: parseInt(e.target.value, 10) || defaultTokens })}
                        style={{ width: 80 }}
                      />
                    </div>
                    <div className="flex-1">
                      <ImageUploadField
                        label="Logo de la carte"
                        value={card.logoUrl || ''}
                        onChange={(url) => updateCard(index, { logoUrl: url })}
                        storagePath={`${storagePathBase}-${card.id}`}
                        aspectRatio="square"
                        disabled={disabled}
                        disabledHint={disabledHint}
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeCard(index)}
                  title="Supprimer la carte"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
