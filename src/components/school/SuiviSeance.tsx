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
