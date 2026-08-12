'use client';

/**
 * SponsorPopupPreview — Aperçu fidèle du popup « édition sponsorisée » du mobile.
 *
 * POURQUOI : un sponsor externe ne peut pas lancer l'app pour vérifier son
 * rendu. Sans aperçu, il configure à l'aveugle (visuel mal cadré, nom trop
 * long, logo illisible sur fond sombre) et découvre le problème en production.
 * Ce composant reproduit `SponsoredEditionPopup` de l'app mobile (cadre 276×291,
 * scrim, badge, encart partenariat, bouton doré) pour que chaque champ saisi se
 * voie immédiatement à droite du formulaire.
 *
 * Fidélité : dimensions, dégradé et couleurs sont repris de
 * startup-ludo/src/components/game/popups/SponsoredEditionPopup.tsx. Le clic
 * sur « en savoir plus » bascule sur l'écran de détail (SponsorDetailModal),
 * exactement comme en jeu.
 */

import { useState } from 'react';
import { ChevronLeft, CheckCircle2, ExternalLink, ImageOff } from 'lucide-react';
import type { EditionSponsor } from '@/types';

interface SponsorPopupPreviewProps {
  /** Nom de l'édition affiché en haut du popup (ex. « Agritech »). */
  editionName: string;
  sponsor: EditionSponsor;
}

/** Dimensions de la maquette mobile (cf. CARD_WIDTH / CARD_HEIGHT côté app). */
const CARD_WIDTH = 276;
const CARD_HEIGHT = 291;
const CARD_PADDING = 14;

export default function SponsorPopupPreview({ editionName, sponsor }: SponsorPopupPreviewProps) {
  // Écran de détail « en savoir plus » — disponible seulement s'il y a de quoi l'alimenter.
  const [showDetail, setShowDetail] = useState(false);
  const hasDetail = !!(sponsor.description?.trim() || sponsor.linkUrl?.trim());
  const name = sponsor.name?.trim() || 'votre organisation';
  const title = editionName?.trim() || 'Édition';

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderRadius: 22,
          background: '#1F91D0',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: '0 8px 24px rgba(12,36,62,0.22)',
          flexShrink: 0,
        }}
      >
        {showDetail && hasDetail ? (
          <DetailScreen sponsor={sponsor} editionName={title} onBack={() => setShowDetail(false)} />
        ) : (
          <MainScreen
            sponsor={sponsor}
            editionName={title}
            sponsorName={name}
            canOpenDetail={hasDetail}
            onOpenDetail={() => setShowDetail(true)}
          />
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', maxWidth: CARD_WIDTH }}>
        {showDetail
          ? 'Écran « en savoir plus » — affiché quand le joueur touche le bouton.'
          : hasDetail
            ? 'Touchez « en savoir plus » pour voir l’écran de détail.'
            : 'Renseignez une description ou un lien pour activer l’écran de détail.'}
      </p>
    </div>
  );
}

/** Écran principal : visuel plein cadre, nom + badge, encart partenariat, bouton doré. */
function MainScreen({
  sponsor,
  editionName,
  sponsorName,
  canOpenDetail,
  onOpenDetail,
}: {
  sponsor: EditionSponsor;
  editionName: string;
  sponsorName: string;
  canOpenDetail: boolean;
  onOpenDetail: () => void;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', paddingTop: CARD_PADDING, paddingBottom: CARD_PADDING }}>
      <SponsorImage url={sponsor.imageUrl} />

      {/* Scrim bas : lisibilité du texte et du bouton par-dessus la photo. */}
      <div
        style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'linear-gradient(180deg, transparent 35%, rgba(0,0,0,.45) 65%, rgba(0,0,0,.72) 100%)',
        }}
      />

      {/* En-tête : nom de l'édition + badge « Sponsorisé » */}
      <div
        className="flex items-center justify-between gap-2"
        style={{ position: 'relative', marginLeft: CARD_PADDING, marginRight: CARD_PADDING }}
      >
        <span
          style={{
            fontSize: 21, fontWeight: 800, color: '#FFFFFF', lineHeight: 1.15,
            textShadow: '0 1px 3px rgba(14,105,156,0.9)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {editionName}
        </span>
        <span
          className="flex items-center gap-1"
          style={{
            background: '#FFFFFF', color: '#1F91D0', borderRadius: 30,
            padding: '6px 11px', fontSize: 11, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap',
          }}
        >
          <CheckCircle2 size={13} />
          Sponsorisé
        </span>
      </div>

      <div style={{ flex: 1 }} />

      {/* Encart partenariat : logo dans une plaque blanche + texte sponsor */}
      <div
        className="flex items-end gap-3"
        style={{ position: 'relative', marginLeft: CARD_PADDING, marginRight: CARD_PADDING, marginBottom: 12 }}
      >
        {sponsor.logoUrl ? (
          <div style={{ flexShrink: 0 }}>
            <p style={{ fontSize: 8, color: '#FFFFFF', marginBottom: 4 }}>En partenariat avec :</p>
            <div
              style={{
                width: 62, height: 52, background: '#FFFFFF', borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 5,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sponsor.logoUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
          </div>
        ) : null}
        <p style={{ flex: 1, fontSize: 12.5, lineHeight: 1.42, color: '#FFFFFF' }}>
          Cette thématique est sponsorisée par <strong style={{ fontWeight: 700 }}>{sponsorName}</strong>…{' '}
          <button
            type="button"
            onClick={canOpenDetail ? onOpenDetail : undefined}
            style={{
              background: 'none', border: 'none', padding: 0,
              font: 'inherit', color: '#FFFFFF', textDecoration: 'underline',
              cursor: canOpenDetail ? 'pointer' : 'default',
              opacity: canOpenDetail ? 1 : 0.6,
            }}
          >
            en savoir plus
          </button>
        </p>
      </div>

      {/* Bouton doré plein largeur */}
      <div style={{ position: 'relative', marginLeft: CARD_PADDING, marginRight: CARD_PADDING }}>
        <GoldButton label="JOUER" />
      </div>
    </div>
  );
}

/** Écran de détail « en savoir plus » : visuel réduit, description longue et lien. */
function DetailScreen({
  sponsor,
  editionName,
  onBack,
}: {
  sponsor: EditionSponsor;
  editionName: string;
  onBack: () => void;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0C243E', display: 'flex', flexDirection: 'column' }}>
      {/* Header : retour + titre, comme SponsorDetailModal */}
      <div className="flex items-center" style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
        <button
          type="button"
          onClick={onBack}
          className="flex items-center"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40', padding: 2 }}
          aria-label="Retour"
        >
          <ChevronLeft size={20} />
        </button>
        <span style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#FFFFFF', letterSpacing: 0.4, marginLeft: -20 }}>
          NOUVELLE PARTIE
        </span>
      </div>

      {/* Contenu défilant */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 10px' }}>
        <div style={{ height: 86, borderRadius: 12, overflow: 'hidden', position: 'relative', marginBottom: 10 }}>
          <SponsorImage url={sponsor.imageUrl} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,.25), transparent)' }} />
          <div className="flex items-center justify-between gap-2" style={{ position: 'absolute', top: 8, left: 8, right: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: '#FFFFFF', textShadow: '0 1px 3px rgba(14,105,156,0.9)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {editionName}
            </span>
            <span
              className="flex items-center gap-1"
              style={{ background: '#FFFFFF', color: '#1F91D0', borderRadius: 30, padding: '3px 8px', fontSize: 9, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              <CheckCircle2 size={10} />
              Sponsorisé
            </span>
          </div>
        </div>

        {sponsor.description?.trim() ? (
          <p style={{ fontSize: 11, lineHeight: 1.55, color: 'rgba(255,255,255,0.86)', whiteSpace: 'pre-wrap' }}>
            {sponsor.description}
          </p>
        ) : (
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontStyle: 'italic' }}>
            Aucune description — cet écran affichera seulement le visuel et le lien.
          </p>
        )}

        {sponsor.linkUrl?.trim() && (
          <span
            className="flex items-center gap-1.5"
            style={{ fontSize: 10.5, color: '#FFBC40', marginTop: 8, wordBreak: 'break-all' }}
          >
            <ExternalLink size={11} style={{ flexShrink: 0 }} />
            {sponsor.linkUrl}
          </span>
        )}
      </div>

      <div style={{ padding: '0 12px 12px', flexShrink: 0 }}>
        <GoldButton label="JOUER" />
      </div>
    </div>
  );
}

/** Visuel du sponsor en fond « cover », ou placeholder si non renseigné. */
function SponsorImage({ url }: { url?: string }) {
  if (!url) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2"
        style={{ position: 'absolute', inset: 0, background: 'linear-gradient(160deg, #2C7FB0, #1F91D0)', color: 'rgba(255,255,255,0.7)' }}
      >
        <ImageOff size={26} />
        <span style={{ fontSize: 11 }}>Visuel du popup</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
  );
}

/** Bouton doré du jeu (GameButton variant yellow). */
function GoldButton({ label }: { label: string }) {
  return (
    <div
      className="flex items-center justify-center"
      style={{
        height: 40, borderRadius: 999,
        background: 'linear-gradient(180deg, #FFD062, #F8B02F)',
        boxShadow: '0 3px 0 #D98E12',
        color: '#16314E', fontSize: 14, fontWeight: 800, letterSpacing: 0.6,
      }}
    >
      {label}
    </div>
  );
}
