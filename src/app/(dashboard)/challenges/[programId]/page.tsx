'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Save, Plus, Trash2, ChevronDown, ChevronRight, Layers, Target, Sparkles, BookOpen, X, Edit, Upload } from 'lucide-react';
import { getChallengeProgram, saveChallengeProgram } from '@/lib/firestore-service';
import type { ChallengeProgram, ChallengeLevel, ChallengeSubLevel, ChallengeSector, CardCategory, Quiz, Duel, Funding, Opportunity, ChallengeEvent } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import AIGenerateModal from '@/components/ui/AIGenerateModal';
import UnsavedChangesDialog from '@/components/ui/UnsavedChangesDialog';
import QuizEditor from '@/components/events/QuizEditor';
import DuelEditor from '@/components/events/DuelEditor';
import FundingEditor from '@/components/events/FundingEditor';
import OpportunityEditor from '@/components/events/OpportunityEditor';
import ChallengeEventEditor from '@/components/events/ChallengeEventEditor';
import ImportContentModal, { type ImportedContent } from '@/components/ui/ImportContentModal';
import type { GenerationType } from '@/lib/ai-prompts';
import { generateId } from '@/lib/utils';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
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
    name: '', description: '', levels: [], sectors: [], enabled: true,
  });
  const [originalData, setOriginalData] = useState<Omit<ChallengeProgram, 'id'> | null>(null);
  const [newId, setNewId] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set());
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const pendingNavigationRef = useRef<string | null>(null);
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

  const aiContext = (() => {
    if (aiModalType === 'challenge_full') return { ...briefing };
    if (aiModalType === 'sublevel_content' && contentTarget) {
      const level = data.levels[contentTarget.levelIdx];
      const sub = level?.subLevels[contentTarget.subIdx];
      return {
        programName: data.name || programId,
        programDescription: data.description,
        levelTitle: level?.title || '',
        levelDescription: level?.description || '',
        subLevelTitle: sub?.title || '',
        subLevelDescription: sub?.description || '',
        cardCategories: sub?.cardCategories || ['quiz'],
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
      setData((prev) => {
        const levels = [...prev.levels];
        const level = { ...levels[levelIdx] };
        const subs = [...level.subLevels];
        const sub = { ...subs[subIdx] };

        if (Array.isArray(gen.quizzes)) {
          sub.quizzes = [...(sub.quizzes || []), ...(gen.quizzes as Quiz[]).map((q) => ({ ...q, id: q.id || `quiz_${generateId()}` }))];
        }
        if (Array.isArray(gen.duels)) {
          sub.duels = [...(sub.duels || []), ...(gen.duels as Duel[]).map((d) => ({ ...d, id: d.id || `duel_${generateId()}` }))];
        }
        if (Array.isArray(gen.fundings)) {
          sub.fundings = [...(sub.fundings || []), ...(gen.fundings as Funding[]).map((f) => ({ ...f, id: f.id || `fund_${generateId()}` }))];
        }
        if (Array.isArray(gen.opportunities)) {
          sub.opportunities = [...(sub.opportunities || []), ...(gen.opportunities as Opportunity[]).map((o) => ({ ...o, id: o.id || `opp_${generateId()}` }))];
        }
        if (Array.isArray(gen.challengeEvents)) {
          sub.challengeEvents = [...(sub.challengeEvents || []), ...(gen.challengeEvents as ChallengeEvent[]).map((c) => ({ ...c, id: c.id || `chal_${generateId()}` }))];
        }

        subs[subIdx] = sub;
        level.subLevels = subs;
        levels[levelIdx] = level;
        return { ...prev, levels };
      });
      const counts = Object.entries(gen as Record<string, unknown>)
        .filter(([, v]) => Array.isArray(v))
        .map(([k, v]) => `${(v as unknown[]).length} ${k}`)
        .join(', ');
      toast.success(`Contenu genere : ${counts}`);
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

  // Check for unsaved changes
  const hasUnsavedChanges = originalData !== null && JSON.stringify(data) !== JSON.stringify(originalData);

  const { allowNavigation } = useUnsavedChanges({
    hasUnsavedChanges,
  });

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const prog = await getChallengeProgram(programId);
        if (prog) {
          const { id, ...rest } = prog;
          setData(rest);
          setOriginalData(rest);
        }
        else { toast.error('Programme non trouve'); router.push('/challenges'); }
      } catch { toast.error('Erreur de chargement'); }
      finally { setLoading(false); }
    })();
  }, [programId, isNew, router]);

  const handleSave = async () => {
    const id = isNew ? newId.trim().toLowerCase().replace(/\s+/g, '-') : programId;
    if (!id || !data.name.trim()) { toast.error('ID et nom requis'); return; }
    setSaving(true);
    try {
      await saveChallengeProgram(id, data);
      setOriginalData(data); // Update original data after successful save
      toast.success(isNew ? 'Programme cree !' : 'Sauvegarde !');
      if (isNew) router.push(`/challenges/${id}`);
    } catch { toast.error('Erreur de sauvegarde'); }
    finally { setSaving(false); }
  };

  const handleNavigate = (path: string) => {
    if (hasUnsavedChanges) {
      pendingNavigationRef.current = path;
      setShowUnsavedDialog(true);
    } else {
      router.push(path);
    }
  };

  const handleSaveAndNavigate = async () => {
    await handleSave();
    if (pendingNavigationRef.current) {
      allowNavigation();
      router.push(pendingNavigationRef.current);
      pendingNavigationRef.current = null;
    }
  };

  const handleDiscardAndNavigate = () => {
    if (pendingNavigationRef.current) {
      allowNavigation();
      router.push(pendingNavigationRef.current);
      pendingNavigationRef.current = null;
    }
    setShowUnsavedDialog(false);
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

    const merge = <T,>(existing: T[], incoming: T[]) =>
      mode === 'replace' ? incoming : [...existing, ...incoming];

    const updates: Partial<typeof sub> = {};
    if (imported.quizzes.length > 0) updates.quizzes = merge(sub.quizzes || [], imported.quizzes);
    if (imported.duels.length > 0) updates.duels = merge(sub.duels || [], imported.duels);
    if (imported.fundings.length > 0) updates.fundings = merge(sub.fundings || [], imported.fundings);
    if (imported.opportunities.length > 0) updates.opportunities = merge(sub.opportunities || [], imported.opportunities);
    if (imported.challengeEvents.length > 0) updates.challengeEvents = merge(sub.challengeEvents || [], imported.challengeEvents);

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
          <button className="p-2 rounded-lg" onClick={() => handleNavigate('/challenges')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 style={{ fontFamily: "'Luckiest Guy', cursive", fontSize: 20, color: '#FFFFFF' }}>
              {isNew ? 'Nouveau Programme' : data.name || programId}
            </h2>
          </div>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={handleSave} disabled={saving}>
          <Save size={16} />
          {saving ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)' }}>
        {(['general', 'levels', 'sectors'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all"
            style={{
              background: activeTab === tab ? 'rgba(155,89,182,0.15)' : 'transparent',
              color: activeTab === tab ? '#9B59B6' : 'rgba(255,255,255,0.5)',
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
            <div className="flex items-center gap-3">
              <label className="label" style={{ marginBottom: 0 }}>Actif</label>
              <button
                onClick={() => setData((p) => ({ ...p, enabled: !p.enabled }))}
                className="relative w-10 h-5 rounded-full transition-colors"
                style={{ background: data.enabled ? '#4CAF50' : 'rgba(255,255,255,0.15)', border: 'none', cursor: 'pointer' }}
              >
                <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform" style={{ left: data.enabled ? 22 : 2 }} />
              </button>
            </div>

            {/* AI Briefing Form */}
            {isNew && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20, marginTop: 8 }}>
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
                      <button onClick={() => setShowBriefingForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
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
                          ? 'linear-gradient(135deg, #FFBC40, #FF9800)' : 'rgba(255,255,255,0.08)',
                        border: 'none', cursor: briefing.programName.trim() && briefing.thematic.trim() ? 'pointer' : 'not-allowed',
                        color: briefing.programName.trim() && briefing.thematic.trim() ? '#000' : 'rgba(255,255,255,0.3)',
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
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{data.levels.length} niveau(x)</p>
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
                <div key={level.id} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  {/* Level header */}
                  <div
                    className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                    style={{ background: 'rgba(0,0,0,0.2)' }}
                    onClick={() => toggleLevel(li)}
                  >
                    {expandedLevels.has(li) ? <ChevronDown size={16} color="rgba(255,255,255,0.4)" /> : <ChevronRight size={16} color="rgba(255,255,255,0.4)" />}
                    <span className="badge" style={{ background: 'rgba(155,89,182,0.15)', color: '#9B59B6' }}>Niveau {li + 1}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', flex: 1 }}>{level.title || '(sans titre)'}</span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{level.subLevels.length} sous-niveaux</span>
                    <button onClick={(e) => { e.stopPropagation(); removeLevel(li); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {/* Level content */}
                  {expandedLevels.has(li) && (
                    <div className="px-4 py-4" style={{ background: 'rgba(0,0,0,0.1)' }}>
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
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Sous-niveaux</span>
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

                      <div className="flex flex-col gap-3">
                        {level.subLevels.map((sub, si) => {
                          const contentCount = getContentCount(sub);
                          return (
                          <div key={sub.id} className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <div className="flex items-start justify-between mb-2">
                              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>Sous-niveau {si + 1}</span>
                              <button onClick={() => removeSubLevel(li, si)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336' }}>
                                <Trash2 size={12} />
                              </button>
                            </div>
                            <div className="flex gap-3 mb-2">
                              <div className="flex-1">
                                <input className="input-field" value={sub.title} onChange={(e) => updateSubLevel(li, si, 'title', e.target.value)} placeholder="Titre" style={{ fontSize: 12 }} />
                              </div>
                              <div style={{ width: 80 }}>
                                <input type="number" className="input-field" value={sub.xpReward} onChange={(e) => updateSubLevel(li, si, 'xpReward', Number(e.target.value))} placeholder="XP" style={{ fontSize: 12 }} />
                              </div>
                            </div>
                            <textarea className="input-field" value={sub.description} onChange={(e) => updateSubLevel(li, si, 'description', e.target.value)} placeholder="Description" rows={1} style={{ fontSize: 12, resize: 'vertical' }} />

                            {/* Card Categories */}
                            <div className="mt-2 mb-2">
                              <label style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Types de cartes</label>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {ALL_CARD_CATEGORIES.map((cat) => {
                                  const active = (sub.cardCategories || []).includes(cat.id);
                                  return (
                                    <button
                                      key={cat.id}
                                      onClick={() => toggleCardCategory(li, si, cat.id)}
                                      style={{
                                        padding: '2px 8px',
                                        borderRadius: 10,
                                        fontSize: 10,
                                        fontWeight: active ? 600 : 400,
                                        background: active ? `${cat.color}20` : 'rgba(255,255,255,0.05)',
                                        color: active ? cat.color : 'rgba(255,255,255,0.3)',
                                        border: `1px solid ${active ? `${cat.color}40` : 'rgba(255,255,255,0.08)'}`,
                                        cursor: 'pointer',
                                      }}
                                    >
                                      {cat.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Content badge + actions */}
                            <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                              <button
                                onClick={() => { setContentModal({ levelIdx: li, subIdx: si }); setContentTab('quizzes'); }}
                                style={{
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  fontSize: 11, color: contentCount > 0 ? '#4CAF50' : 'rgba(255,255,255,0.3)',
                                }}
                              >
                                <BookOpen size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                                {getContentLabel(sub)}
                              </button>
                              <button
                                onClick={() => generateSubLevelContent(li, si)}
                                className="flex items-center gap-1"
                                style={{
                                  background: 'rgba(255,188,64,0.1)', border: '1px solid rgba(255,188,64,0.2)',
                                  borderRadius: 6, padding: '2px 8px', cursor: 'pointer', color: '#FFBC40', fontSize: 10,
                                }}
                              >
                                <Sparkles size={10} />
                                Generer
                              </button>
                            </div>
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
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{data.sectors.length} secteur(s)</p>
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
                <div key={sec.id} className="p-4 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.06)' }}>
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
      {contentModal && contentModalSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col" style={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: 0 }}>
                  Contenu: {contentModalSub.title || 'Sous-niveau'}
                </h3>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{getContentLabel(contentModalSub)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition"
                  style={{
                    background: 'rgba(255,188,64,0.12)',
                    border: '1px solid rgba(255,188,64,0.25)',
                    color: '#FFBC40',
                    cursor: 'pointer',
                  }}
                >
                  <Upload size={13} />
                  Importer via l&apos;IA
                </button>
                <button onClick={() => setContentModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}>
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Content tabs */}
            <div className="flex gap-1 px-5 pt-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {([
                { key: 'quizzes' as ContentTab, label: 'Quiz', count: contentModalSub.quizzes?.length || 0 },
                { key: 'duels' as ContentTab, label: 'Duels', count: contentModalSub.duels?.length || 0 },
                { key: 'fundings' as ContentTab, label: 'Fundings', count: contentModalSub.fundings?.length || 0 },
                { key: 'opportunities' as ContentTab, label: 'Opportunites', count: contentModalSub.opportunities?.length || 0 },
                { key: 'challengeEvents' as ContentTab, label: 'Defis', count: contentModalSub.challengeEvents?.length || 0 },
              ]).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setContentTab(t.key)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: contentTab === t.key ? 600 : 400,
                    color: contentTab === t.key ? '#FFBC40' : 'rgba(255,255,255,0.4)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: contentTab === t.key ? '2px solid #FFBC40' : '2px solid transparent',
                    cursor: 'pointer',
                    marginBottom: -1,
                  }}
                >
                  {t.label} ({t.count})
                </button>
              ))}
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-auto px-5 py-4">
              {contentTab === 'quizzes' && (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setEditingQuiz({ quiz: null, index: -1 })}
                    className="btn-primary flex items-center gap-2 self-start"
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    <Plus size={14} />
                    Ajouter un quiz
                  </button>
                  {(contentModalSub.quizzes || []).map((q, qi) => (
                    <div key={q.id} className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: 10, color: '#2196F3', fontWeight: 600 }}>Quiz #{qi + 1} — {q.category} ({q.difficulty})</span>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingQuiz({ quiz: q, index: qi })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40' }}><Edit size={11} /></button>
                          <button onClick={() => removeContentItem('quizzes', qi)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336' }}><Trash2 size={11} /></button>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: '#fff', marginBottom: 4 }}>{q.question}</p>
                      <div className="flex flex-col gap-1">
                        {q.options.map((opt, oi) => (
                          <span key={oi} style={{ fontSize: 11, color: q.correctAnswer === oi ? '#4CAF50' : 'rgba(255,255,255,0.4)' }}>
                            {q.correctAnswer === oi ? '✓' : '·'} {opt}
                          </span>
                        ))}
                      </div>
                      {q.explanation && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4, fontStyle: 'italic' }}>{q.explanation}</p>}
                    </div>
                  ))}
                  {!(contentModalSub.quizzes?.length) && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 20 }}>Aucun quiz</p>}
                </div>
              )}
              {contentTab === 'duels' && (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setEditingDuel({ duel: null, index: -1 })}
                    className="btn-primary flex items-center gap-2 self-start"
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    <Plus size={14} />
                    Ajouter un duel
                  </button>
                  {(contentModalSub.duels || []).map((d, di) => (
                    <div key={d.id} className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: 10, color: '#9C27B0', fontWeight: 600 }}>Duel #{di + 1} — {d.category}</span>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingDuel({ duel: d, index: di })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40' }}><Edit size={11} /></button>
                          <button onClick={() => removeContentItem('duels', di)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336' }}><Trash2 size={11} /></button>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: '#fff', marginBottom: 4 }}>{d.question}</p>
                      <div className="flex flex-col gap-1">
                        {d.options.map((opt, oi) => (
                          <span key={oi} style={{ fontSize: 11, color: opt.points === 30 ? '#4CAF50' : opt.points === 20 ? '#FFBC40' : 'rgba(255,255,255,0.4)' }}>
                            {opt.points}pts — {opt.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!(contentModalSub.duels?.length) && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 20 }}>Aucun duel</p>}
                </div>
              )}
              {contentTab === 'fundings' && (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setEditingFunding({ funding: null, index: -1 })}
                    className="btn-primary flex items-center gap-2 self-start"
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    <Plus size={14} />
                    Ajouter un financement
                  </button>
                  {(contentModalSub.fundings || []).map((f, fi) => (
                    <div key={f.id} className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: 10, color: '#FF9800', fontWeight: 600 }}>Funding #{fi + 1}</span>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingFunding({ funding: f, index: fi })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40' }}><Edit size={11} /></button>
                          <button onClick={() => removeContentItem('fundings', fi)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336' }}><Trash2 size={11} /></button>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: '#fff' }}>{f.title} — <span style={{ color: '#4CAF50' }}>+{f.tokens} tokens</span></p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{f.description}</p>
                    </div>
                  ))}
                  {!(contentModalSub.fundings?.length) && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 20 }}>Aucun financement</p>}
                </div>
              )}
              {contentTab === 'opportunities' && (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setEditingOpportunity({ opportunity: null, index: -1 })}
                    className="btn-primary flex items-center gap-2 self-start"
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    <Plus size={14} />
                    Ajouter une opportunité
                  </button>
                  {(contentModalSub.opportunities || []).map((o, oi) => (
                    <div key={o.id} className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: 10, color: '#4CAF50', fontWeight: 600 }}>Opportunite #{oi + 1}</span>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingOpportunity({ opportunity: o, index: oi })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40' }}><Edit size={11} /></button>
                          <button onClick={() => removeContentItem('opportunities', oi)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336' }}><Trash2 size={11} /></button>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: '#fff' }}>{o.title} — <span style={{ color: '#4CAF50' }}>+{o.tokens} tokens</span></p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{o.description}</p>
                    </div>
                  ))}
                  {!(contentModalSub.opportunities?.length) && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 20 }}>Aucune opportunite</p>}
                </div>
              )}
              {contentTab === 'challengeEvents' && (
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setEditingChallengeEvent({ challengeEvent: null, index: -1 })}
                    className="btn-primary flex items-center gap-2 self-start"
                    style={{ fontSize: 12, padding: '6px 12px' }}
                  >
                    <Plus size={14} />
                    Ajouter un défi
                  </button>
                  {(contentModalSub.challengeEvents || []).map((c, ci) => (
                    <div key={c.id} className="p-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div className="flex justify-between mb-1">
                        <span style={{ fontSize: 10, color: '#F44336', fontWeight: 600 }}>Defi #{ci + 1}</span>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingChallengeEvent({ challengeEvent: c, index: ci })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FFBC40' }}><Edit size={11} /></button>
                          <button onClick={() => removeContentItem('challengeEvents', ci)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336' }}><Trash2 size={11} /></button>
                        </div>
                      </div>
                      <p style={{ fontSize: 12, color: '#fff' }}>{c.title} — <span style={{ color: '#F44336' }}>{c.tokens} tokens</span></p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{c.description}</p>
                    </div>
                  ))}
                  {!(contentModalSub.challengeEvents?.length) && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 20 }}>Aucun defi</p>}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 flex justify-end" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <button onClick={() => setContentModal(null)} className="btn-secondary" style={{ fontSize: 13 }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Content Modal */}
      {showImportModal && contentModal && (
        <ImportContentModal
          programName={data.name}
          levelTitle={data.levels[contentModal.levelIdx]?.title}
          subLevelTitle={data.levels[contentModal.levelIdx]?.subLevels[contentModal.subIdx]?.title}
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
        />
      )}

      {(editingDuel.index !== null || editingDuel.duel !== null) && (
        <DuelEditor
          duel={editingDuel.duel}
          onSave={handleSaveDuel}
          onClose={() => setEditingDuel({ duel: null, index: null })}
        />
      )}

      {(editingFunding.index !== null || editingFunding.funding !== null) && (
        <FundingEditor
          funding={editingFunding.funding}
          onSave={handleSaveFunding}
          onClose={() => setEditingFunding({ funding: null, index: null })}
        />
      )}

      {(editingOpportunity.index !== null || editingOpportunity.opportunity !== null) && (
        <OpportunityEditor
          opportunity={editingOpportunity.opportunity}
          onSave={handleSaveOpportunity}
          onClose={() => setEditingOpportunity({ opportunity: null, index: null })}
        />
      )}

      {(editingChallengeEvent.index !== null || editingChallengeEvent.challengeEvent !== null) && (
        <ChallengeEventEditor
          challengeEvent={editingChallengeEvent.challengeEvent}
          onSave={handleSaveChallengeEvent}
          onClose={() => setEditingChallengeEvent({ challengeEvent: null, index: null })}
        />
      )}

      {/* Unsaved Changes Dialog */}
      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onSave={handleSaveAndNavigate}
        onDiscard={handleDiscardAndNavigate}
        onCancel={() => {
          setShowUnsavedDialog(false);
          pendingNavigationRef.current = null;
        }}
        saving={saving}
      />
    </div>
  );
}
