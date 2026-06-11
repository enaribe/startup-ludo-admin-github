'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Plus, Trash2, X, Edit, Upload, Package } from 'lucide-react';
import { getProgram, saveProgram, getPartners } from '@/lib/firestore-service';
import type {
  PartnerProgram, ProgramContentPack, ProgramPartner,
  Quiz, Duel, Funding, Opportunity, ChallengeEvent,
} from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ImageUploadField from '@/components/ui/ImageUploadField';
import SaveStatusIndicator from '@/components/ui/SaveStatusIndicator';
import QuizEditor from '@/components/events/QuizEditor';
import DuelEditor from '@/components/events/DuelEditor';
import FundingEditor from '@/components/events/FundingEditor';
import OpportunityEditor from '@/components/events/OpportunityEditor';
import ChallengeEventEditor from '@/components/events/ChallengeEventEditor';
import ImportContentModal, { type ImportedContent } from '@/components/ui/ImportContentModal';
import { generateId } from '@/lib/utils';
import { useAutoSave } from '@/hooks/useAutoSave';
import toast from 'react-hot-toast';

type Tab = 'general' | 'content';
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
    name: 'Nouveau pack',
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
    isActive: true, sortOrder: 0,
  };
}

export default function ProgramEditorPage() {
  const router = useRouter();
  const params = useParams();
  const programId = params.programId as string;
  const isNew = programId === 'new';

  const [data, setData] = useState<Omit<PartnerProgram, 'id'>>(() => makeEmpty('new'));
  const [partners, setPartners] = useState<ProgramPartner[]>([]);
  const [newId, setNewId] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [loading, setLoading] = useState(!isNew);
  const [creating, setCreating] = useState(false);

  // pack en cours d'édition de contenu
  const [contentPackIdx, setContentPackIdx] = useState<number | null>(null);
  const [contentTab, setContentTab] = useState<ContentTab>('quizzes');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFilter, setImportFilter] = useState<ContentTab | undefined>(undefined);

  // éditeurs d'événements
  const [editingQuiz, setEditingQuiz] = useState<{ quiz: Quiz | null; index: number | null } | null>(null);
  const [editingDuel, setEditingDuel] = useState<{ duel: Duel | null; index: number | null } | null>(null);
  const [editingFunding, setEditingFunding] = useState<{ funding: Funding | null; index: number | null } | null>(null);
  const [editingOpportunity, setEditingOpportunity] = useState<{ opportunity: Opportunity | null; index: number | null } | null>(null);
  const [editingChallengeEvent, setEditingChallengeEvent] = useState<{ challengeEvent: ChallengeEvent | null; index: number | null } | null>(null);

  const persist = useCallback(
    (d: Omit<PartnerProgram, 'id'>) => saveProgram(programId, d),
    [programId]
  );
  const { status: saveStatus, flush } = useAutoSave({
    data,
    save: persist,
    enabled: !isNew && !loading,
  });

  useEffect(() => {
    getPartners().then(setPartners).catch(() => toast.error('Erreur de chargement des partenaires'));
  }, []);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const prog = await getProgram(programId);
        if (prog) {
          const { id: _id, ...rest } = prog;
          void _id;
          setData({
            ...makeEmpty(programId),
            ...rest,
            audience: { ...makeEmpty(programId).audience, ...(rest.audience ?? {}) },
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

  const updateAudience = (key: keyof PartnerProgram['audience'], value: unknown) =>
    setData((prev) => ({ ...prev, audience: { ...prev.audience, [key]: value } }));

  // ===== Content packs =====
  const addPack = () => setData((prev) => ({ ...prev, contentPacks: [...prev.contentPacks, emptyPack(isNew ? newId || 'new' : programId)] }));
  const removePack = (idx: number) => setData((prev) => ({ ...prev, contentPacks: prev.contentPacks.filter((_, i) => i !== idx) }));
  const updatePack = (idx: number, patch: Partial<ProgramContentPack>) =>
    setData((prev) => ({ ...prev, contentPacks: prev.contentPacks.map((p, i) => (i === idx ? { ...p, ...patch } : p)) }));

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

  const handleNavigate = (path: string) => {
    if (!isNew) flush();
    router.push(path);
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  const storageId = isNew ? (newId || 'new') : programId;
  const pack = contentPackIdx !== null ? data.contentPacks[contentPackIdx] : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => handleNavigate('/programs')} className="flex items-center gap-2" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 13 }}>
          <ArrowLeft size={16} />
          Programmes
        </button>
        {!isNew && <SaveStatusIndicator status={saveStatus} />}
      </div>

      {/* Onglets */}
      <div className="flex gap-2 mb-6">
        {(['general', 'content'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={activeTab === tab ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '8px 18px', fontSize: 13 }}
          >
            {tab === 'general' ? 'Général' : `Contenus (${data.contentPacks.length})`}
          </button>
        ))}
      </div>

      {activeTab === 'general' && (
        <div className="glass-card p-6" style={{ maxWidth: 760 }}>
          {isNew && (
            <Field label="ID (identifiant unique, ex: young-africa-works)">
              <input className="input-field" value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="young-africa-works" />
            </Field>
          )}

          <Field label="Partenaire principal (porteur du programme)">
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
          </Field>

          <Field label="Co-partenaires (« En partenariat avec »)">
            {partners.filter((p) => p.id !== data.partnerId).length === 0 ? (
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Aucun autre partenaire disponible.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {partners.filter((p) => p.id !== data.partnerId).map((p) => {
                  const checked = (data.coPartnerIds ?? []).includes(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
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

          <div className="grid grid-cols-2 gap-4">
            <Field label="Nom du programme">
              <input className="input-field" value={data.name} onChange={(e) => update('name', e.target.value)} placeholder="Young Africa Works" />
            </Field>
            <Field label="Sous-titre">
              <input className="input-field" value={data.subtitle || ''} onChange={(e) => update('subtitle', e.target.value)} placeholder="Programme d'accompagnement" />
            </Field>
          </div>

          <Field label="Slug">
            <input className="input-field" value={data.slug} onChange={(e) => update('slug', e.target.value)} placeholder="young-africa-works" />
          </Field>

          <Field label="Description">
            <textarea className="input-field" rows={3} value={data.description} onChange={(e) => update('description', e.target.value)} placeholder="Présentation du programme..." />
          </Field>

          {/* Audience */}
          <div style={{ marginTop: 8, marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#FFFFFF' }}>Cible</div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tranche d'âge">
              <input className="input-field" value={data.audience.ageRange || ''} onChange={(e) => updateAudience('ageRange', e.target.value)} placeholder="18-35 ans" />
            </Field>
            <Field label="Secteur">
              <input className="input-field" value={data.audience.sector} onChange={(e) => updateAudience('sector', e.target.value)} placeholder="Agriculture, Tech..." />
            </Field>
          </div>
          <Field label="Profil visé">
            <input className="input-field" value={data.audience.profile} onChange={(e) => updateAudience('profile', e.target.value)} placeholder="Jeunes entrepreneurs..." />
          </Field>
          <Field label="Zones (séparées par des virgules)">
            <input className="input-field" value={data.audience.locations.join(', ')} onChange={(e) => updateAudience('locations', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="Dakar, Thiès, Saint-Louis" />
          </Field>

          <Field label="Tags (séparés par des virgules)">
            <input className="input-field" value={data.tags.join(', ')} onChange={(e) => update('tags', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} placeholder="entrepreneuriat, financement" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre de joueurs (affichage)">
              <input type="number" className="input-field" value={data.playerCount} onChange={(e) => update('playerCount', Number(e.target.value) || 0)} />
            </Field>
            <Field label="Ordre d'affichage">
              <input type="number" className="input-field" value={data.sortOrder} onChange={(e) => update('sortOrder', Number(e.target.value) || 0)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Couleur primaire">
              <ColorInput value={data.primaryColor} onChange={(v) => update('primaryColor', v)} />
            </Field>
            <Field label="Couleur secondaire">
              <ColorInput value={data.secondaryColor} onChange={(v) => update('secondaryColor', v)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <ImageUploadField label="Image de fond (carte programme)" value={data.heroImageUrl || ''} onChange={(url) => update('heroImageUrl', url)} storagePath={`programs/${storageId}/hero`} aspectRatio="banner" />
            <ImageUploadField label="Bannière (header de l'écran programme)" value={data.bannerUrl || ''} onChange={(url) => update('bannerUrl', url)} storagePath={`programs/${storageId}/banner`} aspectRatio="banner" />
          </div>
          <ImageUploadField label="Logo du programme" value={data.logoUrl || ''} onChange={(url) => update('logoUrl', url)} storagePath={`programs/${storageId}/logo`} aspectRatio="square" />

          <label className="flex items-center gap-3 mt-4" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={data.isActive} onChange={(e) => update('isActive', e.target.checked)} />
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Programme actif</span>
          </label>

          {isNew && (
            <button className="btn-primary mt-6" onClick={handleCreate} disabled={creating}>
              {creating ? 'Création...' : 'Créer le programme'}
            </button>
          )}
        </div>
      )}

      {activeTab === 'content' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              {data.contentPacks.length} pack{data.contentPacks.length !== 1 ? 's' : ''} de contenu
            </p>
            <button className="btn-secondary flex items-center gap-2" onClick={addPack} style={{ padding: '8px 14px', fontSize: 12 }}>
              <Plus size={14} /> Ajouter un pack
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.contentPacks.map((p, idx) => {
              const total = p.quizzes.length + p.duels.length + p.fundings.length + p.opportunities.length + p.challengeEvents.length;
              return (
                <div key={p.id} className="glass-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Package size={16} color="#9B59B6" />
                    {data.contentPacks.length > 1 && (
                      <button onClick={() => removePack(idx)} className="p-1.5 rounded-lg" style={{ background: 'rgba(244,67,54,0.08)', color: '#F44336', border: 'none', cursor: 'pointer' }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <input className="input-field" value={p.name} onChange={(e) => updatePack(idx, { name: e.target.value })} placeholder="Nom du pack" style={{ marginBottom: 8 }} />
                  <input className="input-field" value={p.description || ''} onChange={(e) => updatePack(idx, { description: e.target.value })} placeholder="Description (optionnel)" style={{ marginBottom: 12, fontSize: 12 }} />
                  <div className="flex flex-wrap gap-2 mb-3">
                    {CONTENT_TABS.map((ct) => (
                      <span key={ct.key} style={{ fontSize: 11, color: ct.color }}>
                        {(p[ct.key] as unknown[]).length} {ct.label}
                      </span>
                    ))}
                  </div>
                  <button className="btn-secondary w-full flex items-center justify-center gap-2" onClick={() => { setContentPackIdx(idx); setContentTab('quizzes'); }} style={{ padding: '8px 12px', fontSize: 12 }}>
                    <Edit size={13} /> Gérer le contenu ({total})
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal contenu d'un pack */}
      {pack && contentPackIdx !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setContentPackIdx(null)}>
          <div className="glass-card" style={{ width: 'min(720px, 92vw)', maxHeight: '88vh', overflow: 'auto', padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#FFFFFF' }}>{pack.name}</h3>
              <button onClick={() => setContentPackIdx(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            <div className="flex gap-1 mb-4 flex-wrap">
              {CONTENT_TABS.map((ct) => (
                <button key={ct.key} onClick={() => setContentTab(ct.key)} className={contentTab === ct.key ? 'btn-primary' : 'btn-secondary'} style={{ padding: '6px 12px', fontSize: 12 }}>
                  {ct.label} ({(pack[ct.key] as unknown[]).length})
                </button>
              ))}
            </div>

            <div className="flex gap-2 mb-4">
              <button className="btn-secondary flex items-center gap-1" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setShowImportModal(true)}>
                <Upload size={13} /> Importer
              </button>
              <button className="btn-primary flex items-center gap-1" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => openAdd(contentTab)}>
                <Plus size={13} /> Ajouter
              </button>
            </div>

            <ContentList
              pack={pack}
              contentTab={contentTab}
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

function ContentList({ pack, contentTab, onEdit, onDelete }: {
  pack: ProgramContentPack;
  contentTab: ContentTab;
  onEdit: (tab: ContentTab, index: number) => void;
  onDelete: (index: number) => void;
}) {
  const items = pack[contentTab] as { id: string; title?: string; question?: string }[];
  if (items.length === 0) {
    return <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 24 }}>Aucun élément. Ajoutez-en ou importez depuis un texte.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((item, index) => (
        <div key={item.id || index} className="flex items-center justify-between" style={{ padding: 12, borderRadius: 10, background: 'rgba(255,255,255,0.04)' }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', flex: 1, marginRight: 12 }}>
            {item.title || item.question || `Élément ${index + 1}`}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => onEdit(contentTab, index)} className="p-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)', border: 'none', cursor: 'pointer' }}><Edit size={13} /></button>
            <button onClick={() => onDelete(index)} className="p-1.5 rounded-lg" style={{ background: 'rgba(244,67,54,0.08)', color: '#F44336', border: 'none', cursor: 'pointer' }}><Trash2 size={13} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} style={{ width: 40, height: 38, padding: 2, borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', cursor: 'pointer' }} />
      <input className="input-field" value={value} onChange={(e) => onChange(e.target.value)} placeholder="#FFB347" style={{ flex: 1 }} />
    </div>
  );
}
