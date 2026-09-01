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
import { ArrowLeft, CalendarClock, Pencil, Play, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth-context';
import { getClass, getLearners } from '@/lib/school-service';
import {
  DUREE_SEANCE_MAX,
  DUREE_SEANCE_MIN,
  SeanceError,
  bornerDuree,
  compterCartes,
  demarrerPartie,
  endSession,
  getClassSession,
  getSessionContent,
  saveSessionContent,
  startSession,
  updateSession,
} from '@/lib/class-session-service';
import { genererContenuSupplementaire, type MixSeance } from '@/lib/class-session-generation';
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
import AjoutContenuSeance from '@/components/school/AjoutContenuSeance';
import SalleAttente from '@/components/school/SalleAttente';
import SuiviSeance from '@/components/school/SuiviSeance';
import RapportSeance from '@/components/school/RapportSeance';

export default function SeanceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = String(params?.sessionId ?? '');
  const { admin, loading: authLoading, isEstablishmentAdmin, scopedEstablishmentId } = useAuth();

  const [seance, setSeance] = useState<ClassSession | null>(null);
  const [classe, setClasse] = useState<SchoolClass | null>(null);
  const [eleves, setEleves] = useState<Learner[]>([]);
  const [contenu, setContenu] = useState<ClassSessionContent | null>(null);
  const [participants, setParticipants] = useState<ClassSessionParticipant[]>([]);
  const [chargement, setChargement] = useState(true);
  const [chargementSuivi, setChargementSuivi] = useState(true);
  const [action, setAction] = useState(false);
  /**
   * Brouillon de modification de la fiche (séance `scheduled` uniquement).
   * `null` = mode lecture. `programmee` est la valeur du champ datetime-local,
   * chaîne vide = lancement manuel (efface `scheduledAt`).
   */
  const [brouillon, setBrouillon] = useState<{ titre: string; duree: number; programmee: string } | null>(null);
  /** Génération d'un complément de contenu en cours (panneau « Ajouter »). */
  const [enAjout, setEnAjout] = useState(false);
  /**
   * Pendant une session EN DIRECT, l'aperçu du contenu (quiz, duels…) est
   * masqué par défaut : l'écran appartient au suivi de la classe, pas à la
   * relecture des cartes. La correction reste possible — l'IA se trompe, et le
   * prof s'en aperçoit souvent en voyant la question projetée — mais derrière
   * un geste explicite.
   */
  const [montrerContenuEnDirect, setMontrerContenuEnDirect] = useState(false);

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

  /**
   * Ouvre la SALLE D'ATTENTE : la séance passe `running` et reçoit son code
   * d'entrée, mais la partie ne démarre pas encore — les apprenants
   * s'accumulent, l'enseignant lance quand la salle est prête.
   */
  const ouvrir = async () => {
    setAction(true);
    try {
      const { joinCode } = await startSession(sessionId);
      toast.success(`Salle d’attente ouverte — code ${joinCode.slice(0, 3)}-${joinCode.slice(3)}`);
      await charger();
    } catch (error) {
      const message = error instanceof SeanceError ? error.message : 'Impossible d’ouvrir la séance';
      toast.error(message);
    } finally {
      setAction(false);
    }
  };

  /** « Démarrer la partie » : la salle d'attente se ferme, le jeu commence. */
  const lancerPartie = async () => {
    setAction(true);
    try {
      const debut = await demarrerPartie(sessionId);
      setSeance((prev) => (prev ? { ...prev, startedPlayingAt: debut } : prev));
      toast.success('La partie est lancée !');
    } catch (error) {
      console.error('Démarrage de la partie :', error);
      toast.error('Impossible de démarrer la partie');
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

  /**
   * « +5 min » du suivi en direct : allonge la durée PRÉVUE de la séance,
   * bornée au plafond réglementaire (45 min). Ce n'est pas une télécommande
   * des téléphones — juste la durée que le compte à rebours et le mobile lisent.
   */
  const prolonger = async () => {
    if (!seance) return;
    const nouvelle = bornerDuree(seance.durationMinutes + 5);
    if (nouvelle === seance.durationMinutes) return;
    setAction(true);
    try {
      await updateSession(sessionId, { durationMinutes: nouvelle });
      setSeance((prev) => (prev ? { ...prev, durationMinutes: nouvelle } : prev));
      toast.success(`Séance prolongée : ${nouvelle} minutes.`);
    } catch (error) {
      console.error('Prolongation de la séance :', error);
      toast.error('Impossible de prolonger la séance');
    } finally {
      setAction(false);
    }
  };

  /** Ouvre le formulaire de modification, pré-rempli avec la fiche actuelle. */
  const commencerModification = () => {
    if (!seance) return;
    setBrouillon({
      titre: seance.title ?? '',
      duree: seance.durationMinutes,
      programmee: versDatetimeLocal(seance.scheduledAt),
    });
  };

  /**
   * Enregistre la fiche modifiée. Seuls titre, durée et programmation sont
   * ouverts : la classe et le contenu source appartiennent à la création
   * (les règles Firestore figent d'ailleurs `classId`) — pour changer de
   * classe, on recrée une séance en réutilisant le même contenu (wizard,
   * voie « réutiliser une séance »).
   */
  const enregistrerModification = async () => {
    if (!brouillon) return;
    const scheduledAt = brouillon.programmee ? new Date(brouillon.programmee).getTime() : null;
    setAction(true);
    try {
      const titre = brouillon.titre.trim();
      const duree = bornerDuree(brouillon.duree);
      await updateSession(sessionId, { title: titre, durationMinutes: duree, scheduledAt });
      setSeance((prev) =>
        prev
          ? { ...prev, title: titre, durationMinutes: duree, scheduledAt: scheduledAt ?? undefined }
          : prev
      );
      setBrouillon(null);
      toast.success('Séance modifiée.');
    } catch (error) {
      console.error('Modification de la séance :', error);
      toast.error('Impossible de modifier la séance');
    } finally {
      setAction(false);
    }
  };

  /**
   * Génère un complément de contenu et l'ajoute au paquet de la séance.
   * Possible tant que la séance n'est pas terminée — y compris en `running` :
   * les élèves qui rejoignent ensuite jouent avec le paquet enrichi (ceux déjà
   * en partie gardent celui chargé au lancement, comme pour les corrections).
   */
  const ajouterContenu = async (mixAjout: MixSeance) => {
    if (!contenu || !seance) return;
    setEnAjout(true);
    try {
      const fusionne = await genererContenuSupplementaire(
        sessionId,
        '',
        mixAjout,
        {
          className: classe?.name,
          durationMinutes: seance.durationMinutes,
          sessionTitle: seance.title,
        },
        contenu
      );
      const ajoutees = compterCartes(fusionne) - compterCartes(contenu);
      if (ajoutees === 0) {
        toast.error('Aucune carte exploitable générée. Réessayez.');
        return;
      }
      setContenu(fusionne);
      await saveSessionContent(sessionId, fusionne, true);
      toast.success(`${ajoutees} carte${ajoutees > 1 ? 's' : ''} ajoutée${ajoutees > 1 ? 's' : ''}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Génération impossible';
      toast.error(message);
    } finally {
      setEnAjout(false);
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
  // La direction peut CLÔTURER une séance de son établissement (règle du
  // 17/08) — indispensable pour fermer une séance qu'un enseignant a laissée
  // « en cours ». Elle ne peut rien piloter d'autre.
  const peutCloturer =
    estProprietaire ||
    (isEstablishmentAdmin && seance.establishmentId === scopedEstablishmentId);
  const enCours = seance.status === 'running';
  const terminee = seance.status === 'ended';

  return (
    // En direct, les deux cartes (Contrôle / Progression) méritent la largeur
    // d'un vidéoprojecteur ; les fiches et rapports restent à largeur de lecture.
    <div className="flex flex-col gap-5" style={{ maxWidth: enCours ? 1440 : 1100 }}>
      <Link
        href="/seances"
        className="flex items-center gap-2"
        style={{ fontSize: 12.5, color: 'var(--color-text-muted)', textDecoration: 'none' }}
      >
        <ArrowLeft size={14} /> Séances
      </Link>

      {/* En `running`, le suivi porte son propre en-tête « Session en direct ». */}
      {!terminee && !enCours && (
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
          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={commencerModification}
              disabled={action || brouillon !== null}
              style={{ fontSize: 13, opacity: action || brouillon !== null ? 0.5 : 1 }}
            >
              <Pencil size={14} /> Modifier
            </button>
            <button
              className="btn-primary flex items-center gap-2"
              onClick={ouvrir}
              disabled={action || brouillon !== null}
              style={{ fontSize: 13, opacity: action || brouillon !== null ? 0.5 : 1 }}
            >
              <Play size={14} /> Ouvrir la salle d’attente
            </button>
          </div>
        )}
      </div>

      )}

      {/* ═══ SALLE D'ATTENTE — séance ouverte, partie pas encore démarrée ═══ */}
      {enCours && !seance.startedPlayingAt && seance.joinCode && (
        <SalleAttente
          code={seance.joinCode}
          titreSeance={seance.title || 'Séance'}
          nomClasse={classe?.name ?? seance.classId}
          nomEdition={seance.editionId || undefined}
          lignes={lignes}
          chargement={chargementSuivi}
          onDemarrer={estProprietaire ? lancerPartie : undefined}
          actionEnCours={action}
        />
      )}

      {/* ═══ SUIVI EN DIRECT — la partie a démarré ═══ */}
      {enCours && (seance.startedPlayingAt || !seance.joinCode) && (
        <SuiviSeance
          lignes={lignes}
          titreSeance={seance.title || 'Séance'}
          nomClasse={classe?.name ?? seance.classId}
          startedAt={seance.startedAt}
          durationMinutes={seance.durationMinutes}
          chargement={chargementSuivi}
          onTerminer={peutCloturer ? cloturer : undefined}
          onProlonger={estProprietaire ? prolonger : undefined}
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
            contenu={contenu}
          />
        ))}

      {/* ═══ MODIFICATION DE LA FICHE — séance pas encore ouverte ═══ */}
      {brouillon && !enCours && !terminee && (
        <div className="glass-card p-4 flex flex-col gap-4">
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Modifier la séance
          </span>

          <div>
            <label className="label">Titre de la séance</label>
            <input
              className="input-field"
              type="text"
              value={brouillon.titre}
              onChange={(e) => setBrouillon((prev) => (prev ? { ...prev, titre: e.target.value } : prev))}
              placeholder="Ex. Le business model — chapitre 3"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="label" style={{ marginBottom: 0 }}>
              Durée : {brouillon.duree} minutes
            </label>
            <input
              type="range"
              min={DUREE_SEANCE_MIN}
              max={DUREE_SEANCE_MAX}
              step={5}
              value={brouillon.duree}
              onChange={(e) =>
                setBrouillon((prev) => (prev ? { ...prev, duree: bornerDuree(Number(e.target.value)) } : prev))
              }
            />
          </div>

          <div>
            <label className="label">Programmée pour (optionnel)</label>
            <input
              className="input-field"
              type="datetime-local"
              value={brouillon.programmee}
              onChange={(e) =>
                setBrouillon((prev) => (prev ? { ...prev, programmee: e.target.value } : prev))
              }
            />
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
              Laissez vide pour ouvrir la séance manuellement, le moment venu. La programmation est
              indicative : la séance ne devient visible par vos élèves que quand vous l’ouvrez.
            </p>
          </div>

          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            La classe et le contenu source ne se changent pas ici : pour une autre classe, créez une
            nouvelle séance en réutilisant ce contenu (wizard, voie « réutiliser une séance »). Le
            contenu généré reste corrigeable ci-dessous.
          </p>

          <div className="flex items-center gap-2 justify-end">
            <button
              className="btn-secondary"
              onClick={() => setBrouillon(null)}
              disabled={action}
              style={{ fontSize: 13 }}
            >
              Annuler
            </button>
            <button
              className="btn-primary"
              onClick={() => void enregistrerModification()}
              disabled={action}
              style={{ fontSize: 13, opacity: action ? 0.5 : 1 }}
            >
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {/* ═══ FICHE DE LA SÉANCE ═══
          Reléguée SOUS le suivi et le rapport : pendant la séance, l'état des
          élèves prime sur les métadonnées, que l'enseignant vient de saisir.
          En direct, elle est masquée avec l'aperçu du contenu (voir ci-dessous) :
          l'écran reste celui du suivi de la classe. */}
      {!enCours && (
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
      )}

      {/* En direct : l'aperçu du contenu ne s'ouvre que sur demande explicite. */}
      {contenu && estProprietaire && enCours && !montrerContenuEnDirect && (
        <button
          type="button"
          className="flex items-center gap-2"
          onClick={() => setMontrerContenuEnDirect(true)}
          style={{
            alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12.5, color: 'var(--color-text-muted)', padding: 0,
          }}
        >
          <Pencil size={13} /> Corriger le contenu de la séance (quiz, duels…)
        </button>
      )}

      {contenu && estProprietaire && !terminee && (!enCours || montrerContenuEnDirect) && (
        <div className="glass-card p-4 flex flex-col gap-4">
          {enCours && (
            <button
              type="button"
              onClick={() => setMontrerContenuEnDirect(false)}
              style={{
                alignSelf: 'flex-end', background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 12.5, color: 'var(--color-text-muted)', padding: 0,
              }}
            >
              Masquer le contenu
            </button>
          )}
          <ApercuContenuSeance
            contenu={contenu}
            onChange={(suivant) => {
              setContenu(suivant);
              void saveSessionContent(sessionId, suivant, true).catch((error) => {
                console.error('Enregistrement des corrections :', error);
              });
            }}
          />
          {/* L'ajout repart du cours déposé sous cette séance : il n'est
              proposé que si le contenu en a bien été généré (une séance
              « édition seule » n'a pas de cours source). */}
          {seance.hasGeneratedContent && (
            <AjoutContenuSeance onAjouter={ajouterContenu} enCours={enAjout} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Convertit un epoch ms vers la valeur d'un champ `datetime-local` (HEURE
 * LOCALE — `toISOString()` serait décalé d'un fuseau, GMT au Sénégal mais pas
 * pour un test depuis l'Europe).
 */
function versDatetimeLocal(ms?: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
