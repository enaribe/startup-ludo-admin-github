'use client';

/**
 * SALLE D'ATTENTE d'une séance (lot CS-2, PLAN-CODE-SESSION.md).
 *
 * L'écran que l'enseignant projette pendant que ses apprenants rejoignent :
 * un QR, le code en très grand, et les prénoms qui s'allument un à un.
 *
 * ═══ POURQUOI LE QR ENCODE UN LIEN D'APPLICATION, PAS UNE URL WEB ═══
 *
 * `startupludo://session/<code>` est ouvert directement par l'appareil photo
 * natif quand l'app est installée — aucun domaine à posséder, aucune page
 * intermédiaire, aucune dépendance caméra côté mobile. La contrepartie est
 * connue et assumée : un téléphone SANS l'app ne saura pas ouvrir ce lien.
 * C'est pourquoi le code reste affiché en clair et en très grand — il est le
 * chemin universel, celui que l'enseignant dicte aussi à voix haute.
 * Le jour où un domaine existe, seule `LIEN_SESSION` change.
 *
 * ⚠️ LE CODE NE DONNE AUCUN DROIT PAR LUI-MÊME. Il désigne la séance ; la règle
 * Firestore `estCetEleve()` vérifie ensuite que l'appelant est rattaché à LA
 * classe de cette séance. Un élève d'une autre classe qui scanne est refusé par
 * la base, pas seulement par l'interface.
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Info, MonitorPlay, Play, X } from 'lucide-react';
import type { LigneSuivi } from '@/lib/class-report-service';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

/** Préfixe du lien encodé dans le QR — à passer en `https://…` le jour d'un domaine. */
const LIEN_SESSION = 'startupludo://session/';

interface SalleAttenteProps {
  /** Code d'entrée à 6 caractères, déjà généré par `startSession`. */
  code: string;
  /** Titre de la séance, affiché en sous-titre. */
  titreSeance: string;
  /** Nom de la classe concernée. */
  nomClasse: string;
  /** Édition support, pour le sous-titre (facultative). */
  nomEdition?: string;
  /** Lignes de suivi (élèves de la classe × participants) — déjà croisées. */
  lignes: LigneSuivi[];
  /** True tant que la première réponse Firestore n'est pas arrivée. */
  chargement: boolean;
  /** « Démarrer la partie ». Absent pour un lecteur non propriétaire. */
  onDemarrer?: () => void;
  /** True pendant le démarrage, pour neutraliser le bouton. */
  actionEnCours?: boolean;
}

export default function SalleAttente({
  code,
  titreSeance,
  nomClasse,
  nomEdition,
  lignes,
  chargement,
  onDemarrer,
  actionEnCours = false,
}: SalleAttenteProps) {
  const [projection, setProjection] = useState(false);
  const [qr, setQr] = useState<string>('');

  // Le QR est rendu en data-URL, une seule fois par code : pas d'appel réseau,
  // pas de service tiers — le code d'entrée d'une classe ne sort pas d'ici.
  useEffect(() => {
    if (!code) return;
    let annule = false;
    QRCode.toDataURL(`${LIEN_SESSION}${code}`, {
      margin: 1,
      width: 512,
      errorCorrectionLevel: 'M',
      color: { dark: NAVY, light: '#FFFFFF' },
    })
      .then((url) => {
        if (!annule) setQr(url);
      })
      .catch(() => {
        // Sans QR, le code en clair reste le chemin universel : on ne bloque rien.
      });
    return () => {
      annule = true;
    };
  }, [code]);

  const connectes = lignes.filter((l) => l.etat !== 'absent');
  const codeAffiche = code ? `${code.slice(0, 3)}-${code.slice(3)}` : '—';

  return (
    <div className="flex flex-col gap-4">
      {/* ═══ En-tête ═══ */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: NAVY }}>Salle d’attente</h1>
          <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 620, lineHeight: 1.55 }}>
            Projetez cet écran — <strong style={{ color: NAVY }}>{titreSeance}</strong>
            {nomEdition ? ` · Édition ${nomEdition}` : ''} · {nomClasse}. Vos apprenants rejoignent
            en scannant le QR ou en tapant le code ; ceux qui n’ont pas encore lié leur compte
            choisissent leur nom à l’entrée.
          </p>
        </div>
        <button
          className="flex items-center gap-2"
          onClick={() => setProjection(true)}
          style={{
            fontSize: 13, fontWeight: 700, padding: '10px 16px', borderRadius: 10,
            border: 'none', cursor: 'pointer', background: NAVY, color: '#FFFFFF', flexShrink: 0,
          }}
        >
          <MonitorPlay size={15} /> Projeter
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* ═══ Aperçu de l'écran projeté ═══ */}
        <section
          className="lg:col-span-2 flex flex-col items-center"
          style={{ background: NAVY, borderRadius: 20, padding: '28px 24px 32px' }}
        >
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.6, color: 'rgba(255,255,255,0.5)' }}>
            APERÇU DE L’ÉCRAN PROJETÉ
          </div>
          <h2
            style={{
              fontFamily: 'var(--font-title), system-ui',
              fontSize: 34, color: '#FFFFFF', marginTop: 14, letterSpacing: 0.5,
              textShadow: '0 3px 0 rgba(0,0,0,0.25)',
            }}
          >
            REJOIGNEZ LA PARTIE !
          </h2>

          <div style={{ background: '#FFFFFF', borderRadius: 14, padding: 14, marginTop: 20 }}>
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt={`QR code de la session ${codeAffiche}`} style={{ width: 240, height: 240, display: 'block' }} />
            ) : (
              <div
                className="flex items-center justify-center"
                style={{ width: 240, height: 240, fontSize: 12, color: '#5A6A70', textAlign: 'center', padding: 20 }}
              >
                Le code ci-dessous fonctionne dans tous les cas.
              </div>
            )}
          </div>

          <div
            style={{
              fontFamily: 'var(--font-title), system-ui',
              fontSize: 44, color: ORANGE, marginTop: 18, letterSpacing: 2,
            }}
          >
            {codeAffiche}
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 8, textAlign: 'center', lineHeight: 1.6 }}>
            Scannez le QR avec l’appareil photo, ou ouvrez Startup Ludo et entrez le code{' '}
            <strong style={{ color: ORANGE }}>{codeAffiche}</strong>
          </p>

          {/* Les prénoms s'allument un à un — le cœur de l'effet de salle. */}
          <div className="flex items-center justify-center gap-2 flex-wrap" style={{ marginTop: 22, maxWidth: 620 }}>
            {connectes.map((l) => (
              <PastilleJoueur key={l.learnerId} nom={l.nom} />
            ))}
            {connectes.length === 0 && (
              <p style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.5)' }}>
                {chargement ? 'Connexion au suivi…' : 'En attente des premiers apprenants…'}
              </p>
            )}
          </div>
        </section>

        {/* ═══ Contrôle enseignant ═══ */}
        <section className="glass-card">
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-card-border)' }}>
            <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Contrôle enseignant</h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>{nomClasse}</p>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <div className="flex items-baseline gap-2">
              <span style={{ fontSize: 34, fontWeight: 800, color: NAVY, lineHeight: 1 }}>
                {connectes.length}
              </span>
              <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                / {lignes.length} apprenant{lignes.length > 1 ? 's' : ''} connecté{connectes.length > 1 ? 's' : ''}
              </span>
            </div>

            {connectes.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {connectes.map((l) => (
                  <PastilleJoueur key={l.learnerId} nom={l.nom} sombre />
                ))}
              </div>
            )}

            <div
              className="flex items-start gap-2.5"
              style={{
                padding: '12px 14px', borderRadius: 12,
                background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)',
              }}
            >
              <Info size={14} style={{ color: '#B87A0C', flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
                Vous pouvez démarrer sans attendre tout le monde : les retardataires rejoignent en
                cours de partie avec le même code, tant que la séance est ouverte.
              </p>
            </div>

            {onDemarrer && (
              <button
                className="flex items-center justify-center gap-2"
                onClick={onDemarrer}
                disabled={actionEnCours}
                style={{
                  fontSize: 14, fontWeight: 800, padding: '14px 18px', borderRadius: 12,
                  border: 'none', cursor: 'pointer', background: ORANGE, color: NAVY,
                  opacity: actionEnCours ? 0.6 : 1,
                }}
              >
                <Play size={16} /> {actionEnCours ? 'Démarrage…' : 'Démarrer la partie'}
              </button>
            )}
          </div>
        </section>
      </div>

      {/* ═══ Projection plein écran (clic ou Échap pour sortir) ═══ */}
      {projection && (
        <ProjectionPleinEcran
          codeAffiche={codeAffiche}
          qr={qr}
          connectes={connectes}
          total={lignes.length}
          onFermer={() => setProjection(false)}
        />
      )}
    </div>
  );
}

/** Pastille d'un apprenant connecté : point vert + prénom. */
function PastilleJoueur({ nom, sombre }: { nom: string; sombre?: boolean }) {
  return (
    <span
      className="flex items-center gap-2"
      style={{
        fontFamily: 'var(--font-title), system-ui',
        fontSize: 12.5, letterSpacing: 0.4, padding: '7px 14px', borderRadius: 999,
        background: sombre ? NAVY : 'rgba(255,255,255,0.1)',
        color: '#FFFFFF',
        border: sombre ? 'none' : '1px solid rgba(255,255,255,0.15)',
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, background: '#2EA043', flexShrink: 0 }} />
      {nom}
    </span>
  );
}

/** Le même écran, en plein écran, pour le vidéoprojecteur. */
function ProjectionPleinEcran({
  codeAffiche,
  qr,
  connectes,
  total,
  onFermer,
}: {
  codeAffiche: string;
  qr: string;
  connectes: LigneSuivi[];
  total: number;
  onFermer: () => void;
}) {
  // Échap ferme : en projection, la souris est souvent loin de l'écran.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFermer();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [onFermer]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100, background: NAVY,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 18, padding: 32, overflowY: 'auto',
      }}
    >
      <button
        onClick={onFermer}
        title="Fermer (Échap)"
        style={{
          position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.1)',
          border: 'none', borderRadius: 10, cursor: 'pointer', color: '#FFFFFF', padding: 10,
        }}
      >
        <X size={18} />
      </button>

      <h1
        style={{
          fontFamily: 'var(--font-title), system-ui',
          fontSize: 'clamp(34px, 6vw, 68px)', color: '#FFFFFF', letterSpacing: 1,
          textShadow: '0 4px 0 rgba(0,0,0,0.25)', textAlign: 'center',
        }}
      >
        REJOIGNEZ LA PARTIE !
      </h1>

      <div className="flex items-center gap-10 flex-wrap justify-center">
        {qr && (
          <div style={{ background: '#FFFFFF', borderRadius: 18, padding: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr} alt={`QR code de la session ${codeAffiche}`} style={{ width: 'min(38vh, 320px)', height: 'min(38vh, 320px)', display: 'block' }} />
          </div>
        )}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, letterSpacing: 2, color: 'rgba(255,255,255,0.5)' }}>CODE D’ENTRÉE</div>
          <div
            style={{
              fontFamily: 'var(--font-title), system-ui',
              fontSize: 'clamp(48px, 9vw, 104px)', color: ORANGE, letterSpacing: 4, lineHeight: 1.1,
            }}
          >
            {codeAffiche}
          </div>
          <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.75)', marginTop: 10 }}>
            Ouvrez Startup Ludo et entrez ce code
          </div>
        </div>
      </div>

      <div style={{ fontSize: 'clamp(18px, 2.4vw, 26px)', fontWeight: 800, color: '#FFFFFF', marginTop: 8 }}>
        {connectes.length} <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 400 }}>/ {total} connectés</span>
      </div>

      <div className="flex items-center justify-center gap-2 flex-wrap" style={{ maxWidth: 900 }}>
        {connectes.map((l) => (
          <PastilleJoueur key={l.learnerId} nom={l.nom} />
        ))}
      </div>
    </div>
  );
}
