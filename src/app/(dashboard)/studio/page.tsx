'use client';

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sparkles, Search, Star, Check, Trash2, FileText, Settings, Wand2, X, Eye } from 'lucide-react';
import { getScopedPrograms, getProgram, saveProgram } from '@/lib/firestore-service';
import type { PartnerProgram, Quiz, Duel, Funding, Opportunity, ChallengeEvent } from '@/types';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';
import {
  generateLevelContent, publishToProgram, countContent,
  type GeneratedLevel, type LevelMix, type StudioBrief,
} from '@/lib/studio-generation';
import {
  flattenCards, totalCards, updateCardInPacks, removeCardFromPacks,
  CARD_META, CARD_TYPE_ORDER, type StudioCard, type StudioCardType, type CardRef,
} from '@/lib/studio-cards';

const GEN_TYPES = [
  { key: 'opportunity', label: 'Opportunité', color: '#3FAE6B' },
  { key: 'challenge', label: 'Challenge', color: '#E5484D' },
  { key: 'funding', label: 'Financement', color: '#F5A623' },
  { key: 'quiz', label: 'Quiz', color: '#5B8DEF' },
  { key: 'duel', label: 'Duel', color: '#9B59B6' },
] as const;
const LEVELS = ['Niv. 1', 'Niv. 2', 'Niv. 3', 'Niv. 4'];

export default function StudioPageWrapper() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><LoadingSpinner /></div>}>
      <StudioPage />
    </Suspense>
  );
}

function StudioPage() {
  const { isSuperAdmin, admin } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [programId, setProgramId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Données éditables du programme courant (contentPacks).
  const [data, setData] = useState<Omit<PartnerProgram, 'id'> | null>(null);

  // Sélection / filtres de la liste de cartes
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<StudioCardType | null>(null);
  const [searchText, setSearchText] = useState('');
  const [packFilter, setPackFilter] = useState<number | null>(null); // ciblage via ?pack=

  // Panneau de génération IA
  const [showGen, setShowGen] = useState(false);
  const [mix, setMix] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(GEN_TYPES.map((t) => [t.key, [8, 7, 5, 4]])));
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);

  // ===== Chargement des programmes =====
  useEffect(() => {
    (async () => {
      try {
        const list = await getScopedPrograms(admin);
        setPrograms(list);
        const fromUrl = searchParams.get('program');
        const initial = fromUrl && list.some((p) => p.id === fromUrl) ? fromUrl : list[0]?.id ?? '';
        setProgramId(initial);
      } finally { setLoading(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, admin?.uid]);

  // ===== Chargement du programme sélectionné =====
  useEffect(() => {
    if (!programId) { setData(null); return; }
    (async () => {
      const prog = await getProgram(programId);
      if (prog) {
        const { id: _id, ...rest } = prog;
        void _id;
        setData(rest);
      }
    })();
  }, [programId]);

  // Ciblage d'une partie précise (depuis « Gérer le contenu »).
  useEffect(() => {
    if (!data) return;
    const packParam = searchParams.get('pack');
    if (!packParam) { setPackFilter(null); return; }
    const idx = data.contentPacks.findIndex((p) => p.id === packParam);
    setPackFilter(idx >= 0 ? idx : null);
  }, [data, searchParams]);

  const currentProgram = programs.find((p) => p.id === programId);
  const contentSource = currentProgram?.contentSource;

  // ===== Liste de cartes (aplatie + filtrée) =====
  const allCards = useMemo(() => (data ? flattenCards(data.contentPacks) : []), [data]);
  const cards = useMemo(() => {
    let list = allCards;
    if (packFilter !== null) list = list.filter((c) => c.ref.packIndex === packFilter);
    if (typeFilter) list = list.filter((c) => c.type === typeFilter);
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      list = list.filter((c) => c.title.toLowerCase().includes(q));
    }
    return list;
  }, [allCards, packFilter, typeFilter, searchText]);

  const selected = useMemo(() => cards.find((c) => c.id === selectedId) ?? cards[0] ?? null, [cards, selectedId]);

  // ===== Édition d'une carte =====
  // Patch générique : les sous-éditeurs n'envoient que des champs valides pour le type courant.
  const patchSelected = (patch: Record<string, unknown>) => {
    if (!selected || !data) return;
    const newData = { ...selected.data, ...patch } as typeof selected.data;
    setData({ ...data, contentPacks: updateCardInPacks(data.contentPacks, selected.ref, newData) });
  };

  const deleteSelected = () => {
    if (!selected || !data) return;
    setData({ ...data, contentPacks: removeCardFromPacks(data.contentPacks, selected.ref) });
    setSelectedId(null);
  };

  const save = async () => {
    if (!data || !programId) return;
    setSaving(true);
    try {
      await saveProgram(programId, data);
      toast.success('Contenu enregistré.');
    } catch {
      toast.error('Échec de l’enregistrement.');
    } finally {
      setSaving(false);
    }
  };

  // ===== Génération IA (panneau) =====
  const levelMix = (li: number): LevelMix => ({
    opportunity: mix.opportunity[li] || 0,
    challenge: mix.challenge[li] || 0,
    funding: mix.funding[li] || 0,
    quiz: mix.quiz[li] || 0,
    duel: mix.duel[li] || 0,
  });
  const mixTotal = Object.values(mix).reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);

  const runGeneration = useCallback(async () => {
    if (!data || !programId) return;
    const brief: StudioBrief = {
      objective: contentSource?.objective ?? 'Qualification',
      topicsKeep: contentSource?.topicsKeep ?? [],
      topicsAvoid: contentSource?.topicsAvoid ?? [],
      programName: currentProgram?.name,
    };
    const activeLevels = [0, 1, 2, 3].filter((li) => GEN_TYPES.some((t) => (mix[t.key][li] || 0) > 0));
    if (activeLevels.length === 0) { toast.error('Renseignez le mix avant de générer.'); return; }

    setGenerating(true);
    setGenProgress(0);
    const results: GeneratedLevel[] = [];
    try {
      for (let i = 0; i < activeLevels.length; i++) {
        const lvl = await generateLevelContent(brief, activeLevels[i], levelMix(activeLevels[i]));
        results.push(lvl);
        setGenProgress(Math.round(((i + 1) / activeLevels.length) * 100));
      }
      // Publie directement dans les contentPacks en mémoire (visible dans la liste).
      const updated = publishToProgram(data, programId, results);
      setData(updated);
      const n = results.reduce((s, l) => s + countContent(l.content), 0);
      toast.success(`${n} cartes générées et ajoutées. Pensez à Enregistrer.`);
      setShowGen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'La génération a échoué.');
    } finally {
      setGenerating(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, programId, mix, contentSource, currentProgram]);

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  if (programs.length === 0) return <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucun programme accessible.</div>;

  const total = data ? totalCards(data.contentPacks) : 0;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 140px)' }}>
      {/* En-tête */}
      <div className="flex items-center justify-between mb-5 gap-4">
        <div style={{ minWidth: 0 }}>
          <div className="flex items-center gap-3">
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>Studio de contenu</h1>
            {/* Changement de programme : visible seulement si plusieurs (sinon le header global suffit). */}
            {programs.length > 1 && (
              <select
                value={programId}
                onChange={(e) => { setProgramId(e.target.value); setSelectedId(null); }}
                style={{ fontSize: 13, color: 'var(--color-text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600, outline: 'none' }}
              >
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
            Visualisez, éditez et générez les cartes du parcours avec l’assistance IA
          </p>
        </div>
        <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
          {isSuperAdmin ? (
            /* Le super admin supervise : Studio en lecture seule (pas de génération ni d'enregistrement). */
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', background: 'var(--color-surface)', border: '1px solid var(--color-card-border)', padding: '8px 14px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <Eye size={14} /> Lecture seule
            </span>
          ) : (
            <>
              <button className="btn-secondary flex items-center gap-2" style={{ padding: '9px 16px', fontSize: 13, whiteSpace: 'nowrap' }} onClick={() => setShowGen(true)}>
                <Wand2 size={15} /> Générer avec l’IA
              </button>
              <button className="btn-primary flex items-center gap-2" style={{ whiteSpace: 'nowrap' }} onClick={save} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Onglets de parties (switch entre les parties définies dans Structure) — pills sobres */}
      {data && data.contentPacks.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1">
          <PartTab active={packFilter === null} label="Toutes" onClick={() => { setPackFilter(null); setSelectedId(null); router.replace('/studio'); }} />
          {data.contentPacks.map((p, idx) => {
            const count = p.quizzes.length + p.duels.length + p.fundings.length + p.opportunities.length + p.challengeEvents.length;
            return (
              <PartTab
                key={p.id}
                active={packFilter === idx}
                label={`Partie ${idx + 1}`}
                count={count}
                title={p.title || p.name}
                onClick={() => { setPackFilter(idx); setSelectedId(null); router.replace(`/studio?program=${programId}&pack=${p.id}`); }}
              />
            );
          })}
        </div>
      )}

      {/* Éditeur 3 colonnes */}
      <div className="flex gap-4 flex-1" style={{ minHeight: 0 }}>
        {/* Colonne gauche — liste */}
        <div className="glass-card flex flex-col" style={{ width: 320, flexShrink: 0, padding: 12, minHeight: 0 }}>
          <div className="relative mb-3">
            <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            <input className="input-field" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Rechercher une carte…" style={{ paddingLeft: 32, fontSize: 13 }} />
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {CARD_TYPE_ORDER.map((t) => {
              const active = typeFilter === t;
              return (
                <button key={t} onClick={() => setTypeFilter(active ? null : t)} style={{ padding: '4px 12px', borderRadius: 999, fontSize: 12, cursor: 'pointer', fontWeight: active ? 600 : 500, border: `1px solid ${active ? 'transparent' : 'var(--color-card-border)'}`, background: active ? CARD_META[t].color + '22' : '#FFFFFF', color: active ? CARD_META[t].color : 'var(--color-text-secondary)' }}>
                  {CARD_META[t].short}
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col gap-1.5" style={{ minHeight: 0 }}>
            {cards.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center', padding: 20 }}>
                Aucune carte. Cliquez sur « Générer avec l’IA ».
              </p>
            ) : cards.map((c) => {
              const isActive = selected?.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className="flex items-center gap-2.5 text-left"
                  style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${isActive ? CARD_META[c.type].color + '55' : 'transparent'}`, background: isActive ? CARD_META[c.type].color + '0e' : 'var(--color-surface)', cursor: 'pointer' }}
                >
                  <Star size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                  <span className="flex-1" style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {c.levelNum ? `N${c.levelNum}` : '—'} · {CARD_META[c.type].label}
                    </span>
                  </span>
                  {typeof c.tokens === 'number' && (
                    <span style={{ fontSize: 12, fontWeight: 600, color: c.tokens >= 0 ? 'var(--color-success)' : '#E5484D', flexShrink: 0 }}>
                      {c.tokens >= 0 ? '+' : ''}{c.tokens}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Colonne centrale — éditeur */}
        <div className="glass-card flex-1 overflow-y-auto" style={{ padding: 24, minHeight: 0 }}>
          {!selected ? (
            <div className="flex items-center justify-center h-full">
              <p style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Sélectionnez une carte à gauche.</p>
            </div>
          ) : (
            <CardEditor card={selected} onPatch={patchSelected} onDelete={deleteSelected} readOnly={isSuperAdmin} />
          )}
        </div>

        {/* Colonne droite — Insights IA (placeholder visuel) */}
        <div className="glass-card flex-col" style={{ width: 300, flexShrink: 0, padding: 20, minHeight: 0, overflowY: 'auto' }}>
          <InsightsPanel card={selected} sources={contentSource?.documents ?? []} onRegenerate={() => setShowGen(true)} readOnly={isSuperAdmin} />
        </div>
      </div>

      {/* Footer — progression */}
      <div className="flex items-center gap-4 mt-3 px-1">
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{total} carte{total !== 1 ? 's' : ''} au total</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>· {allCards.filter((c) => c.type === 'quiz').length} quiz · {allCards.filter((c) => c.type === 'duel').length} duels · {allCards.filter((c) => c.type === 'funding').length} financements · {allCards.filter((c) => c.type === 'opportunity').length} opportunités · {allCards.filter((c) => c.type === 'challenge').length} défis</span>
      </div>

      {/* Panneau de génération IA */}
      {showGen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => !generating && setShowGen(false)}>
          <div className="glass-card" style={{ width: 'min(680px, 94vw)', maxHeight: '90vh', overflow: 'auto', padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="#9B8CFF" /> Générer avec l’IA
              </h2>
              {!generating && <button onClick={() => setShowGen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><X size={18} /></button>}
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Le contenu est généré depuis la base de contenu du programme (objectif : <strong>{contentSource?.objective ?? 'Qualification'}</strong>) et ajouté aux parties par niveau.
              <button onClick={() => router.push(`/programs/${programId}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-info)', marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 12 }}><Settings size={12} /> Modifier la base</button>
            </p>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)' }}>
                    <th style={{ padding: 8 }}>Type</th>
                    {LEVELS.map((l) => <th key={l} style={{ padding: 8 }}>{l}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {GEN_TYPES.map((t) => (
                    <tr key={t.key} style={{ borderTop: '1px solid var(--color-card-border)' }}>
                      <td style={{ padding: 8, color: t.color, fontWeight: 600 }}>{t.label}</td>
                      {LEVELS.map((_, li) => (
                        <td key={li} style={{ padding: 4 }}>
                          <input type="number" className="input-field" style={{ width: 56, textAlign: 'center' }} value={mix[t.key][li]}
                            onChange={(e) => setMix((prev) => ({ ...prev, [t.key]: prev[t.key].map((v, i) => (i === li ? Number(e.target.value) || 0 : v)) }))} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {generating ? (
              <div className="mt-5">
                <div style={{ height: 8, borderRadius: 4, background: 'var(--color-surface-variant)', marginBottom: 8 }}>
                  <div style={{ width: `${genProgress}%`, height: '100%', borderRadius: 4, background: '#9B8CFF', transition: 'width 0.2s' }} />
                </div>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={13} /> Génération niveau par niveau… {genProgress}%</p>
              </div>
            ) : (
              <div className="flex items-center justify-between mt-5">
                <span style={{ fontSize: 13, color: '#FFB347' }}>Total : {mixTotal} cartes</span>
                <button className="btn-primary flex items-center gap-2" onClick={runGeneration}><Wand2 size={15} /> Lancer la génération</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Éditeur de carte (colonne centrale) =====
function CardEditor({ card, onPatch, onDelete, readOnly }: {
  card: StudioCard;
  onPatch: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  readOnly?: boolean;
}) {
  const meta = CARD_META[card.type];
  return (
    <div>
      {/* En-tête : badges */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <Chip color={meta.color}>{meta.label}</Chip>
        {card.levelNum && <Chip color="var(--color-text-secondary)">Niveau {card.levelNum}</Chip>}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{card.id}</span>
        {!readOnly && (
          <button onClick={onDelete} className="p-1.5 rounded-lg" style={{ background: 'rgba(229,72,77,0.08)', color: '#E5484D', border: 'none', cursor: 'pointer' }} title="Supprimer la carte"><Trash2 size={14} /></button>
        )}
      </div>

      {(card.type === 'quiz' || card.type === 'duel') ? (
        <QuizDuelFields card={card} onPatch={onPatch} readOnly={readOnly} />
      ) : (
        <TitleTokensFields card={card} onPatch={onPatch} readOnly={readOnly} />
      )}
    </div>
  );
}

function QuizDuelFields({ card, onPatch, readOnly }: { card: StudioCard; onPatch: (p: Record<string, unknown>) => void; readOnly?: boolean }) {
  const isQuiz = card.type === 'quiz';
  const data = card.data as Quiz | Duel;
  return (
    <>
      <FieldLabel>Question</FieldLabel>
      <textarea className="input-field" rows={2} value={data.question} onChange={(e) => onPatch({ question: e.target.value })} readOnly={readOnly} style={{ marginBottom: 16 }} />

      <FieldLabel>Réponses</FieldLabel>
      {isQuiz ? (
        <div className="flex flex-col gap-2 mb-4">
          {(data as Quiz).options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <button onClick={() => !readOnly && onPatch({ correctAnswer: oi })} disabled={readOnly} style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, border: `2px solid ${(data as Quiz).correctAnswer === oi ? 'var(--color-success)' : 'var(--color-card-border)'}`, background: (data as Quiz).correctAnswer === oi ? 'var(--color-success)' : 'transparent', cursor: readOnly ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {(data as Quiz).correctAnswer === oi && <Check size={12} color="#fff" />}
              </button>
              <input className="input-field" value={opt} onChange={(e) => { const opts = [...(data as Quiz).options]; opts[oi] = e.target.value; onPatch({ options: opts }); }} readOnly={readOnly} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-4">
          {(data as Duel).options.map((opt, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <span style={{ width: 44, fontSize: 12, fontWeight: 600, color: opt.points === 30 ? 'var(--color-success)' : opt.points === 20 ? '#FFB347' : 'var(--color-text-muted)' }}>{opt.points}pts</span>
              <input className="input-field" value={opt.text} onChange={(e) => { const opts = (data as Duel).options.map((o, i) => i === oi ? { ...o, text: e.target.value } : o); onPatch({ options: opts }); }} readOnly={readOnly} />
            </div>
          ))}
        </div>
      )}

      {isQuiz && (
        <>
          <FieldLabel>Explication</FieldLabel>
          <textarea className="input-field" rows={2} value={(data as Quiz).explanation ?? ''} onChange={(e) => onPatch({ explanation: e.target.value })} readOnly={readOnly} placeholder="Pourquoi cette réponse…" />
        </>
      )}
    </>
  );
}

function TitleTokensFields({ card, onPatch, readOnly }: { card: StudioCard; onPatch: (p: Record<string, unknown>) => void; readOnly?: boolean }) {
  const data = card.data as Funding | Opportunity | ChallengeEvent;
  return (
    <>
      <FieldLabel>Titre</FieldLabel>
      <input className="input-field" value={data.title} onChange={(e) => onPatch({ title: e.target.value })} readOnly={readOnly} style={{ marginBottom: 16 }} />

      <FieldLabel>Effet jetons</FieldLabel>
      <input type="number" className="input-field" value={data.tokens} onChange={(e) => onPatch({ tokens: Number(e.target.value) || 0 })} readOnly={readOnly} style={{ width: 160, marginBottom: 16 }} />

      <FieldLabel>Description</FieldLabel>
      <textarea className="input-field" rows={4} value={data.description} onChange={(e) => onPatch({ description: e.target.value })} readOnly={readOnly} style={{ marginBottom: 16 }} />

      {card.type === 'funding' && (
        <>
          <FieldLabel>Source</FieldLabel>
          <input className="input-field" value={(data as Funding).source ?? ''} onChange={(e) => onPatch({ source: e.target.value })} readOnly={readOnly} placeholder="Ex : DER, Tontine…" />
        </>
      )}
    </>
  );
}

// ===== Panneau Insights IA (colonne droite) =====
function InsightsPanel({ card, sources, onRegenerate, readOnly }: {
  card: StudioCard | null;
  sources: { id: string; name: string; pages?: number }[];
  onRegenerate: () => void;
  readOnly?: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, color: 'var(--color-text-secondary)' }}>INSIGHTS IA</span>
        <span style={{ fontSize: 11, color: '#9B8CFF', background: 'rgba(155,140,255,0.12)', padding: '3px 9px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 4 }}><Sparkles size={11} /> Assisté par IA</span>
      </div>

      {/* Sources documentaires (réelles : base de contenu du programme) */}
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>Sources documentaires</p>
        {sources.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Aucune source. Ajoutez des documents dans la Configuration.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sources.map((s) => (
              <div key={s.id} className="flex items-center gap-2" style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--color-surface)' }}>
                <FileText size={13} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}{s.pages ? `, p.${s.pages}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Score qualité — placeholder visuel (scoring IA non branché) */}
      <div>
        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>Score qualité <span style={{ fontSize: 10, color: 'var(--color-text-muted)', fontWeight: 400 }}>(à venir)</span></p>
        {[
          { label: 'Couverture pédagogique', v: 92 },
          { label: 'Ancrage culturel', v: 88 },
          { label: 'Conformité format', v: 95 },
          { label: 'Neutralité', v: 84 },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-2 mb-2">
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flex: 1 }}>{row.label}</span>
            <div style={{ width: 70, height: 5, borderRadius: 3, background: 'var(--color-surface-variant)' }}>
              <div style={{ width: `${row.v}%`, height: '100%', borderRadius: 3, background: '#9B8CFF' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', width: 22, textAlign: 'right' }}>{row.v}</span>
          </div>
        ))}
      </div>

      {!readOnly && (
        <button className="btn-secondary flex items-center justify-center gap-2" onClick={onRegenerate} disabled={!card} style={{ fontSize: 13 }}>
          <Wand2 size={14} /> Régénérer du contenu
        </button>
      )}
    </div>
  );
}

// ===== Petits composants =====
function PartTab({ active, label, count, title, onClick }: {
  active: boolean; label: string; count?: number; title?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center gap-2"
      style={{
        padding: '6px 13px', borderRadius: 8, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap',
        fontWeight: active ? 600 : 500,
        border: 'none',
        background: active ? 'var(--color-info-light)' : 'transparent',
        color: active ? 'var(--color-info)' : 'var(--color-text-secondary)',
      }}
    >
      <span>{label}</span>
      {typeof count === 'number' && (
        <span style={{ fontSize: 11, fontWeight: 600, color: active ? 'var(--color-info)' : 'var(--color-text-muted)' }}>
          {count}
        </span>
      )}
    </button>
  );
}

function Chip({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 999, background: color.startsWith('var') ? 'var(--color-surface)' : color + '18', color }}>
      {children}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>{children}</label>;
}
