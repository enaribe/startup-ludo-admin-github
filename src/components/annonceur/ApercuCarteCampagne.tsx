'use client';

/**
 * Aperçu recto/verso de la carte d'une campagne — wizard et récapitulatif.
 *
 * Reproduit l'anatomie de la carte mobile (spec §2.1) : bandeau vert avec le
 * type en typographie forte, panneau clair avec logo et message, jeton de gain
 * (non configurable — l'infobulle l'explique), bouton pilule. Le VERSO montre
 * la mention « Sponsorisé par », la description, les critères, la date limite
 * et le CTA au libellé configuré. Clic = retournement 3D — le même geste que
 * fera le joueur.
 */

import { useState } from 'react';
import { RefreshCw, Star } from 'lucide-react';
import type { CampaignCard } from '@/types';
import { JETONS_PAR_KIND } from '@/lib/campaign-service';

const BANDEAU: Record<CampaignCard['kind'], { libelle: string; couleur: string }> = {
  financement: { libelle: 'FINANCEMENT', couleur: '#1F91D0' },
  opportunite: { libelle: 'OPPORTUNITÉ', couleur: '#FFFFFF' },
  evenement: { libelle: 'ÉVÉNEMENT', couleur: '#FFFFFF' },
};

export default function ApercuCarteCampagne({ card }: { card: CampaignCard }) {
  const [verso, setVerso] = useState(false);
  const meta = BANDEAU[card.kind];
  const jetons = JETONS_PAR_KIND[card.kind];

  return (
    <div style={{ perspective: 1000, width: 260, margin: '0 auto' }}>
      <button
        type="button"
        onClick={() => setVerso((v) => !v)}
        aria-label={verso ? 'Voir le recto' : 'Voir le verso'}
        style={{
          display: 'block',
          width: '100%',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          padding: 0,
          transformStyle: 'preserve-3d',
          transition: 'transform 0.55s cubic-bezier(0.4, 0.1, 0.2, 1)',
          transform: verso ? 'rotateY(180deg)' : 'rotateY(0deg)',
          position: 'relative',
          minHeight: 350,
        }}
      >
        {/* ===== RECTO ===== */}
        <Face>
          <Bandeau libelle={meta.libelle} couleur={meta.couleur} />
          <div style={{ background: '#EEF2F8', padding: '16px 14px 12px', flex: 1 }}>
            {card.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.logoUrl}
                alt=""
                style={{ height: 34, maxWidth: 150, objectFit: 'contain', margin: '0 auto 10px', display: 'block' }}
              />
            ) : (
              <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 14, color: '#0F1C2E', marginBottom: 10 }}>
                {card.structure || 'Votre structure'}
              </div>
            )}
            <p style={{ fontSize: 12.5, lineHeight: 1.45, color: '#0F1C2E', textAlign: 'center', fontWeight: 600 }}>
              {card.rectoText || 'Votre message, écrit comme un événement que le joueur vient de vivre.'}
            </p>
            <div
              title="Récompense définie par le jeu — non configurable"
              style={{
                margin: '12px auto 0',
                width: 44,
                height: 28,
                borderRadius: 14,
                background: '#4CAF50',
                border: '2px solid #2E7D32',
                color: '#FFFFFF',
                fontWeight: 800,
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              +{jetons}
            </div>
          </div>
          <Pilule libelle="CONTINUER" />
          <IconeFlip />
        </Face>

        {/* ===== VERSO ===== */}
        <Face retourne>
          <Bandeau libelle={meta.libelle} couleur={meta.couleur} />
          <div style={{ background: '#EEF2F8', padding: '12px 14px', flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 10, color: '#5A6A7E', textAlign: 'center', marginBottom: 8 }}>
              Sponsorisé par {card.structure || 'votre structure'}
            </div>
            <p style={{ fontSize: 11.5, lineHeight: 1.45, color: '#0F1C2E' }}>
              {card.verso?.description || 'La description détaillée de votre dispositif.'}
            </p>
            {card.verso?.avantage && (
              <p style={{ fontSize: 11.5, color: '#0F1C2E', marginTop: 6 }}>
                <strong>Avantage :</strong> {card.verso.avantage}
              </p>
            )}
            {card.verso?.criteres && (
              <p style={{ fontSize: 11, color: '#3D4C61', marginTop: 6 }}>
                <strong>Éligibilité :</strong> {card.verso.criteres}
              </p>
            )}
            {card.verso?.dateLimite && (
              <p style={{ fontSize: 11, color: '#B84A0C', marginTop: 6 }}>
                <strong>Date limite :</strong>{' '}
                {new Date(card.verso.dateLimite).toLocaleDateString('fr-FR')}
              </p>
            )}
          </div>
          <Pilule libelle={card.cta?.libelle || 'EN SAVOIR PLUS'} />
          <IconeFlip />
        </Face>
      </button>
      <button
        type="button"
        onClick={() => setVerso((v) => !v)}
        className="flex items-center gap-2"
        style={{
          margin: '12px auto 0', fontSize: 12.5, fontWeight: 600, color: '#0F1C2E',
          border: '1px solid rgba(15,28,46,0.15)', borderRadius: 18, padding: '7px 16px',
          background: '#FFFFFF', cursor: 'pointer',
        }}
      >
        <RefreshCw size={13} /> {verso ? 'Voir le recto' : 'Voir le verso'}
      </button>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 8 }}>
        La carte telle qu'elle apparaîtra dans le jeu. Cliquez dessus pour la retourner.
      </p>
    </div>
  );
}

function Face({ children, retourne }: { children: React.ReactNode; retourne?: boolean }) {
  return (
    <div
      style={{
        position: retourne ? 'absolute' : 'relative',
        inset: retourne ? 0 : undefined,
        backfaceVisibility: 'hidden',
        transform: retourne ? 'rotateY(180deg)' : undefined,
        borderRadius: 16,
        overflow: 'hidden',
        background: '#FFFFFF',
        boxShadow: '0 6px 20px rgba(15, 28, 46, 0.18)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 350,
      }}
    >
      {children}
    </div>
  );
}

function Bandeau({ libelle, couleur }: { libelle: string; couleur: string }) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        background: 'linear-gradient(135deg, #43A047, #2E7D32)',
        padding: '10px 12px',
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.25)' }}
      >
        <Star size={12} color="#FFF176" fill="#FFF176" />
      </span>
      <span
        style={{
          fontWeight: 900,
          fontSize: 14,
          letterSpacing: 0.5,
          color: couleur,
          textShadow: couleur === '#FFFFFF' ? '0 1px 2px rgba(0,0,0,0.35)' : '0 0 3px #FFFFFF',
        }}
      >
        {libelle}
      </span>
    </div>
  );
}

function Pilule({ libelle }: { libelle: string }) {
  return (
    <div style={{ background: '#EEF2F8', padding: '0 14px 14px' }}>
      <div
        style={{
          background: '#43A047',
          borderRadius: 20,
          padding: '9px 0',
          textAlign: 'center',
          color: '#FFFFFF',
          fontWeight: 800,
          fontSize: 12,
          letterSpacing: 0.5,
          boxShadow: '0 3px 8px rgba(46, 125, 50, 0.4)',
        }}
      >
        {libelle}
      </div>
    </div>
  );
}

function IconeFlip() {
  return (
    <span
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        width: 20,
        height: 20,
        borderRadius: 10,
        background: 'rgba(255,255,255,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RefreshCw size={11} color="#2E7D32" />
    </span>
  );
}
