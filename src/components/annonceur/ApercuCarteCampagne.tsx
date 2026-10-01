'use client';

/**
 * Aperçu recto/verso de la carte d'une campagne — wizard, récapitulatif,
 * fiche de campagne et modération.
 *
 * ═══ COPIE CONFORME, PAS INTERPRÉTATION ═══
 *
 * L'annonceur décide d'acheter en regardant cet aperçu. S'il ne ressemble pas
 * à ce que le joueur verra, on lui vend autre chose que ce qu'il croit. Les
 * valeurs ci-dessous sont donc recopiées des deux composants React Native qui
 * font foi, dans le dépôt `startup-ludo` :
 *
 *   recto → src/components/game/popups/FundingPopup.tsx
 *   verso → src/components/game/popups/SponsorEventPopup.tsx
 *
 * Correspondance des tokens mobiles (src/styles/) :
 *   BORDER_RADIUS['3xl'] = 24 · .xl = 16 · .full = 9999
 *   FONT_SIZES.xs = 10 · .sm = 12 · .base = 14 · .xl = 20
 *   SPACING[n] = n × 4
 *
 * ⚠️ UNE RETOUCHE ESTHÉTIQUE FAITE ICI SEULE RECRÉE L'ÉCART. Si le rendu du
 * jeu change, lire les nouvelles valeurs là-bas et les reporter ici — jamais
 * l'inverse.
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

/** Vert du jeu (`COLORS.success`) et son ombrage. */
const VERT = '#4CAF50';
const VERT_FONCE = '#2E7D32';
/** Fond des encarts de contenu (`descriptionBox` mobile). */
const FOND_ENCART = '#F8F9FA';

/**
 * 300 px et non les 360 du mobile : l'aperçu vit dans une colonne de
 * formulaire, pas en plein écran. Les proportions INTERNES (rayons, tailles de
 * texte, badge) restent celles du jeu — c'est ce qui fait la ressemblance, la
 * largeur absolue ne compte pas.
 */
const LARGEUR = 300;
/** Hauteur commune aux deux faces : sans elle, le verso saute au retournement. */
const HAUTEUR = 392;

export default function ApercuCarteCampagne({ card }: { card: CampaignCard }) {
  const [verso, setVerso] = useState(false);
  const meta = BANDEAU[card.kind];
  const jetons = JETONS_PAR_KIND[card.kind];

  return (
    <div style={{ perspective: 1200, width: LARGEUR, margin: '0 auto' }}>
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
          minHeight: HAUTEUR,
        }}
      >
        {/* ═══════════════ RECTO — FundingPopup.tsx ═══════════════ */}
        <Face>
          <Bandeau libelle={meta.libelle} couleur={meta.couleur} />

          <div style={corps}>
            {card.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={card.logoUrl}
                alt=""
                style={{
                  height: 40,
                  maxWidth: '70%',
                  objectFit: 'contain',
                  margin: '0 auto 12px',
                  display: 'block',
                }}
              />
            ) : (
              // `eventName` : FONTS.title, FONT_SIZES.xl (20), vert, centré.
              <div style={titreStructure}>{card.structure || 'VOTRE STRUCTURE'}</div>
            )}

            {/* `descriptionBox` — encart clair détaché du fond de la carte. */}
            <div style={encart}>
              <p style={texteDescription}>
                {card.rectoText ||
                  'Votre message, écrit comme un événement que le joueur vient de vivre.'}
              </p>
            </div>

            {/* `badge` : 64×64 rond, bordure 3 px — pas une pilule. */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div title="Récompense définie par le jeu — non configurable" style={badge}>
                +{jetons}
              </div>
            </div>

            <Pilule libelle="CONTINUER" />
          </div>

          <IconeFlip />
        </Face>

        {/* ═══════════════ VERSO — SponsorEventPopup.tsx ═══════════════ */}
        <Face retourne>
          <Bandeau libelle={meta.libelle} couleur={meta.couleur} />

          <div style={corps}>
            <div style={encartVerso}>
              {card.logoUrl ? (
                // `sponsorLogoSmall` : 50 % de large, 36 de haut.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={card.logoUrl}
                  alt=""
                  style={{
                    width: '50%',
                    height: 36,
                    objectFit: 'contain',
                    marginBottom: 8,
                    display: 'block',
                  }}
                />
              ) : null}

              <div style={sponsorisePar}>
                SPONSORISÉ PAR {(card.structure || 'votre structure').toUpperCase()}
              </div>

              <p style={versoDescription}>
                {card.verso?.description || 'La description détaillée de votre dispositif.'}
              </p>

              {card.verso?.avantage && (
                <p style={versoLigne}>
                  <span style={versoLibelle}>Avantage : </span>
                  {card.verso.avantage}
                </p>
              )}
              {card.verso?.criteres && (
                <p style={versoLigne}>
                  <span style={versoLibelle}>Éligibilité : </span>
                  {card.verso.criteres}
                </p>
              )}
              {card.verso?.dateLimite && (
                // `versoDeadline` : la date limite passe en orange.
                <p style={{ ...versoLigne, color: '#B84A0C' }}>
                  <span style={versoLibelle}>Date limite : </span>
                  {new Date(card.verso.dateLimite).toLocaleDateString('fr-FR')}
                </p>
              )}
            </div>

            <Pilule libelle={card.cta?.libelle || 'EN SAVOIR PLUS'} />
          </div>

          <IconeFlip />
        </Face>
      </button>

      {/* `flipButton` du jeu : pilule bordée vert foncé sur fond vert très pâle. */}
      <button
        type="button"
        onClick={() => setVerso((v) => !v)}
        className="flex items-center gap-2"
        style={{
          margin: '14px auto 0',
          fontSize: 12,
          fontWeight: 600,
          color: VERT_FONCE,
          border: `1.5px solid ${VERT_FONCE}`,
          borderRadius: 9999,
          padding: '8px 16px',
          background: 'rgba(76, 175, 80, 0.08)',
          cursor: 'pointer',
        }}
      >
        <RefreshCw size={13} /> {verso ? 'Voir le recto' : 'Voir le verso'}
      </button>

      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 8 }}>
        La carte telle qu&apos;elle apparaîtra dans le jeu. Cliquez dessus pour la retourner.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Styles — chaque valeur vient d'un `StyleSheet` du jeu, cf. en-tête.
// ═══════════════════════════════════════════════════════════════════════════

/** `scrollContent` : SPACING[4] en haut, [6] en bas, [5] sur les côtés. */
const corps: React.CSSProperties = {
  background: '#FFFFFF',
  padding: '16px 20px 24px',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
};

/** `eventName` — nom de la structure, en tête du recto. */
const titreStructure: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  color: VERT,
  textAlign: 'center',
  marginBottom: 12,
  letterSpacing: 0.3,
};

/** `descriptionBox` : fond clair, rayon 16, pleine largeur. */
const encart: React.CSSProperties = {
  background: FOND_ENCART,
  borderRadius: 16,
  padding: '14px 16px',
  width: '100%',
  marginBottom: 16,
};

/** Même encart, en colonne centrée : le verso empile logo puis mentions. */
const encartVerso: React.CSSProperties = {
  ...encart,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

/** `description` : 14 px, interligne 22, centré. */
const texteDescription: React.CSSProperties = {
  fontSize: 14,
  lineHeight: '22px',
  color: '#2C3E50',
  textAlign: 'center',
  fontWeight: 500,
  margin: 0,
};

/** `badge` : 64×64, rond, bordure 3 px vert foncé. */
const badge: React.CSSProperties = {
  width: 64,
  height: 64,
  borderRadius: 32,
  background: VERT,
  border: `3px solid ${VERT_FONCE}`,
  color: '#FFFFFF',
  fontWeight: 800,
  fontSize: 20,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  boxShadow: '0 4px 8px rgba(46, 125, 50, 0.25)',
};

/** `sponsoredBy` : 10 px, gris, centré. */
const sponsorisePar: React.CSSProperties = {
  fontSize: 10,
  color: '#7F8E9E',
  marginBottom: 8,
  letterSpacing: 0.4,
  textAlign: 'center',
};

/** `versoDescription` : 12 px, aligné à gauche, interligne 20. */
const versoDescription: React.CSSProperties = {
  fontSize: 12,
  lineHeight: '20px',
  color: '#2C3E50',
  textAlign: 'left',
  width: '100%',
  fontWeight: 500,
  margin: 0,
};

/** `versoLigne` : 12 px, interligne 19, marge haute SPACING[2]. */
const versoLigne: React.CSSProperties = {
  fontSize: 12,
  lineHeight: '19px',
  color: '#3D4C61',
  width: '100%',
  marginTop: 8,
  marginBottom: 0,
  textAlign: 'left',
};

/** `versoLibelle` : le préfixe en gras. */
const versoLibelle: React.CSSProperties = {
  fontWeight: 700,
  color: '#2C3E50',
};

// ═══════════════════════════════════════════════════════════════════════════
// Sous-composants
// ═══════════════════════════════════════════════════════════════════════════

/** Une face de la carte. `BORDER_RADIUS['3xl']` = 24, `SHADOWS.xl`. */
function Face({ children, retourne }: { children: React.ReactNode; retourne?: boolean }) {
  return (
    <div
      style={{
        position: retourne ? 'absolute' : 'relative',
        inset: retourne ? 0 : undefined,
        backfaceVisibility: 'hidden',
        transform: retourne ? 'rotateY(180deg)' : undefined,
        borderRadius: 24,
        overflow: 'hidden',
        background: '#FFFFFF',
        boxShadow: '0 12px 28px rgba(15, 28, 46, 0.22)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: HAUTEUR,
      }}
    >
      {children}
    </div>
  );
}

/** Bandeau de type : dégradé vert et étoile — `PopupHeader` du jeu. */
function Bandeau({ libelle, couleur }: { libelle: string; couleur: string }) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        background: `linear-gradient(135deg, #43A047, ${VERT_FONCE})`,
        padding: '12px 14px',
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{ width: 24, height: 24, borderRadius: 7, background: 'rgba(255,255,255,0.25)' }}
      >
        <Star size={13} color="#FFF176" fill="#FFF176" />
      </span>
      <span
        style={{
          fontWeight: 900,
          fontSize: 15,
          letterSpacing: 0.6,
          color: couleur,
          textShadow: couleur === '#FFFFFF' ? '0 1px 2px rgba(0,0,0,0.35)' : '0 0 3px #FFFFFF',
        }}
      >
        {libelle}
      </span>
    </div>
  );
}

/**
 * Bouton d'action — `GameButton variant="green"`, pleine largeur, avec le
 * relief que le jeu obtient par une ombre portée nette.
 *
 * `marginTop: auto` le colle en bas : sans ça, un verso court le laissait
 * flotter au milieu alors qu'il touche le bord sur mobile.
 */
function Pilule({ libelle }: { libelle: string }) {
  return (
    <div
      style={{
        background: VERT,
        borderRadius: 9999,
        padding: '12px 10px',
        textAlign: 'center',
        color: '#FFFFFF',
        fontWeight: 800,
        fontSize: 13,
        letterSpacing: 0.5,
        boxShadow: `0 4px 0 ${VERT_FONCE}, 0 6px 12px rgba(46, 125, 50, 0.3)`,
        marginTop: 'auto',
      }}
    >
      {libelle}
    </div>
  );
}

/** Pastille de retournement, coin haut droit — `flipButton` compact du jeu. */
function IconeFlip() {
  return (
    <span
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        width: 24,
        height: 24,
        borderRadius: 12,
        background: 'rgba(255,255,255,0.9)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 3px rgba(15,28,46,0.2)',
      }}
    >
      <RefreshCw size={12} color={VERT_FONCE} />
    </span>
  );
}
