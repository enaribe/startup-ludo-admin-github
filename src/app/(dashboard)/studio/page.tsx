'use client';

import { useEffect, useState, useCallback } from 'react';
import { Sparkles, Upload, FileText, Trash2, Check, X, Play, Pause } from 'lucide-react';
import { getPrograms, getProgramsByOwner } from '@/lib/firestore-service';
import type { PartnerProgram } from '@/types';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

const STEPS = ['Ingestion', 'Brief programme', 'Paramétrage du mix', 'Génération', 'Revue programme', 'Validation CONCREE', 'Publication'];

const CARD_TYPES = [
  { key: 'opportunity', label: 'Opportunité', color: '#3FAE6B' },
  { key: 'challenge', label: 'Challenge', color: '#F44336' },
  { key: 'funding', label: 'Financement', color: '#F5A623' },
  { key: 'quiz', label: 'Quiz', color: '#5B8DEF' },
  { key: 'duel', label: 'Duel', color: '#9B59B6' },
];
const LEVELS = ['Niv. 1', 'Niv. 2', 'Niv. 3', 'Niv. 4'];

interface Doc { id: string; name: string; size: string; pages: number; status: 'vectorized' }

export default function StudioPage() {
  const { isSuperAdmin, admin } = useAuth();
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [programId, setProgramId] = useState('');
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);

  // Étape 1 — Ingestion
  const [docs, setDocs] = useState<Doc[]>([]);
  // Étape 2 — Brief
  const [objective, setObjective] = useState('Qualification');
  const [topicsKeep, setTopicsKeep] = useState<string[]>(['coopératives agricoles', 'financements DER']);
  const [topicsAvoid, setTopicsAvoid] = useState<string[]>(['politique', 'religion']);
  const [newTopic, setNewTopic] = useState('');
  // Étape 3 — Mix
  const [mix, setMix] = useState<Record<string, number[]>>(() =>
    Object.fromEntries(CARD_TYPES.map((t) => [t.key, [8, 7, 5, 4]])));
  // Étape 4 — Génération
  const [genProgress, setGenProgress] = useState(0);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = isSuperAdmin ? await getPrograms() : admin?.uid ? await getProgramsByOwner(admin.uid) : [];
        setPrograms(list);
        if (list.length > 0) setProgramId(list[0].id);
      } finally { setLoading(false); }
    })();
  }, [isSuperAdmin, admin?.uid]);

  const totalCards = Object.values(mix).reduce((s, row) => s + row.reduce((a, b) => a + b, 0), 0);

  const addDoc = () => {
    // Stub démo : l'upload + vectorisation RAG seront branchés plus tard.
    const n = docs.length + 1;
    setDocs((prev) => [...prev, { id: `d_${Date.now()}`, name: `Document ${n}.pdf`, size: `${(Math.floor((n * 1.7) % 6) + 1)}.2 Mo`, pages: 12 + n * 3, status: 'vectorized' }]);
    toast.success('Document ajouté (démo — vectorisation à brancher)');
  };

  const addTopic = (list: 'keep' | 'avoid') => {
    if (!newTopic.trim()) return;
    if (list === 'keep') setTopicsKeep((p) => [...p, newTopic.trim()]);
    else setTopicsAvoid((p) => [...p, newTopic.trim()]);
    setNewTopic('');
  };

  const startGeneration = useCallback(() => {
    setGenerating(true);
    setGenProgress(0);
    // Stub démo : progression simulée. La vraie génération IA appellera /api/generate.
    const timer = setInterval(() => {
      setGenProgress((p) => {
        if (p >= 100) { clearInterval(timer); setGenerating(false); return 100; }
        return Math.min(100, p + 7);
      });
    }, 250);
  }, []);

  if (loading && programs.length === 0) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  if (programs.length === 0) return <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucun programme accessible.</div>;

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>Studio de contenu</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>Produisez et validez les cartes du parcours avec l’assistance IA</p>
        </div>
        <span style={{ fontSize: 12, color: '#9B8CFF', background: 'rgba(155,140,255,0.12)', padding: '5px 12px', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Sparkles size={13} /> Assisté par IA
        </span>
      </div>

      {/* Stepper */}
      <div className="glass-card p-4 mb-6" style={{ overflowX: 'auto' }}>
        <div className="flex items-center" style={{ minWidth: 760 }}>
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center" style={{ flex: i < STEPS.length - 1 ? 1 : 'none' }}>
              <button onClick={() => setStep(i)} className="flex items-center gap-2" style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, background: i < step ? '#3FAE6B' : i === step ? '#9B8CFF' : 'var(--color-surface-variant)', color: i <= step ? '#fff' : 'var(--color-text-muted)' }}>
                  {i < step ? <Check size={14} /> : i + 1}
                </span>
                <span style={{ fontSize: 13, color: i === step ? 'var(--color-text-primary)' : 'var(--color-text-muted)', fontWeight: i === step ? 600 : 400, whiteSpace: 'nowrap' }}>{s}</span>
              </button>
              {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, margin: '0 12px', background: i < step ? '#3FAE6B' : 'var(--color-surface-variant)' }} />}
            </div>
          ))}
        </div>
      </div>

      {/* Contenu de l'étape */}
      {step === 0 && (
        <div>
          <button onClick={addDoc} className="glass-card p-10 mb-4 w-full" style={{ border: '2px dashed var(--color-card-border)', textAlign: 'center', cursor: 'pointer', background: 'transparent' }}>
            <Upload size={28} color="var(--color-text-muted)" style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>Glissez vos documents ici</p>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>PDF, DOCX, MD, PPTX · max 500 pages cumulées</p>
          </button>
          {docs.length > 0 && (
            <div className="glass-card p-5">
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 12 }}>Documents ingérés · {docs.reduce((s, d) => s + d.pages, 0)} pages indexées</h3>
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-3" style={{ borderTop: '1px solid var(--color-card-border)' }}>
                  <div className="flex items-center gap-3">
                    <FileText size={16} color="var(--color-text-muted)" />
                    <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{d.name}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{d.size} · {d.pages} p.</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="badge badge-success" style={{ fontSize: 10 }}>Vectorisé</span>
                    <button onClick={() => setDocs((p) => p.filter((x) => x.id !== d.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}><Trash2 size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="glass-card p-6" style={{ maxWidth: 760 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>Objectif pédagogique principal</label>
          <div className="flex gap-2 mb-5 flex-wrap">
            {['Sensibilisation', 'Qualification', 'Pré-incubation', 'Accélération'].map((o) => (
              <button key={o} onClick={() => setObjective(o)} style={{ padding: '6px 16px', borderRadius: 999, fontSize: 13, cursor: 'pointer', border: `1px solid ${objective === o ? '#5B8DEF' : 'var(--color-card-border)'}`, background: objective === o ? 'rgba(91,141,239,0.15)' : 'transparent', color: objective === o ? '#5B8DEF' : 'var(--color-text-secondary)' }}>{o}</button>
            ))}
          </div>

          <TopicEditor label="Sujets à valoriser" topics={topicsKeep} onRemove={(t) => setTopicsKeep((p) => p.filter((x) => x !== t))} color="#3FAE6B" />
          <TopicEditor label="Sujets à éviter" topics={topicsAvoid} onRemove={(t) => setTopicsAvoid((p) => p.filter((x) => x !== t))} color="#F44336" />
          <div className="flex gap-2 mb-4">
            <input className="input-field" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Ajouter un sujet…" />
            <button className="btn-secondary" onClick={() => addTopic('keep')}>+ Valoriser</button>
            <button className="btn-secondary" onClick={() => addTopic('avoid')}>+ Éviter</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="glass-card p-6" style={{ overflowX: 'auto' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>Mix de cartes par type × niveau</h3>
            <span style={{ fontSize: 13, color: '#FFB347' }}>Total : {totalCards} cartes</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)' }}>
                <th style={{ padding: 10 }}>Type</th>
                {LEVELS.map((l) => <th key={l} style={{ padding: 10 }}>{l}</th>)}
                <th style={{ padding: 10 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {CARD_TYPES.map((t) => (
                <tr key={t.key} style={{ borderTop: '1px solid var(--color-card-border)' }}>
                  <td style={{ padding: 10, color: t.color, fontWeight: 600 }}>{t.label}</td>
                  {LEVELS.map((_, li) => (
                    <td key={li} style={{ padding: 6 }}>
                      <input type="number" className="input-field" style={{ width: 60, textAlign: 'center' }} value={mix[t.key][li]}
                        onChange={(e) => setMix((prev) => ({ ...prev, [t.key]: prev[t.key].map((v, i) => (i === li ? Number(e.target.value) || 0 : v)) }))} />
                    </td>
                  ))}
                  <td style={{ padding: 10, color: 'var(--color-text-primary)', fontWeight: 600 }}>{mix[t.key].reduce((a, b) => a + b, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {step === 3 && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{generating ? 'Génération en cours…' : genProgress === 100 ? 'Génération terminée' : 'Prêt à générer'}</h3>
            <span style={{ fontSize: 13, color: '#9B8CFF' }}>{Math.round((genProgress / 100) * totalCards)} / {totalCards} cartes</span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--color-surface-variant)', marginBottom: 16 }}>
            <div style={{ width: `${genProgress}%`, height: '100%', borderRadius: 4, background: '#9B8CFF', transition: 'width 0.2s' }} />
          </div>
          {!generating && genProgress < 100 && (
            <button className="btn-primary flex items-center gap-2" onClick={startGeneration}>
              <Play size={16} /> Lancer la génération
            </button>
          )}
          {generating && <p style={{ fontSize: 13, color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}><Pause size={14} /> Génération simulée (démo — appel IA à brancher)…</p>}
          {genProgress === 100 && <p style={{ fontSize: 13, color: '#3FAE6B' }}>✓ {totalCards} cartes générées. Passez à la revue.</p>}
        </div>
      )}

      {step === 4 && (
        <div className="glass-card p-8" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: 'var(--color-text-primary)', marginBottom: 6 }}>Revue des cartes générées</p>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>L’éditeur de revue carte par carte (score IA, sources, régénération) sera disponible une fois la génération réelle branchée.</p>
        </div>
      )}

      {step === 5 && (
        <div className="glass-card p-8" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: 'var(--color-text-primary)', marginBottom: 6 }}>Validation CONCREE</p>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Soumission à la revue CONCREE (SLA 5–10 jours). L’intégration de l’API de validation est à venir.</p>
        </div>
      )}

      {step === 6 && (
        <div className="glass-card p-6" style={{ maxWidth: 520 }}>
          <div className="flex items-center gap-3 mb-4">
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(63,174,107,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={18} color="#3FAE6B" /></div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>Prêt à publier</p>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{totalCards} cartes · {programs.find((p) => p.id === programId)?.contentPacks?.length ?? 0} parties</p>
            </div>
          </div>
          <button className="btn-primary" onClick={() => toast.success('Parcours publié (démo)')}>Publier le parcours</button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <button className="btn-secondary" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Précédent</button>
        <button className="btn-primary" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))} disabled={step === STEPS.length - 1}>Suivant</button>
      </div>
    </div>
  );
}

function TopicEditor({ label, topics, onRemove, color }: { label: string; topics: string[]; onRemove: (t: string) => void; color: string }) {
  return (
    <div className="mb-4">
      <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{label}</label>
      <div className="flex flex-wrap gap-2">
        {topics.length === 0 && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Aucun</span>}
        {topics.map((t) => (
          <span key={t} className="flex items-center gap-1.5" style={{ padding: '4px 10px', borderRadius: 999, fontSize: 12, color, background: `${color}1a` }}>
            {t}
            <button onClick={() => onRemove(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color, display: 'flex' }}><X size={12} /></button>
          </span>
        ))}
      </div>
    </div>
  );
}
