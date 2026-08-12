'use client';

/**
 * Mode Classe — écran de PROJECTION du rattachement.
 *
 * Cet écran est fait pour être vidéoprojeté au tableau, et lu depuis le fond
 * d'une salle. Trois conséquences de conception, qui expliquent qu'il ne
 * ressemble à aucun autre écran du back-office :
 *
 *   • FOND SOMBRE et code en très gros caractères espacés, en police display.
 *     Le code est DICTÉ à voix haute et recopié — pas de QR (cf. SPEC §1).
 *   • AUCUNE NAVIGATION PARASITE : ni sidebar, ni fil d'Ariane, ni tableau. Un
 *     menu projeté au tableau, ce sont trente élèves qui lisent autre chose que
 *     le code. Les seules actions sont Prolonger / Fermer / Retour.
 *   • TEMPS RÉEL (`onSnapshot` sur `learners`) : le prof voit les coches vertes
 *     apparaître et sait, sans rien demander, qui n'a pas encore rejoint.
 *
 * ⚠️ LE CODE EST ÉPHÉMÈRE ET SERT UNE FOIS PAR ÉLÈVE. Ce n'est pas un code de
 * séance : une fois rattaché, l'élève rejoint les séances depuis son profil,
 * sans code, toute l'année. C'est cette brièveté qui protège la liste nominative
 * d'élèves mineurs — un code qui fuite est déjà expiré.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Circle, Plus, X } from 'lucide-react';
import {
  DUREE_RATTACHEMENT_DEFAUT,
  ecouterLearners,
  fermerFenetreRattachement,
  getClass,
  ouvrirFenetreRattachement,
  RattachementError,
} from '@/lib/school-service';
import { useAuth } from '@/lib/auth-context';
import type { Learner, SchoolClass } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import toast from 'react-hot-toast';

/** Minutes ajoutées par le bouton « Prolonger ». */
const PROLONGATION_MINUTES = 5;

/** Seuil (en ms) sous lequel le décompte passe à l'orange. */
const SEUIL_URGENCE_MS = 2 * 60_000;

/** Palette de l'écran projeté — volontairement figée, hors thème du back-office. */
const FOND = '#0a1e33';
const FOND_CARTE = 'rgba(255,255,255,0.05)';
const BORDURE = 'rgba(255,255,255,0.12)';
const TEXTE = '#FFFFFF';
const TEXTE_ATTENUE = 'rgba(255,255,255,0.55)';

export default function RattachementPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const classId = params.classId as string;
  const {
    isSuperAdmin,
    isEstablishmentAdmin,
    isTeacher,
    scopedEstablishmentId,
    scopedClassIds,
    loading: authLoading,
  } = useAuth();

  const [classe, setClasse] = useState<SchoolClass | null>(null);
  const [eleves, setEleves] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refuse, setRefuse] = useState(false);
  const [expiration, setExpiration] = useState<number | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [maintenant, setMaintenant] = useState(() => Date.now());
  const [enCours, setEnCours] = useState(false);
  const [confirmerFermeture, setConfirmerFermeture] = useState(false);

  /**
   * Durée demandée par l'écran de classe (`?duree=30`), sinon 15 min.
   * Bornée aux valeurs proposées : un paramètre d'URL bricolé ne doit pas
   * pouvoir ouvrir une fenêtre de trois jours — ce qui annulerait toute la
   * protection apportée par l'expiration.
   */
  const dureeDemandee = useMemo(() => {
    const brut = Number(searchParams.get('duree'));
    return [5, 15, 30, 60].includes(brut) ? brut : DUREE_RATTACHEMENT_DEFAUT;
  }, [searchParams]);

  /**
   * Ouverture automatique au premier affichage : le prof arrive ici depuis le
   * bouton « Ouvrir le rattachement », il ne doit pas avoir à cliquer une
   * seconde fois devant sa classe. La ref évite une double ouverture en mode
   * strict de React (double montage en développement) — deux codes générés
   * coup sur coup, dont le premier serait aussitôt orphelin.
   */
  const ouvertureAuto = useRef(false);

  const ouvrir = useCallback(
    async (minutes: number) => {
      setEnCours(true);
      try {
        const fenetre = await ouvrirFenetreRattachement(classId, minutes);
        setCode(fenetre.joinCode);
        setExpiration(fenetre.joinCodeExpiresAt);
      } catch (error) {
        console.error('Ouverture de la fenêtre de rattachement :', error);
        toast.error(
          error instanceof RattachementError
            ? error.message
            : 'Impossible d’ouvrir la fenêtre de rattachement'
        );
      } finally {
        setEnCours(false);
      }
    },
    [classId]
  );

  // ── Chargement de la classe + contrôle de périmètre ─────────────────
  useEffect(() => {
    if (authLoading) return;
    let annule = false;

    (async () => {
      try {
        const data = await getClass(classId);
        if (annule) return;
        if (!data) {
          setRefuse(true);
          return;
        }
        // Même contrôle que l'écran de détail : un enseignant n'ouvre que ses
        // classes, un directeur que celles de son établissement. C'est un
        // garde-fou d'interface — la vraie borne reste les règles Firestore.
        const autorise =
          isSuperAdmin ||
          (isTeacher && scopedClassIds.includes(classId)) ||
          (isEstablishmentAdmin && data.establishmentId === scopedEstablishmentId);
        if (!autorise) {
          setRefuse(true);
          return;
        }
        setClasse(data);

        // Une fenêtre déjà ouverte est REPRISE, jamais remplacée : si le prof
        // revient sur l'écran (fermeture d'onglet, retour arrière), le code
        // affiché doit rester celui qu'il vient de dicter à sa classe.
        const encoreValide = !!data.joinCode && (data.joinCodeExpiresAt ?? 0) > Date.now();
        if (encoreValide) {
          setCode(data.joinCode ?? null);
          setExpiration(data.joinCodeExpiresAt ?? null);
        } else if (!ouvertureAuto.current) {
          ouvertureAuto.current = true;
          await ouvrir(dureeDemandee);
        }
      } catch (error) {
        console.error('Chargement de la classe :', error);
        toast.error('Erreur lors du chargement de la classe');
      } finally {
        if (!annule) setLoading(false);
      }
    })();

    return () => {
      annule = true;
    };
  }, [
    authLoading,
    classId,
    dureeDemandee,
    isSuperAdmin,
    isTeacher,
    isEstablishmentAdmin,
    scopedClassIds,
    scopedEstablishmentId,
    ouvrir,
  ]);

  // ── Liste des élèves en direct ──────────────────────────────────────
  useEffect(() => {
    if (refuse || !classe) return;
    const desabonner = ecouterLearners(
      classId,
      setEleves,
      (erreur) => {
        console.error('Écoute des élèves :', erreur);
        toast.error('La liste ne se met plus à jour automatiquement');
      }
    );
    // Le désabonnement est impératif : sans lui, l'écouteur survit à la
    // navigation et continue d'être facturé sur chaque écriture de la classe.
    return desabonner;
  }, [classId, classe, refuse]);

  // ── Horloge du décompte ─────────────────────────────────────────────
  useEffect(() => {
    if (!expiration) return;
    const timer = window.setInterval(() => setMaintenant(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiration]);

  const restantMs = expiration ? Math.max(0, expiration - maintenant) : 0;
  const fenetreOuverte = !!code && restantMs > 0;
  const urgence = fenetreOuverte && restantMs < SEUIL_URGENCE_MS;

  const actifs = useMemo(() => eleves.filter((e) => e.isActive !== false), [eleves]);
  const tries = useMemo(
    () =>
      [...actifs].sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr')
      ),
    [actifs]
  );
  const rattaches = useMemo(() => actifs.filter((e) => !!e.linkedUid).length, [actifs]);

  const prolonger = async () => {
    // On repart de MAINTENANT et non de l'expiration en cours : prolonger une
    // fenêtre presque écoulée de +5 min doit donner 5 minutes utiles, pas 5
    // minutes ajoutées à un reliquat de 3 secondes.
    const minutesRestantes = restantMs / 60_000;
    await ouvrir(Math.ceil(minutesRestantes) + PROLONGATION_MINUTES);
    toast.success(`Fenêtre prolongée de ${PROLONGATION_MINUTES} minutes`);
  };

  const fermer = async () => {
    setEnCours(true);
    try {
      await fermerFenetreRattachement(classId);
      setCode(null);
      setExpiration(null);
      setConfirmerFermeture(false);
      toast.success('Fenêtre de rattachement fermée');
    } catch (error) {
      console.error('Fermeture de la fenêtre de rattachement :', error);
      toast.error('Impossible de fermer la fenêtre');
    } finally {
      setEnCours(false);
    }
  };

  if (authLoading || loading) {
    return (
      <Ecran>
        <LoadingSpinner size={40} />
      </Ecran>
    );
  }

  if (refuse || !classe) {
    return (
      <Ecran>
        <p style={{ fontSize: 22, color: TEXTE, marginBottom: 24 }}>
          Cette classe ne vous est pas accessible.
        </p>
        <Link href="/classes" className="btn-primary" style={{ textDecoration: 'none' }}>
          Retour aux classes
        </Link>
      </Ecran>
    );
  }

  return (
    <Ecran>
      {/* En-tête minimal : la classe, l'avancement, la sortie. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '20px 32px',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXTE }}>{classe.name}</div>
          <div style={{ fontSize: 14, color: TEXTE_ATTENUE, marginTop: 2 }}>
            {rattaches} / {actifs.length} rattaché{rattaches > 1 ? 's' : ''}
          </div>
        </div>
        <Link
          href={`/classes/${classId}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            color: TEXTE_ATTENUE,
            textDecoration: 'none',
            padding: '8px 14px',
            borderRadius: 8,
            border: `1px solid ${BORDURE}`,
          }}
        >
          <ArrowLeft size={16} /> Retour
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, 0.65fr)',
          gap: 40,
          width: '100%',
          maxWidth: 1400,
          alignItems: 'center',
          padding: '80px 32px 32px',
        }}
        className="rattachement-grille"
      >
        {/* ── Colonne gauche : LE CODE ───────────────────────────────── */}
        <div style={{ textAlign: 'center' }}>
          {fenetreOuverte ? (
            <>
              <p style={{ fontSize: 18, color: TEXTE_ATTENUE, marginBottom: 8 }}>
                Saisissez ce code dans l’application
              </p>
              <div
                style={{
                  // `clamp` : lisible sur un projecteur 1024×768 comme sur un
                  // écran 4K, sans média-query. Le code doit se lire du fond
                  // de la salle — c'est le seul élément qui compte ici.
                  fontSize: 'clamp(64px, 13vw, 190px)',
                  fontWeight: 800,
                  lineHeight: 1.05,
                  letterSpacing: '0.14em',
                  // Monospace : toutes les lettres de même largeur, aucune
                  // ambiguïté de lecture à distance. L'alphabet exclut déjà
                  // O/0 et I/1, la police finit le travail.
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  color: TEXTE,
                  // Le décalage compense la lettre-espacement du dernier
                  // caractère, qui décentrerait le bloc sans lui.
                  textIndent: '0.14em',
                  userSelect: 'all',
                }}
              >
                {code}
              </div>

              <div
                style={{
                  marginTop: 16,
                  fontSize: 'clamp(28px, 4vw, 52px)',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: urgence ? 'var(--color-warning)' : TEXTE_ATTENUE,
                }}
              >
                {formaterDecompte(restantMs)}
              </div>
              <p style={{ fontSize: 15, color: urgence ? 'var(--color-warning)' : TEXTE_ATTENUE, marginTop: 4 }}>
                {urgence ? 'La fenêtre se ferme bientôt' : 'avant la fermeture du code'}
              </p>

              <div
                style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 32, flexWrap: 'wrap' }}
              >
                <button
                  className="btn-secondary flex items-center gap-2"
                  onClick={prolonger}
                  disabled={enCours}
                >
                  <Plus size={16} /> Prolonger de {PROLONGATION_MINUTES} min
                </button>
                <button
                  className="btn-danger flex items-center gap-2"
                  onClick={() => setConfirmerFermeture(true)}
                  disabled={enCours}
                >
                  <X size={16} /> Fermer maintenant
                </button>
              </div>
            </>
          ) : (
            /* ── Fenêtre fermée (expirée ou fermée à la main) ────────── */
            <>
              <div style={{ fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 800, color: TEXTE }}>
                Fenêtre fermée
              </div>
              <p
                style={{
                  fontSize: 17,
                  color: TEXTE_ATTENUE,
                  marginTop: 16,
                  maxWidth: 520,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  lineHeight: 1.6,
                }}
              >
                Le code n’est plus valide. Les élèves déjà rattachés le restent
                définitivement : ils rejoindront les prochaines séances depuis leur
                profil, sans code. Rouvrez une fenêtre pour les absents ou un nouvel élève.
              </p>
              <div
                style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 32, flexWrap: 'wrap' }}
              >
                {[5, 15, 30, 60].map((minutes) => (
                  <button
                    key={minutes}
                    className={minutes === DUREE_RATTACHEMENT_DEFAUT ? 'btn-primary' : 'btn-secondary'}
                    onClick={() => ouvrir(minutes)}
                    disabled={enCours}
                  >
                    Rouvrir {minutes} min
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Colonne droite : qui s'est rattaché ────────────────────── */}
        <div
          style={{
            background: FOND_CARTE,
            border: `1px solid ${BORDURE}`,
            borderRadius: 16,
            padding: 20,
            maxHeight: '70vh',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 14,
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: TEXTE }}>Élèves</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-success)' }}>
              {rattaches} / {actifs.length}
            </span>
          </div>

          {actifs.length === 0 ? (
            <p style={{ fontSize: 14, color: TEXTE_ATTENUE, lineHeight: 1.6 }}>
              Aucun élève dans cette classe. Ajoutez la liste depuis la fiche de classe
              avant d’ouvrir une fenêtre de rattachement.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflowY: 'auto', flex: 1 }}>
              {tries.map((eleve) => {
                const lie = !!eleve.linkedUid;
                return (
                  <li
                    key={eleve.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 4px',
                      borderBottom: `1px solid ${BORDURE}`,
                      fontSize: 16,
                      color: lie ? TEXTE : TEXTE_ATTENUE,
                      fontWeight: lie ? 600 : 400,
                    }}
                  >
                    {lie ? (
                      <CheckCircle2 size={19} color="var(--color-success)" style={{ flexShrink: 0 }} />
                    ) : (
                      <Circle size={19} color="rgba(255,255,255,0.25)" style={{ flexShrink: 0 }} />
                    )}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {eleve.firstName} {eleve.lastName}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmerFermeture}
        onClose={() => setConfirmerFermeture(false)}
        onConfirm={fermer}
        loading={enCours}
        danger
        title="Fermer la fenêtre ?"
        confirmLabel="Fermer maintenant"
        message="Le code cessera immédiatement d’être valide. Les élèves déjà rattachés le restent ; les autres devront attendre que vous rouvriez une fenêtre."
      />

      {/* Une seule colonne sur écran étroit : le code passe avant la liste. */}
      <style jsx global>{`
        @media (max-width: 900px) {
          .rattachement-grille {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </Ecran>
  );
}

/**
 * Cadre sombre plein écran de l'écran projeté.
 *
 * `position: fixed` recouvre la sidebar et l'en-tête du `DashboardLayout` :
 * l'écran est dans le dashboard (garde de routes, session, périmètre) mais ne
 * doit rien projeter de sa navigation au tableau.
 */
function Ecran({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: FOND,
        color: TEXTE,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {children}
    </div>
  );
}

/** Millisecondes → « mm:ss ». Au-delà de 60 min, les minutes débordent (« 65:04 »). */
function formaterDecompte(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const secondes = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secondes).padStart(2, '0')}`;
}
