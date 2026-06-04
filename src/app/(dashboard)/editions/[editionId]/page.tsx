'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft, Plus, Trash2,
  HelpCircle, Swords, Coins, Star, Zap, Sparkles, FolderKanban, Upload,
} from 'lucide-react';
import { getEdition, saveEdition } from '@/lib/firestore-service';
import type { EditionData, Quiz, Duel, DuelOption, Funding, Opportunity, ChallengeEvent, DefaultProject } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import AIGenerateModal from '@/components/ui/AIGenerateModal';
import SectorSelectionModal from '@/components/ui/SectorSelectionModal';
import SaveStatusIndicator from '@/components/ui/SaveStatusIndicator';
import type { GenerationType } from '@/lib/ai-prompts';
import { generateId } from '@/lib/utils';
import { useAutoSave } from '@/hooks/useAutoSave';
import ImportContentModal, { type ImportedContent } from '@/components/ui/ImportContentModal';
import ImportEditionProjectsModal from '@/components/ui/ImportEditionProjectsModal';
import toast from 'react-hot-toast';

type Tab = 'general' | 'quiz' | 'duels' | 'fundings' | 'opportunities' | 'challenges' | 'projects';

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
  const aiContext = { editionName: data.name || editionId, sectors: data.sectors.join(', ') || 'multi-secteurs' };

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
            style={{ background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 style={{ fontFamily: "'Luckiest Guy', cursive", fontSize: 20, color: '#FFFFFF' }}>
              {isNew ? 'Nouvelle Edition' : data.name || editionId}
            </h2>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
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
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all"
            style={{
              background: activeTab === tab.key ? 'rgba(255,188,64,0.15)' : 'transparent',
              color: activeTab === tab.key ? '#FFBC40' : 'rgba(255,255,255,0.5)',
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
                background: 'rgba(255,255,255,0.1)',
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
            {isNew && (
              <div>
                <label className="label">Identifiant (slug)</label>
                <input
                  className="input-field"
                  placeholder="ex: agriculture, sante, culture..."
                  value={newId}
                  onChange={(e) => setNewId(e.target.value)}
                />
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                  Utilise comme cle unique. Pas d&apos;espaces, minuscules uniquement.
                </p>
              </div>
            )}
            <div>
              <label className="label">Nom de l&apos;edition</label>
              <input
                className="input-field"
                placeholder="Edition Agriculture & AgroTech"
                value={data.name}
                onChange={(e) => {
                  updateField('name', e.target.value);
                  // Auto-generer l'ID si nouveau et pas encore modifie manuellement
                  if (isNew) setNewId(slugify(e.target.value));
                }}
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input-field"
                placeholder="Decrivez cette edition..."
                value={data.description}
                onChange={(e) => updateField('description', e.target.value)}
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
              <label className="label">Secteurs (separes par des virgules)</label>
              <input
                className="input-field"
                placeholder="agritech, foodtech, greentech"
                value={data.sectors.join(', ')}
                onChange={(e) => updateField('sectors', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="label" style={{ marginBottom: 0 }}>Active</label>
              <button
                onClick={() => updateField('enabled', !data.enabled)}
                className="relative w-10 h-5 rounded-full transition-colors"
                style={{
                  background: data.enabled ? '#4CAF50' : 'rgba(255,255,255,0.15)',
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
          </div>
        )}

        {/* ===== QUIZ TAB ===== */}
        {activeTab === 'quiz' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
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
                <div key={q.id} className="p-4 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
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
                    <label className="label">Question</label>
                    <textarea
                      className="input-field"
                      value={q.question}
                      onChange={(e) => updateQuiz(i, 'question', e.target.value)}
                      rows={2}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="label">Options (une par ligne)</label>
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() => updateQuiz(i, 'correctAnswer', oi)}
                          className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
                          style={{
                            background: q.correctAnswer === oi ? '#4CAF50' : 'rgba(255,255,255,0.1)',
                            border: `2px solid ${q.correctAnswer === oi ? '#4CAF50' : 'rgba(255,255,255,0.2)'}`,
                            cursor: 'pointer',
                            color: '#fff',
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
                            const newOpts = [...q.options];
                            newOpts[oi] = e.target.value;
                            updateQuiz(i, 'options', newOpts);
                          }}
                          placeholder={`Option ${oi + 1}`}
                          style={{ fontSize: 13 }}
                        />
                      </div>
                    ))}
                    <button
                      onClick={() => updateQuiz(i, 'options', [...q.options, ''])}
                      className="flex items-center gap-1 mt-1"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40', fontSize: 12 }}
                    >
                      <Plus size={12} />
                      Ajouter une option
                    </button>
                  </div>
                  {/* Explanation */}
                  <div className="mb-3">
                    <label className="label">Explication (optionnel)</label>
                    <input
                      className="input-field"
                      value={q.explanation || ''}
                      onChange={(e) => updateQuiz(i, 'explanation', e.target.value)}
                      placeholder="Explication de la bonne reponse"
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
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                {data.duels.length} question{data.duels.length !== 1 ? 's' : ''} de duel
                <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
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
                <div key={d.id} className="p-4 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
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
                    <label className="label">Question</label>
                    <textarea
                      className="input-field"
                      value={d.question}
                      onChange={(e) => updateDuel(i, 'question', e.target.value)}
                      rows={2}
                      style={{ resize: 'vertical' }}
                      placeholder="Quelle est la meilleure strategie pour..."
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
                            background: opt.points === 30 ? 'rgba(76,175,80,0.2)' : opt.points === 20 ? 'rgba(255,188,64,0.2)' : 'rgba(255,255,255,0.1)',
                            color: opt.points === 30 ? '#4CAF50' : opt.points === 20 ? '#FFBC40' : 'rgba(255,255,255,0.5)',
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {opt.points}
                        </span>
                        <input
                          className="input-field flex-1"
                          value={opt.text}
                          onChange={(e) => updateDuelOption(i, oi, 'text', e.target.value)}
                          placeholder={opt.points === 30 ? 'Meilleure reponse (30 pts)' : opt.points === 20 ? 'Bonne reponse (20 pts)' : 'Reponse acceptable (10 pts)'}
                          style={{ fontSize: 13 }}
                        />
                        <input
                          type="number"
                          className="input-field"
                          value={opt.points}
                          onChange={(e) => updateDuelOption(i, oi, 'points', Number(e.target.value))}
                          style={{ width: 60, fontSize: 13, textAlign: 'center' as const }}
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
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
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
                <div key={f.id} className="p-4 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="badge badge-success">Funding #{i + 1}</span>
                    <button onClick={() => { setDeleteItemIndex(i); setDeleteSection('fundings'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mb-3">
                    <label className="label">Titre</label>
                    <input className="input-field" value={f.title} onChange={(e) => updateFunding(i, 'title', e.target.value)} placeholder="Levee de fonds Serie A" />
                  </div>
                  <div className="mb-3">
                    <label className="label">Description</label>
                    <textarea className="input-field" value={f.description} onChange={(e) => updateFunding(i, 'description', e.target.value)} rows={2} style={{ resize: 'vertical' }} />
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
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
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
                <div key={o.id} className="p-4 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="badge badge-primary">Opportunite #{i + 1}</span>
                    <button onClick={() => { setDeleteItemIndex(i); setDeleteSection('opportunities'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mb-3">
                    <label className="label">Titre</label>
                    <input className="input-field" value={o.title} onChange={(e) => updateOpportunity(i, 'title', e.target.value)} placeholder="Partenariat strategique" />
                  </div>
                  <div className="mb-3">
                    <label className="label">Description</label>
                    <textarea className="input-field" value={o.description} onChange={(e) => updateOpportunity(i, 'description', e.target.value)} rows={2} style={{ resize: 'vertical' }} placeholder="Gagnez X jetons grace a..." />
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
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
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
                <div key={c.id} className="p-4 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="badge" style={{ background: 'rgba(155,89,182,0.15)', color: '#9B59B6' }}>Challenge #{i + 1}</span>
                    <button onClick={() => { setDeleteItemIndex(i); setDeleteSection('challenges'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mb-3">
                    <label className="label">Titre</label>
                    <input className="input-field" value={c.title} onChange={(e) => updateChallenge(i, 'title', e.target.value)} placeholder="Probleme technique majeur" />
                  </div>
                  <div className="mb-3">
                    <label className="label">Description</label>
                    <textarea className="input-field" value={c.description} onChange={(e) => updateChallenge(i, 'description', e.target.value)} rows={2} style={{ resize: 'vertical' }} placeholder="Un obstacle se dresse... Perdez X jetons." />
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
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                  {(data.defaultProjects || []).length} projet{(data.defaultProjects || []).length !== 1 ? 's' : ''} par défaut
                </p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                  Ces projets sont proposés aux joueurs qui n&apos;ont pas de startup personnelle
                </p>
              </div>
              <div className="flex gap-2">
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
                <div key={p.id} className="p-4 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="badge" style={{ background: 'rgba(255,188,64,0.15)', color: '#FFBC40' }}>Projet #{i + 1}</span>
                    <button onClick={() => { setDeleteItemIndex(i); setDeleteSection('projects'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mb-3">
                    <label className="label">Nom de la startup</label>
                    <input className="input-field" value={p.name} onChange={(e) => updateDefaultProject(i, 'name', e.target.value)} placeholder="AgriSmart" />
                  </div>
                  <div className="mb-3">
                    <label className="label">Description (pitch)</label>
                    <textarea className="input-field" value={p.description} onChange={(e) => updateDefaultProject(i, 'description', e.target.value)} rows={2} style={{ resize: 'vertical' }} placeholder="Plateforme de digitalisation agricole..." />
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
                    <label className="label">Cible client</label>
                    <input className="input-field" value={p.target} onChange={(e) => updateDefaultProject(i, 'target', e.target.value)} placeholder="Agriculteurs, coopératives..." />
                  </div>
                  <div>
                    <label className="label">Mission / Vision</label>
                    <input className="input-field" value={p.mission} onChange={(e) => updateDefaultProject(i, 'mission', e.target.value)} placeholder="Améliorer les rendements agricoles..." />
                  </div>
                </div>
              ))}
            </div>
            {(data.defaultProjects || []).length === 0 && (
              <div className="text-center py-12" style={{ color: 'rgba(255,255,255,0.3)' }}>
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
