'use client';

/**
 * Suivi EN DIRECT d'une séance en cours (lot 6).
 *
 * CE QUE L'ENSEIGNANT DOIT VOIR EN UN COUP D'ŒIL, dans cet ordre :
 *   1. combien d'élèves sont connectés sur l'effectif de sa classe ;
 *   2. QUI ne l'est pas — c'est la seule information sur laquelle il peut agir
 *      pendant la séance, d'où les non-connectés en TÊTE de liste et non
 *      relégués en bas ;
 *   3. où en sont les autres.
 *
 * PAS DE CONTRÔLES DISTANTS (pause, +5 min) : reportés en V2 par la SPEC. Le
 * seul bouton est « Terminer la séance », qui bascule l'écran sur le rapport.
 *
 * L'écoute temps réel est montée par le PARENT (`ecouterParticipants`) et
 * passée ici en props : ce composant reste purement présentationnel, donc
 * lisible sans dérouler le cycle de vie de l'abonnement Firestore.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2, Square, Users } from 'lucide-react';
import type { LigneSuivi } from '@/lib/class-report-service';

interface SuiviSeanceProps {
  /** Lignes déjà croisées et triées par `construireSuivi`. */
  lignes: LigneSuivi[];
  /** Début effectif de la séance, en millisecondes epoch. */
  startedAt?: number;
  /** Durée prévue par l'enseignant, en minutes. */
  durationMinutes: number;
  /** True tant que la première réponse Firestore n'est pas arrivée. */
  chargement: boolean;
  /** Action « Terminer la séance ». Absente pour un lecteur non propriétaire. */
  onTerminer?: () => void;
  /** True pendant la clôture, pour neutraliser le bouton. */
  actionEnCours?: boolean;
}

export default function SuiviSeance({
  lignes,
  startedAt,
  durationMinutes,
  chargement,
  onTerminer,
  actionEnCours = false,
}: SuiviSeanceProps) {
  const connectes = lignes.filter((l) => l.etat !== 'absent');
  const termines = lignes.filter((l) => l.etat === 'termine');
  const progressionMax = Math.max(1, ...lignes.map((l) => l.cellIndex));

  // Flux « ce qui se passe en ce moment » : les derniers événements remontés
  // par les téléphones (portés par les documents déjà écoutés — zéro coût).
  const flux = lignes
    .filter((l) => l.lastEvent)
    .sort((a, b) => (b.lastEvent?.at ?? 0) - (a.lastEvent?.at ?? 0))
    .slice(0, 6);

  // Classement live : score puis case atteinte.
  const classement = [...lignes]
    .filter((l) => l.etat !== 'absent')
    .sort((a, b) => b.score - a.score || b.cellIndex - a.cellIndex);

  const [podium, setPodium] = useState(false);

  return (
    <section className="glass-card">
      <div
        className="flex items-center justify-between gap-4 px-5 py-4 flex-wrap"
        style={{ borderBottom: '1px solid var(--color-card-border)' }}
      >
        <div>
          <h2
            className="flex items-center gap-2"
            style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}
          >
            <Users size={16} /> Suivi en direct
            <span
              aria-hidden
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: 'var(--color-success)',
                display: 'inline-block',
              }}
            />
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
            <strong style={{ color: 'var(--color-text-primary)' }}>
              {connectes.length} / {lignes.length}
            </strong>{' '}
            élève{lignes.length > 1 ? 's' : ''} connecté{connectes.length > 1 ? 's' : ''}
            {termines.length > 0 && ` · ${termines.length} terminé${termines.length > 1 ? 's' : ''}`}
            {' · '}
            <Chronometre startedAt={startedAt} durationMinutes={durationMinutes} />
          </p>
        </div>

        <button
          className="btn-secondary flex items-center gap-2"
          style={{ fontSize: 12.5 }}
          onClick={() => setPodium(true)}
        >
          Projeter le classement
        </button>
        {onTerminer && (
          <button
            className="btn-secondary flex items-center gap-2"
            onClick={onTerminer}
            disabled={actionEnCours}
            style={{ fontSize: 13, opacity: actionEnCours ? 0.5 : 1, flexShrink: 0 }}
            title="Clôturer la séance et afficher le rapport pédagogique"
          >
            <Square size={14} /> Terminer la séance
          </button>
        )}
      </div>

      {chargement ? (
        <div className="flex items-center justify-center gap-2 py-10" style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
          <Loader2 size={16} className="animate-spin" /> Connexion au suivi…
        </div>
      ) : lignes.length === 0 ? (
        <p className="px-5 py-8" style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>
          Cette classe ne compte aucun élève actif. Ajoutez-les depuis la fiche de la classe.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {lignes.map((ligne, index) => (
            <LigneEleve
              key={ligne.learnerId}
              ligne={ligne}
              progressionMax={progressionMax}
              derniere={index === lignes.length - 1}
            />
          ))}
        </ul>
      )}
      {/* ═══ Flux + classement (lot M4) ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-5 pb-5">
        <div>
          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)', margin: '14px 0 8px' }}>
            Ce qui se passe en ce moment
          </h3>
          {flux.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Les événements apparaîtront dès les premières réponses.
            </p>
          ) : (
            flux.map((l) => (
              <div key={l.learnerId} className="flex items-center gap-2" style={{ padding: '5px 0', fontSize: 12.5 }}>
                <span
                  style={{
                    width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                    background: l.lastEvent?.kind === 'quiz_ok' ? 'var(--color-success)' : '#E67E22',
                  }}
                />
                <strong style={{ color: 'var(--color-text-primary)' }}>{l.nom}</strong>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {l.lastEvent?.kind === 'quiz_ok' ? 'réussit un quiz' : 'retente un quiz'}
                  {l.lastEvent?.label ? ` · ${l.lastEvent.label}` : ''}
                </span>
              </div>
            ))
          )}
        </div>
        <div>
          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)', margin: '14px 0 8px' }}>
            Classement en direct
          </h3>
          {classement.slice(0, 8).map((l, i) => (
            <div key={l.learnerId} className="flex items-center justify-between gap-2" style={{ padding: '4px 0', fontSize: 12.5 }}>
              <span className="flex items-center gap-2">
                <span
                  style={{
                    width: 20, height: 20, borderRadius: 10, fontSize: 10.5, fontWeight: 800,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: i === 0 ? '#F5A623' : i < 3 ? 'rgba(245,166,35,0.35)' : 'rgba(15,28,46,0.08)',
                    color: i < 3 ? '#0F1C2E' : 'var(--color-text-muted)',
                  }}
                >
                  {i + 1}
                </span>
                <span style={{ color: 'var(--color-text-primary)', fontWeight: i < 3 ? 700 : 400 }}>{l.nom}</span>
                <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>case {l.cellIndex}</span>
              </span>
              <strong style={{ color: 'var(--color-text-primary)' }}>{l.score} pts</strong>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Podium plein écran (Échap ou clic pour sortir) ═══ */}
      {podium && (
        <div
          onClick={() => setPodium(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100, background: '#0F1C2E',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', gap: 10,
          }}
        >
          <div style={{ color: '#F5A623', fontWeight: 900, fontSize: 34, letterSpacing: 1 }}>CLASSEMENT</div>
          {classement.slice(0, 5).map((l, i) => (
            <div key={l.learnerId} className="flex items-center gap-4" style={{ fontSize: i < 3 ? 26 : 18, color: '#FFF' }}>
              <span style={{ width: 40, textAlign: 'right', color: i === 0 ? '#F5A623' : i === 1 ? '#C0C8D4' : i === 2 ? '#C88A4B' : 'rgba(255,255,255,0.5)', fontWeight: 900 }}>
                {i + 1}
              </span>
              <span style={{ fontWeight: i < 3 ? 800 : 400 }}>{l.nom}</span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>{l.score} pts</span>
            </div>
          ))}
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 16 }}>Cliquez pour revenir</div>
        </div>
      )}
    </section>
  );
}

/** Une ligne d'élève du suivi. */
function LigneEleve({
  ligne,
  progressionMax,
  derniere,
}: {
  ligne: LigneSuivi;
  progressionMax: number;
  derniere: boolean;
}) {
  const absent = ligne.etat === 'absent';
  const largeur = Math.round((ligne.cellIndex / progressionMax) * 100);

  return (
    <li
      className="flex items-center gap-4 px-5 py-3"
      style={{
        borderBottom: derniere ? 'none' : '1px solid var(--color-card-border)',
        // Les non-connectés sont estompés SANS être masqués : ils doivent rester
        // lisibles à distance d'un écran de vidéoprojecteur, tout en se
        // distinguant immédiatement de la classe qui joue.
        opacity: absent ? 0.62 : 1,
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <PastilleEtat etat={ligne.etat} />
      </span>

      <span
        style={{
          flex: '1 1 160px',
          minWidth: 0,
          fontSize: 13.5,
          color: 'var(--color-text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {ligne.nom}
      </span>

      {absent ? (
        <span style={{ flex: '2 1 200px', fontSize: 12.5, color: 'var(--color-text-muted)' }}>
          Pas connecté
        </span>
      ) : (
        <>
          <span style={{ flex: '2 1 160px', minWidth: 90 }}>
            <span
              style={{
                display: 'block',
                height: 6,
                borderRadius: 999,
                background: 'var(--color-surface-variant)',
                overflow: 'hidden',
              }}
              title={`Case ${ligne.cellIndex}`}
            >
              <span
                style={{
                  display: 'block',
                  width: `${largeur}%`,
                  height: '100%',
                  borderRadius: 999,
                  background:
                    ligne.etat === 'termine' ? 'var(--color-success)' : 'var(--color-primary)',
                }}
              />
            </span>
          </span>
          <span
            style={{ flexShrink: 0, fontSize: 12, color: 'var(--color-text-muted)', width: 78, textAlign: 'right' }}
          >
            {ligne.cardsPlayed} carte{ligne.cardsPlayed > 1 ? 's' : ''}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              width: 62,
              textAlign: 'right',
            }}
            title="Score (jetons)"
          >
            {ligne.score}
          </span>
        </>
      )}
    </li>
  );
}

/** Pastille d'état, avec libellé accessible. */
function PastilleEtat({ etat }: { etat: LigneSuivi['etat'] }) {
  if (etat === 'termine') {
    return (
      <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--color-success)' }}>
        <CheckCircle2 size={14} /> Terminé
      </span>
    );
  }
  if (etat === 'en-jeu') {
    return (
      <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--color-primary)' }}>
        <Loader2 size={14} className="animate-spin" /> En jeu
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
      <Circle size={14} /> Absent
    </span>
  );
}

/**
 * Durée écoulée depuis l'ouverture de la séance, rafraîchie chaque seconde.
 *
 * Isolé dans son propre composant À DESSEIN : une horloge dans le composant
 * parent y déclencherait un rendu complet de la liste d'élèves toutes les
 * secondes, alors que seuls deux chiffres changent.
 */
function Chronometre({
  startedAt,
  durationMinutes,
}: {
  startedAt?: number;
  durationMinutes: number;
}) {
  // Initialisé à `null` puis posé dans un effet : rendre l'heure au premier
  // rendu ferait diverger le HTML du serveur de celui du client (hydratation).
  const [maintenant, setMaintenant] = useState<number | null>(null);

  useEffect(() => {
    setMaintenant(Date.now());
    const minuterie = setInterval(() => setMaintenant(Date.now()), 1000);
    return () => clearInterval(minuterie);
  }, []);

  if (!startedAt || maintenant === null) return <span>durée : —</span>;

  const secondes = Math.max(0, Math.floor((maintenant - startedAt) / 1000));
  const mm = String(Math.floor(secondes / 60)).padStart(2, '0');
  const ss = String(secondes % 60).padStart(2, '0');
  const depassement = secondes > durationMinutes * 60;

  return (
    <span style={depassement ? { color: 'var(--color-warning)' } : undefined}>
      {mm}:{ss} sur {durationMinutes} min
      {depassement ? ' (dépassée)' : ''}
    </span>
  );
}
