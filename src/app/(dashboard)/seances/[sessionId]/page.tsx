'use client';

/**
 * Mode Classe — détail d'une séance : pilotage, SUIVI EN DIRECT et RAPPORT.
 *
 * L'écran a trois visages, déterminés par le seul `status` de la séance :
 *   - `scheduled` : fiche + bouton d'ouverture ;
 *   - `running`   : SUIVI EN DIRECT des élèves (`onSnapshot`) ;
 *   - `ended`     : RAPPORT PÉDAGOGIQUE (lecture unique).
 *
 * ═══ POURQUOI DEUX MODES DE LECTURE, ET PAS UN SEUL ═══
 *
 * Le suivi écoute (`ecouterParticipants`), le rapport lit une fois
 * (`getParticipants`). Garder l'écoute ouverte sur une séance terminée
 * facturerait un abonnement Firestore sur des documents qui ne bougeront plus,
 * potentiellement des heures durant si l'enseignant laisse l'onglet ouvert.
 *
 * La bascule est AUTOMATIQUE : `endSession` met `status` à `ended` dans l'état
 * local, l'effet démonte l'écoute et déclenche la lecture du rapport. L'écran
 * passe donc du suivi au rapport sans rechargement, ce qui est exactement le
 * geste du prof en fin d'heure.
 *
 * La correction du contenu reste possible sur une séance `running` : l'IA se
 * trompe, et l'enseignant s'en aperçoit souvent en voyant la question projetée.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarClock, Play, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth-context';
import { getClass, getLearners } from '@/lib/school-service';
import {
  SeanceError,
  endSession,
  getClassSession,
  getSessionContent,
  saveSessionContent,
  startSession,
} from '@/lib/class-session-service';
import {
  construireSuivi,
  ecouterParticipants,
  getParticipants,
} from '@/lib/class-report-service';
import { integrerSeanceDansCumuls } from '@/lib/class-cumul-service';
import type {
  ClassSession,
  ClassSessionContent,
  ClassSessionParticipant,
  Learner,
  SchoolClass,
} from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ApercuContenuSeance from '@/components/school/ApercuContenuSeance';
import SuiviSeance from '@/components/school/SuiviSeance';
import RapportSeance from '@/components/school/RapportSeance';

export default function SeanceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = String(params?.sessionId ?? '');
  const { admin, loading: authLoading } = useAuth();

  const [seance, setSeance] = useState<ClassSession | null>(null);
  const [classe, setClasse] = useState<SchoolClass | null>(null);
  const [eleves, setEleves] = useState<Learner[]>([]);
  const [contenu, setContenu] = useState<ClassSessionContent | null>(null);
  const [participants, setParticipants] = useState<ClassSessionParticipant[]>([]);
  const [chargement, setChargement] = useState(true);
  const [chargementSuivi, setChargementSuivi] = useState(true);
  const [action, setAction] = useState(false);

  const charger = useCallback(async () => {
    if (!sessionId) return;
    try {
      const s = await getClassSession(sessionId);
      setSeance(s);
      if (s) {
        // Les élèves de la classe sont chargés dans TOUS les états de la
        // séance : ils sont le dénominateur du suivi comme du rapport, et la
        // seule source nominative fiable (le `displayName` du mobile est
        // facultatif). Sans eux, un « pas connecté » ne pourrait pas exister.
        const [c, elevesClasse, contenuSeance] = await Promise.all([
          getClass(s.classId).catch(() => null),
          getLearners(s.classId).catch(() => [] as Learner[]),
          getSessionContent(sessionId).catch(() => null),
        ]);
        setClasse(c);
        setEleves(elevesClasse);
        setContenu(contenuSeance);
      }
    } catch (error) {
      console.error('Chargement de la séance :', error);
      toast.error('Erreur lors du chargement de la séance');
    } finally {
      setChargement(false);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!authLoading) void charger();
  }, [authLoading, charger]);

  const statut = seance?.status;

  /**
   * Participants : écoute temps réel en `running`, lecture unique en `ended`.
   *
   * Le nettoyage de l'abonnement n'est pas une formalité : sans lui, naviguer
   * de séance en séance empilerait autant d'écoutes ouvertes que de visites,
   * toutes facturées, jusqu'au rechargement de l'onglet.
   */
  useEffect(() => {
    if (!sessionId || !statut) return;

    if (statut === 'running') {
      setChargementSuivi(true);
      const desabonner = ecouterParticipants(
        sessionId,
        (liste) => {
          setParticipants(liste);
          setChargementSuivi(false);
        },
        (error) => {
          console.error('Suivi des participants :', error);
          setChargementSuivi(false);
          toast.error('Le suivi en direct est indisponible.');
        }
      );
      return desabonner;
    }

    if (statut === 'ended') {
      setChargementSuivi(true);
      let annule = false;
      void getParticipants(sessionId)
        .then((liste) => {
          if (!annule) setParticipants(liste);
        })
        .catch((error: unknown) => {
          console.error('Lecture des participants :', error);
          if (!annule) toast.error('Impossible de charger le rapport de séance.');
        })
        .finally(() => {
          if (!annule) setChargementSuivi(false);
        });
      return () => {
        annule = true;
      };
    }

    // Séance `scheduled` : aucun participant possible, aucune lecture.
    setParticipants([]);
    setChargementSuivi(false);
    return undefined;
  }, [sessionId, statut]);

  /** Croisement élèves × participants, partagé par le suivi et le rapport. */
  const lignes = useMemo(() => construireSuivi(eleves, participants), [eleves, participants]);

  const ouvrir = async () => {
    setAction(true);
    try {
      await startSession(sessionId);
      toast.success('Séance ouverte — vos élèves la voient sur leur profil.');
      await charger();
    } catch (error) {
      const message = error instanceof SeanceError ? error.message : 'Impossible d’ouvrir la séance';
      toast.error(message);
    } finally {
      setAction(false);
    }
  };

  /**
   * Termine la séance, PUIS intègre les résultats au cumul annuel de chaque
   * participant (lot 7).
   *
   * ═══ L'ORDRE N'EST PAS ARBITRAIRE ═══
   *
   * La clôture d'abord, le cumul ensuite, et le cumul NE BLOQUE PAS la clôture.
   * Une séance qui resterait `running` parce qu'un compteur d'agrégat a échoué
   * continuerait de s'afficher sur le profil des élèves : ils pourraient la
   * rejoindre après la fin du cours. L'agrégat, lui, est rattrapable — c'est
   * exactement ce que fait le bouton « Recalculer les cumuls » de la fiche de
   * classe, vers lequel le message d'erreur renvoie explicitement.
   *
   * Le cumul est IDEMPOTENT (`countedSessionIds`) : un second clic sur
   * « Terminer », ou un recalcul lancé ensuite, ne double aucun compteur.
   */
  const cloturer = async () => {
    setAction(true);
    const finaliseeLe = Date.now();
    try {
      await endSession(sessionId);
      // L'état local bascule immédiatement : l'effet ci-dessus coupe l'écoute
      // et charge le rapport, sans attendre un aller-retour de rechargement.
      setSeance((prev) => (prev ? { ...prev, status: 'ended', endedAt: finaliseeLe } : prev));
      toast.success('Séance terminée — voici votre rapport.');
    } catch (error) {
      console.error('Clôture de la séance :', error);
      toast.error('Impossible de terminer la séance');
      setAction(false);
      return;
    }

    try {
      // On relit les participants plutôt que de se fier à l'état local : la
      // dernière écriture d'un élève peut arriver pendant que le prof clique,
      // et l'écoute temps réel vient d'être coupée par la bascule d'état.
      const derniers = await getParticipants(sessionId);
      const bilan = await integrerSeanceDansCumuls(
        seance?.classId ?? '',
        sessionId,
        eleves,
        derniers,
        { endedAt: finaliseeLe, startedAt: seance?.startedAt, createdAt: seance?.createdAt }
      );
      if (bilan.echecs.length > 0) {
        toast.error(
          `Les résultats de ${bilan.echecs.length} élève${bilan.echecs.length > 1 ? 's n’ont' : ' n’a'} pas pu être ajoutés à leur bilan annuel. Utilisez « Recalculer les cumuls » sur la fiche de la classe.`,
          { duration: 9000 }
        );
      }
    } catch (error) {
      // La séance EST terminée : on le dit, et on indique la réparation.
      console.error('Cumul par élève :', error);
      toast.error(
        'La séance est bien terminée, mais les bilans annuels des élèves n’ont pas pu être mis à jour. Utilisez « Recalculer les cumuls » sur la fiche de la classe.',
        { duration: 9000 }
      );
    } finally {
      setAction(false);
    }
  };

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (!seance) {
    return (
      <EmptyState
        icon={<CalendarClock size={48} />}
        title="Séance introuvable"
        description="Cette séance n’existe plus, ou elle ne relève pas de votre périmètre."
        action={
          <button className="btn-secondary" onClick={() => router.push('/seances')}>
            Retour aux séances
          </button>
        }
      />
    );
  }

  // Seul l'enseignant qui a créé la séance peut la piloter (la règle Firestore
  // dit la même chose : l'afficher en lecture au directeur est volontaire).
  const estProprietaire = admin?.uid === seance.teacherId;
  const enCours = seance.status === 'running';
  const terminee = seance.status === 'ended';

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 980 }}>
      <Link
        href="/seances"
        className="flex items-center gap-2"
        style={{ fontSize: 12.5, color: 'var(--color-text-muted)', textDecoration: 'none' }}
      >
        <ArrowLeft size={14} /> Séances
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {seance.title || 'Séance'}
          </h1>
          <p
            className="flex items-center gap-2"
            style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}
          >
            <Users size={13} />
            {classe?.name ?? seance.classId} · {seance.durationMinutes} min · format individuel
          </p>
        </div>
        {estProprietaire && !enCours && !terminee && (
          <button
            className="btn-primary flex items-center gap-2"
            onClick={ouvrir}
            disabled={action}
            style={{ fontSize: 13, opacity: action ? 0.5 : 1, flexShrink: 0 }}
          >
            <Play size={14} /> Ouvrir la séance
          </button>
        )}
      </div>

      {/* ═══ SUIVI EN DIRECT — séance en cours ═══ */}
      {enCours && (
        <SuiviSeance
          lignes={lignes}
          startedAt={seance.startedAt}
          durationMinutes={seance.durationMinutes}
          chargement={chargementSuivi}
          onTerminer={estProprietaire ? cloturer : undefined}
          actionEnCours={action}
        />
      )}

      {/* ═══ RAPPORT — séance terminée ═══ */}
      {terminee &&
        (chargementSuivi ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : (
          <RapportSeance
            seance={seance}
            eleves={eleves}
            participants={participants}
            lignes={lignes}
            nomClasse={classe?.name ?? 'classe'}
          />
        ))}

      {/* ═══ FICHE DE LA SÉANCE ═══
          Reléguée SOUS le suivi et le rapport : pendant la séance, l'état des
          élèves prime sur les métadonnées, que l'enseignant vient de saisir. */}
      <div className="glass-card p-4 flex flex-col gap-2">
        <Ligne libelle="État" valeur={libelleEtat(seance)} />
        {seance.scheduledAt && (
          <Ligne
            libelle="Programmée pour"
            valeur={new Date(seance.scheduledAt).toLocaleString('fr-FR')}
          />
        )}
        {seance.startedAt && (
          <Ligne libelle="Ouverte le" valeur={new Date(seance.startedAt).toLocaleString('fr-FR')} />
        )}
        {seance.endedAt && (
          <Ligne libelle="Terminée le" valeur={new Date(seance.endedAt).toLocaleString('fr-FR')} />
        )}
        <Ligne
          libelle="Contenu"
          valeur={
            seance.hasGeneratedContent ? 'Généré depuis un cours' : `Édition ${seance.editionId || '—'}`
          }
        />
      </div>

      {contenu && estProprietaire && !terminee && (
        <div className="glass-card p-4">
          <ApercuContenuSeance
            contenu={contenu}
            onChange={(suivant) => {
              setContenu(suivant);
              void saveSessionContent(sessionId, suivant, true).catch((error) => {
                console.error('Enregistrement des corrections :', error);
              });
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Libellé français de l'état d'une séance. */
function libelleEtat(seance: ClassSession): string {
  if (seance.status === 'running') return 'En cours — visible par vos élèves';
  if (seance.status === 'ended') return 'Terminée';
  return 'Programmée — pas encore visible par vos élèves';
}

/** Ligne « libellé — valeur ». */
function Ligne({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{libelle}</span>
      <span style={{ fontSize: 13, color: 'var(--color-text-primary)', textAlign: 'right' }}>
        {valeur}
      </span>
    </div>
  );
}
