'use client';

/**
 * SponsorCardPreview — Aperçu d'une carte sponsor telle qu'elle est tirée en partie.
 *
 * POURQUOI : les cartes « opportunité » et « financement » sont le vrai levier
 * du sponsor (c'est là que le joueur découvre son offre et peut la sauvegarder),
 * mais l'éditeur ne montre que des champs de formulaire. Cet aperçu rend
 * concret ce que verra le joueur : badge de type, logo, texte, gain en jetons,
 * et bouton « Sauvegarder » quand un lien est renseigné.
 *
 * Volontairement sobre : on transpose la structure de `SponsorEventPopup`
 * (bandeau de type, panneau clair logo + texte, pastille « +N », bouton
 * Sauvegarder) dans le langage visuel de l'admin — pas de reproduction pixel
 * du 3D/flip du jeu, qui parasiterait la lecture.
 */

import { Bookmark, Coins, ImageOff, Star } from 'lucide-react';
import type { SponsorEventCard } from '@/types';

export type SponsorCardKind = 'opportunity' | 'funding';

interface SponsorCardPreviewProps {
  card: SponsorEventCard;
  kind: SponsorCardKind;
  /** Jetons par défaut si la carte n'en précise pas (2 opportunité / 4 financement). */
  defaultTokens: number;
}

const KIND_META: Record<SponsorCardKind, { label: string; color: string; icon: React.ReactNode }> = {
  opportunity: { label: 'OPPORTUNITÉ', color: 'var(--color-event-opportunity)', icon: <Star size={13} /> },
  funding: { label: 'FINANCEMENT', color: 'var(--color-event-funding)', icon: <Coins size={13} /> },
};

export default function SponsorCardPreview({ card, kind, defaultTokens }: SponsorCardPreviewProps) {
  const meta = KIND_META[kind];
  const tokens = card.tokens ?? defaultTokens;
  const hasLink = !!card.linkUrl?.trim();
  const hasText = !!card.text.trim();

  return (
    <div
      style={{
        width: 244,
        borderRadius: 16,
        overflow: 'hidden',
        background: '#FFFFFF',
        border: '1px solid var(--color-card-border)',
        boxShadow: '0 4px 16px rgba(12,36,62,0.10)',
      }}
    >
      {/* Bandeau de type : c'est la case du plateau sur laquelle le joueur est tombé. */}
      <div
        className="flex items-center justify-center gap-1.5"
        style={{ background: meta.color, color: '#FFFFFF', padding: '8px 10px', fontSize: 11, fontWeight: 800, letterSpacing: 1 }}
      >
        {meta.icon}
        {meta.label}
      </div>

      <div className="flex flex-col items-center gap-3" style={{ padding: 14 }}>
        {/* Panneau clair : logo de la carte puis texte, comme dans le jeu */}
        <div
          className="flex flex-col items-center gap-2.5"
          style={{ background: '#F8F9FA', borderRadius: 12, padding: '14px 12px', width: '100%' }}
        >
          {card.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.logoUrl} alt="" style={{ maxWidth: '70%', maxHeight: 44, objectFit: 'contain' }} />
          ) : (
            <span className="flex items-center gap-1.5" style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
              <ImageOff size={12} />
              Pas de logo sur cette carte
            </span>
          )}
          <p
            style={{
              fontSize: 12.5, lineHeight: 1.5, textAlign: 'center',
              color: hasText ? '#2C3E50' : 'var(--color-text-muted)',
              fontStyle: hasText ? 'normal' : 'italic',
            }}
          >
            {hasText ? card.text : 'Carte sans texte — elle ne sera jamais tirée en partie.'}
          </p>
        </div>

        {/* Pastille de gain */}
        <div
          className="flex items-center justify-center"
          style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'var(--color-success)', border: '3px solid #2E7D32',
            color: '#FFFFFF', fontSize: 17, fontWeight: 800,
          }}
        >
          +{tokens}
        </div>

        {/* Sauvegarde de l'opportunité : conditionnée à la présence d'un lien */}
        {hasLink ? (
          <span
            className="flex items-center gap-1.5"
            style={{
              fontSize: 11, fontWeight: 600, color: 'var(--color-info)',
              border: '1.5px solid var(--color-info)', borderRadius: 999,
              padding: '5px 12px', background: 'var(--color-info-light)',
            }}
          >
            <Bookmark size={12} />
            Sauvegarder pour plus tard
          </span>
        ) : (
          <p style={{ fontSize: 10.5, color: 'var(--color-text-muted)', textAlign: 'center' }}>
            Sans lien, le joueur ne peut pas sauvegarder cette opportunité.
          </p>
        )}

        <div
          className="flex items-center justify-center"
          style={{
            width: '100%', height: 34, borderRadius: 999,
            background: 'var(--color-success)', color: '#FFFFFF',
            fontSize: 12, fontWeight: 800, letterSpacing: 0.5,
          }}
        >
          CONTINUER
        </div>
      </div>
    </div>
  );
}
