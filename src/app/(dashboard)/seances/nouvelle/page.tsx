'use client';

/**
 * Mode Classe — wizard de création d'une séance (3 étapes).
 *
 * ① La séance    — trois voies : déposer son cours et générer (voie principale),
 *                  réutiliser une séance déjà générée, ou une édition existante.
 * ② La classe    — classe parmi celles de l'enseignant, durée 20–45 min.
 * ③ Récapitulatif — Lancer maintenant, ou programmer.
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
 * PAS DE CODE DE SÉANCE — les élèves rattachés voient la séance depuis leur
 * profil. Le code à 6 caractères vit sur la classe et ne sert qu'au rattachement
 * (lot 4a).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  FileText,
  GraduationCap,
  Layers,
  Play,
  RefreshCw,
  Sparkles,
  Upload,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth-context';
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
  mixPourDuree,
} from '@/lib/class-session-generation';
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
import ApercuContenuSeance from '@/components/school/ApercuContenuSeance';

const ETAPES = ['La séance', 'La classe', 'Récapitulatif'] as const;

/** Voie choisie à l'étape 1 pour définir le contenu de la séance. */
type VoieContenu = 'generation' | 'reutilisation' | 'edition';

export default function NouvelleSeancePage() {
  const router = useRouter();
  const { admin, scopedClassIds, scopedEstablishmentId, loading: authLoading } = useAuth();

  const [etape, setEtape] = useState(0);
  const [chargement, setChargement] = useState(true);

  // ===== Données de référence =====
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [editions, setEditions] = useState<EditionData[]>([]);
  const [seancesPassees, setSeancesPassees] = useState<ClassSession[]>([]);

  // ===== Étape 1 : le contenu =====
  const [voie, setVoie] = useState<VoieContenu>('generation');
  const [titre, setTitre] = useState('');
  const [editionId, setEditionId] = useState('');
  const [seanceSource, setSeanceSource] = useState<ClassSession | null>(null);
  const [consignes, setConsignes] = useState('');
  const [coursDeposes, setCoursDeposes] = useState<{ nom: string; caracteres: number }[]>([]);
  const [contenu, setContenu] = useState<ClassSessionContent | null>(null);
  const [enExtraction, setEnExtraction] = useState(false);
  const [enGeneration, setEnGeneration] = useState(false);

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
  const [programmer, setProgrammer] = useState(false);
  const [dateProgrammee, setDateProgrammee] = useState('');
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
  }, [authLoading, admin, scopedClassIds]);

  // ===== Voie (a) : dépôt du cours =====
  const deposer = useCallback(
    async (fichier: File) => {
      setEnExtraction(true);
      try {
        const meta = await deposerCours(sessionId, fichier);
        setCoursDeposes((prev) => [...prev, { nom: meta.name, caracteres: meta.charCount }]);
        toast.success(`Cours indexé (${meta.charCount.toLocaleString('fr-FR')} caractères)`);
      } catch (error) {
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
      const genere = await genererContenuSeance(sessionId, consignes, mixPourDuree(duree), {
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
  }, [coursDeposes.length, sessionId, consignes, duree, classeChoisie, titre]);

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
  const peutLancer = contenuPret && !!classId && (!programmer || !!dateProgrammee);

  const valider = useCallback(async () => {
    if (!admin || !classeChoisie) return;
    if (!contenuPret) {
      toast.error('Le contenu de la séance n’est pas défini.');
      return;
    }
    const scheduledAt = programmer && dateProgrammee ? new Date(dateProgrammee).getTime() : undefined;
    if (programmer && (!scheduledAt || Number.isNaN(scheduledAt))) {
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
        !programmer
      );
      toast.success(programmer ? 'Séance programmée' : 'Séance lancée — vos élèves la voient dès maintenant.');
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
    programmer,
    dateProgrammee,
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

  const derniereEtape = etape === ETAPES.length - 1;

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Nouvelle séance
        </h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4 }}>
          Vos élèves rattachés verront la séance depuis leur profil — aucun code à ressaisir.
        </p>
      </div>

      <WizardStepper etapes={ETAPES} etape={etape} onAller={setEtape} />

      {etape === 0 && (
        <EtapeSeance
          voie={voie}
          onVoie={setVoie}
          titre={titre}
          onTitre={setTitre}
          editions={editions}
          editionId={editionId}
          onEdition={setEditionId}
          seancesPassees={seancesPassees}
          seanceSource={seanceSource}
          onReutiliser={reutiliser}
          consignes={consignes}
          onConsignes={setConsignes}
          coursDeposes={coursDeposes}
          onDeposer={deposer}
          enExtraction={enExtraction}
          onGenerer={generer}
          enGeneration={enGeneration}
          contenu={contenu}
          onContenu={majContenu}
        />
      )}

      {etape === 1 && (
        <EtapeClasse
          classes={classes}
          classId={classId}
          onClasse={setClassId}
          duree={duree}
          onDuree={setDuree}
        />
      )}

      {etape === 2 && (
        <EtapeRecap
          titre={titre}
          voie={voie}
          contenu={contenu}
          edition={editions.find((e) => e.id === editionId) ?? null}
          classe={classeChoisie}
          duree={duree}
          programmer={programmer}
          onProgrammer={setProgrammer}
          dateProgrammee={dateProgrammee}
          onDateProgrammee={setDateProgrammee}
        />
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="btn-secondary flex items-center gap-2"
          onClick={() => (etape === 0 ? router.push('/seances') : setEtape(etape - 1))}
          style={{ fontSize: 13 }}
        >
          <ArrowLeft size={14} />
          {etape === 0 ? 'Annuler' : 'Précédent'}
        </button>

        <div className="flex items-center gap-3">
          {derniereEtape && !peutLancer && (
            <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
              {!contenuPret
                ? 'Définissez le contenu à l’étape 1.'
                : !classId
                  ? 'Choisissez une classe à l’étape 2.'
                  : 'Choisissez une date.'}
            </span>
          )}
          <button
            type="button"
            className="btn-primary flex items-center gap-2"
            onClick={() => (derniereEtape ? void valider() : setEtape(etape + 1))}
            disabled={derniereEtape && (!peutLancer || enregistrement)}
            style={{ fontSize: 13, opacity: derniereEtape && (!peutLancer || enregistrement) ? 0.5 : 1 }}
          >
            {derniereEtape ? (
              <>
                {programmer ? <CalendarClock size={14} /> : <Play size={14} />}
                {programmer ? 'Programmer' : 'Lancer maintenant'}
              </>
            ) : (
              <>
                Continuer
                <ArrowRight size={14} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================== ÉTAPE 1 — LA SÉANCE =====================

/** Étape 1 : trois voies pour définir le contenu, la génération IA en tête. */
function EtapeSeance({
  voie,
  onVoie,
  titre,
  onTitre,
  editions,
  editionId,
  onEdition,
  seancesPassees,
  seanceSource,
  onReutiliser,
  consignes,
  onConsignes,
  coursDeposes,
  onDeposer,
  enExtraction,
  onGenerer,
  enGeneration,
  contenu,
  onContenu,
}: {
  voie: VoieContenu;
  onVoie: (v: VoieContenu) => void;
  titre: string;
  onTitre: (v: string) => void;
  editions: EditionData[];
  editionId: string;
  onEdition: (v: string) => void;
  seancesPassees: ClassSession[];
  seanceSource: ClassSession | null;
  onReutiliser: (s: ClassSession) => void;
  consignes: string;
  onConsignes: (v: string) => void;
  coursDeposes: { nom: string; caracteres: number }[];
  onDeposer: (f: File) => void;
  enExtraction: boolean;
  onGenerer: () => void;
  enGeneration: boolean;
  contenu: ClassSessionContent | null;
  onContenu: (c: ClassSessionContent) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          Intitulé de la séance (facultatif)
        </span>
        <input
          className="input-field"
          placeholder="Ex. Le business model canvas"
          value={titre}
          onChange={(e) => onTitre(e.target.value)}
        />
      </label>

      {/* Les trois voies. La génération est mise en avant : c'est elle qui
          produit un contenu propre à l'établissement, donc l'argument de vente. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <CarteVoie
          actif={voie === 'generation'}
          onClick={() => onVoie('generation')}
          icone={<Sparkles size={18} />}
          titre="Depuis votre cours"
          texte="Déposez votre chapitre : les quiz et les événements sont générés sur VOS notions."
          recommande
        />
        <CarteVoie
          actif={voie === 'reutilisation'}
          onClick={() => onVoie('reutilisation')}
          icone={<RefreshCw size={18} />}
          titre="Réutiliser une séance"
          texte={
            seancesPassees.length > 0
              ? `${seancesPassees.length} séance${seancesPassees.length > 1 ? 's' : ''} déjà générée${seancesPassees.length > 1 ? 's' : ''}.`
              : 'Aucune séance générée pour l’instant.'
          }
        />
        <CarteVoie
          actif={voie === 'edition'}
          onClick={() => onVoie('edition')}
          icone={<Layers size={18} />}
          titre="Une édition existante"
          texte="Le contenu générique de Startup Ludo, sans préparation."
        />
      </div>

      {/* ===== Voie (a) — génération depuis le cours ===== */}
      {voie === 'generation' && (
        <div className="glass-card p-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              1. Déposez votre cours
            </span>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              PDF, DOCX, Markdown ou texte, 25 Mo maximum. Le document n’est pas conservé : seul
              son texte sert à générer le contenu.
            </p>
            <label
              className="flex items-center gap-2"
              style={{
                border: '1px dashed var(--color-card-border)',
                borderRadius: 10,
                padding: '12px 14px',
                cursor: enExtraction ? 'progress' : 'pointer',
                opacity: enExtraction ? 0.6 : 1,
              }}
            >
              <Upload size={16} style={{ color: 'var(--color-text-muted)' }} />
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {enExtraction ? 'Extraction en cours…' : 'Choisir un fichier'}
              </span>
              <input
                type="file"
                accept=".pdf,.docx,.md,.markdown,.txt"
                style={{ display: 'none' }}
                disabled={enExtraction}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onDeposer(f);
                  e.target.value = '';
                }}
              />
            </label>
            {coursDeposes.map((doc, i) => (
              <div key={`${doc.nom}_${i}`} className="flex items-center gap-2">
                <FileText size={13} style={{ color: 'var(--color-success)' }} />
                <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
                  {doc.nom} — {doc.caracteres.toLocaleString('fr-FR')} caractères
                </span>
              </div>
            ))}
          </div>

          <label className="flex flex-col gap-1">
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              2. Vos consignes (facultatif)
            </span>
            <textarea
              className="input-field"
              rows={2}
              placeholder="Ex. Insister sur le financement participatif, éviter les questions de comptabilité."
              value={consignes}
              onChange={(e) => onConsignes(e.target.value)}
            />
          </label>

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
        </div>
      )}

      {/* ===== Voie (b) — réutilisation ===== */}
      {voie === 'reutilisation' && (
        <div className="glass-card p-4 flex flex-col gap-2">
          {seancesPassees.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
              Vous n’avez encore aucune séance générée. Passez par « Depuis votre cours » — elle
              sera réutilisable ensuite.
            </p>
          ) : (
            seancesPassees.map((s) => {
              const actif = seanceSource?.id === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className="flex items-center justify-between gap-3 p-3"
                  onClick={() => onReutiliser(s)}
                  style={{
                    borderRadius: 10,
                    border: `1px solid ${actif ? 'var(--color-primary)' : 'var(--color-card-border)'}`,
                    background: actif ? 'var(--color-success-light)' : '#FFFFFF',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                    {s.title || 'Séance sans titre'}
                  </span>
                  <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                    {s.startedAt || s.createdAt
                      ? new Date(s.startedAt ?? s.createdAt ?? 0).toLocaleDateString('fr-FR')
                      : ''}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* ===== Voie (c) — édition existante ===== */}
      {voie === 'edition' && (
        <div className="glass-card p-4 flex flex-col gap-2">
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Édition imposée à la classe
          </span>
          <select
            className="input-field"
            value={editionId}
            onChange={(e) => onEdition(e.target.value)}
          >
            {editions.length === 0 && <option value="">Aucune édition disponible</option>}
            {editions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name || e.id}
              </option>
            ))}
          </select>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Contenu générique : les catégories d’origine sont libres, le rapport de fin de séance
            sera donc moins précis qu’avec un contenu généré depuis votre cours.
          </p>
        </div>
      )}

      {/* ===== Aperçu éditable — dès qu'un contenu existe ===== */}
      {contenu && voie !== 'edition' && (
        <div className="glass-card p-4">
          <ApercuContenuSeance contenu={contenu} onChange={onContenu} />
        </div>
      )}
    </div>
  );
}

/** Carte de choix d'une voie de contenu. */
function CarteVoie({
  actif,
  onClick,
  icone,
  titre,
  texte,
  recommande = false,
}: {
  actif: boolean;
  onClick: () => void;
  icone: React.ReactNode;
  titre: string;
  texte: string;
  recommande?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 p-4"
      style={{
        borderRadius: 12,
        border: `1px solid ${actif ? 'var(--color-primary)' : 'var(--color-card-border)'}`,
        background: actif ? 'var(--color-success-light)' : '#FFFFFF',
        cursor: 'pointer',
        textAlign: 'left',
        height: '100%',
      }}
    >
      <span className="flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
        {icone}
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{titre}</span>
        {recommande && (
          <span className="badge badge-info" style={{ fontSize: 10 }}>
            recommandé
          </span>
        )}
      </span>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{texte}</span>
    </button>
  );
}

// ===================== ÉTAPE 2 — LA CLASSE =====================

/** Étape 2 : la classe et la durée. Format individuel uniquement (V1). */
function EtapeClasse({
  classes,
  classId,
  onClasse,
  duree,
  onDuree,
}: {
  classes: SchoolClass[];
  classId: string;
  onClasse: (v: string) => void;
  duree: number;
  onDuree: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card p-4 flex flex-col gap-3">
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Classe concernée
        </span>
        <div className="flex flex-col gap-2">
          {classes.map((c) => {
            const actif = c.id === classId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onClasse(c.id)}
                className="flex items-center justify-between gap-3 p-3"
                style={{
                  borderRadius: 10,
                  border: `1px solid ${actif ? 'var(--color-primary)' : 'var(--color-card-border)'}`,
                  background: actif ? 'var(--color-success-light)' : '#FFFFFF',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <span className="flex items-center gap-2">
                  {actif ? <Check size={14} style={{ color: 'var(--color-success)' }} /> : <Users size={14} />}
                  <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                    {c.name || c.id}
                  </span>
                  <span className="badge">{SCHOOL_LEVEL_LABELS[c.level]}</span>
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  {c.learnerCount ?? 0} élève{(c.learnerCount ?? 0) > 1 ? 's' : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="glass-card p-4 flex flex-col gap-3">
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Durée : {duree} minutes
        </span>
        <input
          type="range"
          min={DUREE_SEANCE_MIN}
          max={DUREE_SEANCE_MAX}
          step={5}
          value={duree}
          onChange={(e) => onDuree(bornerDuree(Number(e.target.value)))}
        />
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          De {DUREE_SEANCE_MIN} à {DUREE_SEANCE_MAX} minutes. La durée règle la quantité de quiz
          générés — comptez environ une question toutes les trois minutes.
        </p>
        {/* Le format « en équipes » est reporté en V2 : chaque élève joue en solo,
            avec le contenu imposé par l'enseignant. On l'annonce plutôt que de
            laisser croire à un choix absent. */}
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          Chaque élève joue <strong>individuellement</strong> sur son téléphone, avec le contenu
          que vous avez choisi.
        </p>
      </div>
    </div>
  );
}

// ===================== ÉTAPE 3 — RÉCAPITULATIF =====================

/** Étape 3 : ce qui a été choisi, puis lancement ou programmation. */
function EtapeRecap({
  titre,
  voie,
  contenu,
  edition,
  classe,
  duree,
  programmer,
  onProgrammer,
  dateProgrammee,
  onDateProgrammee,
}: {
  titre: string;
  voie: VoieContenu;
  contenu: ClassSessionContent | null;
  edition: EditionData | null;
  classe: SchoolClass | null;
  duree: number;
  programmer: boolean;
  onProgrammer: (v: boolean) => void;
  dateProgrammee: string;
  onDateProgrammee: (v: string) => void;
}) {
  const libelleVoie =
    voie === 'generation'
      ? 'Généré depuis votre cours'
      : voie === 'reutilisation'
        ? 'Repris d’une séance précédente'
        : 'Édition existante';

  return (
    <div className="flex flex-col gap-4">
      <div className="glass-card p-4 flex flex-col gap-3">
        <Ligne libelle="Séance" valeur={titre.trim() || 'Sans titre'} />
        <Ligne libelle="Contenu" valeur={libelleVoie} />
        {voie === 'edition' ? (
          <Ligne libelle="Édition" valeur={edition?.name ?? edition?.id ?? '—'} />
        ) : (
          <Ligne
            libelle="Cartes"
            valeur={
              contenu
                ? `${contenu.quizzes.length} quiz · ${contenu.duels.length} duels · ${
                    contenu.fundings.length + contenu.opportunities.length + contenu.challengeEvents.length
                  } événements`
                : 'Aucun contenu'
            }
          />
        )}
        <Ligne libelle="Classe" valeur={classe ? `${classe.name} · ${classe.learnerCount ?? 0} élèves` : '—'} />
        <Ligne libelle="Durée" valeur={`${duree} minutes`} />
        <Ligne libelle="Format" valeur="Individuel" />
      </div>

      <div className="glass-card p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            className={programmer ? 'btn-secondary' : 'btn-primary'}
            style={{ fontSize: 13 }}
            onClick={() => onProgrammer(false)}
          >
            Lancer maintenant
          </button>
          <button
            type="button"
            className={programmer ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 13 }}
            onClick={() => onProgrammer(true)}
          >
            Programmer
          </button>
        </div>
        {programmer ? (
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Date et heure</span>
            <input
              type="datetime-local"
              className="input-field"
              style={{ width: 'auto', minWidth: 240 }}
              value={dateProgrammee}
              onChange={(e) => onDateProgrammee(e.target.value)}
            />
            <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
              La séance restera invisible aux élèves jusqu’à ce que vous l’ouvriez depuis son écran
              de suivi.
            </span>
          </label>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            La séance s’ouvre immédiatement : vos élèves rattachés la voient apparaître sur leur
            profil, sans code à saisir.
          </p>
        )}
      </div>
    </div>
  );
}

/** Ligne « libellé — valeur » du récapitulatif. */
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
