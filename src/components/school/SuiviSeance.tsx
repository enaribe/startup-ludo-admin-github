'use client';

/**
 * Session EN DIRECT (lot 6, maquette « Session en direct ») — deux cartes :
 *
 *   CONTRÔLE      — compte à rebours sur la durée prévue, flux « ce qui se
 *                   passe » (les `lastEvent` remontés par les téléphones),
 *                   « +5 min » et « Terminer ».
 *   PROGRESSION   — classement en direct (case atteinte + score), les élèves
 *                   « pas connectés » nommés au-dessus — c'est la seule
 *                   information sur laquelle le prof peut agir pendant l'heure.
 *
 * RÉSEAU, MESURÉ ET NON DÉCORATIF : le mobile écrit sous throttle (~10 s). Un
 * élève « en jeu » sans écriture depuis plus de 60 s est signalé « hors ligne » ;
 * l'indicateur d'en-tête et l'encart d'alerte en découlent. Firestore mettant
 * les écritures hors ligne en file, ses réponses repartent au retour du réseau.
 *
 * « +5 MIN » ne pilote PAS les téléphones (les contrôles distants type pause
 * restent reportés en V2 par la SPEC) : il allonge la durée PRÉVUE de la
 * séance, bornée à 45 min — le compte à rebours et le mobile la lisent.
 *
 * L'écoute temps réel est montée par le PARENT (`ecouterParticipants`) et
 * passée ici en props : ce composant reste purement présentationnel.
 */

import { useEffect, useState } from 'react';
import { Clock, Loader2, MonitorPlay, Square, Wifi, WifiOff } from 'lucide-react';
import { DUREE_SEANCE_MAX } from '@/lib/class-session-service';
import type { LigneSuivi } from '@/lib/class-report-service';

/** Sans écriture du téléphone depuis ce délai, un élève en jeu est « hors ligne ». */
const SEUIL_HORS_LIGNE_MS = 60_000;

interface SuiviSeanceProps {
  /** Lignes déjà croisées et triées par `construireSuivi`. */
  lignes: LigneSuivi[];
  /** Titre de la séance, pour le sous-titre de l'en-tête. */
  titreSeance: string;
  /** Nom de la classe. */
  nomClasse: string;
  /** Début effectif de la séance, en millisecondes epoch. */
  startedAt?: number;
  /** Durée prévue par l'enseignant, en minutes. */
  durationMinutes: number;
  /** True tant que la première réponse Firestore n'est pas arrivée. */
  chargement: boolean;
  /** Action « Terminer la séance ». Absente pour un lecteur non propriétaire. */
  onTerminer?: () => void;
  /** Allonge la durée prévue de 5 min (propriétaire uniquement, plafond 45). */
  onProlonger?: () => void;
  /** True pendant la clôture, pour neutraliser les boutons. */
  actionEnCours?: boolean;
}

export default function SuiviSeance({
  lignes,
  titreSeance,
  nomClasse,
  startedAt,
  durationMinutes,
  chargement,
  onTerminer,
  onProlonger,
  actionEnCours = false,
}: SuiviSeanceProps) {
  const [podium, setPodium] = useState(false);

  // Horloge partagée (réseau + flux) : posée dans un effet pour l'hydratation,
  // au pas de 15 s — les données, elles, arrivent déjà par l'écoute temps réel.
  const [maintenant, setMaintenant] = useState<number | null>(null);
  useEffect(() => {
    setMaintenant(Date.now());
    const minuterie = setInterval(() => setMaintenant(Date.now()), 15_000);
    return () => clearInterval(minuterie);
  }, []);

  const connectes = lignes.filter((l) => l.etat !== 'absent');
  const absents = lignes.filter((l) => l.etat === 'absent');
  const horsLigne =
    maintenant === null
      ? []
      : lignes.filter(
          (l) => l.etat === 'en-jeu' && l.lastSeenAt > 0 && maintenant - l.lastSeenAt > SEUIL_HORS_LIGNE_MS
        );
  const horsLigneIds = new Set(horsLigne.map((l) => l.learnerId));

  // Flux « ce qui se passe en ce moment » : derniers événements des téléphones.
  const flux = lignes
    .filter((l) => l.lastEvent)
    .sort((a, b) => (b.lastEvent?.at ?? 0) - (a.lastEvent?.at ?? 0))
    .slice(0, 6);

  // Classement live : score puis case atteinte.
  const classement = [...connectes].sort((a, b) => b.score - a.score || b.cellIndex - a.cellIndex);
  const caseMax = Math.max(1, ...classement.map((l) => l.cellIndex));
  const caseMoyenne =
    classement.length > 0
      ? classement.reduce((somme, l) => somme + l.cellIndex, 0) / classement.length
      : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ═══ En-tête de la session ═══ */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Session en direct
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
            {[titreSeance, nomClasse].filter(Boolean).join(' · ')} · {connectes.length} joueur
            {connectes.length > 1 ? 's' : ''} connecté{connectes.length > 1 ? 's' : ''} sur{' '}
            {lignes.length}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap" style={{ flexShrink: 0 }}>
          <span
            className="flex items-center gap-1.5"
            style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}
            title={
              horsLigne.length > 0
                ? `${horsLigne.length} téléphone${horsLigne.length > 1 ? 's' : ''} sans écriture depuis plus d'une minute`
                : 'Tous les téléphones connectés ont écrit il y a moins d’une minute'
            }
          >
            <span
              aria-hidden
              style={{
                width: 8, height: 8, borderRadius: 999, display: 'inline-block',
                background: horsLigne.length > 0 ? '#E67E22' : 'var(--color-primary)',
              }}
            />
            Réseau : {horsLigne.length > 0 ? 'à surveiller' : 'correct'}
          </span>
          <button
            className="flex items-center gap-2"
            onClick={() => setPodium(true)}
            style={{
              fontSize: 13, fontWeight: 700, padding: '10px 16px', borderRadius: 10,
              border: 'none', cursor: 'pointer', background: '#0F1C2E', color: '#FFFFFF',
            }}
          >
            <MonitorPlay size={15} /> Projeter le classement
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* ═══ Carte gauche — Contrôle ═══ */}
        <section className="glass-card p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Contrôle
              </h2>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
                Chacun avance sur son propre plateau, à son rythme
              </p>
            </div>
            <CompteARebours startedAt={startedAt} durationMinutes={durationMinutes} />
          </div>

          <BarreTemps startedAt={startedAt} durationMinutes={durationMinutes} />

          <div>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              Ce qui se passe en ce moment
            </h3>
            {chargement ? (
              <p className="flex items-center gap-2 py-4" style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                <Loader2 size={14} className="animate-spin" /> Connexion au suivi…
              </p>
            ) : flux.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', padding: '8px 0' }}>
                Les événements apparaîtront dès les premières réponses des élèves.
              </p>
            ) : (
              flux.map((l, i) => (
                <div
                  key={l.learnerId}
                  className="flex items-center gap-3"
                  style={{
                    padding: '9px 0',
                    borderBottom: i < flux.length - 1 ? '1px solid var(--color-card-border)' : 'none',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                      background: l.lastEvent?.kind === 'quiz_ok' ? 'var(--color-success)' : '#E67E22',
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', display: 'block' }}>
                      {l.nom}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      {l.lastEvent?.kind === 'quiz_ok' ? 'a réussi un quiz' : 'retente un quiz'}
                      {l.lastEvent?.label ? ` · ${l.lastEvent.label}` : ''}
                    </span>
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                    {ilYA(l.lastEvent?.at, maintenant)}
                  </span>
                </div>
              ))
            )}
          </div>

          {(onProlonger || onTerminer) && (
            <div className="flex items-center gap-3 flex-wrap">
              {onProlonger && (
                <button
                  className="btn-secondary flex items-center gap-2"
                  onClick={onProlonger}
                  disabled={actionEnCours || durationMinutes >= DUREE_SEANCE_MAX}
                  style={{ fontSize: 13, opacity: durationMinutes >= DUREE_SEANCE_MAX ? 0.5 : 1 }}
                  title={
                    durationMinutes >= DUREE_SEANCE_MAX
                      ? `Durée maximale atteinte (${DUREE_SEANCE_MAX} min)`
                      : 'Allonge la durée prévue de la séance de 5 minutes'
                  }
                >
                  <Clock size={14} /> +5 min
                </button>
              )}
              {onTerminer && (
                <button
                  className="flex items-center gap-2"
                  onClick={onTerminer}
                  disabled={actionEnCours}
                  style={{
                    fontSize: 13, fontWeight: 700, padding: '10px 18px', borderRadius: 10,
                    border: 'none', cursor: 'pointer', background: '#0F1C2E', color: '#FFFFFF',
                    opacity: actionEnCours ? 0.5 : 1,
                  }}
                  title="Clôturer la séance et afficher le rapport pédagogique"
                >
                  <Square size={13} /> Terminer
                </button>
              )}
            </div>
          )}

          {horsLigne.length > 0 && (
            <div
              className="flex items-start gap-2.5 p-3"
              style={{ background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.35)', borderRadius: 10 }}
            >
              <WifiOff size={15} style={{ color: '#B87A0C', flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
                <strong style={{ color: 'var(--color-text-primary)' }}>
                  Sans nouvelles de {horsLigne.length} téléphone{horsLigne.length > 1 ? 's' : ''}
                </strong>{' '}
                depuis plus d’une minute ({horsLigne.map((l) => l.nom).join(', ')}). Leur partie
                continue hors ligne — leurs réponses partiront dès que le réseau revient.
              </p>
            </div>
          )}
        </section>

        {/* ═══ Carte droite — Progression de la classe ═══ */}
        <section className="glass-card p-5 flex flex-col gap-4">
          <div>
            <h2 style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Progression de la classe
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
              Cases parcourues et score de chacun — en direct
            </p>
          </div>

          <div
            style={{ height: 6, borderRadius: 3, background: 'rgba(15,28,46,0.08)', overflow: 'hidden' }}
            title={`Case moyenne : ${Math.round(caseMoyenne)} — le plus avancé est à la case ${caseMax}`}
          >
            <div
              style={{
                width: `${Math.round((caseMoyenne / caseMax) * 100)}%`,
                height: '100%', borderRadius: 3, background: 'var(--color-primary)',
              }}
            />
          </div>

          {absents.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
              <Wifi size={12} style={{ display: 'inline', verticalAlign: -1.5, marginRight: 5 }} />
              Pas encore connecté{absents.length > 1 ? 's' : ''} ({absents.length}) :{' '}
              {absents.map((l) => l.nom).join(', ')}
            </p>
          )}

          {chargement ? (
            <p className="flex items-center gap-2 py-4" style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              <Loader2 size={14} className="animate-spin" /> Connexion au suivi…
            </p>
          ) : classement.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', padding: '8px 0' }}>
              Personne n’a encore rejoint la séance.
            </p>
          ) : (
            <div>
              {classement.map((l, i) => (
                <div
                  key={l.learnerId}
                  className="flex items-center gap-3"
                  style={{
                    padding: '10px 0',
                    borderBottom: i < classement.length - 1 ? '1px solid var(--color-card-border)' : 'none',
                  }}
                  title={`${l.cardsPlayed} carte${l.cardsPlayed > 1 ? 's' : ''} jouée${l.cardsPlayed > 1 ? 's' : ''}${l.etat === 'termine' ? ' · a terminé sa partie' : ''}`}
                >
                  <span
                    className="flex items-center justify-center"
                    style={{
                      width: 24, height: 24, borderRadius: 12, fontSize: 11, fontWeight: 800, flexShrink: 0,
                      background: i < 3 ? 'var(--color-primary)' : 'rgba(15,28,46,0.07)',
                      color: i < 3 ? '#0C243E' : 'var(--color-text-muted)',
                    }}
                  >
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {l.nom}
                  </span>
                  {horsLigneIds.has(l.learnerId) && (
                    <span
                      style={{
                        fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 9,
                        background: 'rgba(217,83,79,0.1)', color: '#C9302C', flexShrink: 0,
                      }}
                    >
                      hors ligne
                    </span>
                  )}
                  <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                    case {l.cellIndex}
                  </span>
                  <span
                    style={{
                      marginLeft: 'auto', fontSize: 13, fontWeight: 800,
                      color: 'var(--color-text-primary)', flexShrink: 0,
                    }}
                  >
                    {l.score} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
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
    </div>
  );
}

/** « il y a 40 s » / « il y a 3 min » — âge d'un événement du flux. */
function ilYA(at: number | undefined, maintenant: number | null): string {
  if (!at || maintenant === null) return '';
  const secondes = Math.max(0, Math.round((maintenant - at) / 1000));
  if (secondes < 60) return `il y a ${secondes} s`;
  return `il y a ${Math.round(secondes / 60)} min`;
}

/**
 * Compte à rebours sur la durée prévue, rafraîchi chaque seconde.
 *
 * Isolé dans son propre composant À DESSEIN : une horloge dans le composant
 * parent y déclencherait un rendu complet des deux cartes toutes les secondes,
 * alors que seuls deux chiffres changent.
 */
function CompteARebours({
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

  if (!startedAt || maintenant === null) {
    return (
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-text-primary)' }}>—:—</div>
        <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>sur {durationMinutes} min</div>
      </div>
    );
  }

  const ecoulees = Math.max(0, Math.floor((maintenant - startedAt) / 1000));
  const restantes = durationMinutes * 60 - ecoulees;
  const depassement = restantes < 0;
  const affichees = Math.abs(restantes);
  const mm = String(Math.floor(affichees / 60)).padStart(2, '0');
  const ss = String(affichees % 60).padStart(2, '0');

  return (
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      <div style={{ fontSize: 24, fontWeight: 800, color: depassement ? '#E67E22' : 'var(--color-text-primary)' }}>
        {depassement ? '+' : ''}{mm}:{ss}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--color-text-muted)' }}>
        {depassement ? `dépassées sur ${durationMinutes} min` : `restantes sur ${durationMinutes} min`}
      </div>
    </div>
  );
}

/** Barre de temps écoulé, au pas de 5 s (le pixel près n'apporte rien ici). */
function BarreTemps({ startedAt, durationMinutes }: { startedAt?: number; durationMinutes: number }) {
  const [maintenant, setMaintenant] = useState<number | null>(null);
  useEffect(() => {
    setMaintenant(Date.now());
    const minuterie = setInterval(() => setMaintenant(Date.now()), 5000);
    return () => clearInterval(minuterie);
  }, []);

  const pct =
    !startedAt || maintenant === null
      ? 0
      : Math.min(100, Math.round(((maintenant - startedAt) / (durationMinutes * 60_000)) * 100));

  return (
    <div style={{ height: 6, borderRadius: 3, background: 'rgba(15,28,46,0.08)', overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 3, background: 'var(--color-primary)' }} />
    </div>
  );
}
