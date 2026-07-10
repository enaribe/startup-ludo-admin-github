'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import {
  ArrowLeft, Plus, Trash2, X, Edit, Upload, GripVertical, Languages,
  Info, Palette, Layers, Target, Users, Globe, SlidersHorizontal, FileText, ClipboardList,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getProgram, saveProgram, getPartners, saveSourceDocText, deleteSourceDoc } from '@/lib/firestore-service';
import type {
  PartnerProgram, ProgramContentPack, ProgramPartner, ProgramLevelTier, ProgramGameMode,
  Quiz, Duel, Funding, Opportunity, ChallengeEvent,
} from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ImageUploadField from '@/components/ui/ImageUploadField';
import QuizEditor from '@/components/events/QuizEditor';
import DuelEditor from '@/components/events/DuelEditor';
import FundingEditor from '@/components/events/FundingEditor';
import OpportunityEditor from '@/components/events/OpportunityEditor';
import ChallengeEventEditor from '@/components/events/ChallengeEventEditor';
import ImportContentModal, { type ImportedContent } from '@/components/ui/ImportContentModal';
import LangTabs, { type ContentLang } from '@/components/events/LangTabs';
import { generateId } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import toast from 'react-hot-toast';

type Tab = 'identity' | 'branding' | 'structure' | 'eligibility' | 'personas' | 'language' | 'advanced';

// Navigation latérale « Configuration du parcours » — 7 onglets avec icônes (cf. maquette).
const TABS: { key: Tab; label: string; icon: LucideIcon }[] = [
  { key: 'identity', label: 'Informations', icon: Info },
  { key: 'branding', label: 'Branding', icon: Palette },
  { key: 'structure', label: 'Structure', icon: Layers },
  { key: 'eligibility', label: 'Éligibilité', icon: Target },
  { key: 'personas', label: 'Personas activés', icon: Users },
  { key: 'language', label: 'Langue', icon: Globe },
  { key: 'advanced', label: 'Avancé', icon: SlidersHorizontal },
];

const LEVEL_TIERS: { key: 'idea' | 'preparation' | 'launch' | 'development'; label: string }[] = [
  { key: 'idea', label: 'Idée' },
  { key: 'preparation', label: 'Préparation' },
  { key: 'launch', label: 'Lancement' },
  { key: 'development', label: 'Développement' },
];

const SENEGAL_REGIONS = ['Dakar', 'Thiès', 'Saint-Louis', 'Kaolack', 'Diourbel', 'Fatick', 'Kaffrine', 'Louga', 'Matam', 'Ziguinchor', 'Tambacounda', 'Kolda'];
const SECTOR_OPTIONS = ['Agriculture', 'Agroalimentaire', 'Agritech', 'Maraîchage', 'Élevage', 'Aviculture', 'Pêche', 'Artisanat', 'Commerce', 'Numérique', 'Énergie', 'Tourisme', 'Santé', 'Éducation', 'BTP'];
const AUDIENCE_PROFILE_OPTIONS = ["Porteurs d'idée", 'Jeunes entrepreneurs en démarrage', 'Entrepreneurs en croissance', 'En reconversion', 'Étudiants'];
// Modes de jeu (onglet Structure, cf. maquette). Le mobile applique des points fixes ;
// ces réglages restent informatifs/persistés côté programme.
const GAME_MODES: { key: ProgramGameMode; label: string; recommendedLabel: string }[] = [
  { key: 'solo', label: 'Solo contre ADIA', recommendedLabel: 'Solo IA recommandé' },
  { key: 'duel', label: '1 vs 1', recommendedLabel: '1 vs 1' },
  { key: 'tournament', label: 'Tournoi', recommendedLabel: 'Tournoi' },
];
type ContentTab = 'quizzes' | 'duels' | 'fundings' | 'opportunities' | 'challengeEvents';

const CONTENT_TABS: { key: ContentTab; label: string; color: string }[] = [
  { key: 'quizzes', label: 'Quiz', color: '#2196F3' },
  { key: 'duels', label: 'Duels', color: '#9C27B0' },
  { key: 'fundings', label: 'Financements', color: '#FF9800' },
  { key: 'opportunities', label: 'Opportunités', color: '#4CAF50' },
  { key: 'challengeEvents', label: 'Défis', color: '#F44336' },
];

function emptyPack(programId: string): ProgramContentPack {
  return {
    id: `pack_${generateId()}`,
    programId,
    name: 'Nouveau niveau',
    description: '',
    quizzes: [], duels: [], fundings: [], opportunities: [], challengeEvents: [],
  };
}

function makeEmpty(programId: string): Omit<PartnerProgram, 'id'> {
  return {
    slug: '', partnerId: '', coPartnerIds: [], name: '', subtitle: '', description: '',
    heroImageUrl: '', bannerUrl: '', logoUrl: '',
    playerCount: 0, sessionCount: 0,
    audience: { ageRange: '', locations: [], sector: '', profile: '' },
    tags: [], primaryColor: '#FFB347', secondaryColor: '#0C243E',
    contentPacks: [emptyPack(programId)],
    profiles: [],
    language: 'fr',
    allowedModes: ['solo'],
    recommendedMode: 'solo',
    eligibility: { ageMin: 18, ageMax: 35, regions: [], sectors: [], audienceProfiles: [] },
    advancedSettings: { rule7030: true, concreeValidationRequired: true, frequencyCap: true, publicPreview: false },
    contentSource: { documents: [], objective: 'Qualification', topicsKeep: [], topicsAvoid: [] },
    ownerId: null,
    ownerIds: [],
    isActive: true, sortOrder: 0,
  };
}

export default function ProgramEditorPage() {
  const router = useRouter();
  const params = useParams();
  const { isSuperAdmin, isPartnerAdmin, scopedPartnerId } = useAuth();
  const programId = params.programId as string;
  const isNew = programId === 'new';
  // Le partenaire/opérateur/bailleur n'est éditable que par le super admin.
  // L'admin de partenaire crée ses programmes mais avec partnerId verrouillé sur son partenaire.
  const canEditPartner = isSuperAdmin;

  const [data, setData] = useState<Omit<PartnerProgram, 'id'>>(() => makeEmpty('new'));
  const [partners, setPartners] = useState<ProgramPartner[]>([]);
  const [newId, setNewId] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('identity');
  const [loading, setLoading] = useState(!isNew);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  // Saisie des sujets (brief de génération) dans l'onglet Informations.
  const [newTopicKeep, setNewTopicKeep] = useState('');
  const [newTopicAvoid, setNewTopicAvoid] = useState('');

  // pack en cours d'édition de contenu
  const [contentPackIdx, setContentPackIdx] = useState<number | null>(null);
  const [contentTab, setContentTab] = useState<ContentTab>('quizzes');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFilter, setImportFilter] = useState<ContentTab | undefined>(undefined);
  const [translating, setTranslating] = useState(false);
  // Langue de consultation du contenu dans la liste du pack : 'fr' = original, 'en' = traduction
  const [contentLang, setContentLang] = useState<ContentLang>('fr');

  // éditeurs d'événements
  const [editingQuiz, setEditingQuiz] = useState<{ quiz: Quiz | null; index: number | null } | null>(null);
  const [editingDuel, setEditingDuel] = useState<{ duel: Duel | null; index: number | null } | null>(null);
  const [editingFunding, setEditingFunding] = useState<{ funding: Funding | null; index: number | null } | null>(null);
  const [editingOpportunity, setEditingOpportunity] = useState<{ opportunity: Opportunity | null; index: number | null } | null>(null);
  const [editingChallengeEvent, setEditingChallengeEvent] = useState<{ challengeEvent: ChallengeEvent | null; index: number | null } | null>(null);


  useEffect(() => {
    getPartners().then(setPartners).catch(() => toast.error('Erreur de chargement des partenaires'));
  }, []);

  // Nouveau programme créé par un admin de partenaire : partnerId verrouillé sur son partenaire.
  useEffect(() => {
    if (isNew && isPartnerAdmin && scopedPartnerId) {
      setData((prev) => (prev.partnerId === scopedPartnerId ? prev : { ...prev, partnerId: scopedPartnerId }));
    }
  }, [isNew, isPartnerAdmin, scopedPartnerId]);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const prog = await getProgram(programId);
        if (prog) {
          const { id: _id, ...rest } = prog;
          void _id;
          const empty = makeEmpty(programId);
          setData({
            ...empty,
            ...rest,
            audience: { ...empty.audience, ...(rest.audience ?? {}) },
            eligibility: { ...empty.eligibility!, ...(rest.eligibility ?? {}) },
            advancedSettings: { ...empty.advancedSettings!, ...(rest.advancedSettings ?? {}) },
            contentSource: { ...empty.contentSource!, ...(rest.contentSource ?? {}) },
            allowedModes: rest.allowedModes?.length ? rest.allowedModes : empty.allowedModes,
            contentPacks: rest.contentPacks?.length ? rest.contentPacks : [emptyPack(programId)],
          });
        } else {
          toast.error('Programme non trouvé');
          router.push('/programs');
        }
      } catch {
        toast.error('Erreur de chargement');
      } finally {
        setLoading(false);
      }
    })();
  }, [programId, isNew, router]);

  const update = <K extends keyof Omit<PartnerProgram, 'id'>>(key: K, value: Omit<PartnerProgram, 'id'>[K]) =>
    setData((prev) => ({ ...prev, [key]: value }));

  // ===== Éligibilité (eligibility.*) — onglet « Éligibilité » de la maquette =====
  const EMPTY_ELIG: NonNullable<PartnerProgram['eligibility']> = { ageMin: 18, ageMax: 35, regions: [], sectors: [], audienceProfiles: [] };
  const elig = { ...EMPTY_ELIG, ...(data.eligibility ?? {}) };
  const updateEligibility = (key: keyof NonNullable<PartnerProgram['eligibility']>, value: unknown) =>
    setData((prev) => ({ ...prev, eligibility: { ...EMPTY_ELIG, ...prev.eligibility, [key]: value } }));
  const toggleEligList = (key: 'regions' | 'sectors' | 'audienceProfiles', v: string) =>
    setData((prev) => {
      const cur = new Set((prev.eligibility ?? EMPTY_ELIG)[key]);
      cur.has(v) ? cur.delete(v) : cur.add(v);
      return { ...prev, eligibility: { ...EMPTY_ELIG, ...prev.eligibility, [key]: Array.from(cur) } };
    });

  // ===== Avancé (advancedSettings.*) — onglet « Avancé » de la maquette =====
  const EMPTY_ADV: NonNullable<PartnerProgram['advancedSettings']> = { rule7030: true, concreeValidationRequired: true, frequencyCap: true, publicPreview: false };
  const updateAdvanced = (key: keyof NonNullable<PartnerProgram['advancedSettings']>, value: boolean) =>
    setData((prev) => ({ ...prev, advancedSettings: { ...EMPTY_ADV, ...prev.advancedSettings, [key]: value } }));

  // ===== Base de contenu (contentSource.*) — onglet « Informations » =====
  // Documents sources + brief, saisis une fois et réutilisés par le Studio de génération.
  const EMPTY_SOURCE: NonNullable<PartnerProgram['contentSource']> = { documents: [], objective: 'Qualification', topicsKeep: [], topicsAvoid: [] };
  const source = { ...EMPTY_SOURCE, ...(data.contentSource ?? {}) };
  const updateSource = <K extends keyof NonNullable<PartnerProgram['contentSource']>>(key: K, value: NonNullable<PartnerProgram['contentSource']>[K]) =>
    setData((prev) => ({ ...prev, contentSource: { ...EMPTY_SOURCE, ...prev.contentSource, [key]: value } }));
  const addSourceDoc = (doc: NonNullable<PartnerProgram['contentSource']>['documents'][number]) =>
    setData((prev) => {
      const src = { ...EMPTY_SOURCE, ...prev.contentSource };
      return { ...prev, contentSource: { ...src, documents: [...src.documents, doc] } };
    });
  const removeSourceDoc = (id: string) => {
    setData((prev) => {
      const src = { ...EMPTY_SOURCE, ...prev.contentSource };
      return { ...prev, contentSource: { ...src, documents: src.documents.filter((d) => d.id !== id) } };
    });
    // Nettoie le texte extrait en sous-collection (best-effort).
    deleteSourceDoc(storageId, id).catch(() => toast.error('Le texte indexé n’a pas pu être supprimé.'));
  };
  const addTopic = (list: 'topicsKeep' | 'topicsAvoid', value: string) => {
    const v = value.trim();
    if (!v) return;
    setData((prev) => {
      const src = { ...EMPTY_SOURCE, ...prev.contentSource };
      if (src[list].includes(v)) return prev;
      return { ...prev, contentSource: { ...src, [list]: [...src[list], v] } };
    });
  };
  const removeTopic = (list: 'topicsKeep' | 'topicsAvoid', value: string) =>
    setData((prev) => {
      const src = { ...EMPTY_SOURCE, ...prev.contentSource };
      return { ...prev, contentSource: { ...src, [list]: src[list].filter((t) => t !== value) } };
    });

  // Upload réel d'un document source vers Firebase Storage.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const ACCEPTED_DOC = '.pdf,.doc,.docx,.md,.markdown,.ppt,.pptx';

  const handleSourceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de re-sélectionner le même fichier
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      alert('Fichier trop lourd (max 25 Mo).');
      return;
    }

    const docId = `doc_${generateId()}`;
    setUploadingDoc(true);
    setUploadProgress(0);
    try {
      // 1) Upload du fichier original dans Storage (l'admin peut le re-consulter).
      const storageRef = ref(storage, `programs/${storageId}/sources/${Date.now()}_${file.name}`);
      const task = uploadBytesResumable(storageRef, file);
      const url = await new Promise<string>((resolve, reject) => {
        task.on(
          'state_changed',
          (snap) => setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 90)),
          reject,
          async () => resolve(await getDownloadURL(task.snapshot.ref))
        );
      });

      // 2) Extraction du texte côté serveur.
      setUploadProgress(92);
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/extract', { method: 'POST', body: fd });
      const extracted = await res.json();
      if (!res.ok) throw new Error(extracted.error || 'Extraction impossible');

      // 3) Sauvegarde du texte extrait en sous-collection (base de génération).
      setUploadProgress(97);
      await saveSourceDocText(storageId, docId, { name: file.name, url, pages: extracted.pages ?? 0 }, extracted.text);

      const sizeMo = file.size / (1024 * 1024);
      addSourceDoc({
        id: docId,
        name: file.name,
        size: sizeMo >= 1 ? `${sizeMo.toFixed(1)} Mo` : `${Math.max(1, Math.round(file.size / 1024))} Ko`,
        pages: extracted.pages ?? 0,
        url,
      });
      toast.success(`Document indexé (${extracted.charCount.toLocaleString('fr-FR')} caractères)`);
    } catch (err) {
      toast.error(`Erreur : ${err instanceof Error ? err.message : 'inconnue'}`);
    } finally {
      setUploadingDoc(false);
      setUploadProgress(0);
    }
  };

  // toggleMode retiré : UI des modes masquée (allowedModes conservé dans le state, valeur par défaut ['solo']).

  // ===== Profils (gérés sur la page dédiée /personas) =====
  const profiles = data.profiles ?? [];

  // ===== Content packs =====
  const addPack = () => setData((prev) => ({ ...prev, contentPacks: [...prev.contentPacks, emptyPack(isNew ? newId || 'new' : programId)] }));
  const removePack = (idx: number) => setData((prev) => ({ ...prev, contentPacks: prev.contentPacks.filter((_, i) => i !== idx) }));
  const updatePack = (idx: number, patch: Partial<ProgramContentPack>) =>
    setData((prev) => ({ ...prev, contentPacks: prev.contentPacks.map((p, i) => (i === idx ? { ...p, ...patch } : p)) }));

  // Slider « Nombre de parties » : ajuste la liste à la longueur cible.
  // - On n'ampute jamais une partie qui contient du contenu (sécurité anti-perte).
  const setPartCount = (target: number) =>
    setData((prev) => {
      const cur = prev.contentPacks.length;
      if (target === cur) return prev;
      if (target > cur) {
        const add = Array.from({ length: target - cur }, () => emptyPack(isNew ? newId || 'new' : programId));
        return { ...prev, contentPacks: [...prev.contentPacks, ...add] };
      }
      // Réduction : on retire en priorité les dernières parties VIDES.
      const next = [...prev.contentPacks];
      let toRemove = cur - target;
      for (let i = next.length - 1; i >= 0 && toRemove > 0; i--) {
        const p = next[i];
        const empty = p.quizzes.length + p.duels.length + p.fundings.length + p.opportunities.length + p.challengeEvents.length === 0;
        if (empty) { next.splice(i, 1); toRemove--; }
      }
      return { ...prev, contentPacks: next.length ? next : prev.contentPacks };
    });

  // Réordonnancement des parties (drag & drop natif).
  const movePack = (from: number, to: number) =>
    setData((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.contentPacks.length || to >= prev.contentPacks.length) return prev;
      const next = [...prev.contentPacks];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...prev, contentPacks: next };
    });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [expandedPackIdx, setExpandedPackIdx] = useState<number | null>(null);

  // Modes de jeu : 'solo' toujours actif (obligatoire). Toggle des autres.
  const toggleMode = (mode: ProgramGameMode) => {
    if (mode === 'solo') return;
    setData((prev) => {
      const set = new Set<ProgramGameMode>(prev.allowedModes ?? ['solo']);
      set.has(mode) ? set.delete(mode) : set.add(mode);
      set.add('solo');
      return { ...prev, allowedModes: Array.from(set) };
    });
  };

  // ===== Traduction d'un pack en anglais (IA) =====
  async function translatePack(packIdx: number, targetLang = 'en') {
    const pk = data.contentPacks[packIdx];
    if (!pk) return;
    setTranslating(true);
    try {
      const items = {
        quizzes: pk.quizzes.map((q) => ({ id: q.id, question: q.question, options: q.options, explanation: q.explanation ?? '' })),
        duels: pk.duels.map((d) => ({ id: d.id, question: d.question, options: d.options.map((o) => o.text) })),
        fundings: pk.fundings.map((f) => ({ id: f.id, title: f.title, description: f.description })),
        opportunities: pk.opportunities.map((o) => ({ id: o.id, title: o.title, description: o.description })),
        challengeEvents: pk.challengeEvents.map((c) => ({ id: c.id, title: c.title, description: c.description })),
      };
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
      };
      const byId = <U extends { id: string }>(arr?: U[]) => new Map((arr ?? []).map((x) => [x.id, x]));
      const tq = byId(t.quizzes), td = byId(t.duels), tf = byId(t.fundings), to = byId(t.opportunities), tc = byId(t.challengeEvents);

      setData((prev) => ({
        ...prev,
        contentPacks: prev.contentPacks.map((pack, i) => {
          if (i !== packIdx) return pack;
          return {
            ...pack,
            quizzes: pack.quizzes.map((q) => {
              const tr = tq.get(q.id);
              return tr ? { ...q, translations: { ...(q.translations ?? {}), [targetLang]: { question: tr.question, options: tr.options, explanation: tr.explanation } } } : q;
            }),
            duels: pack.duels.map((d) => {
              const tr = td.get(d.id);
              return tr ? { ...d, translations: { ...(d.translations ?? {}), [targetLang]: { question: tr.question, options: tr.options } } } : d;
            }),
            fundings: pack.fundings.map((f) => {
              const tr = tf.get(f.id);
              return tr ? { ...f, translations: { ...(f.translations ?? {}), [targetLang]: { title: tr.title, description: tr.description } } } : f;
            }),
            opportunities: pack.opportunities.map((o) => {
              const tr = to.get(o.id);
              return tr ? { ...o, translations: { ...(o.translations ?? {}), [targetLang]: { title: tr.title, description: tr.description } } } : o;
            }),
            challengeEvents: pack.challengeEvents.map((c) => {
              const tr = tc.get(c.id);
              return tr ? { ...c, translations: { ...(c.translations ?? {}), [targetLang]: { title: tr.title, description: tr.description } } } : c;
            }),
          };
        }),
      }));
      toast.success('Traduction anglaise générée. Pensez à Enregistrer.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur de traduction');
    } finally {
      setTranslating(false);
    }
  }

  // upsert d'un item de contenu dans le pack courant
  function upsertItem<T extends { id: string }>(packIdx: number, key: ContentTab, item: T, index: number | null) {
    setData((prev) => ({
      ...prev,
      contentPacks: prev.contentPacks.map((pack, i) => {
        if (i !== packIdx) return pack;
        const list = [...(pack[key] as unknown as T[])];
        if (index === null) list.push(item);
        else list[index] = item;
        return { ...pack, [key]: list };
      }),
    }));
  }
  function removeItem(packIdx: number, key: ContentTab, index: number) {
    setData((prev) => ({
      ...prev,
      contentPacks: prev.contentPacks.map((pack, i) =>
        i === packIdx ? { ...pack, [key]: (pack[key] as unknown[]).filter((_, j) => j !== index) } : pack
      ),
    }));
  }

  const handleImport = (content: ImportedContent, mode: 'replace' | 'append') => {
    if (contentPackIdx === null) return;
    setData((prev) => ({
      ...prev,
      contentPacks: prev.contentPacks.map((pack, i) => {
        if (i !== contentPackIdx) return pack;
        const merge = <T,>(existing: T[], incoming: T[]) => (mode === 'replace' ? incoming : [...existing, ...incoming]);
        return {
          ...pack,
          quizzes: merge(pack.quizzes, content.quizzes),
          duels: merge(pack.duels, content.duels),
          fundings: merge(pack.fundings, content.fundings),
          opportunities: merge(pack.opportunities, content.opportunities),
          challengeEvents: merge(pack.challengeEvents, content.challengeEvents),
        };
      }),
    }));
    setShowImportModal(false);
    setImportFilter(undefined);
  };

  const handleCreate = async () => {
    const id = newId.trim().toLowerCase().replace(/\s+/g, '-');
    if (!id || !data.name.trim() || !data.partnerId) { toast.error('ID, nom et partenaire requis'); return; }
    setCreating(true);
    try {
      const packs = data.contentPacks.map((p) => ({ ...p, programId: id }));
      await saveProgram(id, { ...data, slug: data.slug || id, contentPacks: packs });
      toast.success('Programme créé !');
      router.push(`/programs/${id}`);
    } catch {
      toast.error('Erreur lors de la création');
      setCreating(false);
    }
  };

  const handleSave = async () => {
    if (!data.name.trim() || !data.partnerId) { toast.error('Nom et partenaire requis'); return; }
    setSaving(true);
    try {
      await saveProgram(programId, data);
      toast.success('Modifications enregistrées');
    } catch {
      toast.error('Erreur lors de l’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  const storageId = isNew ? (newId || 'new') : programId;
  const pack = contentPackIdx !== null ? data.contentPacks[contentPackIdx] : null;

  return (
    <div>
      {/* Header type "Configuration du parcours" */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => router.push('/programs')} className="flex items-center gap-2 mb-2" style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: 12 }}>
            <ArrowLeft size={14} />
            Programmes
          </button>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>Configuration du parcours</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
            Paramétrez la structure et l’identité {data.name ? `de ${data.name}` : 'du programme'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/programs')} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}>
            Annuler
          </button>
          {isNew ? (
            <button className="btn-primary flex items-center gap-2" onClick={handleCreate} disabled={creating}>
              {creating ? 'Création...' : 'Créer le programme'}
            </button>
          ) : (
            <button className="btn-primary flex items-center gap-2" onClick={handleSave} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>

      {/* Layout 2 colonnes : sidebar de navigation (card) + contenu de l'onglet */}
      <div className="flex gap-6 items-start">
        {/* Navigation latérale */}
        <nav className="glass-card" style={{ width: 240, flexShrink: 0, padding: 12 }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            const Icon = tab.icon;
            const count = tab.key === 'structure' ? data.contentPacks.length : tab.key === 'personas' ? profiles.length : null;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="flex items-center gap-3 w-full"
                style={{
                  padding: '10px 12px',
                  marginBottom: 2,
                  borderRadius: 10,
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 14,
                  fontWeight: active ? 600 : 500,
                  background: active ? 'var(--color-info-light)' : 'transparent',
                  color: active ? 'var(--color-info)' : 'var(--color-text-secondary)',
                }}
              >
                <Icon size={18} />
                <span style={{ flex: 1 }}>{tab.label}</span>
                {count !== null && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: active ? 'var(--color-info)' : 'var(--color-text-muted)' }}>{count}</span>
                )}
              </button>
            );
          })}

          {/* Formulaire de fin : ouvre le form builder dédié (/end-form) sur ce programme. */}
          {!isNew && (
            <>
              <div style={{ height: 1, background: 'var(--color-card-border)', margin: '8px 4px' }} />
              <button
                onClick={() => router.push(`/end-form?program=${programId}`)}
                className="flex items-center gap-3 w-full"
                style={{
                  padding: '10px 12px', marginBottom: 2, borderRadius: 10, border: 'none', cursor: 'pointer',
                  textAlign: 'left', fontSize: 14, fontWeight: 500,
                  background: 'transparent', color: 'var(--color-text-secondary)',
                }}
              >
                <ClipboardList size={18} />
                <span style={{ flex: 1 }}>Formulaire de fin</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>↗</span>
              </button>
            </>
          )}
        </nav>

        {/* Contenu de l'onglet actif */}
        <div style={{ flex: 1, minWidth: 0 }}>

      {activeTab === 'identity' && (
        <div className="glass-card p-6" style={{ maxWidth: 760 }}>
          {isNew && (
            <Field label="ID (identifiant unique, ex: young-africa-works)">
              <input className="input-field" value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="young-africa-works" />
            </Field>
          )}

          <Field label="Partenaire principal (porteur du programme)">
            {canEditPartner ? (
              <select
                className="input-field"
                value={data.partnerId}
                onChange={(e) => {
                  const id = e.target.value;
                  setData((prev) => ({
                    ...prev,
                    partnerId: id,
                    // le partenaire principal ne peut pas être aussi co-partenaire
                    coPartnerIds: (prev.coPartnerIds ?? []).filter((cid) => cid !== id),
                  }));
                }}
              >
                <option value="">— Choisir un partenaire —</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            ) : (
              <input
                className="input-field"
                value={partners.find((p) => p.id === data.partnerId)?.name ?? '—'}
                disabled
                readOnly
              />
            )}
          </Field>

          <Field label="Co-partenaires (« En partenariat avec »)">
            {!canEditPartner ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {(data.coPartnerIds ?? []).map((id) => partners.find((p) => p.id === id)?.name).filter(Boolean).join(', ') || 'Aucun'}
              </p>
            ) : partners.filter((p) => p.id !== data.partnerId).length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Aucun autre partenaire disponible.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {partners.filter((p) => p.id !== data.partnerId).map((p) => {
                  const checked = (data.coPartnerIds ?? []).includes(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const ids = new Set(data.coPartnerIds ?? []);
                          if (e.target.checked) ids.add(p.id); else ids.delete(p.id);
                          update('coPartnerIds', Array.from(ids));
                        }}
                      />
                      {p.name}
                    </label>
                  );
                })}
              </div>
            )}
          </Field>

          <Field label="Nom du programme">
            <input className="input-field" value={data.name} onChange={(e) => update('name', e.target.value)} placeholder="Young Africa Works" />
          </Field>
          {/* Champ masqué : 'subtitle' non lu par le mobile. Conservé dans le state. */}

          <Field label="Slug">
            <input className="input-field" value={data.slug} onChange={(e) => update('slug', e.target.value)} placeholder="young-africa-works" />
          </Field>

          <Field label="Description courte">
            <textarea className="input-field" rows={3} value={data.description} onChange={(e) => update('description', e.target.value)} placeholder="Présentation du programme..." />
          </Field>

          {/* Champ masqué : 'tags' non lu par le mobile. Conservé dans le state. */}

          <label className="flex items-center gap-3 mt-4" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={data.isActive} onChange={(e) => update('isActive', e.target.checked)} />
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Programme actif</span>
          </label>

          {/* ===== Base de contenu (réutilisée par le Studio de génération) ===== */}
          <div style={{ borderTop: '1px solid var(--color-card-border)', marginTop: 24, paddingTop: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>Base de contenu</h3>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Documents sources et brief de génération. Saisis une seule fois ici, ils sont réutilisés automatiquement par le <strong>Studio de contenu</strong> à chaque génération — plus besoin de re-fournir un document.
            </p>

            {/* Documents sources */}
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>Documents sources</label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_DOC}
              onChange={handleSourceFile}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingDoc}
              className="w-full mb-3"
              style={{ border: '2px dashed var(--color-card-border)', borderRadius: 12, padding: '20px', textAlign: 'center', cursor: uploadingDoc ? 'wait' : 'pointer', background: 'transparent', opacity: uploadingDoc ? 0.6 : 1 }}
            >
              <Upload size={22} color="var(--color-text-muted)" style={{ margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {uploadingDoc ? `Téléversement… ${uploadProgress}%` : 'Ajouter un document'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>PDF, DOCX, MD, PPTX · indexé pour la génération</p>
            </button>
            {source.documents.length > 0 && (
              <div className="flex flex-col gap-2 mb-5">
                {source.documents.map((d) => (
                  <div key={d.id} className="flex items-center justify-between" style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--color-surface)' }}>
                    <div className="flex items-center gap-2.5">
                      <FileText size={15} color="var(--color-text-muted)" />
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: 'var(--color-info)', textDecoration: 'underline' }}>{d.name}</a>
                      ) : (
                        <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{d.name}</span>
                      )}
                      {d.size && d.size !== '—' && (
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{d.size}{(d.pages ?? 0) > 0 ? ` · ${d.pages} p.` : ''}</span>
                      )}
                    </div>
                    <button onClick={() => removeSourceDoc(d.id)} className="p-1.5 rounded-lg" style={{ background: 'rgba(244,67,54,0.08)', color: '#F44336', border: 'none', cursor: 'pointer' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Brief — Objectif pédagogique */}
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>Objectif pédagogique principal</label>
            <div className="flex gap-2 mb-5 flex-wrap">
              {['Sensibilisation', 'Qualification', 'Pré-incubation', 'Accélération'].map((o) => {
                const active = (source.objective ?? 'Qualification') === o;
                return (
                  <button
                    key={o}
                    onClick={() => updateSource('objective', o)}
                    style={{ padding: '6px 16px', borderRadius: 999, fontSize: 13, cursor: 'pointer', fontWeight: active ? 600 : 500, border: `1px solid ${active ? 'transparent' : 'var(--color-card-border)'}`, background: active ? 'var(--color-info-light)' : '#FFFFFF', color: active ? 'var(--color-info)' : 'var(--color-text-secondary)' }}
                  >
                    {o}
                  </button>
                );
              })}
            </div>

            {/* Brief — Sujets à valoriser */}
            <TopicField
              label="Sujets à valoriser"
              color="var(--color-success)"
              topics={source.topicsKeep}
              value={newTopicKeep}
              onValueChange={setNewTopicKeep}
              onAdd={() => { addTopic('topicsKeep', newTopicKeep); setNewTopicKeep(''); }}
              onRemove={(t) => removeTopic('topicsKeep', t)}
            />

            {/* Brief — Sujets à éviter */}
            <TopicField
              label="Sujets à éviter"
              color="#E5484D"
              topics={source.topicsAvoid}
              value={newTopicAvoid}
              onValueChange={setNewTopicAvoid}
              onAdd={() => { addTopic('topicsAvoid', newTopicAvoid); setNewTopicAvoid(''); }}
              onRemove={(t) => removeTopic('topicsAvoid', t)}
            />
          </div>
        </div>
      )}

      {activeTab === 'branding' && (
        <div className="glass-card p-6" style={{ maxWidth: 760 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 16 }}>Branding</h2>
          <div className="grid grid-cols-2 gap-4">
            <ImageUploadField label="Image de fond (carte programme)" value={data.heroImageUrl || ''} onChange={(url) => update('heroImageUrl', url)} storagePath={`programs/${storageId}/hero`} aspectRatio="banner" />
            <ImageUploadField label="Logo du programme (milieu-gauche)" value={data.logoUrl || ''} onChange={(url) => update('logoUrl', url)} storagePath={`programs/${storageId}/logo`} aspectRatio="square" />
          </div>
          <div className="mt-4">
            <ImageUploadField label="Logo co-partenaire (« En partenariat avec », haut-droite — optionnel)" value={data.bannerUrl || ''} onChange={(url) => update('bannerUrl', url)} storagePath={`programs/${storageId}/copartner`} aspectRatio="square" />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <Field label="Couleur accent 1">
              <ColorInput value={data.primaryColor} onChange={(v) => update('primaryColor', v)} />
            </Field>
            <Field label="Couleur accent 2">
              <ColorInput value={data.secondaryColor} onChange={(v) => update('secondaryColor', v)} />
            </Field>
          </div>
        </div>
      )}

      {activeTab === 'eligibility' && (
        <div className="glass-card p-6" style={{ maxWidth: 900 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 16 }}>Éligibilité</h2>

          {/* Tranche d'âge */}
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>Tranche d&apos;âge</label>
          <div className="flex items-center gap-3" style={{ marginBottom: 20 }}>
            <input
              type="number"
              className="input-field"
              style={{ width: 120 }}
              value={elig.ageMin ?? ''}
              onChange={(e) => updateEligibility('ageMin', e.target.value === '' ? undefined : Number(e.target.value))}
              placeholder="18"
            />
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>à</span>
            <input
              type="number"
              className="input-field"
              style={{ width: 120 }}
              value={elig.ageMax ?? ''}
              onChange={(e) => updateEligibility('ageMax', e.target.value === '' ? undefined : Number(e.target.value))}
              placeholder="35"
            />
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>ans</span>
          </div>

          {/* Régions couvertes */}
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>Régions couvertes</label>
          <div className="flex flex-wrap gap-2" style={{ marginBottom: 20 }}>
            <ChipMultiSelect options={SENEGAL_REGIONS} selected={elig.regions} onToggle={(v) => toggleEligList('regions', v)} />
          </div>

          {/* Secteurs cibles */}
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>Secteurs cibles</label>
          <div className="flex flex-wrap gap-2" style={{ marginBottom: 20 }}>
            <ChipMultiSelect options={SECTOR_OPTIONS} selected={elig.sectors} onToggle={(v) => toggleEligList('sectors', v)} />
          </div>

          {/* Profils éligibles */}
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>Profils éligibles</label>
          <div className="flex flex-col gap-2" style={{ marginBottom: 20 }}>
            {AUDIENCE_PROFILE_OPTIONS.map((p) => {
              const checked = elig.audienceProfiles.includes(p);
              return (
                <label key={p} className="flex items-center gap-2.5" style={{ cursor: 'pointer', fontSize: 14, color: 'var(--color-text-primary)' }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleEligList('audienceProfiles', p)} />
                  {p}
                </label>
              );
            })}
          </div>

          {/* Aperçu joueur */}
          <div className="glass-card" style={{ background: 'var(--color-surface)', padding: 16, marginTop: 4 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 12 }}>
              Aperçu joueur · « À qui s&apos;adresse ce parcours »
            </p>
            <div className="flex flex-wrap gap-2">
              <PreviewChip>{elig.ageMin ?? '?'}–{elig.ageMax ?? '?'} ans</PreviewChip>
              <PreviewChip>{elig.regions.length} région{elig.regions.length !== 1 ? 's' : ''}</PreviewChip>
              <PreviewChip>{elig.sectors.length} secteur{elig.sectors.length !== 1 ? 's' : ''}</PreviewChip>
              {elig.audienceProfiles.length > 0 && <PreviewChip>{elig.audienceProfiles.join(' & ')}</PreviewChip>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'language' && (
        <div className="glass-card p-6" style={{ maxWidth: 760 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 16 }}>Langue</h2>
          {([
            { key: 'fr', label: 'Français', badge: 'par défaut', disabled: false },
            { key: 'en', label: 'Anglais', badge: 'V2', disabled: true },
            { key: 'wo', label: 'Wolof (audio)', badge: 'V1.5', disabled: true },
          ] as const).map((lang) => (
            <label key={lang.key} className="flex items-center gap-3 mb-3" style={{ cursor: lang.disabled ? 'not-allowed' : 'pointer', opacity: lang.disabled ? 0.5 : 1 }}>
              <input type="radio" name="language" checked={(data.language ?? 'fr') === lang.key} disabled={lang.disabled} onChange={() => update('language', lang.key)} />
              <span style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{lang.label}</span>
              <span className="badge" style={{ fontSize: 10 }}>{lang.badge}</span>
            </label>
          ))}
          <div className="glass-card p-3 mt-2" style={{ background: 'rgba(33,150,243,0.08)', borderColor: 'rgba(33,150,243,0.2)' }}>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Disponible en wolof audio (TTS) à partir de la version 1.5.</p>
          </div>
        </div>
      )}

      {activeTab === 'advanced' && (
        <div className="glass-card p-6" style={{ maxWidth: 760 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 16 }}>Avancé</h2>
          {([
            { key: 'rule7030', title: 'Règle 70/30 bibliothèque CONCREE', desc: 'Garantit la qualité pédagogique' },
            { key: 'concreeValidationRequired', title: 'Validation CONCREE obligatoire', desc: 'Revue humaine avant publication' },
            { key: 'frequencyCap', title: 'Frequency cap messages', desc: 'Max 2 messages / mois / joueur' },
            { key: 'publicPreview', title: 'Mode preview public', desc: 'Lien de démonstration accessible' },
          ] as const).map((opt) => (
            <div key={opt.key} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--color-card-border)' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{opt.title}</p>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{opt.desc}</p>
              </div>
              <Toggle checked={!!data.advancedSettings?.[opt.key]} onChange={(v) => updateAdvanced(opt.key, v)} />
            </div>
          ))}
        </div>
      )}

      {activeTab === 'structure' && (
        <div className="glass-card p-6" style={{ maxWidth: 900 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 20 }}>Structure</h2>

          {/* Nombre de parties — slider */}
          <div className="flex items-center gap-3 mb-3">
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Nombre de parties — <span style={{ color: 'var(--color-info)' }}>{data.contentPacks.length}</span>
            </span>
            {data.contentPacks.length >= 5 && data.contentPacks.length <= 8 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-success)', background: 'var(--color-success-light)', padding: '3px 10px', borderRadius: 999 }}>
                recommandé
              </span>
            )}
          </div>
          <input
            type="range"
            min={1}
            max={12}
            value={data.contentPacks.length}
            onChange={(e) => setPartCount(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--color-info)', marginBottom: 24, cursor: 'pointer' }}
          />

          {/* Niveaux entrepreneuriaux couverts */}
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>Niveaux entrepreneuriaux couverts</p>
          <div className="flex flex-wrap gap-2 mb-6">
            {LEVEL_TIERS.map((t) => {
              const covered = data.contentPacks.some((p) => p.levelTier === t.key);
              return (
                <span
                  key={t.key}
                  style={{
                    padding: '7px 16px', borderRadius: 999, fontSize: 13,
                    fontWeight: covered ? 600 : 500,
                    background: covered ? 'var(--color-info-light)' : '#FFFFFF',
                    border: `1px solid ${covered ? 'transparent' : 'var(--color-card-border)'}`,
                    color: covered ? 'var(--color-info)' : 'var(--color-text-muted)',
                  }}
                >
                  {covered ? '✓ ' : ''}{t.label}
                </span>
              );
            })}
          </div>

          {/* Séquence des parties */}
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>Séquence des parties</p>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            Glissez la poignée ⠿ pour réordonner. Cliquez sur une partie pour éditer son titre, son niveau et gérer son contenu.
          </p>

          <div className="flex flex-col gap-2.5">
            {data.contentPacks.map((p, idx) => {
              const total = p.quizzes.length + p.duels.length + p.fundings.length + p.opportunities.length + p.challengeEvents.length;
              const tierLabel = LEVEL_TIERS.find((t) => t.key === p.levelTier)?.label;
              const tierNum = p.levelTier ? LEVEL_TIERS.findIndex((t) => t.key === p.levelTier) + 1 : null;
              const isOpen = expandedPackIdx === idx;
              return (
                <div
                  key={p.id}
                  className="glass-card"
                  draggable={dragIndex !== null}
                  onDragOver={(e) => { if (dragIndex !== null) { e.preventDefault(); setDragOverIndex(idx); } }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null) movePack(dragIndex, idx);
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  style={{
                    padding: 0,
                    opacity: dragIndex === idx ? 0.4 : 1,
                    outline: dragOverIndex === idx && dragIndex !== idx ? '2px dashed var(--color-info)' : 'none',
                    outlineOffset: 2,
                  }}
                >
                  {/* Ligne compacte (style maquette) */}
                  <div
                    className="flex items-center gap-3"
                    style={{ padding: '14px 16px', cursor: 'pointer' }}
                    onClick={() => setExpandedPackIdx(isOpen ? null : idx)}
                  >
                    <span
                      title="Glisser pour réordonner"
                      onMouseDown={(e) => { e.stopPropagation(); setDragIndex(idx); }}
                      onClick={(e) => e.stopPropagation()}
                      onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                      style={{ cursor: 'grab', display: 'flex', color: 'var(--color-text-muted)' }}
                    >
                      <GripVertical size={16} />
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', background: 'var(--color-surface)', padding: '3px 10px', borderRadius: 8, whiteSpace: 'nowrap' }}>
                      Partie {idx + 1}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', flex: 1 }}>
                      {p.title || p.name || 'Sans titre'}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      {tierNum ? `Niveau ${tierNum} · ${tierLabel}` : 'Niveau non défini'}
                    </span>
                  </div>

                  {/* Panneau d'édition (déplié au clic) */}
                  {isOpen && (
                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--color-card-border)' }}>
                      <div className="pt-4">
                        <input className="input-field" value={p.title || p.name} onChange={(e) => updatePack(idx, { title: e.target.value, name: e.target.value })} placeholder="Titre de la partie (ex: Validation du problème)" style={{ marginBottom: 8 }} />
                        <select className="input-field" value={p.levelTier ?? ''} onChange={(e) => updatePack(idx, { levelTier: (e.target.value || undefined) as ProgramLevelTier | undefined })} style={{ marginBottom: 8, fontSize: 12 }}>
                          <option value="">— Niveau entrepreneurial —</option>
                          {LEVEL_TIERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                        <input className="input-field" value={p.description || ''} onChange={(e) => updatePack(idx, { description: e.target.value })} placeholder="Description (optionnel)" style={{ marginBottom: 12, fontSize: 12 }} />
                        <div className="flex flex-wrap gap-3 mb-3">
                          {CONTENT_TABS.map((ct) => (
                            <span key={ct.key} style={{ fontSize: 11, color: ct.color }}>
                              {(p[ct.key] as unknown[]).length} {ct.label}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="btn-secondary flex-1 flex items-center justify-center gap-2"
                            onClick={() => router.push(`/studio?program=${storageId}&pack=${p.id}`)}
                            style={{ padding: '8px 12px', fontSize: 12 }}
                            title="Ouvrir le contenu de cette partie dans le Studio"
                          >
                            <Edit size={13} /> Gérer le contenu ({total})
                          </button>
                          {data.contentPacks.length > 1 && (
                            <button onClick={() => { removePack(idx); setExpandedPackIdx(null); }} className="p-2 rounded-lg" style={{ background: 'rgba(244,67,54,0.08)', color: '#F44336', border: 'none', cursor: 'pointer' }} title="Supprimer la partie">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Ajouter une partie */}
          <button className="btn-secondary flex items-center gap-2 mt-3" onClick={addPack} style={{ padding: '8px 14px', fontSize: 12 }}>
            <Plus size={14} /> Ajouter une partie
          </button>

          {/* Modes de jeu autorisés + Mode recommandé */}
          <div className="grid grid-cols-2 gap-6 mt-8" style={{ borderTop: '1px solid var(--color-card-border)', paddingTop: 24 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 12 }}>Modes de jeu autorisés</p>
              {GAME_MODES.map((m) => {
                const checked = m.key === 'solo' || (data.allowedModes ?? []).includes(m.key);
                return (
                  <label key={m.key} className="flex items-center gap-2.5 mb-2.5" style={{ cursor: m.key === 'solo' ? 'not-allowed' : 'pointer', fontSize: 14, color: 'var(--color-text-primary)' }}>
                    <input type="checkbox" checked={checked} disabled={m.key === 'solo'} onChange={() => toggleMode(m.key)} />
                    {m.label}{m.key === 'solo' && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>(obligatoire)</span>}
                  </label>
                );
              })}
            </div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 12 }}>Mode recommandé côté joueur</p>
              {GAME_MODES.map((m) => (
                <label key={m.key} className="flex items-center gap-2.5 mb-2.5" style={{ cursor: 'pointer', fontSize: 14, color: 'var(--color-text-primary)' }}>
                  <input type="radio" name="recommendedMode" checked={(data.recommendedMode ?? 'solo') === m.key} onChange={() => update('recommendedMode', m.key)} />
                  {m.recommendedLabel}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'personas' && (
        <div className="glass-card p-6" style={{ maxWidth: 760 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>Personas activés</h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
            {profiles.length} persona{profiles.length !== 1 ? 's' : ''} configuré{profiles.length !== 1 ? 's' : ''}. La création, l’édition et les statistiques se gèrent désormais sur la page dédiée.
          </p>
          <div className="flex flex-col gap-2 mb-4">
            {profiles.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Aucun persona pour l’instant.</p>
            ) : profiles.map((pf) => (
              <div key={pf.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--color-surface)' }}>
                {pf.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={pf.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--color-surface-variant)' }} />
                )}
                <div className="flex-1">
                  <p style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{pf.name || 'Sans nom'}{pf.age ? `, ${pf.age}` : ''}</p>
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{[pf.sector, pf.location].filter(Boolean).join(' · ')}</p>
                </div>
                {pf.isDraft && <span className="badge" style={{ fontSize: 10 }}>Brouillon</span>}
                {!pf.isDraft && pf.enabled === false && <span className="badge badge-error" style={{ fontSize: 10 }}>Désactivé</span>}
              </div>
            ))}
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={() => router.push('/personas')}>
            <Plus size={16} /> Gérer les personas
          </button>
        </div>
      )}

        </div>{/* fin colonne contenu */}
      </div>{/* fin layout 2 colonnes */}

      {/* Modal contenu d'un pack */}
      {pack && contentPackIdx !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setContentPackIdx(null)}>
          <div className="glass-card" style={{ width: 'min(720px, 92vw)', maxHeight: '88vh', overflow: 'auto', padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>{pack.name}</h3>
              <button onClick={() => setContentPackIdx(null)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div className="flex gap-1 mb-4 flex-wrap">
              {CONTENT_TABS.map((ct) => (
                <button key={ct.key} onClick={() => setContentTab(ct.key)} className={contentTab === ct.key ? 'btn-primary' : 'btn-secondary'} style={{ padding: '6px 12px', fontSize: 12 }}>
                  {ct.label} ({(pack[ct.key] as unknown[]).length})
                </button>
              ))}
            </div>

            <div className="flex gap-2 mb-4 flex-wrap">
              <button className="btn-secondary flex items-center gap-1" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setShowImportModal(true)}>
                <Upload size={13} /> Importer
              </button>
              <button className="btn-primary flex items-center gap-1" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => openAdd(contentTab)}>
                <Plus size={13} /> Ajouter
              </button>
              <button
                className="btn-secondary flex items-center gap-1"
                style={{ padding: '6px 12px', fontSize: 12 }}
                disabled={translating}
                onClick={() => contentPackIdx !== null && translatePack(contentPackIdx, 'en')}
                title="Génère la version anglaise de tout le contenu du pack via l'IA"
              >
                <Languages size={13} /> {translating ? 'Traduction…' : 'Traduire en anglais'}
              </button>
              <div className="ml-auto">
                <LangTabs lang={contentLang} onChange={setContentLang} />
              </div>
            </div>

            <ContentList
              pack={pack}
              contentTab={contentTab}
              lang={contentLang}
              onEdit={openEdit}
              onDelete={(index) => removeItem(contentPackIdx, contentTab, index)}
            />
          </div>
        </div>
      )}

      {/* Éditeurs d'événements */}
      {editingQuiz && contentPackIdx !== null && (
        <QuizEditor quiz={editingQuiz.quiz} onClose={() => setEditingQuiz(null)}
          onSave={(quiz) => { upsertItem(contentPackIdx, 'quizzes', quiz, editingQuiz.index); setEditingQuiz(null); }} />
      )}
      {editingDuel && contentPackIdx !== null && (
        <DuelEditor duel={editingDuel.duel} onClose={() => setEditingDuel(null)}
          onSave={(duel) => { upsertItem(contentPackIdx, 'duels', duel, editingDuel.index); setEditingDuel(null); }} />
      )}
      {editingFunding && contentPackIdx !== null && (
        <FundingEditor funding={editingFunding.funding} onClose={() => setEditingFunding(null)}
          onSave={(funding) => { upsertItem(contentPackIdx, 'fundings', funding, editingFunding.index); setEditingFunding(null); }} />
      )}
      {editingOpportunity && contentPackIdx !== null && (
        <OpportunityEditor opportunity={editingOpportunity.opportunity} onClose={() => setEditingOpportunity(null)}
          onSave={(opportunity) => { upsertItem(contentPackIdx, 'opportunities', opportunity, editingOpportunity.index); setEditingOpportunity(null); }} />
      )}
      {editingChallengeEvent && contentPackIdx !== null && (
        <ChallengeEventEditor challengeEvent={editingChallengeEvent.challengeEvent} onClose={() => setEditingChallengeEvent(null)}
          onSave={(ce) => { upsertItem(contentPackIdx, 'challengeEvents', ce, editingChallengeEvent.index); setEditingChallengeEvent(null); }} />
      )}

      {showImportModal && pack && (
        <ImportContentModal
          programName={data.name}
          subLevelTitle={pack.name}
          importFilter={importFilter}
          onClose={() => { setShowImportModal(false); setImportFilter(undefined); }}
          onImport={handleImport}
        />
      )}
    </div>
  );

  function openAdd(tab: ContentTab) {
    if (tab === 'quizzes') setEditingQuiz({ quiz: null, index: null });
    else if (tab === 'duels') setEditingDuel({ duel: null, index: null });
    else if (tab === 'fundings') setEditingFunding({ funding: null, index: null });
    else if (tab === 'opportunities') setEditingOpportunity({ opportunity: null, index: null });
    else setEditingChallengeEvent({ challengeEvent: null, index: null });
  }

  function openEdit(tab: ContentTab, index: number) {
    if (contentPackIdx === null) return;
    const p = data.contentPacks[contentPackIdx];
    if (tab === 'quizzes') setEditingQuiz({ quiz: p.quizzes[index], index });
    else if (tab === 'duels') setEditingDuel({ duel: p.duels[index], index });
    else if (tab === 'fundings') setEditingFunding({ funding: p.fundings[index], index });
    else if (tab === 'opportunities') setEditingOpportunity({ opportunity: p.opportunities[index], index });
    else setEditingChallengeEvent({ challengeEvent: p.challengeEvents[index], index });
  }
}

function ContentList({ pack, contentTab, lang, onEdit, onDelete }: {
  pack: ProgramContentPack;
  contentTab: ContentTab;
  lang: ContentLang;
  onEdit: (tab: ContentTab, index: number) => void;
  onDelete: (index: number) => void;
}) {
  const items = pack[contentTab] as {
    id: string;
    title?: string;
    question?: string;
    translations?: { en?: { title?: string; question?: string } };
  }[];
  if (items.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: 24 }}>Aucun élément. Ajoutez-en ou importez depuis un texte.</p>;
  }
  const isEN = lang === 'en';
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => {
        const frLabel = item.title || item.question || `Élément ${index + 1}`;
        const enLabel = item.translations?.en?.title || item.translations?.en?.question || '';
        const missingEN = isEN && !enLabel;
        return (
          <div key={item.id || index} className="flex items-center justify-between" style={{ padding: 12, borderRadius: 10, background: 'var(--color-surface)' }}>
            <span style={{ fontSize: 13, color: missingEN ? 'var(--color-text-muted)' : 'var(--color-text-secondary)', flex: 1, marginRight: 12, fontStyle: missingEN ? 'italic' : 'normal' }}>
              {isEN ? (enLabel || `Non traduit — « ${frLabel} »`) : frLabel}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => onEdit(contentTab, index)} className="p-1.5 rounded-lg" style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }} title={isEN ? 'Éditer (sélecteur FR/EN dans l’éditeur)' : 'Éditer'}><Edit size={13} /></button>
              <button onClick={() => onDelete(index)} className="p-1.5 rounded-lg" style={{ background: 'rgba(244,67,54,0.08)', color: '#F44336', border: 'none', cursor: 'pointer' }}><Trash2 size={13} /></button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TopicField({ label, color, topics, value, onValueChange, onAdd, onRemove }: {
  label: string; color: string; topics: string[];
  value: string; onValueChange: (v: string) => void; onAdd: () => void; onRemove: (t: string) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{label}</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {topics.length === 0 && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Aucun</span>}
        {topics.map((t) => (
          <span key={t} className="flex items-center gap-1.5" style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, color, background: `${color.startsWith('var') ? 'var(--color-success-light)' : color + '1a'}` }}>
            {t}
            <button onClick={() => onRemove(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color, display: 'flex' }}><X size={12} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="input-field"
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAdd(); } }}
          placeholder="Ajouter un sujet…"
        />
        <button className="btn-secondary" onClick={onAdd} style={{ whiteSpace: 'nowrap', padding: '8px 14px', fontSize: 12 }}>+ Ajouter</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} style={{ width: 40, height: 38, padding: 2, borderRadius: 8, border: '1px solid var(--color-card-border)', background: 'transparent', cursor: 'pointer' }} />
      <input className="input-field" value={value} onChange={(e) => onChange(e.target.value)} placeholder="#FFB347" style={{ flex: 1 }} />
    </div>
  );
}

function ChipMultiSelect({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onToggle(opt)}
            style={{
              padding: '6px 14px',
              borderRadius: 999,
              fontSize: 13,
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
              border: `1px solid ${active ? 'transparent' : 'var(--color-card-border)'}`,
              background: active ? 'var(--color-info-light)' : '#FFFFFF',
              color: active ? 'var(--color-info)' : 'var(--color-text-secondary)',
            }}
          >
            {active ? '✓ ' : ''}{opt}
          </button>
        );
      })}
    </div>
  );
}

function PreviewChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      padding: '6px 14px',
      borderRadius: 999,
      fontSize: 13,
      background: '#FFFFFF',
      border: '1px solid var(--color-card-border)',
      color: 'var(--color-text-secondary)',
    }}>
      {children}
    </span>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: 44,
        height: 26,
        borderRadius: 13,
        border: 'none',
        cursor: 'pointer',
        background: checked ? '#3FAE6B' : 'var(--color-surface-variant)',
        position: 'relative',
        transition: 'background 0.15s',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3,
        left: checked ? 21 : 3,
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: '#FFFFFF',
        transition: 'left 0.15s',
      }} />
    </button>
  );
}
