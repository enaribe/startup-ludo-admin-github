'use client';

/**
 * Mode Classe — wizard de création d'une séance (3 ou 4 écrans).
 *
 * UN ÉCRAN, UNE QUESTION. Le fil n'a pas la même longueur pour tous :
 *
 *   ① La séance     — la seule question : COMMENT préparer ? Quatre façons à
 *                     plat (prête à l'emploi, depuis son cours, réutiliser,
 *                     contenu générique). Rien d'autre que de quoi choisir.
 *   ② Le contenu    — SEULEMENT pour « depuis mon cours » et « réutiliser » :
 *                     dépôt, consignes, dosage, génération, aperçu éditable.
 *   ③ La classe     — classe parmi celles de l'enseignant, durée 20–45 min.
 *   ④ Récapitulatif — Lancer maintenant, ou programmer.
 *
 * POURQUOI CE DÉCOUPAGE. Tout vivait sur l'écran ①, qui était donc dimensionné
 * pour le cas le plus lourd — générer depuis un cours — et faisait payer cette
 * longueur aux trois autres façons, qui ne demandent qu'un clic. Deux retours
 * successifs : « trop de choses sur un même écran », puis, après un premier
 * correctif par repli, « je ne veux pas que le user se mette à scroller
 * autant ». Replier ne suffisait pas : les réglages d'une option s'ajoutaient
 * SOUS les trois autres, qui restaient à l'écran.
 *
 * L'écran ② n'est donc pas une étape fixe : `etapesPour()` le retire quand il
 * n'aurait rien à montrer. Une séance prête va directement au choix de la
 * classe — ajouter un écran traversable en un clic aurait remplacé « c'est trop
 * long » par « pourquoi cet écran ». Les étapes sont désignées par une CLÉ et
 * non par un rang, pour cette raison exacte (cf. `CleEtape`).
 *
 * NAVIGATION LIBRE — toutes les étapes restent cliquables (cf. `WizardStepper`,
 * qui corrige le défaut d'affordance du wizard sponsor). La validation porte sur
 * le bouton final : on empêche de LANCER une séance incomplète, pas de consulter
 * le récapitulatif pour voir ce qui manque.
 *
 * FORMAT INDIVIDUEL UNIQUEMENT — le format « en équipes » est reporté en V2
 * (SPEC §1). Il n'est volontairement pas proposé, même grisé : une option
 * désactivée dans un écran de vente donne l'impression d'un produit inachevé.
 *
 * PAS DE CODE DANS CET ÉCRAN — le code à 6 caractères est celui de la SÉANCE,
 * affiché une fois celle-ci lancée (salle d'attente). L'élève le saisit pour
 * rejoindre, et s'inscrit du même geste s'il ne l'était pas encore : il n'y a
 * plus de rattachement préalable à préparer ici.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronRight,
  FileText,
  GraduationCap,
  Info,
  Layers,
  Play,
  RefreshCw,
  Sparkles,
  Upload,
  Users,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth-context';
import { getReadySessionsPubliees, type ReadySession } from '@/lib/ready-session-service';
import { getClassesByIds } from '@/lib/school-service';
import { getEditions } from '@/lib/firestore-service';
import {
  DUREE_SEANCE_DEFAUT,
  DUREE_SEANCE_MAX,
  DUREE_SEANCE_MIN,
  SeanceError,
  bornerDuree,
  compterCartes,
  createClassSession,
  getSessionContent,
  getSessionsByTeacher,
  saveSessionContent,
} from '@/lib/class-session-service';
import {
  deposerCours,
  genererContenuSeance,
  genererContenuSupplementaire,
  mixPourDuree,
  type MixSeance,
} from '@/lib/class-session-generation';
import { ErreurHorsSujet, type AnalyseThematique } from '@/lib/analyse-thematique';
import { generateId } from '@/lib/utils';
import {
  SCHOOL_LEVEL_LABELS,
  type ClassSession,
  type ClassSessionContent,
  type EditionData,
  type SchoolClass,
} from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import WizardStepper from '@/components/school/WizardStepper';
import RefusThematique from '@/components/school/RefusThematique';
import ApercuContenuSeance from '@/components/school/ApercuContenuSeance';
import AjoutContenuSeance from '@/components/school/AjoutContenuSeance';

/**
 * Les écrans possibles du parcours, désignés par un NOM et non par un rang.
 *
 * ═══ POURQUOI DES CLÉS, ET NON UN INDEX ═══
 *
 * Le fil n'a pas la même longueur selon la façon de préparer : préparer un
 * contenu depuis un cours (ou relire une séance réutilisée) ajoute un écran que
 * « séance prête » et « contenu générique » n'ont aucune raison de traverser.
 *
 * Avec des index, « étape 2 » désignerait la classe dans un cas et le contenu
 * dans l'autre : un enseignant qui change d'avis à l'écran 1 se retrouverait
 * ailleurs qu'il ne croit, sans rien de visible pour le signaler. La clé
 * supprime la question — `'classe'` désigne toujours la classe.
 */
type CleEtape = 'seance' | 'contenu' | 'classe' | 'recap';

const LIBELLES_ETAPES: Record<CleEtape, string> = {
  seance: 'La séance',
  contenu: 'Le contenu',
  classe: 'La classe',
  recap: 'Récapitulatif',
};

/**
 * Les écrans à traverser pour une façon de préparer donnée.
 *
 * L'écran « Le contenu » n'existe que là où il y a quelque chose à faire ou à
 * relire : déposer un cours et générer, ou vérifier ce qu'une séance réutilisée
 * apporte. Une séance prête et le contenu générique n'ont rien à y montrer —
 * les faire passer par un écran traversable en un clic remplacerait « c'est
 * trop long » par « pourquoi cet écran ».
 */
function etapesPour(voie: VoieContenu, seancePrete: boolean): readonly CleEtape[] {
  if (seancePrete || voie === 'edition') return ['seance', 'classe', 'recap'];
  return ['seance', 'contenu', 'classe', 'recap'];
}

/**
 * Séances prêtes à l'emploi (spec v2.1, voie A) : un clic préconfigure titre,
 * édition support, durée et difficulté — l'enseignant peut lancer dès l'étape 2.
 * Difficulté EN CLAIR (arbitrage D2) : Débutant / Intermédiaire / Avancé.
 */
/**
 * Les séances prêtes viennent désormais de `readySessions` (écran CONCREE).
 *
 * Elles étaient codées ici : en ajouter une demandait une livraison, et elles
 * ne portaient qu'un titre et une durée — choisir « Le business plan » lançait
 * une séance VIDE, qui tirait les cartes ordinaires de l'édition. Chacune
 * porte maintenant son contenu de jeu, généré une fois côté admin.
 */

/** Voie choisie à l'étape 1 pour définir le contenu de la séance. */
type VoieContenu = 'generation' | 'reutilisation' | 'edition';

export default function NouvelleSeancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { admin, scopedClassIds, scopedEstablishmentId, loading: authLoading } = useAuth();

  const [etape, setEtape] = useState<CleEtape>('seance');
  const [chargement, setChargement] = useState(true);

  // ===== Données de référence =====
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [editions, setEditions] = useState<EditionData[]>([]);
  const [seancesPassees, setSeancesPassees] = useState<ClassSession[]>([]);

  // ===== Étape 1 : le contenu =====
  const [voie, setVoie] = useState<VoieContenu>('generation');
  /**
   * Séance prête à l'emploi retenue, `null` en mode personnalisé. C'est ce qui
   * bascule la mise en avant entre les deux cartes de l'étape 1 (maquette) :
   * choisir une séance prête présélectionne titre, édition et durée ; toucher
   * au titre ou à la source de contenu repasse en personnalisé.
   */
  const [seancePreteId, setSeancePreteId] = useState<string | null>(null);
  const [seancesPretes, setSeancesPretes] = useState<ReadySession[]>([]);
  const [titre, setTitre] = useState('');
  const [editionId, setEditionId] = useState('');
  const [seanceSource, setSeanceSource] = useState<ClassSession | null>(null);
  const [consignes, setConsignes] = useState('');
  const [coursDeposes, setCoursDeposes] = useState<
    { nom: string; caracteres: number; theme: string; incertain: boolean }[]
  >([]);
  /**
   * Dernier verdict thématique à signaler : refus, ou acceptation douteuse.
   *
   * Un SEUL emplacement et non une liste : l'enseignant dépose ses fichiers un
   * par un et réagit au dernier. Empiler les verdicts transformerait le haut de
   * l'écran en journal d'événements, que personne ne lit.
   */
  const [verdict, setVerdict] = useState<{ fichier: string; analyse: AnalyseThematique } | null>(
    null
  );
  const [contenu, setContenu] = useState<ClassSessionContent | null>(null);
  const [enExtraction, setEnExtraction] = useState(false);
  const [enGeneration, setEnGeneration] = useState(false);
  /**
   * Quantités à générer, PAR TYPE — c'est l'enseignant qui décide, la durée ne
   * sert que de point de départ (≈ 1 quiz / 3 min). Décision produit : un mix
   * imposé produisait des paquets trop courts, et les cartes revenaient en
   * boucle dans les parties longues.
   */
  const [mix, setMix] = useState<MixSeance>(() => mixPourDuree(DUREE_SEANCE_DEFAUT));
  const [enAjout, setEnAjout] = useState(false);

  /**
   * Identifiant de la séance, tiré DÈS LE MONTAGE et non à la validation.
   *
   * Les cours déposés et le contenu généré vivent en sous-collection de la
   * séance : il faut donc son id avant même que la séance n'existe. Le document
   * de séance, lui, n'est écrit qu'au bout du parcours — un wizard abandonné ne
   * laisse que des sous-collections orphelines, invisibles et sans coût.
   */
  const [sessionId] = useState(() => `sess_${generateId()}`);

  // ===== Étape 2 : la classe =====
  const [classId, setClassId] = useState('');
  const [duree, setDuree] = useState(DUREE_SEANCE_DEFAUT);

  // ===== Étape 3 : lancement =====
  // Programmation (étape 3, carte « Programmer plutôt que lancer ? ») : date et
  // heure séparées comme la maquette. Le choix lancer/programmer se fait par le
  // BOUTON du pied de page, plus par une bascule.
  const [dateProgrammee, setDateProgrammee] = useState('');
  const [heureProgrammee, setHeureProgrammee] = useState('09:00');
  const [enregistrement, setEnregistrement] = useState(false);

  const classeChoisie = useMemo(() => classes.find((c) => c.id === classId) ?? null, [classes, classId]);

  // Chargement des classes de l'enseignant, des éditions et de son historique.
  useEffect(() => {
    if (authLoading || !admin) return;
    let annule = false;
    (async () => {
      try {
        const [mesClasses, sesEditions, sesSeances] = await Promise.all([
          getClassesByIds(scopedClassIds),
          getEditions().catch(() => [] as EditionData[]),
          getSessionsByTeacher(admin.uid).catch(() => [] as ClassSession[]),
        ]);
        if (annule) return;
        setClasses(mesClasses.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)));
        const actives = sesEditions.filter((e) => e.enabled !== false);
        setEditions(actives);
        if (actives[0]) setEditionId(actives[0].id);

        // Préremplissage depuis la Communauté (« Dupliquer dans mes séances ») :
        // titre, édition (matchée par nom parmi les éditions ACTIVES) et durée
        // arrivent dans l'URL — la séance est prête à lancer en voie édition.
        // Classe préremplie quand on arrive depuis SA fiche : l'enseignant
        // vient de la consulter, la lui faire resélectionner serait un retour
        // en arrière. Vérifiée contre son périmètre — un id d'URL ne donne
        // aucun droit.
        const classeUrl = (searchParams.get('classe') ?? '').trim();
        if (classeUrl && scopedClassIds.includes(classeUrl)) setClassId(classeUrl);

        // Séances prêtes PUBLIÉES : actives et pourvues d'un contenu. Une
        // séance sans contenu n'est pas proposée — elle enverrait la classe
        // sur une partie ordinaire en promettant l'inverse.
        getReadySessionsPubliees()
          .then((liste) => setSeancesPretes(liste))
          .catch(() => setSeancesPretes([]));

        const titreUrl = searchParams.get('titre');
        const editionUrl = (searchParams.get('edition') ?? '').trim().toLowerCase();
        const dureeUrl = Number(searchParams.get('duree'));
        if (titreUrl) {
          setTitre(titreUrl);
          setVoie('edition');
        }
        if (editionUrl) {
          const cible = actives.find(
            (e) =>
              e.id.toLowerCase() === editionUrl ||
              (e.name ?? '').toLowerCase().includes(editionUrl)
          );
          if (cible) setEditionId(cible.id);
        }
        if (Number.isFinite(dureeUrl) && dureeUrl > 0) setDuree(bornerDuree(dureeUrl));
        // Seules les séances au contenu généré sont réutilisables : réutiliser
        // une séance « édition seule » n'apporterait rien de plus que la voie (c).
        setSeancesPassees(sesSeances.filter((s) => s.hasGeneratedContent));
        if (mesClasses.length === 1) setClassId(mesClasses[0].id);
      } catch (error) {
        console.error('Chargement du wizard de séance :', error);
        toast.error('Erreur lors du chargement de vos classes');
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [authLoading, admin, scopedClassIds, searchParams]);

  // ===== Voie (a) : dépôt du cours =====
  const deposer = useCallback(
    async (fichier: File) => {
      setEnExtraction(true);
      setVerdict(null);
      try {
        const meta = await deposerCours(sessionId, fichier);
        const incertain = meta.analyse.verdict === 'incertain';
        setCoursDeposes((prev) => [
          ...prev,
          {
            nom: meta.name,
            caracteres: meta.charCount,
            theme: meta.analyse.theme,
            incertain,
          },
        ]);
        // Un verdict incertain n'empêche rien, mais il doit être VU : c'est le
        // cas où le contenu généré risque de dériver du sujet, et l'enseignant
        // est le seul à pouvoir en juger dans l'aperçu.
        if (incertain) setVerdict({ fichier: meta.name, analyse: meta.analyse });
        toast.success(`Cours indexé (${meta.charCount.toLocaleString('fr-FR')} caractères)`);
      } catch (error) {
        /*
          Le refus thématique n'est PAS une erreur technique : il s'affiche dans
          un panneau qui explique et qui reste, là où un toast s'évanouit avant
          d'avoir été lu. Le toast est conservé en complément, pour que le refus
          soit perçu immédiatement même si le panneau est hors du champ de
          vision après un défilement.
        */
        if (error instanceof ErreurHorsSujet) {
          setVerdict({ fichier: fichier.name, analyse: error.analyse });
          toast.error('Document hors sujet : il n’a pas été ajouté.');
          return;
        }
        const message = error instanceof Error ? error.message : 'Extraction impossible';
        toast.error(message);
      } finally {
        setEnExtraction(false);
      }
    },
    [sessionId]
  );

  // ===== Voie (a) : génération =====
  const generer = useCallback(async () => {
    if (coursDeposes.length === 0) {
      toast.error('Déposez d’abord votre cours.');
      return;
    }
    setEnGeneration(true);
    try {
      const genere = await genererContenuSeance(sessionId, consignes, mix, {
        className: classeChoisie?.name,
        schoolLevel: classeChoisie ? SCHOOL_LEVEL_LABELS[classeChoisie.level] : undefined,
        durationMinutes: duree,
        sessionTitle: titre,
      });
      if (compterCartes(genere) === 0) {
        toast.error('Aucun contenu exploitable généré. Précisez vos consignes et réessayez.');
        return;
      }
      setContenu(genere);
      await saveSessionContent(sessionId, genere);
      toast.success(`${compterCartes(genere)} cartes générées — relisez-les avant de lancer.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Génération impossible';
      toast.error(message);
    } finally {
      setEnGeneration(false);
    }
  }, [coursDeposes.length, sessionId, consignes, mix, duree, classeChoisie, titre]);

  // ===== Voie (a) : ajout de contenu APRÈS génération =====
  const ajouterContenu = useCallback(
    async (mixAjout: MixSeance) => {
      if (!contenu) return;
      setEnAjout(true);
      try {
        const fusionne = await genererContenuSupplementaire(
          sessionId,
          consignes,
          mixAjout,
          {
            className: classeChoisie?.name,
            schoolLevel: classeChoisie ? SCHOOL_LEVEL_LABELS[classeChoisie.level] : undefined,
            durationMinutes: duree,
            sessionTitle: titre,
          },
          contenu
        );
        const ajoutees = compterCartes(fusionne) - compterCartes(contenu);
        if (ajoutees === 0) {
          toast.error('Aucune carte exploitable générée. Précisez vos consignes et réessayez.');
          return;
        }
        setContenu(fusionne);
        await saveSessionContent(sessionId, fusionne);
        toast.success(`${ajoutees} carte${ajoutees > 1 ? 's' : ''} ajoutée${ajoutees > 1 ? 's' : ''}.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Génération impossible';
        toast.error(message);
      } finally {
        setEnAjout(false);
      }
    },
    [contenu, sessionId, consignes, duree, classeChoisie, titre]
  );

  // ===== Voie (b) : réutilisation d'une séance déjà générée =====
  const reutiliser = useCallback(
    async (source: ClassSession) => {
      setSeanceSource(source);
      setEditionId(source.editionId);
      if (!titre.trim()) setTitre(source.title ?? '');
      try {
        const ancien = await getSessionContent(source.id);
        if (!ancien) {
          toast.error('Le contenu de cette séance est introuvable.');
          return;
        }
        setContenu(ancien);
        // Recopié sur la NOUVELLE séance : la séance d'origine et son rapport
        // doivent rester intacts si l'enseignant corrige le contenu cette fois-ci.
        await saveSessionContent(sessionId, ancien);
        toast.success(`Contenu repris (${compterCartes(ancien)} cartes).`);
      } catch (error) {
        console.error('Réutilisation d’une séance :', error);
        toast.error('Erreur lors de la reprise du contenu');
      }
    },
    [sessionId, titre]
  );

  /** Enregistre les corrections de l'enseignant sur le contenu. */
  const majContenu = useCallback(
    (suivant: ClassSessionContent) => {
      setContenu(suivant);
      void saveSessionContent(sessionId, suivant, true).catch((error) => {
        console.error('Enregistrement des corrections :', error);
      });
    },
    [sessionId]
  );

  // ===== Validation finale =====
  const contenuPret = voie === 'edition' ? !!editionId : !!contenu && compterCartes(contenu) > 0;
  const peutLancer = contenuPret && !!classId;
  const peutProgrammer = peutLancer && !!dateProgrammee && !!heureProgrammee;

  const valider = useCallback(async (planifier: boolean) => {
    if (!admin || !classeChoisie) return;
    if (!contenuPret) {
      toast.error('Le contenu de la séance n’est pas défini.');
      return;
    }
    const scheduledAt = planifier
      ? new Date(`${dateProgrammee}T${heureProgrammee}`).getTime()
      : undefined;
    if (planifier && (!scheduledAt || Number.isNaN(scheduledAt))) {
      toast.error('Choisissez une date et une heure.');
      return;
    }

    setEnregistrement(true);
    try {
      await createClassSession(
        sessionId,
        {
          establishmentId: classeChoisie.establishmentId ?? scopedEstablishmentId ?? '',
          classId: classeChoisie.id,
          teacherId: admin.uid,
          editionId: editionId || seanceSource?.editionId || '',
          durationMinutes: bornerDuree(duree),
          attachmentUrls: [],
          title: titre.trim() || `Séance du ${new Date().toLocaleDateString('fr-FR')}`,
          hasGeneratedContent: voie !== 'edition',
          ...(scheduledAt ? { scheduledAt } : {}),
          ...(seanceSource?.programId ? { programId: seanceSource.programId } : {}),
          ...(seanceSource?.contentPackId ? { contentPackId: seanceSource.contentPackId } : {}),
          ...(seanceSource?.levelIndex !== undefined ? { levelIndex: seanceSource.levelIndex } : {}),
        },
        !planifier
      );
      toast.success(planifier ? 'Séance programmée' : 'Séance lancée — vos élèves la voient dès maintenant.');
      router.push(`/seances/${sessionId}`);
    } catch (error) {
      // Licence expirée / établissement suspendu : message métier affiché tel quel.
      const message =
        error instanceof SeanceError
          ? error.message
          : 'Erreur lors de la création de la séance';
      console.error('Création de séance :', error);
      toast.error(message);
    } finally {
      setEnregistrement(false);
    }
  }, [
    admin,
    classeChoisie,
    contenuPret,
    dateProgrammee,
    heureProgrammee,
    sessionId,
    scopedEstablishmentId,
    editionId,
    seanceSource,
    duree,
    titre,
    voie,
    router,
  ]);

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap size={48} />}
        title="Aucune classe affectée"
        description="Vous devez avoir au moins une classe pour créer une séance. Demandez à la direction de votre établissement de vous en affecter une."
      />
    );
  }

  /*
    ═══ LE FIL SE CALCULE, IL N'EST PAS FIGÉ ═══

    Les écrans dépendent de la façon de préparer choisie à l'écran 1. Tout ce
    qui suit en découle, pour qu'il n'existe qu'UNE définition du parcours :
    changer `etapesPour` suffit à changer le fil, les flèches et le pied de page.
  */
  const etapes = etapesPour(voie, seancePreteId !== null);
  const rang = Math.max(0, etapes.indexOf(etape));
  const derniereEtape = rang === etapes.length - 1;
  const premiereEtape = rang === 0;

  /*
    FILET DE SÉCURITÉ. Changer de façon de préparer peut retirer du fil l'écran
    affiché : un enseignant sur « Le contenu » qui revient choisir « séance
    prête » se retrouverait sur un écran que le parcours ne contient plus —
    page blanche, sans rien pour en sortir. On le ramène alors au choix.
  */
  const etapeAffichee: CleEtape = etapes.includes(etape) ? etape : 'seance';

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 1320 }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text-primary)' }}>
          Lancer une session
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
          Choisissez la séance et la classe — deux minutes, zéro préparation. Vos élèves rattachés
          la verront depuis leur profil, sans code à saisir.
        </p>
      </div>

      <WizardStepper
        etapes={etapes.map((c) => LIBELLES_ETAPES[c])}
        etape={rang}
        onAller={(i) => setEtape(etapes[i])}
      />

      {etapeAffichee === 'seance' && (
        <EtapeSeance
          voie={voie}
          onVoie={setVoie}
          seancesPretes={seancesPretes}
          seancePreteId={seancePreteId}
          onSeancePreteId={setSeancePreteId}
          titre={titre}
          onTitre={setTitre}
          onSeancePrete={(d) => setDuree(bornerDuree(d))}
          editions={editions}
          editionId={editionId}
          onEdition={setEditionId}
          seancesPassees={seancesPassees}
          seanceSource={seanceSource}
          onReutiliser={reutiliser}
          onContenu={majContenu}
        />
      )}

      {etapeAffichee === 'contenu' && (
        <EtapeContenu
          voie={voie}
          titre={titre}
          seanceSource={seanceSource}
          consignes={consignes}
          onConsignes={setConsignes}
          coursDeposes={coursDeposes}
          onDeposer={deposer}
          enExtraction={enExtraction}
          verdict={verdict}
          onFermerVerdict={() => setVerdict(null)}
          mix={mix}
          onMix={setMix}
          onGenerer={generer}
          enGeneration={enGeneration}
          onAjouter={ajouterContenu}
          enAjout={enAjout}
          contenu={contenu}
          onContenu={majContenu}
          onRevenirAuChoix={() => setEtape('seance')}
        />
      )}

      {etapeAffichee === 'classe' && (
        <EtapeClasse
          classes={classes}
          classId={classId}
          onClasse={setClassId}
          duree={duree}
          onDuree={setDuree}
          nomEnseignant={admin?.displayName ?? ''}
        />
      )}

      {etapeAffichee === 'recap' && (
        <EtapeRecap
          titre={titre}
          voie={voie}
          seancePrete={seancePreteId !== null}
          contenu={contenu}
          nbDocs={coursDeposes.length}
          edition={editions.find((e) => e.id === editionId) ?? null}
          classe={classeChoisie}
          duree={duree}
          nomEnseignant={admin?.displayName ?? ''}
          dateProgrammee={dateProgrammee}
          onDateProgrammee={setDateProgrammee}
          heureProgrammee={heureProgrammee}
          onHeureProgrammee={setHeureProgrammee}
        />
      )}

      {/* Navigation — barre de pied de page (maquette) */}
      <div className="glass-card flex items-center justify-between gap-3 px-4 py-3" style={{ flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn-secondary flex items-center gap-2"
          onClick={() => (premiereEtape ? router.push('/seances') : setEtape(etapes[rang - 1]))}
          style={{ fontSize: 13 }}
        >
          <ArrowLeft size={14} />
          {premiereEtape ? 'Annuler' : 'Précédent'}
        </button>

        {/*
          ═══ CE QUI MANQUE, LÀ OÙ ON EST ═══

          DÉFAUT CORRIGÉ : hors du récapitulatif, l'absence de contenu affichait
          une coche verte et « Zéro préparation — il ne reste que la classe ».
          Sur l'écran de génération, cocher vert un contenu qui n'existe pas
          envoie l'enseignant plus loin convaincu d'avoir fini, pour buter sur un
          bouton Lancer grisé deux écrans après.

          Les étapes sont nommées et non numérotées : leur rang change avec la
          façon de préparer, donc aucun message ne peut citer « l'étape 2 ».
        */}
        <span className="flex items-center gap-2" style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
          {etapeAffichee === 'contenu' && !contenuPret ? (
            voie === 'generation'
              ? 'Déposez un document, puis générez le contenu.'
              : 'Choisissez la séance à reprendre.'
          ) : derniereEtape && !peutLancer ? (
            !contenuPret ? 'Définissez le contenu avant de lancer.' : 'Choisissez une classe.'
          ) : contenuPret ? (
            <>
              <Check size={14} style={{ color: 'var(--color-success)' }} />
              {derniereEtape
                ? 'Tout est prêt — lancez, ou programmez avec une date et une heure.'
                : 'Contenu prêt — il ne reste que la classe à choisir.'}
            </>
          ) : (
            <>
              <Check size={14} style={{ color: 'var(--color-success)' }} />
              Zéro préparation — il ne reste que la classe à choisir.
            </>
          )}
        </span>

        {derniereEtape ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-secondary flex items-center gap-2"
              onClick={() => void valider(true)}
              disabled={!peutProgrammer || enregistrement}
              title={!peutProgrammer ? 'Renseignez la date et l’heure dans « Programmer plutôt que lancer ? »' : undefined}
              style={{ fontSize: 13, opacity: !peutProgrammer || enregistrement ? 0.5 : 1 }}
            >
              <CalendarClock size={14} /> Programmer
            </button>
            <button
              type="button"
              className="btn-primary flex items-center gap-2"
              onClick={() => void valider(false)}
              disabled={!peutLancer || enregistrement}
              style={{ fontSize: 13, opacity: !peutLancer || enregistrement ? 0.5 : 1 }}
            >
              <Play size={14} /> Lancer maintenant
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            onClick={() => setEtape(etapes[rang + 1])}
            style={{ fontSize: 13 }}
          >
            Suivant
            <ArrowRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ===================== ÉTAPE 1 — LA SÉANCE =====================

/**
 * Écran 1 — UNE SEULE QUESTION : comment préparer cette séance ?
 *
 * ═══ CE QUI A CHANGÉ, ET POURQUOI ═══
 *
 * Cet écran portait autrefois le choix ET tout ce que le choix impliquait :
 * zone de dépôt, consignes, dosage, bouton de génération, aperçu éditable. Il
 * était donc dimensionné pour le cas le plus lourd (générer depuis un cours),
 * et les trois autres façons — qui ne demandent rien de plus qu'un clic —
 * payaient cette longueur. Retour d'usage : « trop de choses sur un même
 * écran », puis, après un premier correctif par repli : « je ne veux pas que le
 * user se mette à scroller autant ».
 *
 * Replier ne suffisait pas : les réglages d'une option dépliée s'ajoutaient
 * SOUS les trois autres options, qui restaient à l'écran. La page restait
 * longue. Ce qu'il fallait, c'est séparer — le choix ici, ses conséquences à
 * l'écran suivant, qui n'existe que pour les façons qui en ont besoin.
 *
 * Il ne reste donc ici que quatre lignes et deux réglages repliés : l'écran
 * tient sans défilement, et chaque ligne est une issue réelle du parcours.
 */
function EtapeSeance({
  voie,
  onVoie,
  seancesPretes,
  seancePreteId,
  onSeancePreteId,
  titre,
  onTitre,
  onSeancePrete,
  editions,
  editionId,
  onEdition,
  seancesPassees,
  seanceSource,
  onReutiliser,
  onContenu,
}: {
  voie: VoieContenu;
  onVoie: (v: VoieContenu) => void;
  /** Catalogue publié — chargé depuis `readySessions`. */
  seancesPretes: ReadySession[];
  seancePreteId: string | null;
  onSeancePreteId: (v: string | null) => void;
  titre: string;
  onTitre: (v: string) => void;
  /** Une séance prête à l'emploi impose aussi sa durée (écran classe pré-rempli). */
  onSeancePrete: (duree: number) => void;
  editions: EditionData[];
  editionId: string;
  onEdition: (v: string) => void;
  seancesPassees: ClassSession[];
  seanceSource: ClassSession | null;
  onReutiliser: (s: ClassSession) => void;
  onContenu: (c: ClassSessionContent) => void;
}) {
  const modePerso = seancePreteId === null;

  /**
   * Un clic sur une séance prête préconfigure tout — l'enseignant peut lancer.
   *
   * Le CONTENU est copié, pas référencé : la séance prête est un modèle, et
   * une correction apportée au catalogue ne doit pas modifier une séance déjà
   * jouée. C'est la même règle que pour la réutilisation d'une séance passée.
   */
  const choisirPrete = (sp: ReadySession) => {
    onSeancePreteId(sp.id);
    onVoie('edition');
    onTitre(sp.titre);
    if (sp.contenu) onContenu(sp.contenu);
    if (editions.some((e) => e.id === sp.editionId)) onEdition(sp.editionId);
    else if (editions[0]) onEdition(editions[0].id);
    onSeancePrete(sp.duree);
  };

  /** Toute interaction avec une voie personnalisée reprend la main. */
  const passerEnPerso = (v: VoieContenu) => {
    onSeancePreteId(null);
    onVoie(v);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Comment voulez-vous préparer cette séance&nbsp;?
        </h2>
        <span className="flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 700, color: '#2E7D32', marginTop: 4 }}>
          <Check size={13} /> Séances alignées sur le curriculum Startup Ludo
        </span>
      </div>

      {/*
        QUATRE FAÇONS, AU MÊME NIVEAU, DANS L'ORDRE CROISSANT DE PRÉPARATION.

        L'écran posait auparavant deux cartes comparatives dont celle de droite
        contenait un second choix à trois branches : l'enseignant tenait un
        arbre (2 puis 3) entièrement déplié. Ce sont bien quatre issues, elles
        sont donc présentées comme telles.

        Chaque ligne porte juste ce qu'il faut pour CHOISIR — un sous-titre et,
        quand il aide, un compteur. Ce que le choix implique vit à l'écran
        suivant, pas ici.
      */}
      <div className="flex flex-col gap-2.5">
        {/* ─── (1) Séance prête : aucune préparation ─── */}
        <OptionSource
          actif={!modePerso}
          onClick={() => {
            if (seancesPretes[0]) choisirPrete(seancesPretes[0]);
          }}
          icone={<Zap size={17} />}
          titre="Une séance prête à l'emploi"
          texte="Rien à préparer — vous choisissez, vous lancez."
          compteur={seancesPretes.length > 0 ? `${seancesPretes.length} disponible${seancesPretes.length > 1 ? 's' : ''}` : undefined}
          enfants={
            seancesPretes.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                Aucune séance prête publiée pour l’instant. Choisissez une autre façon de préparer.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {seancesPretes.map((sp) => {
                  const actif = seancePreteId === sp.id;
                  return (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => choisirPrete(sp)}
                      className="flex items-center justify-between gap-3"
                      style={{
                        textAlign: 'left', padding: '11px 14px', borderRadius: 10, cursor: 'pointer',
                        border: `1.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-card-border)'}`,
                        background: actif ? 'rgba(255,188,64,0.09)' : '#FFFFFF',
                      }}
                    >
                      <span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', display: 'block' }}>
                          {sp.titre}
                        </span>
                        <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                          {sp.duree} min · {sp.difficulte}{sp.note ? ` · ${sp.note}` : ''}
                        </span>
                      </span>
                      <BadgeDifficulte difficulte={sp.difficulte} />
                    </button>
                  );
                })}
              </div>
            )
          }
        />

        {/* ─── (2) Génération depuis le cours : la voie recommandée ─── */}
        <OptionSource
          actif={modePerso && voie === 'generation'}
          onClick={() => passerEnPerso('generation')}
          icone={<Sparkles size={17} />}
          titre="Depuis mon cours"
          recommande
          texte="Les quiz portent sur VOS notions, et le rapport de séance en hérite."
          compteur="dépôt à l’étape suivante"
        />

        {/* ─── (3) Réutilisation d'une séance déjà générée ─── */}
        <OptionSource
          actif={modePerso && voie === 'reutilisation'}
          onClick={() => passerEnPerso('reutilisation')}
          icone={<RefreshCw size={17} />}
          titre="Réutiliser une séance"
          texte="Repartir d’un contenu déjà généré, tel quel."
          compteur={seancesPassees.length > 0 ? `${seancesPassees.length} séance${seancesPassees.length > 1 ? 's' : ''}` : 'aucune pour l’instant'}
          enfants={
            seancesPassees.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                Aucune séance générée pour l’instant — cette option se remplira après votre
                première séance préparée depuis un cours.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {seancesPassees.map((s) => {
                  const actif = seanceSource?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="flex items-center justify-between gap-3"
                      onClick={() => onReutiliser(s)}
                      style={{
                        padding: '10px 13px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                        border: `1.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-card-border)'}`,
                        background: actif ? 'rgba(255,188,64,0.09)' : '#FFFFFF',
                      }}
                    >
                      <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>
                        {s.title || 'Séance sans titre'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                        {s.startedAt || s.createdAt
                          ? new Date(s.startedAt ?? s.createdAt ?? 0).toLocaleDateString('fr-FR')
                          : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          }
        />

        {/* ─── (4) Contenu générique : le repli sans préparation ─── */}
        <OptionSource
          actif={modePerso && voie === 'edition'}
          onClick={() => passerEnPerso('edition')}
          icone={<Layers size={17} />}
          titre="Le contenu générique Startup Ludo"
          texte="Sans aucune préparation — le rapport de séance sera moins précis."
        />
      </div>

      {/*
        RÉGLAGES COMMUNS, REPLIÉS.

        L'intitulé et l'édition valent pour les quatre façons, mais ils ont tous
        deux un défaut utilisable : l'intitulé est facultatif, l'édition est déjà
        positionnée (imposée par une séance prête, sinon la première). Les
        laisser dépliés ajouterait deux décisions à un écran qui n'en pose qu'une
        — alors qu'ils ne bloquent jamais le passage à la suite.
      */}
      <BlocRepliable
        titre="Intitulé et édition thématique"
        resume={[titre.trim() || 'Intitulé automatique', editions.find((e) => e.id === editionId)?.name ?? editionId]
          .filter(Boolean)
          .join(' · ')}
      >
        <label className="flex flex-col gap-1">
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Intitulé de la séance <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>· facultatif</span>
          </span>
          <input
            className="input-field"
            placeholder="Ex. Le business model canvas"
            value={titre}
            onChange={(e) => {
              onSeancePreteId(null);
              onTitre(e.target.value);
            }}
          />
        </label>

        <div className="flex flex-col gap-2" style={{ marginTop: 12 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Édition thématique
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {editions.length === 0 && (
              <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                Aucune édition disponible.
              </span>
            )}
            {editions.map((e) => {
              const actif = editionId === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onEdition(e.id)}
                  style={{
                    fontSize: 12.5, padding: '7px 15px', borderRadius: 20, cursor: 'pointer',
                    border: `1.5px solid ${actif ? '#0F1C2E' : 'var(--color-card-border)'}`,
                    background: actif ? '#0F1C2E' : '#FFFFFF',
                    color: actif ? '#FFFFFF' : 'var(--color-text-secondary)',
                    fontWeight: actif ? 700 : 400,
                  }}
                >
                  {e.name || e.id}
                </button>
              );
            })}
          </div>
        </div>
      </BlocRepliable>
    </div>
  );
}

// ===================== ÉCRAN 2 — LE CONTENU =====================

/**
 * Écran 2 — ce que la façon choisie demande, et rien d'autre.
 *
 * ═══ POURQUOI UN ÉCRAN SÉPARÉ ═══
 *
 * Ce bloc vivait sous le choix, sur le même écran. Deux conséquences : il
 * fallait défiler pour l'atteindre après avoir cliqué, et les trois autres
 * façons — qui n'en ont aucun usage — en subissaient la longueur.
 *
 * Il n'existe maintenant que pour les deux façons qui ont quelque chose à y
 * faire : générer depuis un cours, ou relire ce qu'une séance réutilisée
 * apporte (cf. `etapesPour`). « Séance prête » et « contenu générique » vont
 * directement au choix de la classe.
 *
 * LE TITRE RAPPELLE LE CHOIX FAIT. Sur un écran séparé, l'enseignant perd de
 * vue ce qu'il a coché à l'écran précédent ; le rappel et son bouton de retour
 * évitent un aller-retour par le fil d'étapes pour vérifier.
 */
function EtapeContenu({
  voie,
  titre,
  seanceSource,
  consignes,
  onConsignes,
  coursDeposes,
  onDeposer,
  enExtraction,
  verdict,
  onFermerVerdict,
  mix,
  onMix,
  onGenerer,
  enGeneration,
  onAjouter,
  enAjout,
  contenu,
  onContenu,
  onRevenirAuChoix,
}: {
  voie: VoieContenu;
  titre: string;
  seanceSource: ClassSession | null;
  consignes: string;
  onConsignes: (v: string) => void;
  coursDeposes: { nom: string; caracteres: number; theme: string; incertain: boolean }[];
  onDeposer: (f: File) => void;
  enExtraction: boolean;
  /** Verdict thématique à signaler (refus ou acceptation douteuse), si besoin. */
  verdict: { fichier: string; analyse: AnalyseThematique } | null;
  onFermerVerdict: () => void;
  mix: MixSeance;
  onMix: (m: MixSeance) => void;
  onGenerer: () => void;
  enGeneration: boolean;
  onAjouter: (m: MixSeance) => void | Promise<void>;
  enAjout: boolean;
  contenu: ClassSessionContent | null;
  onContenu: (c: ClassSessionContent) => void;
  onRevenirAuChoix: () => void;
}) {
  const genere = voie === 'generation';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          type="button"
          onClick={onRevenirAuChoix}
          className="flex items-center gap-1.5"
          style={{
            fontSize: 12, color: 'var(--color-text-muted)', background: 'none',
            border: 'none', cursor: 'pointer', padding: 0, marginBottom: 6,
          }}
        >
          <ArrowLeft size={12} />
          {genere ? 'Depuis mon cours' : 'Réutiliser une séance'} — changer
        </button>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          {genere ? 'Préparez le contenu de la séance' : 'Vérifiez le contenu repris'}
        </h2>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.55 }}>
          {genere ? (
            <>
              Déposez vos supports&nbsp;: les quiz sont générés sur vos notions et le rapport de
              séance en hérite. Le fichier n’est pas conservé — seul son texte est indexé, et son
              contenu doit porter sur l’entrepreneuriat ou la gestion.
            </>
          ) : (
            <>
              Le contenu de «&nbsp;{seanceSource?.title || titre || 'la séance choisie'}&nbsp;» est
              repris tel quel. Vous pouvez le relire et l’ajuster avant de continuer.
            </>
          )}
        </p>
      </div>

      {genere && (
        <section className="glass-card p-5 flex flex-col gap-4">
          {verdict && (
            <RefusThematique
              fichier={verdict.fichier}
              analyse={verdict.analyse}
              onFermer={onFermerVerdict}
            />
          )}

          <label
            className="flex flex-col items-center justify-center gap-2"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (enExtraction) return;
              Array.from(e.dataTransfer.files).forEach((f) => onDeposer(f));
            }}
            style={{
              border: '1.5px dashed var(--color-card-border)',
              borderRadius: 12,
              padding: '30px 20px',
              cursor: enExtraction ? 'progress' : 'pointer',
              opacity: enExtraction ? 0.6 : 1,
              textAlign: 'center',
            }}
          >
            <Upload size={20} style={{ color: 'var(--color-primary)' }} />
            <span style={{ fontSize: 13.5, color: 'var(--color-text-secondary)' }}>
              {enExtraction ? (
                'Extraction en cours…'
              ) : (
                <>
                  Glissez vos documents ici ou{' '}
                  <span style={{ color: '#B87A0C', fontWeight: 700 }}>parcourez vos fichiers</span>
                </>
              )}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
              PDF, DOCX, Markdown, texte · 25 Mo max par fichier
            </span>
            <input
              type="file"
              accept=".pdf,.docx,.md,.markdown,.txt"
              multiple
              style={{ display: 'none' }}
              disabled={enExtraction}
              onChange={(e) => {
                Array.from(e.target.files ?? []).forEach((f) => onDeposer(f));
                e.target.value = '';
              }}
            />
          </label>

          {coursDeposes.map((doc, i) => (
            <div key={`${doc.nom}_${i}`} className="flex items-center gap-2">
              <FileText
                size={13}
                style={{ color: doc.incertain ? '#B87A0C' : 'var(--color-success)' }}
              />
              <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                {doc.nom} — {doc.caracteres.toLocaleString('fr-FR')} caractères
                {/* Le thème détecté est affiché même quand il est correct : c'est
                    la preuve que le contrôle a bien eu lieu sur CE fichier. */}
                {doc.theme && doc.theme !== 'indéterminé' && doc.theme !== 'inconnu' && (
                  <span style={{ color: 'var(--color-text-muted)' }}> · {doc.theme}</span>
                )}
              </span>
            </div>
          ))}

          <label className="flex flex-col gap-1">
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Vos consignes <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>· facultatif</span>
            </span>
            <textarea
              className="input-field"
              rows={2}
              placeholder="Ex. Insister sur le financement participatif, éviter les questions de comptabilité."
              value={consignes}
              onChange={(e) => onConsignes(e.target.value)}
            />
          </label>

          {/* Le dosage est un réglage fin que la plupart gardent au défaut. */}
          <BlocRepliable titre="Ajuster le contenu à générer">
            <MixContenu mix={mix} onMix={onMix} />
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8, lineHeight: 1.5 }}>
              Repère&nbsp;: ≈ 1 quiz toutes les 3 minutes de jeu. Seuls les quiz alimentent le
              rapport de notions maîtrisées — et plus le paquet est fourni, moins les cartes
              reviennent en partie.
            </p>
          </BlocRepliable>

          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            style={{ alignSelf: 'flex-start', fontSize: 13, opacity: coursDeposes.length === 0 || enGeneration ? 0.5 : 1 }}
            disabled={coursDeposes.length === 0 || enGeneration}
            onClick={onGenerer}
          >
            <Sparkles size={14} />
            {enGeneration ? 'Génération en cours…' : contenu ? 'Régénérer' : 'Générer le contenu'}
          </button>
        </section>
      )}

      {/*
        ===== Aperçu éditable — dès qu'un contenu existe =====
        La condition porte sur la PRÉSENCE d'un contenu, pas sur la voie : une
        séance prête apporte le sien par une voie (`edition`) qui n'en produit
        normalement pas, et l'enseignant ne voyait alors rien.
      */}
      {contenu && compterCartes(contenu) > 0 && (
        <div className="glass-card p-4 flex flex-col gap-4">
          <ApercuContenuSeance contenu={contenu} onChange={onContenu} />
          {/* L'ajout n'a de sens que sur la voie génération : il repart du
              cours déposé sous CETTE séance. Une séance réutilisée n'en a pas. */}
          {genere && <AjoutContenuSeance onAjouter={onAjouter} enCours={enAjout || enGeneration} />}
        </div>
      )}
    </div>
  );
}

/**
 * Quantités par type — cinq compteurs sur une ligne.
 *
 * Bornes larges (0–20) : c'est l'enseignant qui connaît sa séance. Le seul
 * garde-fou dur est le zéro négatif ; un mix « tout à zéro » est refusé par le
 * bouton Générer en aval (aucune carte → `compterCartes` = 0 → erreur claire).
 */
function MixContenu({ mix, onMix }: { mix: MixSeance; onMix: (m: MixSeance) => void }) {
  const champs: Array<{ cle: keyof MixSeance; libelle: string }> = [
    { cle: 'quiz', libelle: 'Quiz' },
    { cle: 'duel', libelle: 'Duels' },
    { cle: 'opportunity', libelle: 'Opportunités' },
    { cle: 'funding', libelle: 'Financements' },
    { cle: 'challenge', libelle: 'Défis' },
  ];
  const borner = (n: number) => Math.min(20, Math.max(0, Math.round(n) || 0));

  return (
    <div className="flex items-end gap-3 flex-wrap">
      {champs.map(({ cle, libelle }) => (
        <label key={cle} className="flex flex-col gap-1">
          <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{libelle}</span>
          <input
            className="input-field"
            type="number"
            min={0}
            max={20}
            value={mix[cle]}
            onChange={(e) => onMix({ ...mix, [cle]: borner(Number(e.target.value)) })}
            style={{ width: 76 }}
          />
        </label>
      ))}
    </div>
  );
}

/**
 * Réglage fin, replié par défaut : visible d'un clic, absent sinon.
 *
 * ═══ CE QUE CE COMPOSANT EST, ET N'EST PAS ═══
 *
 * Il ne sert QU'À ce qui a un défaut utilisable — l'intitulé (facultatif),
 * l'édition (déjà positionnée), le dosage du contenu (rarement touché). Un
 * champ dont l'absence bloquerait la suite n'a rien à faire ici : replier une
 * obligation la transforme en impasse silencieuse, l'enseignant cherchant un
 * bouton grisé sans savoir quoi remplir.
 *
 * `resume` montre la valeur courante sur la ligne de titre, pour qu'on sache
 * ce qui est réglé sans déplier. Sans lui, replier ne fait que cacher.
 */
function BlocRepliable({
  titre,
  resume,
  children,
}: {
  titre: string;
  resume?: string;
  children: React.ReactNode;
}) {
  const [ouvert, setOuvert] = useState(false);

  return (
    <div
      style={{
        borderRadius: 12,
        border: '1.5px solid var(--color-card-border)',
        background: '#FFFFFF',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        className="flex items-center gap-2 w-full"
        style={{ padding: '11px 15px', cursor: 'pointer', textAlign: 'left', background: 'transparent', border: 'none' }}
      >
        <ChevronRight
          size={15}
          style={{
            color: 'var(--color-text-muted)',
            transform: ouvert ? 'rotate(90deg)' : 'none',
            transition: 'transform 120ms ease',
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>{titre}</span>
        {resume && !ouvert && (
          <span
            style={{
              fontSize: 11.5, color: 'var(--color-text-muted)', marginLeft: 'auto',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%',
            }}
          >
            {resume}
          </span>
        )}
      </button>
      {ouvert && (
        <div style={{ padding: '2px 15px 15px' }}>{children}</div>
      )}
    </div>
  );
}

/** Badge de difficulté en clair (arbitrage D2 — pas de codes N1-N4 ici). */
function BadgeDifficulte({ difficulte }: { difficulte: string }) {
  const styles: Record<string, { background: string; color: string }> = {
    Débutant: { background: 'rgba(46,160,67,0.12)', color: '#2EA043' },
    Intermédiaire: { background: 'rgba(245,166,35,0.15)', color: '#B87A0C' },
    Avancé: { background: 'rgba(15,28,46,0.07)', color: '#4A5A70' },
  };
  const s = styles[difficulte] ?? styles['Avancé'];
  return (
    <span
      style={{
        fontSize: 10.5, fontWeight: 700, borderRadius: 8, padding: '4px 9px',
        flexShrink: 0, ...s,
      }}
    >
      {difficulte}
    </span>
  );
}

/** Rangée de choix d'une source de contenu, dans la carte personnalisée. */
/**
 * Une façon de préparer la séance, et SEULEMENT ce qu'elle demande.
 *
 * ═══ POURQUOI UNE OPTION QUI S'OUVRE ═══
 *
 * L'étape affichait tout en même temps : deux cartes côte à côte, dont celle
 * de droite contenait un second choix à trois branches, plus une zone de dépôt
 * de documents posée SOUS les cartes — à 600 pixels du clic qui l'avait fait
 * apparaître. Retour d'usage : « trop de choses sur un même écran, on peut se
 * perdre ». L'enseignant devait tenir un choix à deux branches dont l'une se
 * subdivisait en trois, tout visible d'un coup.
 *
 * Ici, les quatre façons sont à PLAT et sur un pied d'égalité, et les réglages
 * d'une option vivent DANS l'option, révélés par son choix. Ce qui n'est pas
 * choisi n'occupe que sa ligne de titre.
 *
 * `enfants` n'est rendu que lorsque `actif` : non pour l'esthétique, mais pour
 * que les champs d'une voie non retenue ne soient ni lus par un lecteur
 * d'écran, ni atteignables au clavier, ni soumis.
 */
function OptionSource({
  actif,
  onClick,
  icone,
  titre,
  texte,
  recommande = false,
  compteur,
  enfants,
}: {
  actif: boolean;
  onClick: () => void;
  icone: React.ReactNode;
  titre: string;
  texte: string;
  recommande?: boolean;
  /** Chiffre discret sur le titre (« 3 séances »), quand il aide à choisir. */
  compteur?: string;
  /** Réglages propres à cette option — montrés seulement si elle est choisie. */
  enfants?: React.ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: `1.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-card-border)'}`,
        background: actif ? 'rgba(255,188,64,0.06)' : '#FFFFFF',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onClick}
        aria-expanded={enfants ? actif : undefined}
        className="flex items-start gap-3 w-full"
        style={{ padding: '13px 15px', cursor: 'pointer', textAlign: 'left', background: 'transparent', border: 'none' }}
      >
        <span style={{ color: actif ? 'var(--color-primary)' : 'var(--color-text-secondary)', marginTop: 1 }}>
          {icone}
        </span>
        <span style={{ flex: 1 }}>
          <span className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>{titre}</span>
            {recommande && (
              <span className="badge badge-info" style={{ fontSize: 10 }}>
                recommandé
              </span>
            )}
            {compteur && (
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{compteur}</span>
            )}
          </span>
          <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', display: 'block', marginTop: 2, lineHeight: 1.45 }}>
            {texte}
          </span>
        </span>
        {/* Pastille de sélection : dit lequel des quatre est retenu sans avoir
            à comparer des bordures de couleur entre elles. */}
        <span
          aria-hidden
          style={{
            width: 16, height: 16, borderRadius: 8, flexShrink: 0, marginTop: 2,
            border: `1.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-card-border)'}`,
            background: actif ? 'var(--color-primary)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {actif && <Check size={10} strokeWidth={3} style={{ color: '#FFFFFF' }} />}
        </span>
      </button>

      {actif && enfants && (
        <div
          className="flex flex-col gap-4"
          style={{ padding: '4px 15px 15px', borderTop: '1px solid var(--color-card-border)', marginTop: 2, paddingTop: 15 }}
        >
          {enfants}
        </div>
      )}
    </div>
  );
}

// ===================== ÉTAPE 2 — LA CLASSE =====================

/**
 * Étape 2 (maquette « Pour quelle classe ? ») : cartes de classes riches,
 * format de jeu, bandeau récapitulatif, durée — et à droite les options
 * (note réseau).
 *
 * FORMAT INDIVIDUEL UNIQUEMENT : « En équipes » est affiché comme la maquette
 * mais marqué « Bientôt » et non cliquable — le mobile ne le gère pas encore
 * (SPEC §1, V2). Un choix qui ne piloterait rien serait un mensonge.
 */
function EtapeClasse({
  classes,
  classId,
  onClasse,
  duree,
  onDuree,
  nomEnseignant,
}: {
  classes: SchoolClass[];
  classId: string;
  onClasse: (v: string) => void;
  duree: number;
  onDuree: (v: number) => void;
  nomEnseignant: string;
}) {
  const classeChoisie = classes.find((c) => c.id === classId) ?? null;
  const effectif = classeChoisie?.learnerCount ?? 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      {/* ═══ Carte gauche — Pour quelle classe ? ═══ */}
      <section className="glass-card lg:col-span-2">
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-card-border)' }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Pour quelle classe ?
          </h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
            Choisissez la classe et le format de jeu.
          </p>
        </div>

        <div className="p-5 flex flex-col gap-5">
          {/* Cartes de classes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {classes.map((c) => {
              const actif = c.id === classId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onClasse(c.id)}
                  className="flex flex-col gap-2"
                  style={{
                    position: 'relative', textAlign: 'left', padding: '16px 18px', borderRadius: 14,
                    cursor: 'pointer',
                    border: `2px solid ${actif ? 'var(--color-primary)' : 'var(--color-card-border)'}`,
                    background: '#FFFFFF',
                  }}
                >
                  {/* Coche ronde en haut à droite */}
                  <span
                    className="flex items-center justify-center"
                    style={{
                      position: 'absolute', top: 14, right: 14, width: 22, height: 22, borderRadius: 11,
                      background: actif ? 'var(--color-primary)' : 'transparent',
                      border: actif ? 'none' : '1.5px solid var(--color-card-border)',
                    }}
                  >
                    {actif && <Check size={13} color="#0C243E" strokeWidth={3} />}
                  </span>
                  <span
                    className="flex items-center justify-center"
                    style={{
                      width: 42, height: 42, borderRadius: 12, background: '#0F1C2E', color: '#F5A623',
                      fontSize: 13, fontWeight: 900, letterSpacing: 0.5,
                    }}
                  >
                    {initialesClasse(c.name || c.id)}
                  </span>
                  <span
                    style={{
                      alignSelf: 'flex-start', fontSize: 10.5, fontWeight: 700, padding: '3px 9px',
                      borderRadius: 8, background: 'rgba(79,107,255,0.1)', color: '#4F6BFF',
                    }}
                  >
                    {SCHOOL_LEVEL_LABELS[c.level] ?? c.level}
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.35 }}>
                    {c.name || c.id}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                    {c.learnerCount ?? 0} apprenant{(c.learnerCount ?? 0) > 1 ? 's' : ''}
                    {nomEnseignant ? ` · Ens. ${nomEnseignant}` : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Format de jeu */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Format de jeu
            </h3>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '3px 0 10px' }}>
              Chaque apprenant joue sur l’app — le format détermine qui répond.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                style={{
                  fontSize: 12.5, fontWeight: 700, padding: '9px 16px', borderRadius: 10,
                  border: '1.5px solid var(--color-primary)', background: 'rgba(255,188,64,0.12)',
                  color: 'var(--color-text-primary)',
                }}
              >
                Individuel — 1 téléphone par apprenant
              </span>
              <span
                className="flex items-center gap-2"
                title="Le format en équipes arrive dans une prochaine version de l’application mobile."
                style={{
                  fontSize: 12.5, padding: '9px 16px', borderRadius: 10,
                  border: '1.5px solid var(--color-card-border)', background: '#FFFFFF',
                  color: 'var(--color-text-muted)', cursor: 'not-allowed',
                }}
              >
                En équipes — 1 téléphone par équipe
                <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: 'rgba(245,166,35,0.12)', color: '#B87A0C' }}>
                  Bientôt
                </span>
              </span>
            </div>

            {/* Bandeau récapitulatif — chiffres réels de la classe choisie */}
            {classeChoisie && (
              <div
                className="flex items-start gap-3"
                style={{
                  marginTop: 12, padding: '14px 16px', borderRadius: 12,
                  background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)',
                }}
              >
                <Users size={16} style={{ color: '#B87A0C', flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                    {effectif} apprenant{effectif > 1 ? 's' : ''} → {effectif} joueur{effectif > 1 ? 's' : ''} individuel{effectif > 1 ? 's' : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.5 }}>
                    {classeChoisie.name || classeChoisie.id} · chacun joue sur son téléphone, à son
                    rythme, avec son propre score.
                  </div>
                </div>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--color-card-border)' }} />

          {/* Durée */}
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Durée de la session
            </h3>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '3px 0 10px' }}>
              De {DUREE_SEANCE_MIN} à {DUREE_SEANCE_MAX} minutes — la durée règle la quantité de
              quiz générés (≈ 1 question / 3 min).
            </p>
            <div className="flex items-center gap-5">
              <input
                type="range"
                min={DUREE_SEANCE_MIN}
                max={DUREE_SEANCE_MAX}
                step={5}
                value={duree}
                onChange={(e) => onDuree(bornerDuree(Number(e.target.value)))}
                style={{ flex: 1, accentColor: '#F5A623' }}
              />
              <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--color-text-primary)', flexShrink: 0, width: 74, textAlign: 'right' }}>
                {duree} min
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ Carte droite — Options de la séance ═══ */}
      <section className="glass-card">
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-card-border)' }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Options de la séance
          </h2>
        </div>
        <div className="p-5 flex flex-col gap-4">
          {/* Note réseau — uniquement ce que l'app fait vraiment */}
          <div
            className="flex items-start gap-2.5"
            style={{
              padding: '12px 14px', borderRadius: 12,
              background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.25)',
            }}
          >
            <Info size={14} style={{ color: '#B87A0C', flexShrink: 0, marginTop: 2 }} />
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
              Les connexions faibles sont gérées automatiquement par l’app : la partie continue
              hors ligne et les réponses partent au retour du réseau — rien à configurer.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Initiales du badge de classe (« Master 1 » → « M1 ») — même règle que la fiche. */
function initialesClasse(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return 'CL';
  const initiales = mots.slice(0, 2).map((m) => m[0]).join('').toUpperCase();
  return initiales.length >= 2 ? initiales : nom.trim().slice(0, 2).toUpperCase();
}

// ===================== ÉTAPE 3 — RÉCAPITULATIF =====================

/**
 * Étape 3 (maquette) : récapitulatif en tableau à gauche, carte « Programmer
 * plutôt que lancer ? » à droite. Le choix lancer/programmer se fait par les
 * BOUTONS du pied de page — remplir la date et l'heure active « Programmer ».
 */
function EtapeRecap({
  titre,
  voie,
  seancePrete,
  contenu,
  nbDocs,
  edition,
  classe,
  duree,
  nomEnseignant,
  dateProgrammee,
  onDateProgrammee,
  heureProgrammee,
  onHeureProgrammee,
}: {
  titre: string;
  voie: VoieContenu;
  seancePrete: boolean;
  contenu: ClassSessionContent | null;
  nbDocs: number;
  edition: EditionData | null;
  classe: SchoolClass | null;
  duree: number;
  nomEnseignant: string;
  dateProgrammee: string;
  onDateProgrammee: (v: string) => void;
  heureProgrammee: string;
  onHeureProgrammee: (v: string) => void;
}) {
  const sousTitreSeance =
    voie === 'generation'
      ? 'Générée depuis votre cours'
      : voie === 'reutilisation'
        ? 'Reprise d’une séance précédente'
        : seancePrete
          ? 'Séance prête à l’emploi'
          : `Édition ${edition?.name ?? edition?.id ?? '—'}`;

  const detailCartes =
    voie !== 'edition' && contenu
      ? `${contenu.quizzes.length} quiz · ${contenu.duels.length} duels · ${
          contenu.fundings.length + contenu.opportunities.length + contenu.challengeEvents.length
        } événements`
      : null;

  const effectif = classe?.learnerCount ?? 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      {/* ═══ Carte gauche — Récapitulatif ═══ */}
      <section className="glass-card lg:col-span-2">
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-card-border)' }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Récapitulatif
          </h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
            Tout est prêt — vos apprenants rattachés la verront sur leur profil.
          </p>
        </div>
        <div className="px-5">
          <LigneRecap libelle="La séance">
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {titre.trim() || 'Sans titre'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {sousTitreSeance}
              {detailCartes ? ` · ${detailCartes}` : ''}
            </div>
          </LigneRecap>
          <LigneRecap libelle="La classe">
            {classe ? (
              <>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  {classe.name || classe.id}
                </div>
                <span
                  style={{
                    display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 10px',
                    borderRadius: 8, background: 'rgba(79,107,255,0.1)', color: '#4F6BFF', margin: '6px 0 4px',
                  }}
                >
                  {SCHOOL_LEVEL_LABELS[classe.level] ?? classe.level}
                </span>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                  {effectif} apprenant{effectif > 1 ? 's' : ''} · jeu individuel
                  {nomEnseignant ? ` · Ens. ${nomEnseignant}` : ''}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, color: '#C0392B', fontWeight: 600 }}>
                Aucune classe choisie — revenez à l’étape 2.
              </div>
            )}
          </LigneRecap>
          <LigneRecap libelle="Documents de cours">
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {nbDocs > 0 ? `${nbDocs} document${nbDocs > 1 ? 's' : ''} indexé${nbDocs > 1 ? 's' : ''}` : 'Aucun'}
            </div>
          </LigneRecap>
          <LigneRecap libelle="Durée" derniere>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {duree} minutes
            </div>
          </LigneRecap>
        </div>
      </section>

      {/* ═══ Carte droite — Programmer plutôt que lancer ? ═══ */}
      <section className="glass-card p-5">
        <h2 style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Programmer plutôt que lancer ?
        </h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 14px', lineHeight: 1.55 }}>
          Renseignez une date et une heure, puis cliquez « Programmer » : la séance sera enregistrée
          pour ce créneau — vous l’ouvrirez d’un clic le moment venu, elle restera invisible aux
          apprenants d’ici là.
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>Date</span>
            <input
              type="date"
              className="input-field"
              value={dateProgrammee}
              onChange={(e) => onDateProgrammee(e.target.value)}
              style={{ width: 165 }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>Heure</span>
            <input
              type="time"
              className="input-field"
              value={heureProgrammee}
              onChange={(e) => onHeureProgrammee(e.target.value)}
              style={{ width: 110 }}
            />
          </label>
        </div>
      </section>
    </div>
  );
}

/** Ligne du récapitulatif : libellé à gauche, contenu riche à droite. */
function LigneRecap({
  libelle,
  children,
  derniere,
}: {
  libelle: string;
  children: React.ReactNode;
  derniere?: boolean;
}) {
  return (
    <div
      className="flex items-start gap-4 py-4"
      style={{ borderBottom: derniere ? 'none' : '1px solid var(--color-card-border)' }}
    >
      <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)', width: 150, flexShrink: 0, paddingTop: 1 }}>
        {libelle}
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>{children}</div>
    </div>
  );
}
