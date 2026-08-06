'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Plus, Trash2,
  HelpCircle, Swords, Coins, Star, Zap, Sparkles, FolderKanban, Upload, Languages,
} from 'lucide-react';
import { getEdition, saveEdition } from '@/lib/firestore-service';
import type { EditionData, Quiz, Duel, DuelOption, Funding, Opportunity, ChallengeEvent, DefaultProject } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ImageUploadField from '@/components/ui/ImageUploadField';
import SponsorCardListEditor from '@/components/ui/SponsorCardListEditor';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import AIGenerateModal from '@/components/ui/AIGenerateModal';
import SectorSelectionModal from '@/components/ui/SectorSelectionModal';
import SectorChecklist from '@/components/ui/SectorChecklist';
import SaveStatusIndicator from '@/components/ui/SaveStatusIndicator';
import type { GenerationType } from '@/lib/ai-prompts';
import { generateId } from '@/lib/utils';
import { useAutoSave } from '@/hooks/useAutoSave';
import ImportContentModal, { type ImportedContent } from '@/components/ui/ImportContentModal';
import ImportEditionProjectsModal from '@/components/ui/ImportEditionProjectsModal';
import LangTabs, { type ContentLang } from '@/components/events/LangTabs';
import toast from 'react-hot-toast';

type Tab = 'general' | 'quiz' | 'duels' | 'fundings' | 'opportunities' | 'challenges' | 'projects';

/** Sections traduisibles (tous les onglets de contenu, hors « general »). */
type TranslatableSection = Exclude<Tab, 'general'>;
const SECTION_LABELS: Record<TranslatableSection, string> = {
  quiz: 'Quiz',
  duels: 'Duels',
  fundings: 'Financements',
  opportunities: 'Opportunités',
  challenges: 'Défis',
  projects: 'Projets',
};

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'general', label: 'General', icon: null },
  { key: 'quiz', label: 'Quiz', icon: <HelpCircle size={14} /> },
  { key: 'duels', label: 'Duels', icon: <Swords size={14} /> },
  { key: 'fundings', label: 'Fundings', icon: <Coins size={14} /> },
  { key: 'opportunities', label: 'Opportunites', icon: <Star size={14} /> },
  { key: 'challenges', label: 'Challenges', icon: <Zap size={14} /> },
  { key: 'projects', label: 'Projets', icon: <FolderKanban size={14} /> },
];

const EMPTY_EDITION: Omit<EditionData, 'id'> = {
  name: '',
  description: '',
  icon: 'game-controller-outline',
  color: '#FFBC40',
  sectors: [],
  quizzes: [],
  duels: [],
  fundings: [],
  opportunities: [],
  challenges: [],
  defaultProjects: [],
  enabled: true,
};

export default function EditionEditorPage() {
  const router = useRouter();
  const params = useParams();
  const editionId = params.editionId as string;
  const isNew = editionId === 'new';

  const [data, setData] = useState<Omit<EditionData, 'id'>>(EMPTY_EDITION);
  const [newId, setNewId] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [loading, setLoading] = useState(!isNew);
  const [creating, setCreating] = useState(false);
  const [deleteItemIndex, setDeleteItemIndex] = useState<number | null>(null);
  const [deleteSection, setDeleteSection] = useState<Tab | null>(null);
  const [aiModalType, setAiModalType] = useState<GenerationType | null>(null);
  const [showSectorSelection, setShowSectorSelection] = useState(false);
  const [autoPrompt, setAutoPrompt] = useState<string | undefined>(undefined);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportProjectsModal, setShowImportProjectsModal] = useState(false);
  const [importFilter, setImportFilter] = useState<keyof ImportedContent | null>(null);
  const [translating, setTranslating] = useState(false);
  // Langue de consultation/édition du contenu : 'fr' = texte original, 'en' = traduction (translations.en)
  const [editLang, setEditLang] = useState<ContentLang>('fr');

  // Sauvegarde automatique : active uniquement sur une edition existante.
  // Pour une nouvelle edition, on garde l'etape de creation initiale (ID + nom).
  const persist = useCallback(
    (d: Omit<EditionData, 'id'>) => saveEdition(editionId, d),
    [editionId]
  );
  const { status: saveStatus, flush } = useAutoSave({
    data,
    save: persist,
    enabled: !isNew && !loading,
  });

  // AI generation context
  const aiContext = { edition: editionId, editionName: data.name || editionId, sectors: data.sectors.join(', ') || 'multi-secteurs' };

  // Map tab -> AI generation type
  const TAB_AI_TYPE: Partial<Record<Tab, GenerationType>> = {
    quiz: 'edition_quiz',
    duels: 'edition_duels',
    fundings: 'edition_fundings',
    opportunities: 'edition_opportunities',
    challenges: 'edition_challenges',
  };

  // Genere un slug a partir d'un nom (ex: "Édition Énergies Renouvelables" -> "energies-renouvelables")
  const slugify = (text: string) =>
    text.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/^edition-?/, ''); // remove "edition-" prefix

  const handleSectorsSelected = (selectedSectors: string[]) => {
    setShowSectorSelection(false);

    // Sauvegarder les secteurs sélectionnés immédiatement dans l'édition
    updateField('sectors', selectedSectors);

    const sectorsText = selectedSectors.join(', ');
    const prompt = `Génère une édition complète pour les secteurs suivants : ${sectorsText}.

Crée au minimum :
- 10 quiz variés et éducatifs
- 5 questions de duel (toutes avec 3 réponses valides mais points différents)
- 6 événements de financement réalistes
- 12 opportunités positives
- 8 challenges/obstacles
- 4 PROJETS PAR DÉFAUT (startups fictives cohérentes avec les secteurs)

Tous adaptés au contexte africain et aux secteurs choisis.

Pour les projets par défaut, chaque projet doit avoir :
- id (slug, ex: "fintech-mobile-money")
- name (nom de la startup)
- description (pitch court, 2-3 phrases)
- sector (un des secteurs sélectionnés : ${sectorsText})
- target (cible client)
- mission (mission/vision de la startup)
- initialBudget (optionnel, entre 50000-200000)`;
    setAutoPrompt(prompt);
    setAiModalType('edition_full');
  };

  const handleAIGenerated = (generated: unknown) => {
    if (!aiModalType) return;
    const items = Array.isArray(generated) ? generated : [];
    const withIds = items.map((item: Record<string, unknown>) => ({
      ...item,
      id: item.id || `${aiModalType.split('_')[1]}_ai_${generateId()}`,
    }));

    if (aiModalType === 'edition_quiz') {
      updateField('quizzes', [...data.quizzes, ...withIds as Quiz[]]);
      toast.success(`${withIds.length} quiz ajoutes`);
    } else if (aiModalType === 'edition_duels') {
      updateField('duels', [...data.duels, ...withIds as Duel[]]);
      toast.success(`${withIds.length} duels ajoutes`);
    } else if (aiModalType === 'edition_fundings') {
      updateField('fundings', [...data.fundings, ...withIds as Funding[]]);
      toast.success(`${withIds.length} fundings ajoutes`);
    } else if (aiModalType === 'edition_opportunities') {
      updateField('opportunities', [...data.opportunities, ...withIds as Opportunity[]]);
      toast.success(`${withIds.length} opportunites ajoutees`);
    } else if (aiModalType === 'edition_challenges') {
      updateField('challenges', [...data.challenges, ...withIds as ChallengeEvent[]]);
      toast.success(`${withIds.length} challenges ajoutes`);
    } else if (aiModalType === 'default_projects') {
      updateField('defaultProjects', [...(data.defaultProjects || []), ...withIds as DefaultProject[]]);
      toast.success(`${withIds.length} projet${withIds.length !== 1 ? 's' : ''} par défaut ajouté${withIds.length !== 1 ? 's' : ''}`);
    } else if (aiModalType === 'edition_full') {
      const gen = generated as Record<string, unknown>;
      if (gen.name) {
        updateField('name', gen.name as string);
        // Auto-generer l'ID depuis le nom si on est en mode creation
        if (isNew && !newId) {
          setNewId(slugify(gen.name as string));
        }
      }
      if (gen.description) updateField('description', gen.description as string);
      if (gen.icon) updateField('icon', gen.icon as string);
      if (gen.color) updateField('color', gen.color as string);
      if (gen.sectors) updateField('sectors', gen.sectors as string[]);
      if (gen.quizzes) updateField('quizzes', gen.quizzes as Quiz[]);
      if (gen.duels) updateField('duels', gen.duels as Duel[]);
      if (gen.fundings) updateField('fundings', gen.fundings as Funding[]);
      if (gen.opportunities) updateField('opportunities', gen.opportunities as Opportunity[]);
      if (gen.challenges) updateField('challenges', gen.challenges as ChallengeEvent[]);
      if (gen.defaultProjects) updateField('defaultProjects', gen.defaultProjects as DefaultProject[]);
      toast.success('Edition complete generee !');
    }
  };

  // Load existing edition
  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const edition = await getEdition(editionId);
        if (edition) {
          const { id, ...rest } = edition;
          setData(rest);
        } else {
          toast.error('Edition non trouvee');
          router.push('/editions');
        }
      } catch (error) {
        console.error('Load error:', error);
        toast.error('Erreur de chargement');
      } finally {
        setLoading(false);
      }
    })();
  }, [editionId, isNew, router]);

  // Creation initiale d'une nouvelle edition : on persiste une 1ere fois puis
  // on bascule vers l'URL avec l'ID, ou l'autosave prend le relais.
  const handleCreate = async () => {
    const id = newId.trim().toLowerCase().replace(/\s+/g, '-');
    if (!id) {
      toast.error('Veuillez entrer un identifiant');
      return;
    }
    if (!data.name.trim()) {
      toast.error('Veuillez entrer un nom');
      return;
    }

    setCreating(true);
    try {
      await saveEdition(id, data);
      toast.success('Edition creee !');
      router.push(`/editions/${id}`);
    } catch (error) {
      console.error('Create error:', error);
      toast.error('Erreur lors de la creation');
      setCreating(false);
    }
  };

  const updateField = <K extends keyof typeof data>(key: K, value: (typeof data)[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  // Sponsoring de l'édition (popup côté mobile) — valeurs par défaut si absent.
  const sponsor = data.sponsor ?? { enabled: false, name: '', imageUrl: '', logoUrl: '', linkUrl: '' };
  const updateSponsor = (patch: Partial<typeof sponsor>) =>
    updateField('sponsor', { ...sponsor, ...patch });

  // Persiste tout edit en attente avant de quitter la page.
  const handleNavigate = (path: string) => {
    if (!isNew) flush();
    router.push(path);
  };

  // ===== Quiz helpers =====
  const addQuiz = () => {
    updateField('quizzes', [...data.quizzes, {
      id: `quiz_${generateId()}`,
      question: '',
      options: ['', '', ''],
      correctAnswer: 0,
      category: 'business-model',
      difficulty: 'facile',
      explanation: '',
    }]);
  };

  const updateQuiz = (index: number, field: keyof Quiz, value: unknown) => {
    const updated = [...data.quizzes];
    updated[index] = { ...updated[index], [field]: value } as Quiz;
    updateField('quizzes', updated);
  };

  const removeQuiz = (index: number) => {
    updateField('quizzes', data.quizzes.filter((_, i) => i !== index));
    setDeleteItemIndex(null);
    setDeleteSection(null);
  };

  // ===== Helpers d'édition multilingue (FR = racine, EN = translations.en) =====
  const isEN = editLang === 'en';

  // --- Métadonnées de l'édition : name / description ---
  const edName = isEN ? data.translations?.en?.name ?? '' : data.name;
  const edDescription = isEN ? data.translations?.en?.description ?? '' : data.description;
  const setEdMeta = (field: 'name' | 'description', value: string) => {
    if (isEN) {
      setData((prev) => ({
        ...prev,
        translations: { ...(prev.translations ?? {}), en: { ...(prev.translations?.en ?? {}), [field]: value } },
      }));
    } else {
      updateField(field, value);
      if (field === 'name' && isNew) setNewId(slugify(value));
    }
  };

  // --- Quiz : question / options[] / explanation ---
  const quizQuestion = (q: Quiz) => (isEN ? q.translations?.en?.question ?? '' : q.question);
  const quizOptions = (q: Quiz): string[] => (isEN ? (q.translations?.en?.options ?? q.options.map(() => '')) : q.options);
  const quizExplanation = (q: Quiz) => (isEN ? q.translations?.en?.explanation ?? '' : q.explanation ?? '');
  const setQuizTr = (i: number, patch: Partial<{ question: string; options: string[]; explanation: string }>) => {
    if (!isEN) return;
    const q = data.quizzes[i];
    const en = { question: q.translations?.en?.question ?? '', options: q.translations?.en?.options ?? q.options.map(() => ''), explanation: q.translations?.en?.explanation ?? '', ...patch };
    updateQuiz(i, 'translations', { ...(q.translations ?? {}), en });
  };

  // --- Duel : question / options[].text ---
  const duelQuestion = (d: Duel) => (isEN ? d.translations?.en?.question ?? '' : d.question);
  const duelOptionText = (d: Duel, oi: number) => (isEN ? d.translations?.en?.options?.[oi] ?? '' : d.options?.[oi]?.text ?? '');
  const setDuelTr = (i: number, patch: Partial<{ question: string; options: string[] }>) => {
    if (!isEN) return;
    const d = data.duels[i];
    const en = { question: d.translations?.en?.question ?? '', options: d.translations?.en?.options ?? (d.options ?? []).map(() => ''), ...patch };
    updateDuel(i, 'translations', { ...(d.translations ?? {}), en });
  };
  const setDuelOptionTr = (i: number, oi: number, value: string) => {
    const d = data.duels[i];
    const opts = [...(d.translations?.en?.options ?? (d.options ?? []).map(() => ''))];
    opts[oi] = value;
    setDuelTr(i, { options: opts });
  };

  // --- Funding / Opportunity / Challenge : title / description ---
  const trTitle = (item: { title: string; translations?: { en?: { title?: string } } }) => (isEN ? item.translations?.en?.title ?? '' : item.title);
  const trDesc = (item: { description: string; translations?: { en?: { description?: string } } }) => (isEN ? item.translations?.en?.description ?? '' : item.description);
  const setTitleDescTr = (
    update: (i: number, field: 'translations', value: unknown) => void,
    item: { title: string; description: string; translations?: { en?: { title?: string; description?: string } } },
    i: number,
    patch: Partial<{ title: string; description: string }>
  ) => {
    if (!isEN) return;
    const en = { title: item.translations?.en?.title ?? '', description: item.translations?.en?.description ?? '', ...patch };
    update(i, 'translations', { ...(item.translations ?? {}), en });
  };

  // --- DefaultProject : name / description / target / mission ---
  type ProjField = 'name' | 'description' | 'target' | 'mission';
  const projField = (p: DefaultProject, field: ProjField) =>
    isEN ? p.translations?.en?.[field] ?? '' : p[field] ?? '';
  const setProjField = (p: DefaultProject, i: number, field: ProjField, value: string) => {
    if (isEN) {
      const en = { ...(p.translations?.en ?? {}), [field]: value };
      updateDefaultProject(i, 'translations', { ...(p.translations ?? {}), en });
    } else {
      updateDefaultProject(i, field, value);
    }
  };

  // ===== Traduction de toute l'édition (IA) =====
  /**
   * Traduit le contenu de l'édition vers `targetLang`.
   * @param section - Si fournie, ne traduit QUE cette section (onglet courant).
   *                  Sinon, traduit toute l'édition.
   */
  async function translateEdition(targetLang = 'en', section?: TranslatableSection) {
    setTranslating(true);
    try {
      // On n'envoie à l'API que les sections demandées (tout, ou une seule).
      const want = (s: TranslatableSection) => !section || section === s;
      const items: Record<string, unknown> = {};
      if (want('quiz')) items.quizzes = data.quizzes.map((q) => ({ id: q.id, question: q.question, options: q.options, explanation: q.explanation ?? '' }));
      if (want('duels')) items.duels = data.duels.map((d) => ({ id: d.id, question: d.question, options: d.options.map((o) => o.text) }));
      if (want('fundings')) items.fundings = data.fundings.map((f) => ({ id: f.id, title: f.title, description: f.description }));
      if (want('opportunities')) items.opportunities = data.opportunities.map((o) => ({ id: o.id, title: o.title, description: o.description }));
      if (want('challenges')) items.challengeEvents = data.challenges.map((c) => ({ id: c.id, title: c.title, description: c.description }));
      if (want('projects')) items.defaultProjects = (data.defaultProjects ?? []).map((p) => ({ id: p.id, name: p.name, description: p.description, target: p.target, mission: p.mission }));

      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetLang, items }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Traduction impossible');
      const t = json.translations as {
        quizzes?: { id: string; question: string; options: string[]; explanation?: string }[];
        duels?: { id: string; question: string; options: string[] }[];
        fundings?: { id: string; title: string; description: string }[];
        opportunities?: { id: string; title: string; description: string }[];
        challengeEvents?: { id: string; title: string; description: string }[];
        defaultProjects?: { id: string; name: string; description: string; target: string; mission: string }[];
      };
      const idx = <U extends { id: string }>(arr?: U[]) => new Map((arr ?? []).map((x) => [x.id, x]));
      const tq = idx(t.quizzes), td = idx(t.duels), tf = idx(t.fundings), to = idx(t.opportunities), tc = idx(t.challengeEvents), tp = idx(t.defaultProjects);

      // On ne remappe QUE les sections traduites ; les autres restent intactes.
      setData((prev) => ({
        ...prev,
        ...(want('quiz') && { quizzes: prev.quizzes.map((q) => { const r = tq.get(q.id); return r ? { ...q, translations: { ...(q.translations ?? {}), [targetLang]: { question: r.question, options: r.options, explanation: r.explanation } } } : q; }) }),
        ...(want('duels') && { duels: prev.duels.map((d) => { const r = td.get(d.id); return r ? { ...d, translations: { ...(d.translations ?? {}), [targetLang]: { question: r.question, options: r.options } } } : d; }) }),
        ...(want('fundings') && { fundings: prev.fundings.map((f) => { const r = tf.get(f.id); return r ? { ...f, translations: { ...(f.translations ?? {}), [targetLang]: { title: r.title, description: r.description } } } : f; }) }),
        ...(want('opportunities') && { opportunities: prev.opportunities.map((o) => { const r = to.get(o.id); return r ? { ...o, translations: { ...(o.translations ?? {}), [targetLang]: { title: r.title, description: r.description } } } : o; }) }),
        ...(want('challenges') && { challenges: prev.challenges.map((c) => { const r = tc.get(c.id); return r ? { ...c, translations: { ...(c.translations ?? {}), [targetLang]: { title: r.title, description: r.description } } } : c; }) }),
        ...(want('projects') && { defaultProjects: (prev.defaultProjects ?? []).map((p) => { const r = tp.get(p.id); return r ? { ...p, translations: { ...(p.translations ?? {}), [targetLang]: { name: r.name, description: r.description, target: r.target, mission: r.mission } } } : p; }) }),
      }));
      toast.success(section
        ? `Traduction anglaise générée pour la section « ${SECTION_LABELS[section]} ».`
        : 'Traduction anglaise générée pour toute l’édition.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur de traduction');
    } finally {
      setTranslating(false);
    }
  }

  // ===== Traduction des métadonnées de l'édition (onglet Général) =====
  /** Traduit le nom et la description de l'édition vers `targetLang` (stockés dans translations). */
  async function translateGeneral(targetLang = 'en') {
    if (!data.name && !data.description) {
      toast.error('Renseignez d’abord le nom et la description.');
      return;
    }
    setTranslating(true);
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetLang,
          items: { edition: { name: data.name, description: data.description } },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Traduction impossible');
      const ed = json.translations?.edition as { name?: string; description?: string } | undefined;
      if (!ed) throw new Error('Réponse de traduction invalide');
      setData((prev) => ({
        ...prev,
        translations: {
          ...(prev.translations ?? {}),
          [targetLang]: {
            ...(prev.translations?.[targetLang] ?? {}),
            name: ed.name ?? '',
            description: ed.description ?? '',
          },
        },
      }));
      toast.success('Traduction anglaise générée pour le nom et la description.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur de traduction');
    } finally {
      setTranslating(false);
    }
  }

  // ===== Duel helpers =====
  const addDuel = () => {
    updateField('duels', [...data.duels, {
      id: `duel_${generateId()}`,
      question: '',
      options: [
        { text: '', points: 30 },
        { text: '', points: 20 },
        { text: '', points: 10 },
      ],
      category: 'business',
    }]);
  };

  const updateDuel = (index: number, field: string, value: unknown) => {
    const updated = [...data.duels];
    updated[index] = { ...updated[index], [field]: value } as Duel;
    updateField('duels', updated);
  };

  const updateDuelOption = (duelIndex: number, optionIndex: number, field: keyof DuelOption, value: unknown) => {
    const updated = [...data.duels];
    const newOptions = [...updated[duelIndex].options];
    newOptions[optionIndex] = { ...newOptions[optionIndex], [field]: value } as DuelOption;
    updated[duelIndex] = { ...updated[duelIndex], options: newOptions };
    updateField('duels', updated);
  };

  const removeDuel = (index: number) => {
    updateField('duels', data.duels.filter((_, i) => i !== index));
    setDeleteItemIndex(null);
    setDeleteSection(null);
  };

  // ===== Funding helpers =====
  const addFunding = () => {
    updateField('fundings', [...data.fundings, {
      id: `fund_${generateId()}`,
      title: '',
      description: '',
      tokens: 3,
      source: '',
    }]);
  };

  const updateFunding = (index: number, field: keyof Funding, value: unknown) => {
    const updated = [...data.fundings];
    updated[index] = { ...updated[index], [field]: value } as Funding;
    updateField('fundings', updated);
  };

  const removeFunding = (index: number) => {
    updateField('fundings', data.fundings.filter((_, i) => i !== index));
    setDeleteItemIndex(null);
    setDeleteSection(null);
  };

  // ===== Opportunity helpers =====
  const addOpportunity = () => {
    updateField('opportunities', [...data.opportunities, {
      id: `opp_${generateId()}`,
      title: '',
      description: '',
      tokens: 3,
    }]);
  };

  const updateOpportunity = (index: number, field: keyof Opportunity, value: unknown) => {
    const updated = [...data.opportunities];
    updated[index] = { ...updated[index], [field]: value } as Opportunity;
    updateField('opportunities', updated);
  };

  const removeOpportunity = (index: number) => {
    updateField('opportunities', data.opportunities.filter((_, i) => i !== index));
    setDeleteItemIndex(null);
    setDeleteSection(null);
  };

  // ===== Challenge helpers =====
  const addChallenge = () => {
    updateField('challenges', [...data.challenges, {
      id: `ch_${generateId()}`,
      title: '',
      description: '',
      tokens: -3,
    }]);
  };

  const updateChallenge = (index: number, field: keyof ChallengeEvent, value: unknown) => {
    const updated = [...data.challenges];
    updated[index] = { ...updated[index], [field]: value } as ChallengeEvent;
    updateField('challenges', updated);
  };

  const removeChallenge = (index: number) => {
    updateField('challenges', data.challenges.filter((_, i) => i !== index));
    setDeleteItemIndex(null);
    setDeleteSection(null);
  };

  // ===== Default Project helpers =====
  const addDefaultProject = () => {
    updateField('defaultProjects', [...(data.defaultProjects || []), {
      id: `proj_${generateId()}`,
      name: '',
      description: '',
      sector: data.sectors?.[0] || '',
      target: '',
      mission: '',
    }]);
  };

  const updateDefaultProject = (index: number, field: keyof DefaultProject, value: unknown) => {
    const updated = [...(data.defaultProjects || [])];
    updated[index] = { ...updated[index], [field]: value } as DefaultProject;
    updateField('defaultProjects', updated);
  };

  const removeDefaultProject = (index: number) => {
    updateField('defaultProjects', (data.defaultProjects || []).filter((_, i) => i !== index));
    setDeleteItemIndex(null);
    setDeleteSection(null);
  };

  const handleImportContent = (imported: ImportedContent, mode: 'replace' | 'append') => {
    const merge = <T,>(existing: T[], incoming: T[]) =>
      mode === 'replace' ? incoming : [...existing, ...incoming];

    let count = 0;
    if (imported.quizzes.length > 0) {
      updateField('quizzes', merge(data.quizzes, imported.quizzes as Quiz[]));
      count += imported.quizzes.length;
    }
    if (imported.duels.length > 0) {
      updateField('duels', merge(data.duels, imported.duels as Duel[]));
      count += imported.duels.length;
    }
    if (imported.fundings.length > 0) {
      updateField('fundings', merge(data.fundings, imported.fundings as Funding[]));
      count += imported.fundings.length;
    }
    if (imported.opportunities.length > 0) {
      updateField('opportunities', merge(data.opportunities, imported.opportunities as Opportunity[]));
      count += imported.opportunities.length;
    }
    if (imported.challengeEvents.length > 0) {
      updateField('challenges', merge(data.challenges, imported.challengeEvents as ChallengeEvent[]));
      count += imported.challengeEvents.length;
    }
    setShowImportModal(false);
    toast.success(`${count} élément${count > 1 ? 's' : ''} importé${count > 1 ? 's' : ''} (${mode === 'append' ? 'ajouté' : 'remplacé'})`);
  };

  const handleImportProjects = (imported: DefaultProject[], mode: 'replace' | 'append') => {
    const next =
      mode === 'replace'
        ? imported
        : [...(data.defaultProjects || []), ...imported];
    updateField('defaultProjects', next);
    setShowImportProjectsModal(false);
    toast.success(
      `${imported.length} projet${imported.length > 1 ? 's' : ''} importé${imported.length > 1 ? 's' : ''} (${mode === 'append' ? 'ajouté' : 'remplacé'})`
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            className="p-2 rounded-lg transition-colors"
            onClick={() => handleNavigate('/editions')}
            style={{ background: 'var(--color-surface)', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 style={{ fontFamily: "'Luckiest Guy', cursive", fontSize: 20, color: 'var(--color-text-primary)' }}>
              {isNew ? 'Nouvelle Edition' : data.name || editionId}
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {isNew ? 'Creez une nouvelle edition' : `Modifier ${editionId}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-secondary flex items-center gap-1.5"
            onClick={() => { setImportFilter(null); setShowImportModal(true); }}
            style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.25)', color: '#FFBC40' }}
          >
            <Upload size={13} />
            Importer tout
          </button>
          {!isNew && activeTab !== 'general' && (
            <LangTabs lang={editLang} onChange={setEditLang} />
          )}
          {/* Traduire seulement la section active (onglet de contenu) */}
          {!isNew && activeTab !== 'general' && (
            <button
              className="btn-secondary flex items-center gap-1.5"
              onClick={() => translateEdition('en', activeTab as TranslatableSection)}
              disabled={translating}
              title={`Génère la version anglaise de la section « ${SECTION_LABELS[activeTab as TranslatableSection]} » uniquement`}
              style={{ fontSize: 12, padding: '6px 12px' }}
            >
              <Languages size={13} />
              {translating ? 'Traduction…' : `Traduire ${SECTION_LABELS[activeTab as TranslatableSection]}`}
            </button>
          )}
          {/* Traduire toute l'édition */}
          {!isNew && (
            <button
              className="btn-secondary flex items-center gap-1.5"
              onClick={() => translateEdition('en')}
              disabled={translating}
              title="Génère la version anglaise de TOUT le contenu de l'édition"
              style={{ fontSize: 12, padding: '6px 12px' }}
            >
              <Languages size={13} />
              {translating ? 'Traduction…' : 'Tout traduire'}
            </button>
          )}
          {isNew && (
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={() => setShowSectorSelection(true)}
              style={{ borderColor: 'rgba(255,188,64,0.3)', color: '#FFBC40' }}
            >
              <Sparkles size={14} />
              Generer avec l&apos;IA
            </button>
          )}
          {isNew ? (
            <button
              className="btn-primary flex items-center gap-2"
              onClick={handleCreate}
              disabled={creating}
            >
              <Plus size={16} />
              {creating ? 'Creation...' : 'Creer l’edition'}
            </button>
          ) : (
            <SaveStatusIndicator status={saveStatus} />
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--color-surface)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all"
            style={{
              background: activeTab === tab.key ? 'rgba(255,188,64,0.15)' : 'transparent',
              color: activeTab === tab.key ? '#FFBC40' : 'var(--color-text-muted)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 600 : 400,
            }}
          >
            {tab.icon}
            {tab.label}
            {tab.key !== 'general' && (
              <span style={{
                fontSize: 10,
                background: 'var(--color-surface-variant)',
                padding: '1px 6px',
                borderRadius: 8,
                marginLeft: 2,
              }}>
                {tab.key === 'quiz' ? data.quizzes.length :
                 tab.key === 'duels' ? data.duels.length :
                 tab.key === 'fundings' ? data.fundings.length :
                 tab.key === 'opportunities' ? data.opportunities.length :
                 tab.key === 'challenges' ? data.challenges.length :
                 tab.key === 'projects' ? (data.defaultProjects?.length || 0) :
                 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="glass-card p-6">
        {/* ===== GENERAL TAB ===== */}
        {activeTab === 'general' && (
          <div className="flex flex-col gap-5" style={{ maxWidth: 600 }}>
            {/* Langue d'édition + traduction IA du nom / description (édition existante) */}
            {!isNew && (
              <div className="flex items-center justify-between" style={{ gap: 12 }}>
                <LangTabs lang={editLang} onChange={setEditLang} />
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => translateGeneral('en')}
                  disabled={translating}
                  title="Génère la version anglaise du nom et de la description"
                  style={{ fontSize: 12, padding: '6px 12px' }}
                >
                  <Languages size={13} />
                  {translating ? 'Traduction…' : 'Traduire (IA)'}
                </button>
              </div>
            )}
            {isNew && (
              <div>
                <label className="label">Identifiant (slug)</label>
                <input
                  className="input-field"
                  placeholder="ex: agriculture, sante, culture..."
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                />
                <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                  Utilise comme cle unique. Pas d&apos;espaces, minuscules uniquement.
                </p>
              </div>
            )}
            <div>
              <label className="label">Nom de l&apos;edition{isEN ? ' (EN)' : ''}</label>
              <input
                className="input-field"
                placeholder={isEN ? 'Agriculture & AgroTech Edition' : 'Edition Agriculture & AgroTech'}
                value={edName}
                onChange={(e) => setEdMeta('name', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Description{isEN ? ' (EN)' : ''}</label>
              <textarea
                className="input-field"
                placeholder={isEN ? 'Describe this edition...' : 'Decrivez cette edition...'}
                value={edDescription}
                onChange={(e) => setEdMeta('description', e.target.value)}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="label">Icone (Ionicons)</label>
                <input
                  className="input-field"
                  placeholder="leaf-outline"
                  value={data.icon}
                  onChange={(e) => updateField('icon', e.target.value)}
                />
              </div>
              <div style={{ width: 120 }}>
                <label className="label">Couleur</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={data.color}
                    onChange={(e) => updateField('color', e.target.value)}
                    style={{ width: 36, height: 36, border: 'none', cursor: 'pointer', borderRadius: 8 }}
                  />
                  <input
                    className="input-field"
                    value={data.color}
                    onChange={(e) => updateField('color', e.target.value)}
                    style={{ width: 80, fontSize: 12 }}
                  />
                </div>
              </div>
            </div>
            <div>
              <SectorChecklist
                value={data.sectors}
                onChange={(sectors) => updateField('sectors', sectors)}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="label" style={{ marginBottom: 0 }}>Active</label>
              <button
                onClick={() => updateField('enabled', !data.enabled)}
                className="relative w-10 h-5 rounded-full transition-colors"
                style={{
                  background: data.enabled ? '#4CAF50' : 'var(--color-surface-variant)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                  style={{ left: data.enabled ? 22 : 2 }}
                />
              </button>
            </div>

            {/* ===== Sponsoring (popup côté mobile) ===== */}
            <div style={{ borderTop: '1px solid var(--color-card-border)', paddingTop: 18 }}>
              <div className="flex items-center gap-3">
                <label className="label" style={{ marginBottom: 0 }}>Édition sponsorisée</label>
                <button
                  onClick={() => updateSponsor({ enabled: !sponsor.enabled })}
                  className="relative w-10 h-5 rounded-full transition-colors"
                  style={{
                    background: sponsor.enabled ? '#4CAF50' : 'var(--color-surface-variant)',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                    style={{ left: sponsor.enabled ? 22 : 2 }}
                  />
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Affiche un popup au choix de l&apos;édition : badge « Sponsorisé », visuel,
                texte « Cette thématique est sponsorisée par… » et bouton JOUER.
              </p>

              {sponsor.enabled && (
                <div className="flex flex-col gap-4" style={{ marginTop: 14 }}>
                  <div>
                    <label className="label">Nom du sponsor</label>
                    <input
                      className="input-field"
                      placeholder="Mastercard Foundation"
                      value={sponsor.name}
                      onChange={(e) => updateSponsor({ name: e.target.value })}
                    />
                  </div>
                  <ImageUploadField
                    label="Visuel du popup (image plein cadre — format portrait conseillé)"
                    value={sponsor.imageUrl || ''}
                    onChange={(url) => updateSponsor({ imageUrl: url })}
                    storagePath={`editions/${isNew ? newId.trim() : editionId}/sponsor`}
                    aspectRatio="banner"
                    disabled={isNew && !newId.trim()}
                    disabledHint="Renseignez d'abord l'identifiant de l'édition."
                  />
                  <ImageUploadField
                    label="Logo du sponsor (encart « En partenariat avec » — optionnel)"
                    value={sponsor.logoUrl || ''}
                    onChange={(url) => updateSponsor({ logoUrl: url })}
                    storagePath={`editions/${isNew ? newId.trim() : editionId}/sponsor-logo`}
                    aspectRatio="square"
                    disabled={isNew && !newId.trim()}
                    disabledHint="Renseignez d'abord l'identifiant de l'édition."
                  />
                  <div>
                    <label className="label">Lien « en savoir plus » (optionnel)</label>
                    <input
                      className="input-field"
                      placeholder="https://www.mastercardfdn.org/..."
                      value={sponsor.linkUrl || ''}
                      onChange={(e) => updateSponsor({ linkUrl: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label">Description (écran « en savoir plus » — optionnel)</label>
                    <textarea
                      className="input-field"
                      rows={5}
                      placeholder="Présentation du sponsor et de la thématique, affichée quand le joueur appuie sur EN SAVOIR PLUS…"
                      value={sponsor.description || ''}
                      onChange={(e) => updateSponsor({ description: e.target.value })}
                    />
                  </div>

                  {/* Cartes d'événements sponsor injectées en partie (~25 % de chance
                      sur les cases opportunité/financement côté mobile) */}
                  <div style={{ borderTop: '1px dashed var(--color-card-border)', paddingTop: 14 }}>
                    <SponsorCardListEditor
                      title="Opportunités sponsor"
                      hint="Tirées à la place d'une opportunité classique (~1 fois sur 4). Logo propre à chaque carte (ex. DER)."
                      cards={sponsor.opportunities ?? []}
                      onChange={(cards) => updateSponsor({ opportunities: cards })}
                      storagePathBase={`editions/${isNew ? newId.trim() : editionId}/sponsor-opp`}
                      defaultTokens={2}
                      disabled={isNew && !newId.trim()}
                      disabledHint="Renseignez d'abord l'identifiant de l'édition."
                    />
                  </div>
                  <SponsorCardListEditor
                    title="Financements sponsor"
                    hint="Tirés à la place d'un financement classique (~1 fois sur 4). Logo propre à chaque carte (ex. Orange Bank)."
                    cards={sponsor.fundings ?? []}
                    onChange={(cards) => updateSponsor({ fundings: cards })}
                    storagePathBase={`editions/${isNew ? newId.trim() : editionId}/sponsor-fund`}
                    defaultTokens={4}
                    disabled={isNew && !newId.trim()}
                    disabledHint="Renseignez d'abord l'identifiant de l'édition."
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== QUIZ TAB ===== */}
        {activeTab === 'quiz' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {data.quizzes.length} question{data.quizzes.length !== 1 ? 's' : ''} de quiz
              </p>
              <div className="flex gap-2">
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => { setImportFilter('quizzes'); setShowImportModal(true); }}
                  style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.25)', color: '#FFBC40' }}
                >
                  <Upload size={13} />
                  Importer
                </button>
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => setAiModalType('edition_quiz')}
                  style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.3)', color: '#FFBC40' }}
                >
                  <Sparkles size={13} />
                  IA
                </button>
                <button className="btn-primary flex items-center gap-2" onClick={addQuiz} style={{ fontSize: 13, padding: '8px 16px' }}>
                  <Plus size={14} />
                  Ajouter
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {data.quizzes.map((q, i) => (
                <div key={q.id} className="p-4 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="badge badge-info">Quiz #{i + 1}</span>
                    <button
                      onClick={() => { setDeleteItemIndex(i); setDeleteSection('quiz'); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mb-3">
                    <label className="label">Question{isEN ? ' (EN)' : ''}</label>
                    <textarea
                      className="input-field"
                      value={quizQuestion(q)}
                      onChange={(e) => isEN ? setQuizTr(i, { question: e.target.value }) : updateQuiz(i, 'question', e.target.value)}
                      rows={2}
                      style={{ resize: 'vertical' }}
                      placeholder={isEN ? 'Traduction anglaise…' : undefined}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="label">Options{isEN ? ' (EN)' : ''}</label>
                    {quizOptions(q).map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() => updateQuiz(i, 'correctAnswer', oi)}
                          className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
                          style={{
                            background: q.correctAnswer === oi ? '#4CAF50' : 'var(--color-surface-variant)',
                            border: `2px solid ${q.correctAnswer === oi ? '#4CAF50' : 'var(--color-card-border)'}`,
                            cursor: 'pointer',
                            color: q.correctAnswer === oi ? '#fff' : 'var(--color-text-secondary)',
                            fontSize: 10,
                            fontWeight: 700,
                          }}
                          title={q.correctAnswer === oi ? 'Bonne reponse' : 'Definir comme bonne reponse'}
                        >
                          {q.correctAnswer === oi ? '✓' : oi + 1}
                        </button>
                        <input
                          className="input-field flex-1"
                          value={opt}
                          onChange={(e) => {
                            if (isEN) {
                              const newOpts = [...quizOptions(q)];
                              newOpts[oi] = e.target.value;
                              setQuizTr(i, { options: newOpts });
                            } else {
                              const newOpts = [...q.options];
                              newOpts[oi] = e.target.value;
                              updateQuiz(i, 'options', newOpts);
                            }
                          }}
                          placeholder={isEN ? `Option ${oi + 1} (EN)` : `Option ${oi + 1}`}
                          style={{ fontSize: 13 }}
                        />
                      </div>
                    ))}
                    {!isEN && (
                      <button
                        onClick={() => updateQuiz(i, 'options', [...q.options, ''])}
                        className="flex items-center gap-1 mt-1"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40', fontSize: 12 }}
                      >
                        <Plus size={12} />
                        Ajouter une option
                      </button>
                    )}
                  </div>
                  {/* Explanation */}
                  <div className="mb-3">
                    <label className="label">Explication (optionnel){isEN ? ' (EN)' : ''}</label>
                    <input
                      className="input-field"
                      value={quizExplanation(q)}
                      onChange={(e) => isEN ? setQuizTr(i, { explanation: e.target.value }) : updateQuiz(i, 'explanation', e.target.value)}
                      placeholder={isEN ? 'Traduction de l’explication…' : 'Explication de la bonne reponse'}
                      style={{ fontSize: 13 }}
                    />
                  </div>
                  {/* Reward / Penalty / Time */}
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="label">Recompense (tokens, opt.)</label>
                      <input
                        type="number"
                        className="input-field"
                        value={q.rewardTokens ?? ''}
                        onChange={(e) => updateQuiz(i, 'rewardTokens', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="3"
                        style={{ fontSize: 13 }}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="label">Penalite (tokens, opt.)</label>
                      <input
                        type="number"
                        className="input-field"
                        value={q.penaltyTokens ?? ''}
                        onChange={(e) => updateQuiz(i, 'penaltyTokens', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="-1"
                        style={{ fontSize: 13 }}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="label">Temps (sec, opt.)</label>
                      <input
                        type="number"
                        className="input-field"
                        value={q.timeLimit ?? ''}
                        onChange={(e) => updateQuiz(i, 'timeLimit', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="30"
                        style={{ fontSize: 13 }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== DUELS TAB ===== */}
        {activeTab === 'duels' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {data.duels.length} question{data.duels.length !== 1 ? 's' : ''} de duel
                <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
                  (3 questions par duel, chaque reponse vaut 30, 20 ou 10 pts)
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => { setImportFilter('duels'); setShowImportModal(true); }}
                  style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.25)', color: '#FFBC40' }}
                >
                  <Upload size={13} />
                  Importer
                </button>
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => setAiModalType('edition_duels')}
                  style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.3)', color: '#FFBC40' }}
                >
                  <Sparkles size={13} />
                  IA
                </button>
                <button className="btn-primary flex items-center gap-2" onClick={addDuel} style={{ fontSize: 13, padding: '8px 16px' }}>
                  <Plus size={14} />
                  Ajouter
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {data.duels.map((d, i) => (
                <div key={d.id} className="p-4 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="badge" style={{ background: 'rgba(255,107,107,0.15)', color: '#FF6B6B' }}>Duel Q{i + 1}</span>
                    <button
                      onClick={() => { setDeleteItemIndex(i); setDeleteSection('duels'); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mb-3">
                    <label className="label">Question{isEN ? ' (EN)' : ''}</label>
                    <textarea
                      className="input-field"
                      value={duelQuestion(d)}
                      onChange={(e) => isEN ? setDuelTr(i, { question: e.target.value }) : updateDuel(i, 'question', e.target.value)}
                      rows={2}
                      style={{ resize: 'vertical' }}
                      placeholder={isEN ? 'Traduction anglaise…' : 'Quelle est la meilleure strategie pour...'}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="label">Categorie</label>
                    <input
                      className="input-field"
                      value={d.category}
                      onChange={(e) => updateDuel(i, 'category', e.target.value)}
                      placeholder="business, financement, pitch, marketing..."
                      style={{ fontSize: 13 }}
                    />
                  </div>
                  {/* 3 Options avec points */}
                  <div>
                    <label className="label">Reponses (toutes valides, points differents)</label>
                    {(d.options || []).map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2 mb-2">
                        <span
                          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
                          style={{
                            background: opt.points === 30 ? 'rgba(76,175,80,0.2)' : opt.points === 20 ? 'rgba(255,188,64,0.2)' : 'var(--color-surface-variant)',
                            color: opt.points === 30 ? '#4CAF50' : opt.points === 20 ? '#FFBC40' : 'var(--color-text-secondary)',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {opt.points}
                        </span>
                        <input
                          className="input-field flex-1"
                          value={isEN ? duelOptionText(d, oi) : opt.text}
                          onChange={(e) => isEN ? setDuelOptionTr(i, oi, e.target.value) : updateDuelOption(i, oi, 'text', e.target.value)}
                          placeholder={isEN ? `Reponse ${oi + 1} (EN)` : (opt.points === 30 ? 'Meilleure reponse (30 pts)' : opt.points === 20 ? 'Bonne reponse (20 pts)' : 'Reponse acceptable (10 pts)')}
                          style={{ fontSize: 13 }}
                        />
                        <input
                          type="number"
                          className="input-field"
                          value={opt.points}
                          onChange={(e) => updateDuelOption(i, oi, 'points', Number(e.target.value))}
                          disabled={isEN}
                          style={{ width: 60, fontSize: 13, textAlign: 'center' as const, opacity: isEN ? 0.4 : 1 }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== FUNDINGS TAB ===== */}
        {activeTab === 'fundings' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {data.fundings.length} evenement{data.fundings.length !== 1 ? 's' : ''} de financement
              </p>
              <div className="flex gap-2">
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => { setImportFilter('fundings'); setShowImportModal(true); }}
                  style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.25)', color: '#FFBC40' }}
                >
                  <Upload size={13} />
                  Importer
                </button>
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => setAiModalType('edition_fundings')}
                  style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.3)', color: '#FFBC40' }}
                >
                  <Sparkles size={13} />
                  IA
                </button>
                <button className="btn-primary flex items-center gap-2" onClick={addFunding} style={{ fontSize: 13, padding: '8px 16px' }}>
                  <Plus size={14} />
                  Ajouter
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {data.fundings.map((f, i) => (
                <div key={f.id} className="p-4 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="badge badge-success">Funding #{i + 1}</span>
                    <button onClick={() => { setDeleteItemIndex(i); setDeleteSection('fundings'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mb-3">
                    <label className="label">Titre{isEN ? ' (EN)' : ''}</label>
                    <input className="input-field" value={trTitle(f)} onChange={(e) => isEN ? setTitleDescTr(updateFunding, f, i, { title: e.target.value }) : updateFunding(i, 'title', e.target.value)} placeholder={isEN ? 'Traduction du titre…' : 'Levee de fonds Serie A'} />
                  </div>
                  <div className="mb-3">
                    <label className="label">Description{isEN ? ' (EN)' : ''}</label>
                    <textarea className="input-field" value={trDesc(f)} onChange={(e) => isEN ? setTitleDescTr(updateFunding, f, i, { description: e.target.value }) : updateFunding(i, 'description', e.target.value)} rows={2} style={{ resize: 'vertical' }} placeholder={isEN ? 'Traduction de la description…' : undefined} />
                  </div>
                  <div className="flex gap-4">
                    <div style={{ width: 120 }}>
                      <label className="label">Tokens</label>
                      <input type="number" className="input-field" value={f.tokens} onChange={(e) => updateFunding(i, 'tokens', Number(e.target.value))} />
                    </div>
                    <div className="flex-1">
                      <label className="label">Source (optionnel)</label>
                      <input className="input-field" value={f.source || ''} onChange={(e) => updateFunding(i, 'source', e.target.value)} placeholder="Tontine, Microcredit, Investisseur..." style={{ fontSize: 13 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== OPPORTUNITIES TAB ===== */}
        {activeTab === 'opportunities' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {data.opportunities.length} opportunite{data.opportunities.length !== 1 ? 's' : ''}
              </p>
              <div className="flex gap-2">
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => { setImportFilter('opportunities'); setShowImportModal(true); }}
                  style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.25)', color: '#FFBC40' }}
                >
                  <Upload size={13} />
                  Importer
                </button>
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => setAiModalType('edition_opportunities')}
                  style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.3)', color: '#FFBC40' }}
                >
                  <Sparkles size={13} />
                  IA
                </button>
                <button className="btn-primary flex items-center gap-2" onClick={addOpportunity} style={{ fontSize: 13, padding: '8px 16px' }}>
                  <Plus size={14} />
                  Ajouter
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {data.opportunities.map((o, i) => (
                <div key={o.id} className="p-4 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="badge badge-primary">Opportunite #{i + 1}</span>
                    <button onClick={() => { setDeleteItemIndex(i); setDeleteSection('opportunities'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mb-3">
                    <label className="label">Titre{isEN ? ' (EN)' : ''}</label>
                    <input className="input-field" value={trTitle(o)} onChange={(e) => isEN ? setTitleDescTr(updateOpportunity, o, i, { title: e.target.value }) : updateOpportunity(i, 'title', e.target.value)} placeholder={isEN ? 'Traduction du titre…' : 'Partenariat strategique'} />
                  </div>
                  <div className="mb-3">
                    <label className="label">Description{isEN ? ' (EN)' : ''}</label>
                    <textarea className="input-field" value={trDesc(o)} onChange={(e) => isEN ? setTitleDescTr(updateOpportunity, o, i, { description: e.target.value }) : updateOpportunity(i, 'description', e.target.value)} rows={2} style={{ resize: 'vertical' }} placeholder={isEN ? 'Traduction de la description…' : 'Gagnez X jetons grace a...'} />
                  </div>
                  <div style={{ width: 120 }}>
                    <label className="label">Tokens (positif)</label>
                    <input type="number" className="input-field" value={o.tokens} onChange={(e) => updateOpportunity(i, 'tokens', Number(e.target.value))} min={0} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== CHALLENGES TAB ===== */}
        {activeTab === 'challenges' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {data.challenges.length} challenge{data.challenges.length !== 1 ? 's' : ''} en jeu
              </p>
              <div className="flex gap-2">
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => { setImportFilter('challengeEvents'); setShowImportModal(true); }}
                  style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.25)', color: '#FFBC40' }}
                >
                  <Upload size={13} />
                  Importer
                </button>
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => setAiModalType('edition_challenges')}
                  style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.3)', color: '#FFBC40' }}
                >
                  <Sparkles size={13} />
                  IA
                </button>
                <button className="btn-primary flex items-center gap-2" onClick={addChallenge} style={{ fontSize: 13, padding: '8px 16px' }}>
                  <Plus size={14} />
                  Ajouter
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {data.challenges.map((c, i) => (
                <div key={c.id} className="p-4 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="badge" style={{ background: 'rgba(155,89,182,0.15)', color: '#9B59B6' }}>Challenge #{i + 1}</span>
                    <button onClick={() => { setDeleteItemIndex(i); setDeleteSection('challenges'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mb-3">
                    <label className="label">Titre{isEN ? ' (EN)' : ''}</label>
                    <input className="input-field" value={trTitle(c)} onChange={(e) => isEN ? setTitleDescTr(updateChallenge, c, i, { title: e.target.value }) : updateChallenge(i, 'title', e.target.value)} placeholder={isEN ? 'Traduction du titre…' : 'Probleme technique majeur'} />
                  </div>
                  <div className="mb-3">
                    <label className="label">Description{isEN ? ' (EN)' : ''}</label>
                    <textarea className="input-field" value={trDesc(c)} onChange={(e) => isEN ? setTitleDescTr(updateChallenge, c, i, { description: e.target.value }) : updateChallenge(i, 'description', e.target.value)} rows={2} style={{ resize: 'vertical' }} placeholder={isEN ? 'Traduction de la description…' : 'Un obstacle se dresse... Perdez X jetons.'} />
                  </div>
                  <div style={{ width: 140 }}>
                    <label className="label">Tokens (negatif)</label>
                    <input type="number" className="input-field" value={c.tokens} onChange={(e) => updateChallenge(i, 'tokens', Number(e.target.value))} max={0} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== PROJECTS TAB ===== */}
        {activeTab === 'projects' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  {(data.defaultProjects || []).length} projet{(data.defaultProjects || []).length !== 1 ? 's' : ''} par défaut
                </p>
                <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                  Ces projets sont proposés aux joueurs qui n&apos;ont pas de startup personnelle
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => setAiModalType('default_projects')}
                  style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(124,108,255,0.35)', color: '#9B8CFF' }}
                >
                  <Sparkles size={13} />
                  Générer (IA)
                </button>
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => setShowImportProjectsModal(true)}
                  style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.25)', color: '#FFBC40' }}
                >
                  <Upload size={13} />
                  Importer
                </button>
                <button className="btn-primary flex items-center gap-2" onClick={addDefaultProject} style={{ fontSize: 13, padding: '8px 16px' }}>
                  <Plus size={14} />
                  Ajouter
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(data.defaultProjects || []).map((p, i) => (
                <div key={p.id} className="p-4 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="badge" style={{ background: 'rgba(255,188,64,0.15)', color: '#FFBC40' }}>Projet #{i + 1}</span>
                    <button onClick={() => { setDeleteItemIndex(i); setDeleteSection('projects'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mb-3">
                    <label className="label">Nom de la startup{isEN ? ' (EN)' : ''}</label>
                    <input className="input-field" value={projField(p, 'name')} onChange={(e) => setProjField(p, i, 'name', e.target.value)} placeholder={isEN ? 'AgriSmart (English)' : 'AgriSmart'} />
                  </div>
                  <div className="mb-3">
                    <label className="label">Description (pitch){isEN ? ' (EN)' : ''}</label>
                    <textarea className="input-field" value={projField(p, 'description')} onChange={(e) => setProjField(p, i, 'description', e.target.value)} rows={2} style={{ resize: 'vertical' }} placeholder="Plateforme de digitalisation agricole..." />
                  </div>
                  <div className="flex gap-3 mb-3">
                    <div className="flex-1">
                      <label className="label">Secteur</label>
                      <select className="input-field" value={p.sector} onChange={(e) => updateDefaultProject(i, 'sector', e.target.value)}>
                        <option value="">Choisir...</option>
                        {(data.sectors || []).map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="label">Budget initial</label>
                      <input type="number" className="input-field" value={p.initialBudget || ''} onChange={(e) => updateDefaultProject(i, 'initialBudget', e.target.value ? Number(e.target.value) : undefined)} placeholder="100000" />
                    </div>
                  </div>
                  <div className="mb-3">
                    <label className="label">Cible client{isEN ? ' (EN)' : ''}</label>
                    <input className="input-field" value={projField(p, 'target')} onChange={(e) => setProjField(p, i, 'target', e.target.value)} placeholder="Agriculteurs, coopératives..." />
                  </div>
                  <div>
                    <label className="label">Mission / Vision{isEN ? ' (EN)' : ''}</label>
                    <input className="input-field" value={projField(p, 'mission')} onChange={(e) => setProjField(p, i, 'mission', e.target.value)} placeholder="Améliorer les rendements agricoles..." />
                  </div>
                </div>
              ))}
            </div>
            {(data.defaultProjects || []).length === 0 && (
              <div className="text-center py-12" style={{ color: 'var(--color-text-muted)' }}>
                <FolderKanban size={40} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
                <p style={{ fontSize: 14 }}>Aucun projet par défaut</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>Générez une édition avec l&apos;IA, importez un texte ou ajoutez manuellement</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Import Content Modal */}
      {showImportModal && (
        <ImportContentModal
          subLevelTitle={data.name || editionId}
          importFilter={importFilter ?? undefined}
          onImport={handleImportContent}
          onClose={() => { setShowImportModal(false); setImportFilter(null); }}
        />
      )}

      {showImportProjectsModal && (
        <ImportEditionProjectsModal
          editionName={data.name || editionId}
          sectors={data.sectors || []}
          onImport={handleImportProjects}
          onClose={() => setShowImportProjectsModal(false)}
        />
      )}

      {/* Sector Selection Modal */}
      <SectorSelectionModal
        open={showSectorSelection}
        onClose={() => setShowSectorSelection(false)}
        onConfirm={handleSectorsSelected}
      />

      {/* AI Generate Modal */}
      <AIGenerateModal
        open={!!aiModalType}
        onClose={() => {
          setAiModalType(null);
          setAutoPrompt(undefined);
        }}
        type={aiModalType || 'edition_quiz'}
        context={aiContext}
        onGenerated={handleAIGenerated}
        autoPrompt={autoPrompt}
      />

      {/* Delete item confirm */}
      <ConfirmDialog
        open={deleteItemIndex !== null}
        onClose={() => { setDeleteItemIndex(null); setDeleteSection(null); }}
        onConfirm={() => {
          if (deleteItemIndex === null || !deleteSection) return;
          if (deleteSection === 'quiz') removeQuiz(deleteItemIndex);
          else if (deleteSection === 'duels') removeDuel(deleteItemIndex);
          else if (deleteSection === 'fundings') removeFunding(deleteItemIndex);
          else if (deleteSection === 'opportunities') removeOpportunity(deleteItemIndex);
          else if (deleteSection === 'challenges') removeChallenge(deleteItemIndex);
          else if (deleteSection === 'projects') removeDefaultProject(deleteItemIndex);
        }}
        title="Supprimer cet element"
        message="Etes-vous sur de vouloir supprimer cet element ? Cette action est irreversible."
        confirmLabel="Supprimer"
        danger
      />
    </div>
  );
}
