'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, ChevronDown, ChevronRight, Layers, Target, Sparkles, BookOpen, X, Edit, Upload } from 'lucide-react';
import { getChallengeProgram, saveChallengeProgram } from '@/lib/firestore-service';
import type { ChallengeProgram, ChallengeLevel, ChallengeSubLevel, ChallengeSector, CardCategory, Quiz, Duel, Funding, Opportunity, ChallengeEvent } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ImageUploadField from '@/components/ui/ImageUploadField';
import AIGenerateModal from '@/components/ui/AIGenerateModal';
import SaveStatusIndicator from '@/components/ui/SaveStatusIndicator';
import QuizEditor from '@/components/events/QuizEditor';
import DuelEditor from '@/components/events/DuelEditor';
import FundingEditor from '@/components/events/FundingEditor';
import OpportunityEditor from '@/components/events/OpportunityEditor';
import ChallengeEventEditor from '@/components/events/ChallengeEventEditor';
import ImportContentModal, { type ImportedContent } from '@/components/ui/ImportContentModal';
import type { GenerationType } from '@/lib/ai-prompts';
import { generateId } from '@/lib/utils';
import { useAutoSave } from '@/hooks/useAutoSave';
import toast from 'react-hot-toast';

type Tab = 'general' | 'levels' | 'sectors';

const ALL_CARD_CATEGORIES: { id: CardCategory; label: string; color: string }[] = [
  { id: 'quiz', label: 'Quiz', color: '#2196F3' },
  { id: 'duel', label: 'Duel', color: '#9C27B0' },
  { id: 'opportunity', label: 'Opportunite', color: '#4CAF50' },
  { id: 'funding', label: 'Financement', color: '#FF9800' },
  { id: 'challenge', label: 'Defi', color: '#F44336' },
];

const EMPTY_SUBLEVEL: Omit<ChallengeSubLevel, 'id' | 'order'> = {
  title: '', description: '', deliverables: [], xpReward: 50,
  cardCategories: ['quiz', 'opportunity'],
  quizzes: [], duels: [], fundings: [], opportunities: [], challengeEvents: [],
};

type ContentTab = 'quizzes' | 'duels' | 'fundings' | 'opportunities' | 'challengeEvents';

export default function ChallengeEditorPage() {
  const router = useRouter();
  const params = useParams();
  const programId = params.programId as string;
  const isNew = programId === 'new';

  const [data, setData] = useState<Omit<ChallengeProgram, 'id'>>({
    name: '', description: '', logoUrl: '', bannerUrl: '', levels: [], sectors: [], enabled: true,
  });
  const [newId, setNewId] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [loading, setLoading] = useState(!isNew);
  const [creating, setCreating] = useState(false);
  const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set());
  const [aiModalType, setAiModalType] = useState<GenerationType | null>(null);
  const [aiAutoPrompt, setAiAutoPrompt] = useState<string | undefined>(undefined);
  const [showBriefingForm, setShowBriefingForm] = useState(false);
  const [briefing, setBriefing] = useState({
    programName: '', organization: '', thematic: '', description: '',
    levelCount: 4, subLevelCount: 4, sectorCount: 4,
    targetAudience: 'Jeunes entrepreneurs africains',
  });

  // Content generation target (which sub-level)
  const [contentTarget, setContentTarget] = useState<{ levelIdx: number; subIdx: number } | null>(null);
  // Content detail modal
  const [contentModal, setContentModal] = useState<{ levelIdx: number; subIdx: number } | null>(null);
  const [contentTab, setContentTab] = useState<ContentTab>('quizzes');
  // Event editors
  const [editingQuiz, setEditingQuiz] = useState<{ quiz: Quiz | null; index: number | null }>({ quiz: null, index: null });
  const [editingDuel, setEditingDuel] = useState<{ duel: Duel | null; index: number | null }>({ duel: null, index: null });
  const [editingFunding, setEditingFunding] = useState<{ funding: Funding | null; index: number | null }>({ funding: null, index: null });
  const [editingOpportunity, setEditingOpportunity] = useState<{ opportunity: Opportunity | null; index: number | null }>({ opportunity: null, index: null });
  const [editingChallengeEvent, setEditingChallengeEvent] = useState<{ challengeEvent: ChallengeEvent | null; index: number | null }>({ challengeEvent: null, index: null });
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFilterOverride, setImportFilterOverride] = useState<ContentTab | undefined>(undefined);
  // Sector filter for content generation & display
  const [activeSectorId, setActiveSectorId] = useState<string>('');

  const aiContext = (() => {
    if (aiModalType === 'challenge_full') return { ...briefing };
    if (aiModalType === 'sublevel_content' && contentTarget) {
      const level = data.levels[contentTarget.levelIdx];
      const sub = level?.subLevels[contentTarget.subIdx];
      const sector = activeSectorId ? data.sectors.find(s => s.id === activeSectorId) : null;
      return {
        programName: data.name || programId,
        programDescription: data.description,
        levelTitle: level?.title || '',
        levelDescription: level?.description || '',
        subLevelTitle: sub?.title || '',
        subLevelDescription: sub?.description || '',
        cardCategories: sub?.cardCategories || ['quiz'],
        ...(sector ? { sectorName: sector.name, sectorDescription: sector.description } : {}),
      };
    }
    return { programName: data.name || programId };
  })();

  const handleAIGenerated = (generated: unknown) => {
    if (!aiModalType) return;

    if (aiModalType === 'challenge_full') {
      const gen = generated as Record<string, unknown>;
      const levels = Array.isArray(gen.levels)
        ? (gen.levels as Record<string, unknown>[]).map((item, idx) => ({
            ...item,
            id: (item.id as string) || `lvl_${generateId()}`,
            title: (item.title as string) || `Niveau ${idx + 1}`,
            description: (item.description as string) || '',
            order: (item.order as number) ?? idx,
            subLevels: Array.isArray(item.subLevels)
              ? (item.subLevels as Record<string, unknown>[]).map((sub, sIdx) => ({
                  ...EMPTY_SUBLEVEL,
                  ...sub,
                  id: (sub.id as string) || `sub_${generateId()}`,
                  title: (sub.title as string) || `Sous-niveau ${sIdx + 1}`,
                  description: (sub.description as string) || '',
                  order: (sub.order as number) ?? sIdx,
                  cardCategories: Array.isArray(sub.cardCategories) ? sub.cardCategories : ['quiz', 'opportunity'],
                  quizzes: [], duels: [], fundings: [], opportunities: [], challengeEvents: [],
                }))
              : [],
          }))
        : [];
      const sectors = Array.isArray(gen.sectors)
        ? (gen.sectors as Record<string, unknown>[]).map((item) => ({
            ...item,
            id: (item.id as string) || `sec_${generateId()}`,
            name: (item.name as string) || '',
            description: (item.description as string) || '',
            icon: (item.icon as string) || '🏢',
          }))
        : [];
      setData((prev) => ({
        ...prev,
        name: (gen.name as string) || prev.name,
        description: (gen.description as string) || prev.description,
        levels: levels as ChallengeLevel[],
        sectors: sectors as ChallengeSector[],
        enabled: true,
      }));
      if (isNew && gen.name) {
        setNewId((gen.name as string).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
      }
      setShowBriefingForm(false);
      toast.success(`Programme genere : ${levels.length} niveaux, ${sectors.length} secteurs`);
      return;
    }

    if (aiModalType === 'sublevel_content' && contentTarget) {
      const gen = generated as Record<string, unknown>;
      const { levelIdx, subIdx } = contentTarget;
      const tagSector = activeSectorId || undefined;
      setData((prev) => {
        const levels = [...prev.levels];
        const level = { ...levels[levelIdx] };
        const subs = [...level.subLevels];
        const sub = { ...subs[subIdx] };

        if (Array.isArray(gen.quizzes)) {
          sub.quizzes = [...(sub.quizzes || []), ...(gen.quizzes as Quiz[]).map((q) => ({ ...q, id: q.id || `quiz_${generateId()}`, sectorId: tagSector }))];
        }
        if (Array.isArray(gen.duels)) {
          sub.duels = [...(sub.duels || []), ...(gen.duels as Duel[]).map((d) => ({ ...d, id: d.id || `duel_${generateId()}`, sectorId: tagSector }))];
        }
        if (Array.isArray(gen.fundings)) {
          sub.fundings = [...(sub.fundings || []), ...(gen.fundings as Funding[]).map((f) => ({ ...f, id: f.id || `fund_${generateId()}`, sectorId: tagSector }))];
        }
        if (Array.isArray(gen.opportunities)) {
          sub.opportunities = [...(sub.opportunities || []), ...(gen.opportunities as Opportunity[]).map((o) => ({ ...o, id: o.id || `opp_${generateId()}`, sectorId: tagSector }))];
        }
        if (Array.isArray(gen.challengeEvents)) {
          sub.challengeEvents = [...(sub.challengeEvents || []), ...(gen.challengeEvents as ChallengeEvent[]).map((c) => ({ ...c, id: c.id || `chal_${generateId()}`, sectorId: tagSector }))];
        }

        subs[subIdx] = sub;
        level.subLevels = subs;
        levels[levelIdx] = level;
        return { ...prev, levels };
      });
      const sectorLabel = tagSector ? data.sectors.find(s => s.id === tagSector)?.name : 'general';
      const counts = Object.entries(gen as Record<string, unknown>)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => `${(v as unknown[]).length} ${k}`)
        .join(', ');
      toast.success(`Contenu genere (${sectorLabel}) : ${counts}`);
      setContentTarget(null);
      return;
    }

    const items = Array.isArray(generated) ? generated : [];
    if (aiModalType === 'challenge_levels') {
      const withIds: ChallengeLevel[] = items.map((item: Record<string, unknown>, idx: number) => ({
        ...item,
        id: (item.id as string) || `lvl_${generateId()}`,
        title: (item.title as string) || `Niveau ${idx + 1}`,
        description: (item.description as string) || '',
        order: (item.order as number) ?? idx,
        subLevels: Array.isArray(item.subLevels)
          ? (item.subLevels as Record<string, unknown>[]).map((sub, sIdx) => ({
              ...EMPTY_SUBLEVEL,
              ...sub,
              id: (sub.id as string) || `sub_${generateId()}`,
              title: (sub.title as string) || `Sous-niveau ${sIdx + 1}`,
              description: (sub.description as string) || '',
              order: (sub.order as number) ?? sIdx,
              cardCategories: Array.isArray(sub.cardCategories) ? sub.cardCategories : ['quiz', 'opportunity'],
              quizzes: [], duels: [], fundings: [], opportunities: [], challengeEvents: [],
            }))
          : [],
      } as ChallengeLevel));
      setData((prev) => ({ ...prev, levels: [...prev.levels, ...withIds] }));
      toast.success(`${withIds.length} niveaux ajoutes`);
    } else if (aiModalType === 'challenge_sectors') {
      const withIds: ChallengeSector[] = items.map((item: Record<string, unknown>) => ({
        ...item,
        id: (item.id as string) || `sec_${generateId()}`,
        name: (item.name as string) || '',
        description: (item.description as string) || '',
        icon: (item.icon as string) || '🏢',
      } as ChallengeSector));
      setData((prev) => ({ ...prev, sectors: [...prev.sectors, ...withIds] }));
      toast.success(`${withIds.length} secteurs ajoutes`);
    }
  };

  // Sauvegarde automatique : active uniquement sur un programme existant.
  const persist = useCallback(
    (d: Omit<ChallengeProgram, 'id'>) => saveChallengeProgram(programId, d),
    [programId]
  );
  const { status: saveStatus, flush } = useAutoSave({
    data,
    save: persist,
    enabled: !isNew && !loading,
  });

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const prog = await getChallengeProgram(programId);
        if (prog) {
          const { id, ...rest } = prog;
          setData(rest);
        }
        else { toast.error('Programme non trouve'); router.push('/challenges'); }
      } catch { toast.error('Erreur de chargement'); }
      finally { setLoading(false); }
    })();
  }, [programId, isNew, router]);

  // Creation initiale d'un nouveau programme, puis bascule vers l'autosave.
  const handleCreate = async () => {
    const id = newId.trim().toLowerCase().replace(/\s+/g, '-');
    if (!id || !data.name.trim()) { toast.error('ID et nom requis'); return; }
    setCreating(true);
    try {
      await saveChallengeProgram(id, data);
      toast.success('Programme cree !');
      router.push(`/challenges/${id}`);
    } catch {
      toast.error('Erreur lors de la creation');
      setCreating(false);
    }
  };

  // Persiste tout edit en attente avant de quitter la page.
  const handleNavigate = (path: string) => {
    if (!isNew) flush();
    router.push(path);
  };

  const toggleLevel = (i: number) => {
    setExpandedLevels((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  // Level CRUD
  const addLevel = () => {
    setData((prev) => ({
      ...prev,
      levels: [...prev.levels, { id: `lvl_${generateId()}`, title: '', description: '', order: prev.levels.length + 1, subLevels: [] }],
    }));
  };

  const updateLevel = (i: number, field: keyof ChallengeLevel, value: unknown) => {
    setData((prev) => {
      const levels = [...prev.levels];
      levels[i] = { ...levels[i], [field]: value } as ChallengeLevel;
      return { ...prev, levels };
    });
  };

  const removeLevel = (i: number) => {
    setData((prev) => ({ ...prev, levels: prev.levels.filter((_, idx) => idx !== i) }));
  };

  // SubLevel CRUD
  const addSubLevel = (levelIndex: number) => {
    setData((prev) => {
      const levels = [...prev.levels];
      const level = { ...levels[levelIndex] };
      level.subLevels = [...level.subLevels, {
        ...EMPTY_SUBLEVEL,
        id: `sub_${generateId()}`, order: level.subLevels.length + 1,
      }];
      levels[levelIndex] = level;
      return { ...prev, levels };
    });
  };

  const updateSubLevel = (li: number, si: number, field: keyof ChallengeSubLevel, value: unknown) => {
    setData((prev) => {
      const levels = [...prev.levels];
      const level = { ...levels[li] };
      const subs = [...level.subLevels];
      subs[si] = { ...subs[si], [field]: value } as ChallengeSubLevel;
      level.subLevels = subs;
      levels[li] = level;
      return { ...prev, levels };
    });
  };

  const removeSubLevel = (li: number, si: number) => {
    setData((prev) => {
      const levels = [...prev.levels];
      const level = { ...levels[li] };
      level.subLevels = level.subLevels.filter((_, idx) => idx !== si);
      levels[li] = level;
      return { ...prev, levels };
    });
  };

  // Toggle cardCategory for a sub-level
  const toggleCardCategory = (li: number, si: number, cat: CardCategory) => {
    const sub = data.levels[li]?.subLevels[si];
    if (!sub) return;
    const cats = sub.cardCategories || [];
    const newCats = cats.includes(cat) ? cats.filter((c) => c !== cat) : [...cats, cat];
    updateSubLevel(li, si, 'cardCategories', newCats);
  };

  // Generate content for a single sub-level
  const generateSubLevelContent = (li: number, si: number) => {
    setContentTarget({ levelIdx: li, subIdx: si });
    setAiAutoPrompt('Genere le contenu educatif pour ce sous-niveau');
    setAiModalType('sublevel_content');
  };

  // Batch generate content for all sub-levels of a level
  const generateLevelContent = async (li: number) => {
    const level = data.levels[li];
    if (!level?.subLevels.length) return;
    for (let si = 0; si < level.subLevels.length; si++) {
      const sub = level.subLevels[si];
      const totalContent = (sub.quizzes?.length || 0) + (sub.duels?.length || 0) +
        (sub.fundings?.length || 0) + (sub.opportunities?.length || 0) + (sub.challengeEvents?.length || 0);
      if (totalContent > 0) continue; // skip sub-levels that already have content
      generateSubLevelContent(li, si);
      return; // open modal for first empty sub-level, user will continue manually
    }
    toast.success('Tous les sous-niveaux ont deja du contenu');
  };

  // Content count for a sub-level
  const getContentCount = (sub: ChallengeSubLevel) => {
    return (sub.quizzes?.length || 0) + (sub.duels?.length || 0) +
      (sub.fundings?.length || 0) + (sub.opportunities?.length || 0) + (sub.challengeEvents?.length || 0);
  };

  // Content count label
  const getContentLabel = (sub: ChallengeSubLevel) => {
    const parts: string[] = [];
    if (sub.quizzes?.length) parts.push(`${sub.quizzes.length} quiz`);
    if (sub.duels?.length) parts.push(`${sub.duels.length} duels`);
    if (sub.fundings?.length) parts.push(`${sub.fundings.length} fund.`);
    if (sub.opportunities?.length) parts.push(`${sub.opportunities.length} opp.`);
    if (sub.challengeEvents?.length) parts.push(`${sub.challengeEvents.length} defis`);
    return parts.length > 0 ? parts.join(', ') : 'Aucun contenu';
  };

  // Sector CRUD
  const addSector = () => {
    setData((prev) => ({
      ...prev,
      sectors: [...prev.sectors, { id: `sec_${generateId()}`, name: '', description: '', icon: 'business-outline' }],
    }));
  };

  const updateSector = (i: number, field: keyof ChallengeSector, value: string) => {
    setData((prev) => {
      const sectors = [...prev.sectors];
      sectors[i] = { ...sectors[i], [field]: value } as ChallengeSector;
      return { ...prev, sectors };
    });
  };

  const removeSector = (i: number) => {
    setData((prev) => ({ ...prev, sectors: prev.sectors.filter((_, idx) => idx !== i) }));
  };

  // Content detail modal helpers
  const contentModalSub = contentModal ? data.levels[contentModal.levelIdx]?.subLevels[contentModal.subIdx] : null;

  const removeContentItem = (field: ContentTab, index: number) => {
    if (!contentModal) return;
    const { levelIdx, subIdx } = contentModal;
    const sub = data.levels[levelIdx]?.subLevels[subIdx];
    if (!sub) return;
    const arr = [...(sub[field] || [])];
    arr.splice(index, 1);
    updateSubLevel(levelIdx, subIdx, field, arr);
  };

  // Event CRUD handlers
  const handleSaveQuiz = (quiz: Quiz) => {
    if (!contentModal) return;
    const { levelIdx, subIdx } = contentModal;
    const sub = data.levels[levelIdx]?.subLevels[subIdx];
    if (!sub) return;
    const quizzes = [...(sub.quizzes || [])];
    if (editingQuiz.index !== null && editingQuiz.index >= 0) {
      quizzes[editingQuiz.index] = quiz;
    } else {
      quizzes.push(quiz);
    }
    updateSubLevel(levelIdx, subIdx, 'quizzes', quizzes);
    setEditingQuiz({ quiz: null, index: null });
  };

  const handleSaveDuel = (duel: Duel) => {
    if (!contentModal) return;
    const { levelIdx, subIdx } = contentModal;
    const sub = data.levels[levelIdx]?.subLevels[subIdx];
    if (!sub) return;
    const duels = [...(sub.duels || [])];
    if (editingDuel.index !== null && editingDuel.index >= 0) {
      duels[editingDuel.index] = duel;
    } else {
      duels.push(duel);
    }
    updateSubLevel(levelIdx, subIdx, 'duels', duels);
    setEditingDuel({ duel: null, index: null });
  };

  const handleSaveFunding = (funding: Funding) => {
    if (!contentModal) return;
    const { levelIdx, subIdx } = contentModal;
    const sub = data.levels[levelIdx]?.subLevels[subIdx];
    if (!sub) return;
    const fundings = [...(sub.fundings || [])];
    if (editingFunding.index !== null && editingFunding.index >= 0) {
      fundings[editingFunding.index] = funding;
    } else {
      fundings.push(funding);
    }
    updateSubLevel(levelIdx, subIdx, 'fundings', fundings);
    setEditingFunding({ funding: null, index: null });
  };

  const handleSaveOpportunity = (opportunity: Opportunity) => {
    if (!contentModal) return;
    const { levelIdx, subIdx } = contentModal;
    const sub = data.levels[levelIdx]?.subLevels[subIdx];
    if (!sub) return;
    const opportunities = [...(sub.opportunities || [])];
    if (editingOpportunity.index !== null && editingOpportunity.index >= 0) {
      opportunities[editingOpportunity.index] = opportunity;
    } else {
      opportunities.push(opportunity);
    }
    updateSubLevel(levelIdx, subIdx, 'opportunities', opportunities);
    setEditingOpportunity({ opportunity: null, index: null });
  };

  const handleSaveChallengeEvent = (challengeEvent: ChallengeEvent) => {
    if (!contentModal) return;
    const { levelIdx, subIdx } = contentModal;
    const sub = data.levels[levelIdx]?.subLevels[subIdx];
    if (!sub) return;
    const challengeEvents = [...(sub.challengeEvents || [])];
    if (editingChallengeEvent.index !== null && editingChallengeEvent.index >= 0) {
      challengeEvents[editingChallengeEvent.index] = challengeEvent;
    } else {
      challengeEvents.push(challengeEvent);
    }
    updateSubLevel(levelIdx, subIdx, 'challengeEvents', challengeEvents);
    setEditingChallengeEvent({ challengeEvent: null, index: null });
  };

  const handleImportContent = (imported: ImportedContent, mode: 'replace' | 'append') => {
    if (!contentModal) return;
    const { levelIdx, subIdx } = contentModal;
    const sub = data.levels[levelIdx]?.subLevels[subIdx];
    if (!sub) return;

    // Auto-tag imported content with active sector
    const tagSector = activeSectorId || undefined;
    const tagQuizzes = (items: Quiz[]) => tagSector ? items.map(item => ({ ...item, sectorId: tagSector })) : items;
    const tagDuels = (items: Duel[]) => tagSector ? items.map(item => ({ ...item, sectorId: tagSector })) : items;
    const tagFundings = (items: Funding[]) => tagSector ? items.map(item => ({ ...item, sectorId: tagSector })) : items;
    const tagOpportunities = (items: Opportunity[]) => tagSector ? items.map(item => ({ ...item, sectorId: tagSector })) : items;
    const tagChallengeEvents = (items: ChallengeEvent[]) => tagSector ? items.map(item => ({ ...item, sectorId: tagSector })) : items;

    const merge = <T,>(existing: T[], incoming: T[]) =>
      mode === 'replace' ? incoming : [...existing, ...incoming];

    const updates: Partial<typeof sub> = {};
    if (imported.quizzes.length > 0) updates.quizzes = merge(sub.quizzes || [], tagQuizzes(imported.quizzes));
    if (imported.duels.length > 0) updates.duels = merge(sub.duels || [], tagDuels(imported.duels));
    if (imported.fundings.length > 0) updates.fundings = merge(sub.fundings || [], tagFundings(imported.fundings));
    if (imported.opportunities.length > 0) updates.opportunities = merge(sub.opportunities || [], tagOpportunities(imported.opportunities));
    if (imported.challengeEvents.length > 0) updates.challengeEvents = merge(sub.challengeEvents || [], tagChallengeEvents(imported.challengeEvents));

    const updatedLevels = data.levels.map((lvl, li) =>
      li !== levelIdx ? lvl : {
        ...lvl,
        subLevels: lvl.subLevels.map((s, si) =>
          si !== subIdx ? s : { ...s, ...updates }
        ),
      }
    );
    setData(prev => ({ ...prev, levels: updatedLevels }));
    setShowImportModal(false);
    toast.success(`Contenu importé (${mode === 'append' ? 'ajouté' : 'remplacé'})`);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button className="p-2 rounded-lg" onClick={() => handleNavigate('/challenges')} style={{ background: 'var(--color-surface)', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 style={{ fontFamily: "'Luckiest Guy', cursive", fontSize: 20, color: 'var(--color-text-primary)' }}>
              {isNew ? 'Nouveau Programme' : data.name || programId}
            </h2>
          </div>
        </div>
        {isNew ? (
          <button className="btn-primary flex items-center gap-2" onClick={handleCreate} disabled={creating}>
            <Plus size={16} />
            {creating ? 'Creation...' : 'Creer le programme'}
          </button>
        ) : (
          <SaveStatusIndicator status={saveStatus} />
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--color-surface)' }}>
        {(['general', 'levels', 'sectors'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all"
            style={{
              background: activeTab === tab ? 'rgba(155,89,182,0.15)' : 'transparent',
              color: activeTab === tab ? '#9B59B6' : 'var(--color-text-secondary)',
              border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
            }}
          >
            {tab === 'levels' && <Layers size={14} />}
            {tab === 'sectors' && <Target size={14} />}
            {tab === 'general' ? 'General' : tab === 'levels' ? `Niveaux (${data.levels.length})` : `Secteurs (${data.sectors.length})`}
          </button>
        ))}
      </div>

      <div className="glass-card p-6">
        {/* General */}
        {activeTab === 'general' && (
          <div className="flex flex-col gap-5" style={{ maxWidth: 600 }}>
            {isNew && (
              <div>
                <label className="label">Identifiant</label>
                <input className="input-field" placeholder="yeah" value={newId} onChange={(e) => setNewId(e.target.value)} />
              </div>
            )}
            <div>
              <label className="label">Nom du programme</label>
              <input className="input-field" placeholder="Programme YEAH" value={data.name} onChange={(e) => setData((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input-field" value={data.description} onChange={(e) => setData((p) => ({ ...p, description: e.target.value }))} rows={3} style={{ resize: 'vertical' }} />
            </div>
            <ImageUploadField
              label="Bannière (image en haut de la carte)"
              value={data.bannerUrl || ''}
              onChange={(url) => setData((p) => ({ ...p, bannerUrl: url }))}
              storagePath={`challenges/${isNew ? newId || 'new' : programId}/banner`}
              aspectRatio="banner"
            />
            <ImageUploadField
              label="Logo"
              value={data.logoUrl || ''}
              onChange={(url) => setData((p) => ({ ...p, logoUrl: url }))}
              storagePath={`challenges/${isNew ? newId || 'new' : programId}/logo`}
              aspectRatio="square"
            />
            <div className="flex items-center gap-3">
              <label className="label" style={{ marginBottom: 0 }}>Actif</label>
              <button
                onClick={() => setData((p) => ({ ...p, enabled: !p.enabled }))}
                className="relative w-10 h-5 rounded-full transition-colors"
                style={{ background: data.enabled ? '#4CAF50' : 'var(--color-surface-variant)', border: 'none', cursor: 'pointer' }}
              >
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ left: data.enabled ? 22 : 2 }} />
              </button>
            </div>

            {/* AI Briefing Form */}
            {isNew && (
              <div style={{ borderTop: '1px solid var(--color-card-border)', paddingTop: 20, marginTop: 8 }}>
                {!showBriefingForm ? (
                  <button
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all"
                    onClick={() => setShowBriefingForm(true)}
                    style={{
                      background: 'linear-gradient(135deg, rgba(255,188,64,0.12), rgba(255,188,64,0.05))',
                      border: '1px solid rgba(255,188,64,0.25)',
                      color: '#FFBC40', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    }}
                  >
                    <Sparkles size={15} />
                    Generer le programme complet avec l&apos;IA
                  </button>
                ) : (
                  <div className="rounded-xl p-5" style={{ background: 'rgba(255,188,64,0.05)', border: '1px solid rgba(255,188,64,0.15)' }}>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="flex items-center gap-2" style={{ fontSize: 14, fontWeight: 700, color: '#FFBC40', margin: 0 }}>
                        <Sparkles size={15} />
                        Briefing IA — Generation complete
                      </h3>
                      <button onClick={() => setShowBriefingForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 12 }}>
                        Fermer
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="label">Nom du programme *</label>
                        <input className="input-field" placeholder="Programme YEAH" value={briefing.programName}
                          onChange={(e) => setBriefing((p) => ({ ...p, programName: e.target.value }))} />
                      </div>
                      <div>
                        <label className="label">Organisation</label>
                        <input className="input-field" placeholder="Concree" value={briefing.organization}
                          onChange={(e) => setBriefing((p) => ({ ...p, organization: e.target.value }))} />
                      </div>
                      <div>
                        <label className="label">Thematique / domaine *</label>
                        <input className="input-field" placeholder="Entrepreneuriat numerique en Afrique" value={briefing.thematic}
                          onChange={(e) => setBriefing((p) => ({ ...p, thematic: e.target.value }))} />
                      </div>
                      <div>
                        <label className="label">Public cible</label>
                        <input className="input-field" placeholder="Jeunes entrepreneurs africains" value={briefing.targetAudience}
                          onChange={(e) => setBriefing((p) => ({ ...p, targetAudience: e.target.value }))} />
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="label">Description courte</label>
                      <textarea className="input-field" placeholder="Decrivez brievement le programme..." value={briefing.description}
                        onChange={(e) => setBriefing((p) => ({ ...p, description: e.target.value }))} rows={2} style={{ resize: 'vertical' }} />
                    </div>

                    <div className="grid grid-cols-3 gap-4 mb-5">
                      <div>
                        <label className="label">Niveaux</label>
                        <input type="number" className="input-field" min={1} max={10} value={briefing.levelCount}
                          onChange={(e) => setBriefing((p) => ({ ...p, levelCount: Number(e.target.value) }))} />
                      </div>
                      <div>
                        <label className="label">Sous-niveaux / niveau</label>
                        <input type="number" className="input-field" min={1} max={10} value={briefing.subLevelCount}
                          onChange={(e) => setBriefing((p) => ({ ...p, subLevelCount: Number(e.target.value) }))} />
                      </div>
                      <div>
                        <label className="label">Secteurs</label>
                        <input type="number" className="input-field" min={1} max={12} value={briefing.sectorCount}
                          onChange={(e) => setBriefing((p) => ({ ...p, sectorCount: Number(e.target.value) }))} />
                      </div>
                    </div>

                    <button
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg transition-all"
                      disabled={!briefing.programName.trim() || !briefing.thematic.trim()}
                      onClick={() => { setAiAutoPrompt(undefined); setAiModalType('challenge_full'); }}
                      style={{
                        background: briefing.programName.trim() && briefing.thematic.trim()
                          ? 'linear-gradient(135deg, #FFBC40, #FF9800)' : 'var(--color-surface)',
                        border: 'none', cursor: briefing.programName.trim() && briefing.thematic.trim() ? 'pointer' : 'not-allowed',
                        color: briefing.programName.trim() && briefing.thematic.trim() ? '#000' : 'var(--color-text-muted)',
                        fontSize: 13, fontWeight: 700,
                      }}
                    >
                      <Sparkles size={15} />
                      Generer le programme
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Levels */}
        {activeTab === 'levels' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{data.levels.length} niveau(x)</p>
              <div className="flex gap-2">
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => { setAiAutoPrompt(undefined); setAiModalType('challenge_levels'); }}
                  style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.3)', color: '#FFBC40' }}
                >
                  <Sparkles size={13} />
                  IA
                </button>
                <button className="btn-primary flex items-center gap-2" onClick={addLevel} style={{ fontSize: 13, padding: '8px 16px' }}>
                  <Plus size={14} />
                  Ajouter un niveau
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              {data.levels.map((level, li) => (
                <div key={level.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--color-card-border)' }}>
                  {/* Level header */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                    style={{ background: 'var(--color-surface)' }}
                    onClick={() => toggleLevel(li)}
                  >
                    {expandedLevels.has(li) ? <ChevronDown size={16} color="var(--color-text-muted)" /> : <ChevronRight size={16} color="var(--color-text-muted)" />}
                    <span className="badge" style={{ background: 'rgba(155,89,182,0.15)', color: '#9B59B6' }}>Niveau {li + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', flex: 1 }}>{level.title || '(sans titre)'}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{level.subLevels.length} sous-niveaux</span>
                    <button onClick={(e) => { e.stopPropagation(); removeLevel(li); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Level content */}
                  {expandedLevels.has(li) && (
                    <div className="px-4 py-4" style={{ background: 'var(--color-surface)' }}>
                      <div className="flex gap-4 mb-4">
                        <div className="flex-1">
                          <label className="label">Titre</label>
                          <input className="input-field" value={level.title} onChange={(e) => updateLevel(li, 'title', e.target.value)} />
                        </div>
                        <div style={{ width: 80 }}>
                          <label className="label">Ordre</label>
                          <input type="number" className="input-field" value={level.order} onChange={(e) => updateLevel(li, 'order', Number(e.target.value))} />
                        </div>
                      </div>
                      <div className="mb-4">
                        <label className="label">Description</label>
                        <textarea className="input-field" value={level.description} onChange={(e) => updateLevel(li, 'description', e.target.value)} rows={2} style={{ resize: 'vertical' }} />
                      </div>

                      {/* Sub-levels header */}
                      <div className="flex items-center justify-between mb-3">
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Sous-niveaux</span>
                        <div className="flex gap-2">
                          <button
                            className="flex items-center gap-1"
                            onClick={() => generateLevelContent(li)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40', fontSize: 11 }}
                          >
                            <Sparkles size={11} />
                            Generer tout le contenu
                          </button>
                          <button className="flex items-center gap-1" onClick={() => addSubLevel(li)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40', fontSize: 12 }}>
                            <Plus size={12} />
                            Ajouter
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2">
                        {level.subLevels.map((sub, si) => {
                          const contentCount = getContentCount(sub);
                          const contentParts: { key: string; count: number; color: string; label: string }[] = [
                            { key: 'quizzes', count: sub.quizzes?.length || 0, color: '#2196F3', label: 'Q' },
                            { key: 'duels', count: sub.duels?.length || 0, color: '#9C27B0', label: 'D' },
                            { key: 'fundings', count: sub.fundings?.length || 0, color: '#FF9800', label: 'F' },
                            { key: 'opportunities', count: sub.opportunities?.length || 0, color: '#4CAF50', label: 'O' },
                            { key: 'challengeEvents', count: sub.challengeEvents?.length || 0, color: '#F44336', label: 'E' },
                          ];
                          return (
                          <div key={sub.id} className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-card-border)', background: 'var(--color-surface)' }}>
                            {/* Compact header row */}
                            <div className="flex items-center gap-2 px-3 py-2">
                              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-muted)', minWidth: 16 }}>{si + 1}</span>
                              <input
                                className="input-field"
                                value={sub.title}
                                onChange={(e) => updateSubLevel(li, si, 'title', e.target.value)}
                                placeholder="Titre du sous-niveau"
                                style={{ fontSize: 12, padding: '4px 8px', flex: 1, background: '#FFFFFF', border: '1px solid var(--color-card-border)' }}
                              />
                              <input
                                type="number"
                                className="input-field"
                                value={sub.xpReward}
                                onChange={(e) => updateSubLevel(li, si, 'xpReward', Number(e.target.value))}
                                placeholder="XP"
                                style={{ fontSize: 11, padding: '4px 6px', width: 60, textAlign: 'center', background: '#FFFFFF', border: '1px solid var(--color-card-border)' }}
                                title="XP Reward"
                              />
                              {/* Content dots */}
                              <div className="flex items-center gap-1">
                                {contentParts.filter(p => p.count > 0).map(p => (
                                  <span
                                    key={p.key}
                                    title={`${p.count} ${p.key}`}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                      width: 18, height: 18, borderRadius: '50%', fontSize: 8, fontWeight: 700,
                                      background: `${p.color}20`, color: p.color,
                                    }}
                                  >
                                    {p.count}
                                  </span>
                                ))}
                                {contentCount === 0 && (
                                  <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>vide</span>
                                )}
                              </div>
                              {/* Actions */}
                              <button
                                onClick={() => { setContentModal({ levelIdx: li, subIdx: si }); setContentTab('quizzes'); }}
                                title="Voir / editer le contenu"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', padding: 2 }}
                              >
                                <BookOpen size={13} />
                              </button>
                              <button
                                onClick={() => generateSubLevelContent(li, si)}
                                title="Generer du contenu IA"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40', padding: 2 }}
                              >
                                <Sparkles size={13} />
                              </button>
                              <button
                                onClick={() => removeSubLevel(li, si)}
                                title="Supprimer"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(244,67,54,0.5)', padding: 2 }}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                            {/* Description row (collapsible feel, always visible but compact) */}
                            {(sub.description || true) && (
                              <div className="px-3 pb-2" style={{ paddingLeft: 34 }}>
                                <textarea
                                  className="input-field"
                                  value={sub.description}
                                  onChange={(e) => updateSubLevel(li, si, 'description', e.target.value)}
                                  placeholder="Description..."
                                  rows={1}
                                  style={{ fontSize: 11, padding: '3px 8px', resize: 'vertical', background: '#FFFFFF', border: '1px solid var(--color-card-border)', color: 'var(--color-text-secondary)' }}
                                />
                              </div>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sectors */}
        {activeTab === 'sectors' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{data.sectors.length} secteur(s)</p>
              <div className="flex gap-2">
                <button
                  className="btn-secondary flex items-center gap-1.5"
                  onClick={() => { setAiAutoPrompt(undefined); setAiModalType('challenge_sectors'); }}
                  style={{ fontSize: 12, padding: '6px 12px', borderColor: 'rgba(255,188,64,0.3)', color: '#FFBC40' }}
                >
                  <Sparkles size={13} />
                  IA
                </button>
                <button className="btn-primary flex items-center gap-2" onClick={addSector} style={{ fontSize: 13, padding: '8px 16px' }}>
                  <Plus size={14} />
                  Ajouter
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.sectors.map((sec, i) => (
                <div key={sec.id} className="p-4 rounded-xl" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)' }}>
                  <div className="flex items-start justify-between mb-3">
                    <span className="badge badge-primary">Secteur</span>
                    <button onClick={() => removeSector(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="mb-3">
                    <label className="label">Nom</label>
                    <input className="input-field" value={sec.name} onChange={(e) => updateSector(i, 'name', e.target.value)} placeholder="AgriTech" />
                  </div>
                  <div className="mb-3">
                    <label className="label">Description</label>
                    <input className="input-field" value={sec.description} onChange={(e) => updateSector(i, 'description', e.target.value)} placeholder="Technologies agricoles" />
                  </div>
                  <div>
                    <label className="label">Icone</label>
                    <input className="input-field" value={sec.icon} onChange={(e) => updateSector(i, 'icon', e.target.value)} placeholder="leaf-outline" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content Detail Modal */}
      {contentModal && contentModalSub && (() => {
        const CONTENT_TABS: { key: ContentTab; label: string; color: string; count: number }[] = [
          { key: 'quizzes', label: 'Quiz', color: '#2196F3', count: contentModalSub.quizzes?.length || 0 },
          { key: 'duels', label: 'Duels', color: '#9C27B0', count: contentModalSub.duels?.length || 0 },
          { key: 'fundings', label: 'Financements', color: '#FF9800', count: contentModalSub.fundings?.length || 0 },
          { key: 'opportunities', label: 'Opportunites', color: '#4CAF50', count: contentModalSub.opportunities?.length || 0 },
          { key: 'challengeEvents', label: 'Defis', color: '#F44336', count: contentModalSub.challengeEvents?.length || 0 },
        ];
        const activeTabConfig = CONTENT_TABS.find(t => t.key === contentTab)!;
        const totalContent = CONTENT_TABS.reduce((s, t) => s + t.count, 0);

        const addActions: Record<ContentTab, () => void> = {
          quizzes: () => setEditingQuiz({ quiz: null, index: -1 }),
          duels: () => setEditingDuel({ duel: null, index: -1 }),
          fundings: () => setEditingFunding({ funding: null, index: -1 }),
          opportunities: () => setEditingOpportunity({ opportunity: null, index: -1 }),
          challengeEvents: () => setEditingChallengeEvent({ challengeEvent: null, index: -1 }),
        };
        const addLabels: Record<ContentTab, string> = {
          quizzes: 'Ajouter un quiz', duels: 'Ajouter un duel', fundings: 'Ajouter un financement',
          opportunities: 'Ajouter une opportunite', challengeEvents: 'Ajouter un defi',
        };

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}>
            {/* Header */}
            <div className="px-5 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>
                    {contentModalSub.title || 'Sous-niveau'}
                  </h3>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                    {totalContent} element{totalContent !== 1 ? 's' : ''} au total
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setImportFilterOverride(undefined); setShowImportModal(true); }}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                    style={{ background: 'rgba(255,188,64,0.12)', border: '1px solid rgba(255,188,64,0.25)', color: '#FFBC40', cursor: 'pointer' }}
                    title="Importer tout type de contenu via IA"
                  >
                    <Upload size={13} />
                    Importer tout
                  </button>
                  <button onClick={() => setContentModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-0.5">
                {CONTENT_TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setContentTab(t.key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all"
                    style={{
                      fontSize: 11,
                      fontWeight: contentTab === t.key ? 600 : 400,
                      color: contentTab === t.key ? t.color : 'rgba(255,255,255,0.35)',
                      background: contentTab === t.key ? `${t.color}15` : 'transparent',
                      border: contentTab === t.key ? `1px solid ${t.color}30` : '1px solid transparent',
                      cursor: 'pointer',
                    }}
                  >
                    {t.label}
                    {t.count > 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                        background: `${t.color}20`, color: t.color,
                      }}>
                        {t.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Sector selector bar */}
            {data.sectors.length > 0 && (
              <div className="flex items-center gap-2 px-5 py-2 shrink-0" style={{ background: 'rgba(155,89,182,0.05)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <Target size={13} style={{ color: '#9B59B6', flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>Secteur :</span>
                <div className="flex gap-1 flex-wrap">
                  <button
                    onClick={() => setActiveSectorId('')}
                    className="rounded-md px-2.5 py-1 transition-all"
                    style={{
                      fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none',
                      background: !activeSectorId ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.04)',
                      color: !activeSectorId ? '#fff' : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    Tous
                  </button>
                  {data.sectors.map((sec) => (
                    <button
                      key={sec.id}
                      onClick={() => setActiveSectorId(sec.id)}
                      className="rounded-md px-2.5 py-1 transition-all"
                      style={{
                        fontSize: 10, fontWeight: 600, cursor: 'pointer', border: 'none',
                        background: activeSectorId === sec.id ? 'rgba(155,89,182,0.25)' : 'rgba(255,255,255,0.04)',
                        color: activeSectorId === sec.id ? '#9B59B6' : 'rgba(255,255,255,0.4)',
                      }}
                    >
                      {sec.name}
                    </button>
                  ))}
                </div>
                {activeSectorId && (
                  <span style={{ fontSize: 9, color: '#9B59B6', marginLeft: 'auto', flexShrink: 0 }}>
                    Generer / Importer = auto-tague &quot;{data.sectors.find(s => s.id === activeSectorId)?.name}&quot;
                  </span>
                )}
              </div>
            )}

            {/* Action bar */}
            <div className="flex items-center gap-2 px-5 py-2.5 shrink-0" style={{ background: 'rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <button
                onClick={addActions[contentTab]}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ background: `${activeTabConfig.color}15`, border: `1px solid ${activeTabConfig.color}30`, color: activeTabConfig.color, cursor: 'pointer' }}
              >
                <Plus size={12} />
                {addLabels[contentTab]}
              </button>
              <button
                onClick={() => { setImportFilterOverride(contentTab); setShowImportModal(true); }}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}
              >
                <Upload size={11} />
                Importer des {activeTabConfig.label.toLowerCase()}
              </button>
              <button
                onClick={() => {
                  setContentTarget({ levelIdx: contentModal.levelIdx, subIdx: contentModal.subIdx });
                  setAiAutoPrompt(
                    activeSectorId
                      ? `Genere le contenu educatif pour ce sous-niveau, specifique au secteur "${data.sectors.find(s => s.id === activeSectorId)?.name}". Tout le contenu doit etre contextualise pour ce secteur.`
                      : 'Genere le contenu educatif pour ce sous-niveau'
                  );
                  setAiModalType('sublevel_content');
                }}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ background: 'rgba(255,188,64,0.12)', border: '1px solid rgba(255,188,64,0.25)', color: '#FFBC40', cursor: 'pointer', marginLeft: 'auto' }}
              >
                <Sparkles size={11} />
                {activeSectorId ? `Generer IA (${data.sectors.find(s => s.id === activeSectorId)?.name})` : 'Generer IA'}
              </button>
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-auto px-5 py-4">
              {contentTab === 'quizzes' && (() => {
                const filtered = (contentModalSub.quizzes || []).map((q, qi) => ({ item: q, origIndex: qi }))
                  .filter(({ item }) => !activeSectorId || !item.sectorId || item.sectorId === activeSectorId);
                return (
                <div className="flex flex-col gap-2">
                  {filtered.map(({ item: q, origIndex: qi }) => (
                    <div key={q.id} className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: 10, color: '#2196F3', fontWeight: 600 }}>
                          Quiz #{qi + 1} — {q.category} ({q.difficulty})
                          {q.sectorId && (
                            <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(155,89,182,0.15)', color: '#9B59B6' }}>
                              {data.sectors.find(s => s.id === q.sectorId)?.name || q.sectorId}
                            </span>
                          )}
                        </span>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingQuiz({ quiz: q, index: qi })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40' }}><Edit size={11} /></button>
                          <button onClick={() => removeContentItem('quizzes', qi)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336' }}><Trash2 size={11} /></button>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: '#fff', marginBottom: 4 }}>{q.question}</p>
                      <div className="flex flex-col gap-0.5">
                        {q.options.map((opt, oi) => (
                          <span key={oi} style={{ fontSize: 11, color: q.correctAnswer === oi ? '#4CAF50' : 'rgba(255,255,255,0.4)' }}>
                            {q.correctAnswer === oi ? '✓' : '·'} {opt}
                          </span>
                        ))}
                      </div>
                      {q.explanation && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4, fontStyle: 'italic' }}>{q.explanation}</p>}
                    </div>
                  ))}
                  {filtered.length === 0 && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 20 }}>Aucun quiz{activeSectorId ? ` pour "${data.sectors.find(s => s.id === activeSectorId)?.name}"` : ''}</p>}
                </div>
                );
              })()}
              {contentTab === 'duels' && (() => {
                const filtered = (contentModalSub.duels || []).map((d, di) => ({ item: d, origIndex: di }))
                  .filter(({ item }) => !activeSectorId || !item.sectorId || item.sectorId === activeSectorId);
                return (
                <div className="flex flex-col gap-2">
                  {filtered.map(({ item: d, origIndex: di }) => (
                    <div key={d.id} className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: 10, color: '#9C27B0', fontWeight: 600 }}>
                          Duel #{di + 1} — {d.category}
                          {d.sectorId && (
                            <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(155,89,182,0.15)', color: '#9B59B6' }}>
                              {data.sectors.find(s => s.id === d.sectorId)?.name || d.sectorId}
                            </span>
                          )}
                        </span>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingDuel({ duel: d, index: di })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40' }}><Edit size={11} /></button>
                          <button onClick={() => removeContentItem('duels', di)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336' }}><Trash2 size={11} /></button>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: '#fff', marginBottom: 4 }}>{d.question}</p>
                      <div className="flex flex-col gap-0.5">
                        {d.options.map((opt, oi) => (
                          <span key={oi} style={{ fontSize: 11, color: opt.points === 30 ? '#4CAF50' : opt.points === 20 ? '#FFBC40' : 'rgba(255,255,255,0.4)' }}>
                            {opt.points}pts — {opt.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {filtered.length === 0 && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 20 }}>Aucun duel{activeSectorId ? ` pour "${data.sectors.find(s => s.id === activeSectorId)?.name}"` : ''}</p>}
                </div>
                );
              })()}
              {contentTab === 'fundings' && (() => {
                const filtered = (contentModalSub.fundings || []).map((f, fi) => ({ item: f, origIndex: fi }))
                  .filter(({ item }) => !activeSectorId || !item.sectorId || item.sectorId === activeSectorId);
                return (
                <div className="flex flex-col gap-2">
                  {filtered.map(({ item: f, origIndex: fi }) => (
                    <div key={f.id} className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: 10, color: '#FF9800', fontWeight: 600 }}>
                          Financement #{fi + 1}
                          {f.sectorId && (
                            <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(155,89,182,0.15)', color: '#9B59B6' }}>
                              {data.sectors.find(s => s.id === f.sectorId)?.name || f.sectorId}
                            </span>
                          )}
                        </span>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingFunding({ funding: f, index: fi })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40' }}><Edit size={11} /></button>
                          <button onClick={() => removeContentItem('fundings', fi)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336' }}><Trash2 size={11} /></button>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: '#fff' }}>{f.title} — <span style={{ color: '#4CAF50' }}>+{f.tokens} tokens</span></p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{f.description}</p>
                    </div>
                  ))}
                  {filtered.length === 0 && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 20 }}>Aucun financement{activeSectorId ? ` pour "${data.sectors.find(s => s.id === activeSectorId)?.name}"` : ''}</p>}
                </div>
                );
              })()}
              {contentTab === 'opportunities' && (() => {
                const filtered = (contentModalSub.opportunities || []).map((o, oi) => ({ item: o, origIndex: oi }))
                  .filter(({ item }) => !activeSectorId || !item.sectorId || item.sectorId === activeSectorId);
                return (
                <div className="flex flex-col gap-2">
                  {filtered.map(({ item: o, origIndex: oi }) => (
                    <div key={o.id} className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: 10, color: '#4CAF50', fontWeight: 600 }}>
                          Opportunite #{oi + 1}
                          {o.sectorId && (
                            <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(155,89,182,0.15)', color: '#9B59B6' }}>
                              {data.sectors.find(s => s.id === o.sectorId)?.name || o.sectorId}
                            </span>
                          )}
                        </span>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingOpportunity({ opportunity: o, index: oi })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40' }}><Edit size={11} /></button>
                          <button onClick={() => removeContentItem('opportunities', oi)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336' }}><Trash2 size={11} /></button>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: '#fff' }}>{o.title} — <span style={{ color: '#4CAF50' }}>+{o.tokens} tokens</span></p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{o.description}</p>
                    </div>
                  ))}
                  {filtered.length === 0 && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 20 }}>Aucune opportunite{activeSectorId ? ` pour "${data.sectors.find(s => s.id === activeSectorId)?.name}"` : ''}</p>}
                </div>
                );
              })()}
              {contentTab === 'challengeEvents' && (() => {
                const filtered = (contentModalSub.challengeEvents || []).map((c, ci) => ({ item: c, origIndex: ci }))
                  .filter(({ item }) => !activeSectorId || !item.sectorId || item.sectorId === activeSectorId);
                return (
                <div className="flex flex-col gap-2">
                  {filtered.map(({ item: c, origIndex: ci }) => (
                    <div key={c.id} className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: 10, color: '#F44336', fontWeight: 600 }}>
                          Defi #{ci + 1}
                          {c.sectorId && (
                            <span style={{ marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(155,89,182,0.15)', color: '#9B59B6' }}>
                              {data.sectors.find(s => s.id === c.sectorId)?.name || c.sectorId}
                            </span>
                          )}
                        </span>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingChallengeEvent({ challengeEvent: c, index: ci })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40' }}><Edit size={11} /></button>
                          <button onClick={() => removeContentItem('challengeEvents', ci)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336' }}><Trash2 size={11} /></button>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: '#fff' }}>{c.title} — <span style={{ color: '#F44336' }}>{c.tokens} tokens</span></p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{c.description}</p>
                    </div>
                  ))}
                  {filtered.length === 0 && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 20 }}>Aucun defi{activeSectorId ? ` pour "${data.sectors.find(s => s.id === activeSectorId)?.name}"` : ''}</p>}
                </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 flex justify-end shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button onClick={() => setContentModal(null)} className="btn-secondary" style={{ fontSize: 13 }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Import Content Modal */}
      {showImportModal && contentModal && (
        <ImportContentModal
          programName={data.name}
          levelTitle={data.levels[contentModal.levelIdx]?.title}
          subLevelTitle={data.levels[contentModal.levelIdx]?.subLevels[contentModal.subIdx]?.title}
          importFilter={importFilterOverride}
          onImport={handleImportContent}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* AI Generate Modal */}
      <AIGenerateModal
        open={!!aiModalType}
        onClose={() => { setAiModalType(null); setAiAutoPrompt(undefined); setContentTarget(null); }}
        type={aiModalType || 'challenge_levels'}
        context={aiContext}
        onGenerated={handleAIGenerated}
        autoPrompt={aiAutoPrompt}
      />

      {/* Event Editors */}
      {(editingQuiz.index !== null || editingQuiz.quiz !== null) && (
        <QuizEditor
          quiz={editingQuiz.quiz}
          onSave={handleSaveQuiz}
          onClose={() => setEditingQuiz({ quiz: null, index: null })}
          sectors={data.sectors}
        />
      )}

      {(editingDuel.index !== null || editingDuel.duel !== null) && (
        <DuelEditor
          duel={editingDuel.duel}
          onSave={handleSaveDuel}
          onClose={() => setEditingDuel({ duel: null, index: null })}
          sectors={data.sectors}
        />
      )}

      {(editingFunding.index !== null || editingFunding.funding !== null) && (
        <FundingEditor
          funding={editingFunding.funding}
          onSave={handleSaveFunding}
          onClose={() => setEditingFunding({ funding: null, index: null })}
          sectors={data.sectors}
        />
      )}

      {(editingOpportunity.index !== null || editingOpportunity.opportunity !== null) && (
        <OpportunityEditor
          opportunity={editingOpportunity.opportunity}
          onSave={handleSaveOpportunity}
          onClose={() => setEditingOpportunity({ opportunity: null, index: null })}
          sectors={data.sectors}
        />
      )}

      {(editingChallengeEvent.index !== null || editingChallengeEvent.challengeEvent !== null) && (
        <ChallengeEventEditor
          challengeEvent={editingChallengeEvent.challengeEvent}
          onSave={handleSaveChallengeEvent}
          onClose={() => setEditingChallengeEvent({ challengeEvent: null, index: null })}
          sectors={data.sectors}
        />
      )}
    </div>
  );
}
