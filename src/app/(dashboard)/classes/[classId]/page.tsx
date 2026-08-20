'use client';

/**
 * Mode Classe — détail d'une classe et liste de ses élèves.
 *
 * PÉRIMÈTRE : un enseignant n'ouvre que les classes de son claim `classIds`,
 * un directeur que celles de son établissement. Le contrôle est fait ici pour
 * ne pas monter d'écran hors périmètre (et ne pas déclencher de lecture vouée à
 * être refusée), mais la vraie borne reste les règles Firestore.
 *
 * ÉDITION : le nom et le niveau sont modifiables par le directeur uniquement,
 * en autosave. L'enseignant consulte la fiche et gère les élèves de SA classe.
 *
 * ⚠️ RETRAIT D'UN ÉLÈVE — jamais une suppression. `removeLearner` pose
 * `isActive: false` et libère `linkedUid`. Supprimer le document rendrait fausses
 * les séances passées et le bilan de classe (cf. SPEC « Mouvements d'élèves »).
 * Les élèves retirés sont masqués par défaut, avec une bascule pour les revoir
 * et, le cas échéant, les réintégrer.
 *
 * `learnerCount` est dénormalisé sur la classe (il alimente la grille
 * `/classes`) : il est donc recalculé et réécrit à chaque mouvement d'élève.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  LayoutGrid,
  Play,
  Plus,
  RefreshCw,
  Upload,
  UserMinus,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { firestore, COLLECTIONS } from '@/lib/firebase';
import {
  addLearners,
  addLearner,
  DUREE_RATTACHEMENT_DEFAUT,
  DUREES_RATTACHEMENT,
  getClass,
  getEstablishment,
  getLearners,
  removeLearner,
  restoreLearner,
  saveClass,
  QuotaDepasseError,
} from '@/lib/school-service';
import { recalculerCumuls } from '@/lib/class-cumul-service';
import {
  SEUIL_QUESTIONS_NOTION,
  agregerCompteurs,
  fusionnerCompteurs,
  getParticipants,
  niveauApprenant,
  niveauDeTaux,
  type AgregationNotions,
  type CompteursMaitrise,
} from '@/lib/class-report-service';
import { getSessionsByClass } from '@/lib/class-session-service';
import { genererBilanClassePdf } from '@/lib/class-bilan-pdf';
import {
  examinerClasse,
  genererCertificats,
  nomFichierCertificat,
  telechargerPdf,
  type EligibiliteCertificat,
} from '@/lib/certificate-service';
import { cleEleve } from '@/lib/learners-csv';
import { formatDate } from '@/lib/utils';
import {
  SCHOOL_LEVELS,
  SCHOOL_LEVEL_LABELS,
  type ClassSession,
  type Learner,
  type SchoolClass,
  type SchoolLevel,
} from '@/types';
import { useAuth } from '@/lib/auth-context';
import { useAutoSave } from '@/hooks/useAutoSave';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import SaveStatusIndicator from '@/components/ui/SaveStatusIndicator';
import ImportLearnersModal from '@/components/school/ImportLearnersModal';
import toast from 'react-hot-toast';

/** Partie éditable de la fiche de classe (autosave). */
interface FicheClasse {
  name: string;
  level: SchoolLevel;
}

/**
 * Nombre maximal de séances dont l'engagement est MESURÉ (une lecture de la
 * sous-collection `participants` par séance). Au-delà, la courbe porte les
 * dernières séances et le dit — jamais de troncature silencieuse.
 */
const MAX_SEANCES_MESUREES = 12;

/** Un point de la courbe d'engagement : une séance terminée, mesurée. */
interface PointEngagement {
  sessionId: string;
  /** Rang chronologique dans l'année (« S3 »). */
  label: string;
  /** Date de la séance, déjà formatée (« 12 mars »). */
  dateTexte: string;
  /** Titre de la séance, pour l'infobulle. */
  titre: string;
  /** Apprenants connectés à la séance. */
  participants: number;
  /** Participation en % de l'effectif actuel, `null` si l'effectif est vide. */
  pct: number | null;
}

/** Initiales affichées sur le badge de la classe (« Master 1 » → « M1 »). */
function initialesClasse(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return 'CL';
  const initiales = mots.slice(0, 2).map((m) => m[0]).join('').toUpperCase();
  return initiales.length >= 2 ? initiales : nom.trim().slice(0, 2).toUpperCase();
}

export default function ClasseDetailPage() {
  const params = useParams();
  const router = useRouter();
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
  const [fiche, setFiche] = useState<FicheClasse>({ name: '', level: 'lycee' });
  const [eleves, setEleves] = useState<Learner[]>([]);
  const [loading, setLoading] = useState(true);
  const [refuse, setRefuse] = useState(false);
  const [introuvable, setIntrouvable] = useState(false);

  const [afficherRetires, setAfficherRetires] = useState(false);
  const [ajout, setAjout] = useState(false);
  const [importCsv, setImportCsv] = useState(false);
  const [retrait, setRetrait] = useState<Learner | null>(null);
  const [retraitEnCours, setRetraitEnCours] = useState(false);
  const [choixDuree, setChoixDuree] = useState(false);

  // ── Bilan de classe (maquette « détails d'une classe ») ──
  const [seances, setSeances] = useState<ClassSession[]>([]);
  /** `null` tant que la mesure des participations est en cours. */
  const [engagement, setEngagement] = useState<PointEngagement[] | null>(null);
  const [enseignants, setEnseignants] = useState<string[]>([]);
  const [bilanEnCours, setBilanEnCours] = useState(false);

  // ── Lot 7 : cumuls et certificats ──
  const [nomEtablissement, setNomEtablissement] = useState('');
  const [recalculEnCours, setRecalculEnCours] = useState(false);
  const [progresRecalcul, setProgresRecalcul] = useState<string | null>(null);
  const [apercuCertificats, setApercuCertificats] = useState<EligibiliteCertificat[] | null>(null);
  const [certificatsEnCours, setCertificatsEnCours] = useState(false);

  // Le nom et le niveau relèvent de la direction. L'enseignant gère les élèves.
  const peutEditerFiche = isEstablishmentAdmin || isSuperAdmin;

  /**
   * Le recalcul et les certificats sont réservés à l'enseignant de la classe et
   * à la direction. Ce sont deux gestes lourds : l'un réécrit les compteurs de
   * toute la classe, l'autre produit un document nominatif signé au nom de
   * l'établissement.
   */
  const peutGererCumuls = isTeacher || isEstablishmentAdmin || isSuperAdmin;

  const persist = useCallback(
    async (valeur: FicheClasse) => {
      if (!classe) return;
      const { id: _id, ...reste } = classe;
      void _id;
      await saveClass(classId, { ...reste, name: valeur.name, level: valeur.level });
    },
    [classId, classe]
  );
  const { status: saveStatus } = useAutoSave({
    data: fiche,
    save: persist,
    enabled: peutEditerFiche && !loading && !refuse && !introuvable && !!classe,
  });

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getClass(classId);
      if (!data) {
        setIntrouvable(true);
        return;
      }
      // Périmètre : un enseignant n'ouvre que ses classes ; un directeur, que
      // celles de son établissement. Le super admin passe partout (support).
      const autorise =
        isSuperAdmin ||
        (isTeacher && scopedClassIds.includes(classId)) ||
        (isEstablishmentAdmin && data.establishmentId === scopedEstablishmentId);
      if (!autorise) {
        setRefuse(true);
        return;
      }
      setClasse(data);
      setFiche({ name: data.name ?? '', level: data.level ?? 'lycee' });
      const listeEleves = await getLearners(classId);
      setEleves(listeEleves);

      // Le nom de l'établissement sert au bandeau du bilan et à la co-signature
      // du certificat : son échec ne doit pas empêcher la fiche de s'afficher.
      void getEstablishment(data.establishmentId)
        .then((etab) => setNomEtablissement(etab?.name ?? ''))
        .catch(() => setNomEtablissement(''));

      // Noms des enseignants affectés — même lecture publique bornée de
      // `users/{uid}` que le tableau de bord école. Décoratif : silencieux.
      void Promise.all(
        (data.teacherIds ?? []).slice(0, 3).map((uid) =>
          getDoc(doc(firestore, COLLECTIONS.users, uid))
            .then((snap) => (snap.data()?.displayName as string) ?? '')
            .catch(() => '')
        )
      ).then((noms) => setEnseignants(noms.filter(Boolean)));

      // ── Séances et engagement — le cœur du bilan de classe ──
      // Hors du chemin bloquant : la fiche s'affiche dès les élèves chargés, la
      // courbe se remplit quand les participations ont été relues. Le coût est
      // borné : une lecture de sous-collection (~30 documents) par séance
      // mesurée, plafonné à MAX_SEANCES_MESUREES.
      void (async () => {
        try {
          const sessions = await getSessionsByClass(classId);
          setSeances(sessions);

          const effectif = listeEleves.filter((e) => e.isActive !== false).length;
          const terminees = sessions
            .filter((s) => s.status === 'ended')
            .sort((a, b) => (a.startedAt ?? a.createdAt ?? 0) - (b.startedAt ?? b.createdAt ?? 0));
          const mesurees = terminees.slice(-MAX_SEANCES_MESUREES);
          const decalage = terminees.length - mesurees.length;

          const points = await Promise.all(
            mesurees.map(async (s, i): Promise<PointEngagement> => {
              const participants = await getParticipants(s.id).catch(() => []);
              const connectes = participants.filter((p) => !!p.learnerId).length;
              return {
                sessionId: s.id,
                label: `S${decalage + i + 1}`,
                dateTexte: s.startedAt
                  ? new Date(s.startedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
                  : '',
                titre: s.title ?? '',
                participants: connectes,
                pct: effectif > 0 ? Math.round(Math.min(1, connectes / effectif) * 100) : null,
              };
            })
          );
          setEngagement(points);
        } catch (error) {
          console.error('Mesure de l’engagement de la classe :', error);
          setEngagement([]);
        }
      })();
    } catch (error) {
      console.error('Chargement de la classe :', error);
      toast.error('Erreur lors du chargement de la classe');
    } finally {
      setLoading(false);
    }
  }, [classId, isSuperAdmin, isTeacher, isEstablishmentAdmin, scopedClassIds, scopedEstablishmentId]);

  useEffect(() => {
    if (!authLoading) charger();
  }, [authLoading, charger]);

  const actifs = useMemo(() => eleves.filter((e) => e.isActive !== false), [eleves]);
  const retires = useMemo(() => eleves.filter((e) => e.isActive === false), [eleves]);
  const rattaches = useMemo(() => actifs.filter((e) => !!e.linkedUid).length, [actifs]);

  const affiches = useMemo(() => {
    const liste = afficherRetires ? eleves : actifs;
    return [...liste].sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr')
    );
  }, [eleves, actifs, afficherRetires]);

  // ── Agrégats du bilan — tous dérivés de données MESURÉES ──

  const terminees = useMemo(() => seances.filter((s) => s.status === 'ended'), [seances]);
  const prolongementsAssignes = useMemo(
    () => seances.filter((s) => s.prolongement?.actif).length,
    [seances]
  );

  /** Première séance terminée, pour dater la période couverte par le bilan. */
  const premiereSeanceLe = useMemo(() => {
    const dates = terminees.map((s) => s.startedAt ?? s.createdAt ?? 0).filter(Boolean);
    return dates.length ? Math.min(...dates) : null;
  }, [terminees]);

  /**
   * Cumul annuel de la CLASSE : fusion des compteurs de maîtrise des apprenants
   * actifs, agrégée avec les MÊMES règles que le rapport de séance et la fiche
   * élève (seuil des 3 questions, tri croissant — la plus faible d'abord).
   */
  const cumulClasse = useMemo(() => {
    let compteurs: CompteursMaitrise = {};
    for (const e of actifs) compteurs = fusionnerCompteurs(compteurs, e.masteryByCategory ?? {});
    const questions = Object.values(compteurs).reduce((somme, c) => somme + c.total, 0);
    const correctes = Object.values(compteurs).reduce((somme, c) => somme + c.correct, 0);
    return {
      agregation: agregerCompteurs(compteurs) as AgregationNotions,
      questions,
      tauxPct: questions > 0 ? Math.round((correctes / questions) * 100) : null,
    };
  }, [actifs]);

  /** Apprenants actifs dont au moins une notion est certifiable (critère du lot 7). */
  const eligiblesCertificat = useMemo(
    () => examinerClasse(actifs).filter((x) => x.eligible).length,
    [actifs]
  );

  const engagementMoyen = useMemo(() => {
    const taux = (engagement ?? []).map((p) => p.pct).filter((x): x is number => x != null);
    if (taux.length === 0) return null;
    return Math.round(taux.reduce((a, b) => a + b, 0) / taux.length);
  }, [engagement]);

  /** Tendance : 3 dernières séances mesurées contre les 3 précédentes. */
  const tendanceEngagement = useMemo(() => {
    const taux = (engagement ?? []).map((p) => p.pct).filter((x): x is number => x != null);
    if (taux.length < 4) return null;
    const moyenne = (liste: number[]) => liste.reduce((a, b) => a + b, 0) / liste.length;
    return Math.round(moyenne(taux.slice(-3)) - moyenne(taux.slice(-6, -3)));
  }, [engagement]);

  /** Génère et télécharge le « Bilan de la classe (PDF) » — mêmes chiffres que l'écran. */
  const exporterBilan = async () => {
    if (!classe) return;
    setBilanEnCours(true);
    try {
      const octets = await genererBilanClassePdf({
        nomClasse: fiche.name || 'Classe sans nom',
        niveau: SCHOOL_LEVEL_LABELS[fiche.level] ?? fiche.level,
        etablissement: nomEtablissement,
        enseignants: enseignants.join(', '),
        date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
        tuiles: [
          ['Engagement moyen', engagementMoyen != null ? `${engagementMoyen} %` : '—'],
          ['Prolongements assignés', String(prolongementsAssignes)],
          ['Éligibles au certificat', `${eligiblesCertificat}/${actifs.length}`],
          ['Séances jouées', String(terminees.length)],
        ],
        engagement: (engagement ?? []).map((p) => ({ label: p.label, date: p.dateTexte, pct: p.pct })),
        notions: [
          ...cumulClasse.agregation.notions.map((n) => ({ libelle: n.libelle, tauxPct: n.taux, total: n.total })),
          ...cumulClasse.agregation.sousEchantillonnees.map((n) => ({ libelle: n.libelle, tauxPct: null, total: n.total })),
        ],
        apprenants: [...actifs]
          .sort(
            (a, b) =>
              a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr')
          )
          .map((e) => {
            const n = niveauApprenant(e);
            return {
              nom: `${e.lastName} ${e.firstName}`.trim(),
              niveau: `N${n.niveau}`,
              questions: n.questions,
              tauxPct: n.tauxPct,
              seances: e.totalSessions ?? 0,
              derniereActivite: e.lastPlayedAt ? formatDate(e.lastPlayedAt) : '-',
            };
          }),
        mentionProlongements: prolongementsAssignes > 0,
      });
      telechargerPdf(
        octets,
        `bilan-classe-${(fiche.name || classId).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`
      );
    } catch (error) {
      console.error('Bilan de la classe :', error);
      toast.error('Impossible de générer le bilan de la classe');
    } finally {
      setBilanEnCours(false);
    }
  };

  /**
   * Réécrit `learnerCount` sur la classe après un mouvement d'élève.
   * Ce compteur dénormalisé est ce que lit la grille `/classes` : le laisser
   * dériver afficherait des effectifs faux au directeur.
   */
  const majEffectif = useCallback(
    async (listeAJour: Learner[]) => {
      if (!classe) return;
      const effectif = listeAJour.filter((e) => e.isActive !== false).length;
      if (effectif === classe.learnerCount) return;
      const { id: _id, ...reste } = classe;
      void _id;
      try {
        await saveClass(classId, { ...reste, learnerCount: effectif });
        setClasse({ ...classe, learnerCount: effectif });
      } catch (error) {
        // Non bloquant : la liste d'élèves est juste, seul le compteur de la
        // grille est en retard — il sera corrigé au prochain mouvement.
        console.error('Mise à jour de l’effectif :', error);
      }
    },
    [classId, classe]
  );

  /**
   * Établissement servant au contrôle du quota d'élèves (lot 3).
   *
   * On le lit sur la CLASSE, pas sur le compte connecté : c'est la seule source
   * qui vaut aussi pour le super admin (qui n'a pas de `scopedEstablishmentId`).
   * Chaîne vide pour un enseignant : il n'a pas le droit de lister les classes
   * de son établissement, donc pas de quoi calculer l'effectif global — le
   * contrôle est alors sauté côté service (cf. `assertQuotaEleves`).
   */
  const etablissementQuota = isTeacher && !isEstablishmentAdmin && !isSuperAdmin
    ? ''
    : classe?.establishmentId ?? '';

  /** Affiche un message de quota tel quel ; sinon un message générique. */
  const signalerErreurEleve = (error: unknown, messageParDefaut: string) => {
    if (error instanceof QuotaDepasseError) {
      toast.error(error.message, { duration: 6000 });
      return;
    }
    toast.error(messageParDefaut);
  };

  const ajouterEleve = async (firstName: string, lastName: string, externalId: string) => {
    try {
      const cree = await addLearner(classId, { firstName, lastName, externalId }, etablissementQuota);
      const suivant = [...eleves, cree];
      setEleves(suivant);
      await majEffectif(suivant);
      toast.success('Élève ajouté');
      setAjout(false);
    } catch (error) {
      console.error('Ajout d’un élève :', error);
      signalerErreurEleve(error, 'Erreur lors de l’ajout de l’élève');
    }
  };

  const importerEleves = async (
    entrees: Array<{ firstName: string; lastName: string; externalId: string }>
  ) => {
    try {
      const crees = await addLearners(classId, entrees, etablissementQuota);
      const suivant = [...eleves, ...crees];
      setEleves(suivant);
      await majEffectif(suivant);
      toast.success(`${crees.length} élève${crees.length > 1 ? 's' : ''} importé${crees.length > 1 ? 's' : ''}`);
      setImportCsv(false);
    } catch (error) {
      console.error('Import CSV :', error);
      signalerErreurEleve(error, 'Erreur lors de l’import');
      // Rethrow : la modale d'import doit rester ouverte pour que l'utilisateur
      // ajuste sa sélection plutôt que de perdre son fichier analysé.
      if (error instanceof QuotaDepasseError) throw error;
    }
  };

  const confirmerRetrait = async () => {
    if (!retrait) return;
    setRetraitEnCours(true);
    try {
      await removeLearner(classId, retrait.id);
      const suivant = eleves.map((e) =>
        e.id === retrait.id ? { ...e, isActive: false, linkedUid: null, linkedAt: null } : e
      );
      setEleves(suivant);
      await majEffectif(suivant);
      toast.success('Élève retiré de la classe');
      setRetrait(null);
    } catch (error) {
      console.error('Retrait d’un élève :', error);
      toast.error('Erreur lors du retrait');
    } finally {
      setRetraitEnCours(false);
    }
  };

  const reintegrer = async (eleve: Learner) => {
    try {
      await restoreLearner(classId, eleve.id);
      const suivant = eleves.map((e) => (e.id === eleve.id ? { ...e, isActive: true } : e));
      setEleves(suivant);
      await majEffectif(suivant);
      toast.success('Élève réintégré');
    } catch (error) {
      console.error('Réintégration d’un élève :', error);
      toast.error('Erreur lors de la réintégration');
    }
  };

  /**
   * Reconstruit les cumuls annuels de toute la classe — le FILET DE SÉCURITÉ
   * du lot 7.
   *
   * Le cumul normal est écrit à la clôture de séance, dans le navigateur de
   * l'enseignant. Un réseau coupé au mauvais moment, un onglet fermé trop vite,
   * et la séance est `ended` sans que les compteurs aient bougé. Sans ce bouton,
   * ce cumul serait perdu DÉFINITIVEMENT : les réponses restent dans
   * `participants`, mais plus rien ne viendrait jamais les relire.
   *
   * Le recalcul repart de zéro et est donc indépendant de l'état antérieur — il
   * répare aussi bien un cumul manqué qu'un compteur corrompu. Comme il est
   * idempotent, le relancer sur une classe déjà à jour n'écrit rien du tout.
   */
  const lancerRecalcul = async () => {
    if (!classe) return;
    setRecalculEnCours(true);
    setProgresRecalcul('Lecture des séances…');
    try {
      const bilan = await recalculerCumuls(classId, eleves, (traitees, total) =>
        setProgresRecalcul(`Séance ${traitees} / ${total}…`)
      );
      // On relit les élèves : leurs agrégats viennent d'être réécrits, et la
      // fiche élève comme les certificats doivent partir des valeurs à jour.
      setEleves(await getLearners(classId));

      if (bilan.echecs.length > 0) {
        toast.error(
          `Recalcul partiel : ${bilan.misAJour} bilan${bilan.misAJour > 1 ? 's mis' : ' mis'} à jour, ${bilan.echecs.length} en échec. Réessayez dans un instant.`,
          { duration: 8000 }
        );
      } else if (bilan.misAJour === 0) {
        toast.success(
          `Les bilans sont déjà à jour : ${bilan.seancesTraitees} séance${bilan.seancesTraitees > 1 ? 's relues' : ' relue'}, aucun compteur à corriger.`,
          { duration: 6000 }
        );
      } else {
        toast.success(
          `${bilan.misAJour} bilan${bilan.misAJour > 1 ? 's' : ''} recalculé${bilan.misAJour > 1 ? 's' : ''} depuis ${bilan.seancesTraitees} séance${bilan.seancesTraitees > 1 ? 's' : ''}.`,
          { duration: 6000 }
        );
      }
    } catch (error) {
      console.error('Recalcul des cumuls :', error);
      toast.error('Impossible de recalculer les cumuls de la classe');
    } finally {
      setRecalculEnCours(false);
      setProgresRecalcul(null);
    }
  };

  /**
   * Ouvre l'aperçu avant génération des certificats de la classe.
   *
   * Seuls les élèves ACTIFS sont examinés : un élève retiré n'a plus à recevoir
   * un certificat co-signé par un établissement qu'il a quitté. Sa fiche
   * individuelle reste consultable, et son certificat téléchargeable depuis là
   * si l'enseignant le juge utile.
   */
  const ouvrirCertificats = () => setApercuCertificats(examinerClasse(actifs));

  /**
   * Produit UN SEUL PDF, une page par élève éligible.
   *
   * Pas de ZIP : un PDF multi-pages s'imprime d'un geste et s'archive dans le
   * dossier de la classe, là où 30 fichiers séparés obligeraient à décompresser
   * puis à imprimer 30 fois.
   */
  const genererLotCertificats = async () => {
    if (!apercuCertificats || !classe) return;
    setCertificatsEnCours(true);
    try {
      const octets = await genererCertificats(apercuCertificats, {
        nomEtablissement: nomEtablissement || 'votre établissement',
        nomClasse: classe.name ?? 'Classe',
        // Borne de période : la dernière activité connue de la classe. On
        // n'affirme pas une « année scolaire » que rien dans les données ne
        // permet de dater.
        finPeriode: actifs.reduce((max, e) => Math.max(max, e.lastPlayedAt ?? 0), 0) || null,
      });
      telechargerPdf(octets, nomFichierCertificat(`classe-${classe.name ?? classId}`));
      const nb = apercuCertificats.filter((e) => e.eligible).length;
      toast.success(`${nb} certificat${nb > 1 ? 's' : ''} généré${nb > 1 ? 's' : ''}`);
      setApercuCertificats(null);
    } catch (error) {
      console.error('Génération des certificats :', error);
      toast.error(error instanceof Error ? error.message : 'Impossible de générer les certificats');
    } finally {
      setCertificatsEnCours(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (refuse) {
    return (
      <EmptyState
        icon={<Users size={48} />}
        title="Classe hors de votre périmètre"
        description="Cette classe ne vous est pas affectée. Revenez à la liste de vos classes."
        action={
          <Link href="/classes" className="btn-primary" style={{ textDecoration: 'none' }}>
            Retour aux classes
          </Link>
        }
      />
    );
  }

  if (introuvable || !classe) {
    return (
      <EmptyState
        icon={<Users size={48} />}
        title="Classe introuvable"
        description="Cette classe a peut-être été supprimée."
        action={
          <Link href="/classes" className="btn-primary" style={{ textDecoration: 'none' }}>
            Retour aux classes
          </Link>
        }
      />
    );
  }

  return (
    <div>
      {/* Fil d'Ariane */}
      <Link
        href="/classes"
        className="flex items-center gap-1.5 mb-4"
        style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none', width: 'fit-content' }}
      >
        <ArrowLeft size={14} /> Retour aux classes
      </Link>

      {/* ═══ En-tête — carte d'identité de la classe (maquette) ═══ */}
      <section className="glass-card p-5 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div
              style={{
                width: 56, height: 56, borderRadius: 14, flexShrink: 0,
                background: '#0F1C2E', color: '#F5A623',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, fontWeight: 900, letterSpacing: 0.5,
              }}
            >
              {initialesClasse(fiche.name)}
            </div>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
                {fiche.name || 'Classe sans nom'}
              </h1>
              <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 9 }}>
                <span
                  style={{
                    fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 8,
                    background: 'rgba(15,28,46,0.07)', color: 'var(--color-text-primary)',
                  }}
                >
                  {SCHOOL_LEVEL_LABELS[fiche.level] ?? fiche.level}
                </span>
                <FiletEntete />
                <InfoEntete>
                  {actifs.length} apprenant{actifs.length > 1 ? 's' : ''}
                </InfoEntete>
                <FiletEntete />
                <InfoEntete>
                  {terminees.length} séance{terminees.length > 1 ? 's' : ''} jouée
                  {terminees.length > 1 ? 's' : ''}
                </InfoEntete>
                {enseignants.length > 0 && (
                  <>
                    <FiletEntete />
                    <InfoEntete>
                      Enseignant{enseignants.length > 1 ? 's' : ''} : {enseignants.join(', ')}
                    </InfoEntete>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap" style={{ flexShrink: 0 }}>
            {peutEditerFiche && <SaveStatusIndicator status={saveStatus} />}
            <button
              className="btn-primary flex items-center gap-2"
              onClick={exporterBilan}
              disabled={bilanEnCours}
              title="Un PDF d'une à deux pages reprenant exactement les chiffres de cet écran"
            >
              <Download size={16} /> {bilanEnCours ? 'Génération…' : 'Bilan de la classe (PDF)'}
            </button>
          </div>
        </div>
      </section>

      {/* ═══ Tuiles — uniquement des chiffres mesurés ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <TuileBilan
          Icon={Play}
          libelle="Engagement moyen"
          valeur={engagementMoyen != null ? `${engagementMoyen} %` : '—'}
          sous={
            engagement === null
              ? 'mesure en cours…'
              : engagementMoyen != null
                ? `présence moyenne sur ${(engagement ?? []).length} séance${(engagement ?? []).length > 1 ? 's' : ''} mesurée${(engagement ?? []).length > 1 ? 's' : ''}`
                : 'aucune séance terminée à mesurer'
          }
          tendance={tendanceEngagement}
        />
        <TuileBilan
          Icon={ClipboardCheck}
          libelle="Prolongements assignés"
          valeur={String(prolongementsAssignes)}
          accent
          sous={
            prolongementsAssignes > 0
              ? 'rendus : comptage à venir dans l’app mobile'
              : 'aucun prolongement assigné pour l’instant'
          }
        />
        <TuileBilan
          Icon={Award}
          libelle="Éligibles au certificat"
          valeur={`${eligiblesCertificat}/${actifs.length}`}
          sous={`au moins une notion mesurée sur ≥ ${SEUIL_QUESTIONS_NOTION} questions`}
        />
        <TuileBilan
          Icon={LayoutGrid}
          libelle="Séances jouées"
          valeur={String(terminees.length)}
          sous={premiereSeanceLe ? `depuis le ${formatDate(premiereSeanceLe)}` : 'aucune séance terminée'}
        />
      </div>

      {/* ═══ Engagement séance après séance + notions travaillées ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <section className="glass-card p-5">
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 3 }}>
            Engagement séance après séance
          </h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
            Part des apprenants présents pendant la séance (effectif actuel : {actifs.length})
          </p>
          {engagement === null ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '24px 0' }}>
              Mesure des participations en cours…
            </p>
          ) : engagement.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '24px 0' }}>
              Aucune séance terminée pour l’instant : la courbe apparaîtra après la première séance
              jouée.
            </p>
          ) : (
            <>
              <CourbeEngagement points={engagement} />
              {terminees.length > engagement.length && (
                <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 10 }}>
                  Les {engagement.length} dernières séances sont mesurées ici — la classe en compte{' '}
                  {terminees.length} au total (toutes reprises dans les cumuls).
                </p>
              )}
            </>
          )}
        </section>

        <section className="glass-card p-5">
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 3 }}>
            Progression du curriculum
          </h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
            Notions couvertes par la classe — cumul annuel des quiz
            {cumulClasse.questions > 0 && (
              <>
                {' '}
                ({cumulClasse.questions} réponse{cumulClasse.questions > 1 ? 's' : ''}
                {cumulClasse.tauxPct != null && <>, {cumulClasse.tauxPct} % de réussite</>})
              </>
            )}
          </p>
          {cumulClasse.agregation.notions.length === 0 &&
          cumulClasse.agregation.sousEchantillonnees.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '24px 0' }}>
              Aucune réponse de quiz cumulée pour l’instant. Si des séances ont pourtant été jouées,
              lancez « Recalculer les cumuls ».
            </p>
          ) : (
            <div className="flex flex-col" style={{ gap: 14 }}>
              {cumulClasse.agregation.notions.map((n) => (
                <BarreNotion key={n.category} libelle={n.libelle} taux={n.taux} total={n.total} />
              ))}
              {cumulClasse.agregation.sousEchantillonnees.length > 0 && (
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.6 }}>
                  Vues mais trop peu évaluées (moins de {SEUIL_QUESTIONS_NOTION} questions) :{' '}
                  {cumulClasse.agregation.sousEchantillonnees.map((n) => n.libelle).join(', ')}.
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Fiche de la classe */}
      <section className="glass-card p-5 mb-4">
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 16 }}>
          Informations de la classe
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Nom de la classe</label>
            <input
              className="input-field"
              value={fiche.name}
              readOnly={!peutEditerFiche}
              disabled={!peutEditerFiche}
              placeholder="Terminale S2"
              onChange={(e) => setFiche((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Niveau</label>
            <select
              className="input-field"
              value={fiche.level}
              disabled={!peutEditerFiche}
              onChange={(e) => setFiche((prev) => ({ ...prev, level: e.target.value as SchoolLevel }))}
            >
              {SCHOOL_LEVELS.map((n) => (
                <option key={n} value={n}>
                  {SCHOOL_LEVEL_LABELS[n]}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!peutEditerFiche && (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>
            Le nom et le niveau de la classe sont gérés par la direction de l’établissement.
          </p>
        )}
      </section>

      {/* Élèves */}
      <section className="glass-card">
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap"
          style={{ borderBottom: '1px solid var(--color-card-border)' }}
        >
          <div>
            <h2 style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Les apprenants
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
              Niveau atteint dans le jeu · cumul annuel mesuré — {actifs.length} actif
              {actifs.length > 1 ? 's' : ''}
              {retires.length > 0 && ` · ${retires.length} retiré${retires.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {retires.length > 0 && (
              <button
                className="btn-secondary flex items-center gap-2"
                style={{ fontSize: 12, padding: '6px 12px' }}
                onClick={() => setAfficherRetires((v) => !v)}
              >
                {afficherRetires ? <EyeOff size={14} /> : <Eye size={14} />}
                {afficherRetires ? 'Masquer les élèves retirés' : 'Afficher les élèves retirés'}
              </button>
            )}

            {/* ── Lot 7 : bilans annuels et certificats ── */}
            {peutGererCumuls && (
              <>
                <button
                  className="btn-secondary flex items-center gap-2"
                  onClick={lancerRecalcul}
                  disabled={recalculEnCours || actifs.length === 0}
                  title="Relit toutes les séances terminées et reconstruit les bilans annuels des élèves. À utiliser si une clôture de séance a échoué."
                >
                  <RefreshCw size={16} className={recalculEnCours ? 'animate-spin' : undefined} />
                  {progresRecalcul ?? 'Recalculer les cumuls'}
                </button>
                <button
                  className="btn-secondary flex items-center gap-2"
                  onClick={ouvrirCertificats}
                  disabled={actifs.length === 0}
                  title="Un seul PDF, une page par élève éligible"
                >
                  <Award size={16} /> Générer les certificats
                </button>
              </>
            )}

            <button className="btn-secondary flex items-center gap-2" onClick={() => setImportCsv(true)}>
              <Upload size={16} /> Importer un CSV
            </button>
            <button className="btn-secondary flex items-center gap-2" onClick={() => setAjout(true)}>
              <Plus size={16} /> Ajouter un élève
            </button>
            {/*
              Ouvrir le rattachement — l'action principale de la fiche de classe à
              la rentrée. Désactivée sans élève : un code projeté devant une liste
              vide n'a rien à rattacher, et le prof perdrait la séance à chercher
              pourquoi.
            */}
            <button
              className="btn-primary flex items-center gap-2"
              onClick={() => setChoixDuree(true)}
              disabled={actifs.length === 0}
              title={
                actifs.length === 0
                  ? 'Ajoutez d’abord les élèves de la classe'
                  : 'Projeter un code pour rattacher les comptes des élèves'
              }
            >
              <KeyRound size={16} /> Ouvrir le rattachement
            </button>
          </div>
        </div>

        {affiches.length === 0 ? (
          <EmptyState
            icon={<Users size={48} />}
            title="Aucun élève"
            description="Ajoutez les élèves un par un, ou importez la liste complète depuis un fichier CSV."
            action={
              <div className="flex items-center gap-3">
                <button className="btn-secondary flex items-center gap-2" onClick={() => setImportCsv(true)}>
                  <Upload size={16} /> Importer un CSV
                </button>
                <button className="btn-primary flex items-center gap-2" onClick={() => setAjout(true)}>
                  <Plus size={16} /> Ajouter un élève
                </button>
              </div>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-card-border)' }}>
                  <Th>Apprenant</Th>
                  <Th>Rattachement</Th>
                  <Th>Niveau</Th>
                  <Th>Questions</Th>
                  <Th>Réussite</Th>
                  <Th>Séances</Th>
                  <Th>Dernière activité</Th>
                  <Th style={{ textAlign: 'right' }}>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {affiches.map((eleve, index) => {
                  const retire = eleve.isActive === false;
                  const n = niveauApprenant(eleve);
                  return (
                    <tr
                      key={eleve.id}
                      style={{
                        borderBottom:
                          index < affiches.length - 1 ? '1px solid var(--color-card-border)' : 'none',
                        opacity: retire ? 0.55 : 1,
                      }}
                    >
                      <Td>
                        {/* Le nom ouvre la FICHE ÉLÈVE (vue annuelle, lot 7) :
                            c'est le seul chemin vers le bilan d'un élève et son
                            certificat individuel. */}
                        <Link
                          href={`/classes/${classId}/eleves/${eleve.id}`}
                          style={{ color: 'var(--color-text-primary)', textDecoration: 'none', fontWeight: 600 }}
                        >
                          {eleve.lastName} {eleve.firstName}
                        </Link>
                        {eleve.externalId?.trim() && (
                          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                            {eleve.externalId.trim()}
                          </div>
                        )}
                      </Td>
                      <Td>
                        {retire ? (
                          <span className="badge">Retiré</span>
                        ) : eleve.linkedUid ? (
                          <span className="badge badge-success flex items-center gap-1" style={{ width: 'fit-content' }}>
                            <CheckCircle2 size={11} /> Compte lié
                          </span>
                        ) : (
                          <span className="badge badge-info flex items-center gap-1" style={{ width: 'fit-content' }}>
                            <Clock size={11} /> En attente
                          </span>
                        )}
                      </Td>
                      <Td>
                        <span
                          title={`${n.questions} question${n.questions > 1 ? 's' : ''} cumulée${n.questions > 1 ? 's' : ''}${n.tauxPct != null ? ` · ${n.tauxPct} % de réussite` : ''} — N1 découvre · N2 pratique (≥10 q) · N3 maîtrise (≥25 q, ≥60 %) · N4 autonome (≥50 q, ≥70 %)`}
                          style={{
                            fontSize: 11, fontWeight: 800, padding: '3px 9px', borderRadius: 9,
                            background: n.niveau >= 3 ? 'rgba(46,160,67,0.12)' : n.niveau === 2 ? 'rgba(245,166,35,0.15)' : 'rgba(15,28,46,0.07)',
                            color: n.niveau >= 3 ? '#2EA043' : n.niveau === 2 ? '#B87A0C' : '#5A6A7E',
                          }}
                        >
                          N{n.niveau}
                        </span>
                      </Td>
                      <Td>{n.questions > 0 ? n.questions : '—'}</Td>
                      <Td>{n.tauxPct != null ? `${n.tauxPct} %` : '—'}</Td>
                      <Td>{(eleve.totalSessions ?? 0) > 0 ? eleve.totalSessions : '—'}</Td>
                      <Td>{eleve.lastPlayedAt ? formatDate(eleve.lastPlayedAt) : '—'}</Td>
                      <td className="px-4 py-3 text-right">
                        {retire ? (
                          <button
                            onClick={() => reintegrer(eleve)}
                            className="flex items-center gap-1.5 ml-auto"
                            style={{
                              fontSize: 12,
                              padding: '5px 10px',
                              borderRadius: 6,
                              border: 'none',
                              cursor: 'pointer',
                              background: 'var(--color-success-light)',
                              color: 'var(--color-success)',
                            }}
                            title="Réintégrer cet élève dans la classe"
                          >
                            <UserPlus size={13} /> Réintégrer
                          </button>
                        ) : (
                          <button
                            onClick={() => setRetrait(eleve)}
                            className="flex items-center gap-1.5 ml-auto"
                            style={{
                              fontSize: 12,
                              padding: '5px 10px',
                              borderRadius: 6,
                              border: 'none',
                              cursor: 'pointer',
                              background: 'var(--color-error-light)',
                              color: 'var(--color-error)',
                            }}
                            title="Retirer cet élève de la classe"
                          >
                            <UserMinus size={13} /> Retirer
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Ajout manuel */}
      {ajout && (
        <ModaleAjoutEleve
          existants={eleves}
          onClose={() => setAjout(false)}
          onAdd={ajouterEleve}
        />
      )}

      {/* Import CSV */}
      {importCsv && (
        <ImportLearnersModal
          existants={eleves.map((e) => ({ firstName: e.firstName, lastName: e.lastName }))}
          onClose={() => setImportCsv(false)}
          onImport={importerEleves}
        />
      )}

      {/* Aperçu avant génération des certificats de la classe */}
      {apercuCertificats && (
        <ModaleCertificats
          examens={apercuCertificats}
          enCours={certificatsEnCours}
          onClose={() => setApercuCertificats(null)}
          onGenerer={genererLotCertificats}
        />
      )}

      {/* Choix de la durée avant d'ouvrir la fenêtre de rattachement */}
      {choixDuree && (
        <ModaleDureeRattachement
          restants={actifs.length - rattaches}
          onClose={() => setChoixDuree(false)}
          onOuvrir={(minutes) => router.push(`/classes/${classId}/rattachement?duree=${minutes}`)}
        />
      )}

      {/* Confirmation de retrait */}
      <ConfirmDialog
        open={!!retrait}
        onClose={() => setRetrait(null)}
        onConfirm={confirmerRetrait}
        loading={retraitEnCours}
        danger
        title="Retirer cet élève ?"
        confirmLabel="Retirer de la classe"
        message={
          retrait
            ? `${retrait.firstName} ${retrait.lastName} sera retiré de la classe et son compte sera libéré : il pourra être rattaché ailleurs. L’élève n’est PAS supprimé — son historique et les séances passées restent intacts, et vous pourrez le réintégrer.`
            : ''
        }
      />
    </div>
  );
}

/** En-tête de colonne du tableau d'élèves. */
function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      className="text-left px-4 py-3"
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        color: 'var(--color-text-muted)',
        ...style,
      }}
    >
      {children}
    </th>
  );
}

/** Cellule du tableau d'élèves. */
function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-3" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
      {children}
    </td>
  );
}

/** Filet vertical séparant les informations de l'en-tête (maquette). */
function FiletEntete() {
  return <span style={{ width: 1, height: 15, background: 'var(--color-card-border)', display: 'inline-block' }} />;
}

/** Information de l'en-tête, en texte simple (maquette : pas de pilule). */
function InfoEntete({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{children}</span>;
}

/** Tuile de synthèse du bilan de classe — icône + libellé, valeur, sous-titre. */
function TuileBilan({
  Icon,
  libelle,
  valeur,
  sous,
  accent,
  tendance,
}: {
  Icon: LucideIcon;
  libelle: string;
  valeur: string;
  sous?: string;
  accent?: boolean;
  tendance?: number | null;
}) {
  return (
    <div
      className="glass-card p-4"
      style={accent ? { borderColor: 'rgba(245,166,35,0.5)', background: 'rgba(245,166,35,0.07)' } : undefined}
    >
      <div className="flex items-center gap-2" style={{ color: accent ? '#B87A0C' : 'var(--color-text-muted)' }}>
        <Icon size={14} strokeWidth={2.2} />
        <span style={{ fontSize: 12.5 }}>{libelle}</span>
      </div>
      <div className="flex items-baseline gap-2" style={{ marginTop: 10 }}>
        <span style={{ fontSize: 27, fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>
          {valeur}
        </span>
        {tendance != null && tendance !== 0 && (
          <span
            style={{ fontSize: 12, fontWeight: 700, color: tendance > 0 ? '#2EA043' : '#D9534F' }}
            title="Écart entre les 3 dernières séances mesurées et les 3 précédentes"
          >
            {tendance > 0 ? '▲' : '▼'} {Math.abs(tendance)} pts
          </span>
        )}
      </div>
      {sous && (
        <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 8, lineHeight: 1.45 }}>{sous}</div>
      )}
    </div>
  );
}

/**
 * Courbe d'engagement séance après séance — SVG maison, comme la courbe
 * quotidienne du tableau de bord annonceur : aucune bibliothèque de graphes
 * dans le projet, et une douzaine de points ne la justifie pas.
 */
function CourbeEngagement({ points }: { points: PointEngagement[] }) {
  const L = 560;
  const H = 220;
  const PAD_G = 42;
  const PAD_D = 14;
  const PAD_H = 16;
  const PAD_B = 30;
  const largeur = L - PAD_G - PAD_D;
  const hauteur = H - PAD_H - PAD_B;

  const valides = points
    .map((p, i) => ({ ...p, i }))
    .filter((p): p is PointEngagement & { i: number; pct: number } => p.pct != null);

  // Plancher adaptatif, comme la maquette (axe 50-100 %) : le quart de 25 le
  // plus proche SOUS le minimum mesuré, jamais moins que zéro. Une classe qui
  // oscille entre 70 et 95 % garde ainsi une courbe lisible.
  const minPct = valides.length ? Math.min(...valides.map((p) => p.pct)) : 0;
  const plancher = Math.max(0, Math.floor(minPct / 25) * 25 - (minPct % 25 === 0 && minPct > 0 ? 25 : 0));
  const graduations = [plancher, Math.round((plancher + 100) / 2), 100];

  const x = (i: number) =>
    PAD_G + (points.length === 1 ? largeur / 2 : (i / (points.length - 1)) * largeur);
  const y = (pct: number) =>
    PAD_H + (1 - (Math.min(100, Math.max(plancher, pct)) - plancher) / (100 - plancher)) * hauteur;

  const chemin = valides.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${x(p.i)} ${y(p.pct)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${L} ${H}`}
      style={{ width: '100%', height: 'auto', display: 'block' }}
      role="img"
      aria-label="Engagement de la classe, séance après séance"
    >
      {graduations.map((g) => (
        <g key={g}>
          <line x1={PAD_G} x2={L - PAD_D} y1={y(g)} y2={y(g)} stroke="rgba(15,28,46,0.09)" strokeWidth={1} />
          <text x={PAD_G - 8} y={y(g) + 3.5} textAnchor="end" fontSize={10.5} fill="#8A94A3">
            {g}%
          </text>
        </g>
      ))}
      {valides.length > 1 && (
        <path d={chemin} fill="none" stroke="#0F1C2E" strokeWidth={2} strokeLinejoin="round" />
      )}
      {valides.map((p) => (
        <circle key={p.sessionId} cx={x(p.i)} cy={y(p.pct)} r={4.5} fill="#FFFFFF" stroke="#0F1C2E" strokeWidth={2}>
          <title>
            {`${p.label}${p.titre ? ` · ${p.titre}` : ''}${p.dateTexte ? ` · ${p.dateTexte}` : ''} — ${p.participants} apprenant${p.participants > 1 ? 's' : ''} présent${p.participants > 1 ? 's' : ''} (${p.pct} %)`}
          </title>
        </circle>
      ))}
      {points.map((p, i) => (
        <text key={p.sessionId} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="#8A94A3">
          {p.label}
        </text>
      ))}
    </svg>
  );
}

/**
 * Barre d'une notion couverte — maquette : libellé, barre fine, % à droite.
 * Le verdict reprend `niveauDeTaux` (le MÊME que le rapport de séance et la
 * fiche élève) : navy par défaut, orange quand la notion est à retravailler.
 * Le volume de mesure reste accessible dans l'infobulle.
 */
function BarreNotion({ libelle, taux, total }: { libelle: string; taux: number; total: number }) {
  const aRetravailler = niveauDeTaux(taux) === 'a-retravailler';
  return (
    <div
      className="flex items-center gap-3"
      title={`${libelle} — ${taux} % de réussite sur ${total} question${total > 1 ? 's' : ''} cumulée${total > 1 ? 's' : ''}`}
    >
      <span
        style={{
          fontSize: 12.5, color: 'var(--color-text-secondary)', width: 150, flexShrink: 0,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {libelle}
      </span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(15,28,46,0.08)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${Math.max(2, taux)}%`, height: '100%', borderRadius: 3,
            background: aRetravailler ? '#F5A623' : '#0F1C2E',
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-primary)',
          width: 44, textAlign: 'right', flexShrink: 0,
        }}
      >
        {taux} %
      </span>
    </div>
  );
}

/**
 * Aperçu avant génération des certificats de la classe.
 *
 * ═══ POURQUOI UNE ÉTAPE INTERMÉDIAIRE PLUTÔT QU'UN TÉLÉCHARGEMENT DIRECT ═══
 *
 * Parce qu'un élève non éligible ne doit JAMAIS être écarté en silence. Un
 * enseignant qui télécharge « les certificats de la classe » et en reçoit 28
 * pour 30 élèves découvrirait le trou en distribuant, devant ses élèves — dont
 * les deux qui n'ont rien reçu. La modale nomme les exclus et donne la raison
 * de chacun AVANT la génération : le prof décide en connaissance de cause, et
 * peut d'abord lancer un recalcul si la cause est une clôture manquée.
 */
function ModaleCertificats({
  examens,
  enCours,
  onClose,
  onGenerer,
}: {
  examens: EligibiliteCertificat[];
  enCours: boolean;
  onClose: () => void;
  onGenerer: () => void;
}) {
  const eligibles = examens.filter((e) => e.eligible);
  const exclus = examens.filter((e) => !e.eligible);

  const nomDe = (examen: EligibiliteCertificat) =>
    `${examen.eleve.firstName ?? ''} ${examen.eleve.lastName ?? ''}`.trim() || 'Élève sans nom';

  return (
    <Modal open onClose={onClose} title="Générer les certificats de la classe" maxWidth="620px">
      <div className="flex flex-col gap-4">
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          Un <strong>seul PDF</strong> sera produit, avec <strong>une page par élève éligible</strong>{' '}
          — prêt à imprimer et à archiver. Chaque certificat porte les notions évaluées par au moins{' '}
          {SEUIL_QUESTIONS_NOTION} questions sur l’année, et la mention de co-signature de
          l’établissement.
        </p>

        <div
          className="flex items-center gap-2 p-3"
          style={{ background: 'var(--color-success-light)', borderRadius: 8 }}
        >
          <Award size={16} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            <strong style={{ color: 'var(--color-text-primary)' }}>
              {eligibles.length} certificat{eligibles.length > 1 ? 's' : ''}
            </strong>{' '}
            sur {examens.length} élève{examens.length > 1 ? 's' : ''} actif
            {examens.length > 1 ? 's' : ''}.
          </span>
        </div>

        {/* Les exclus, NOMMÉS et JUSTIFIÉS — jamais un silence. */}
        {exclus.length > 0 && (
          <div>
            <h3
              className="flex items-center gap-2"
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}
            >
              <AlertCircle size={15} style={{ color: 'var(--color-warning)' }} />
              {exclus.length} élève{exclus.length > 1 ? 's' : ''} sans certificat
            </h3>
            <ul
              className="flex flex-col gap-2"
              style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 240, overflowY: 'auto' }}
            >
              {exclus.map((examen) => (
                <li
                  key={examen.eleve.id}
                  className="p-3"
                  style={{ background: 'var(--color-surface-variant)', borderRadius: 8 }}
                >
                  <strong style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                    {nomDe(examen)}
                  </strong>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3, lineHeight: 1.5 }}>
                    {examen.raison}
                  </p>
                </li>
              ))}
            </ul>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 10, lineHeight: 1.6 }}>
              Si une séance de ces élèves n’a pas été comptabilisée (clôture interrompue), lancez
              d’abord <strong>« Recalculer les cumuls »</strong> : leurs bilans seront reconstruits
              depuis les séances terminées.
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button className="btn-secondary" onClick={onClose} disabled={enCours}>
            Annuler
          </button>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={onGenerer}
            disabled={enCours || eligibles.length === 0}
          >
            <Award size={15} />
            {enCours
              ? 'Génération…'
              : `Générer ${eligibles.length} certificat${eligibles.length > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Choix de la durée de la fenêtre de rattachement, avant projection.
 *
 * Le choix est demandé ICI plutôt que sur l'écran projeté : ce dernier est
 * affiché au tableau, devant la classe, et ne doit contenir aucune décision à
 * prendre — juste le code, le décompte et l'avancement.
 *
 * L'ouverture effective (génération du code, écriture Firestore) a lieu sur
 * l'écran de projection : un code généré ici et jamais projeté resterait actif
 * pour rien, ce qui est exactement ce que la fenêtre éphémère cherche à éviter.
 */
function ModaleDureeRattachement({
  restants,
  onClose,
  onOuvrir,
}: {
  restants: number;
  onClose: () => void;
  onOuvrir: (minutes: number) => void;
}) {
  const [minutes, setMinutes] = useState<number>(DUREE_RATTACHEMENT_DEFAUT);

  return (
    <Modal open onClose={onClose} title="Ouvrir le rattachement" maxWidth="480px">
      <div className="flex flex-col gap-4">
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          Un code à 6 caractères sera affiché en grand, à projeter au tableau et à{' '}
          <strong>dicter à voix haute</strong>. Chaque élève le saisit dans l’application, choisit
          son nom dans la liste, et son compte est lié <strong>définitivement</strong> : il
          rejoindra les prochaines séances depuis son profil, sans code.
        </p>

        {restants > 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {restants} élève{restants > 1 ? 's' : ''} n’{restants > 1 ? 'ont' : 'a'} pas encore de
            compte lié.
          </p>
        ) : (
          <div className="p-3" style={{ background: 'var(--color-info-light)', borderRadius: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Tous les élèves de la classe ont déjà un compte lié. Une nouvelle fenêtre n’est utile
              que pour un élève ajouté depuis, ou pour refaire un rattachement après un retrait.
            </span>
          </div>
        )}

        <div>
          <label className="label">Durée de la fenêtre</label>
          <div className="flex items-center gap-2 flex-wrap">
            {DUREES_RATTACHEMENT.map((d) => (
              <button
                key={d}
                onClick={() => setMinutes(d)}
                className={d === minutes ? 'btn-primary' : 'btn-secondary'}
                style={{ minWidth: 78 }}
              >
                {d} min
              </button>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            Passé ce délai, le code ne vaut plus rien — c’est ce qui protège la liste de vos élèves.
            Vous pourrez le prolonger ou rouvrir une fenêtre à tout moment.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3">
          <button className="btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button className="btn-primary" onClick={() => onOuvrir(minutes)}>
            Projeter le code
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Modale d'ajout manuel d'un élève.
 * La détection de doublon reprend la même clé que l'import CSV (`cleEleve`) :
 * un même homonyme est signalé de la même façon, quel que soit le chemin de saisie.
 */
function ModaleAjoutEleve({
  existants,
  onClose,
  onAdd,
}: {
  existants: Learner[];
  onClose: () => void;
  onAdd: (firstName: string, lastName: string, externalId: string) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [externalId, setExternalId] = useState('');
  const [enCours, setEnCours] = useState(false);

  const doublon = useMemo(() => {
    if (!firstName.trim() || !lastName.trim()) return false;
    const cle = cleEleve(firstName, lastName);
    return existants.some((e) => cleEleve(e.firstName, e.lastName) === cle);
  }, [firstName, lastName, existants]);

  const valider = async () => {
    const prenom = firstName.trim();
    const nom = lastName.trim();
    if (!prenom || !nom) {
      toast.error('Le prénom et le nom sont obligatoires');
      return;
    }
    setEnCours(true);
    try {
      await onAdd(prenom, nom, externalId.trim());
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Ajouter un élève" maxWidth="440px">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Prénom</label>
            <input
              className="input-field"
              value={firstName}
              autoFocus
              placeholder="Fatou"
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Nom</label>
            <input
              className="input-field"
              value={lastName}
              placeholder="Diop"
              onChange={(e) => setLastName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') valider();
              }}
            />
          </div>
        </div>
        <div>
          <label className="label">Identifiant de l’établissement (facultatif)</label>
          <input
            className="input-field"
            value={externalId}
            placeholder="2026-041"
            onChange={(e) => setExternalId(e.target.value)}
          />
        </div>

        {doublon && (
          <div
            className="flex items-start gap-2 p-3"
            style={{ background: 'var(--color-warning-light)', borderRadius: 8 }}
          >
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Un élève portant ce prénom et ce nom figure déjà dans la classe. Vous pouvez tout de
              même l’ajouter s’il s’agit d’un homonyme.
            </span>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button className="btn-secondary" onClick={onClose} disabled={enCours}>
            Annuler
          </button>
          <button className="btn-primary" onClick={valider} disabled={enCours}>
            {enCours ? 'Ajout…' : 'Ajouter l’élève'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
