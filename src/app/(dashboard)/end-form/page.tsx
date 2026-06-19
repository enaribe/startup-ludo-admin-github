'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Type, AlignLeft, Phone, Mail, ChevronDown, Layers, Target, Check, SlidersHorizontal, Calendar, Upload, Trash2, GripVertical,
} from 'lucide-react';
import { getPrograms, getProgramsByOwner, getProgram, saveProgram } from '@/lib/firestore-service';
import { defaultEndForm } from '@/lib/end-form-defaults';
import { generateId } from '@/lib/utils';
import type { PartnerProgram, ProgramEndForm, ProgramFormField, FormFieldType } from '@/types';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

const PALETTE: { type: FormFieldType; label: string; icon: React.ReactNode }[] = [
  { type: 'short_text', label: 'Texte court', icon: <Type size={16} /> },
  { type: 'long_text', label: 'Texte long', icon: <AlignLeft size={16} /> },
  { type: 'phone', label: 'Téléphone', icon: <Phone size={16} /> },
  { type: 'email', label: 'Email', icon: <Mail size={16} /> },
  { type: 'select', label: 'Liste', icon: <ChevronDown size={16} /> },
  { type: 'multi_select', label: 'Multi-select', icon: <Layers size={16} /> },
  { type: 'radio', label: 'Radio', icon: <Target size={16} /> },
  { type: 'checkbox', label: 'Checkbox', icon: <Check size={16} /> },
  { type: 'slider', label: 'Slider', icon: <SlidersHorizontal size={16} /> },
  { type: 'date', label: 'Date', icon: <Calendar size={16} /> },
  { type: 'file', label: 'Fichier', icon: <Upload size={16} /> },
];

const TYPE_LABEL: Record<FormFieldType, string> = {
  short_text: 'Texte court', long_text: 'Texte long', phone: 'Téléphone', email: 'Email',
  select: 'Liste', multi_select: 'Multi-select', radio: 'Radio', checkbox: 'Checkbox',
  slider: 'Slider', date: 'Date', file: 'Fichier',
};

const HAS_OPTIONS: FormFieldType[] = ['select', 'multi_select', 'radio'];

function newField(type: FormFieldType): ProgramFormField {
  return {
    id: `field_${generateId()}`,
    type,
    label: TYPE_LABEL[type],
    required: false,
    ...(HAS_OPTIONS.includes(type) ? { options: ['Option 1', 'Option 2'] } : {}),
    ...(type === 'slider' ? { min: 1, max: 10 } : {}),
    ...(type === 'long_text' ? { maxLength: 280 } : {}),
  };
}

export default function EndFormPage() {
  const { isSuperAdmin, admin } = useAuth();
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [programId, setProgramId] = useState<string>('');
  const [form, setForm] = useState<ProgramEndForm>({ fields: [], consents: [] });
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  // Charge les programmes accessibles (super admin = tous, admin = les siens).
  useEffect(() => {
    (async () => {
      try {
        const list = isSuperAdmin ? await getPrograms() : admin?.uid ? await getProgramsByOwner(admin.uid) : [];
        setPrograms(list);
        if (list.length > 0) setProgramId(list[0].id);
      } catch {
        toast.error('Erreur de chargement');
      } finally {
        setLoading(false);
      }
    })();
  }, [isSuperAdmin, admin?.uid]);

  // Charge le formulaire du programme sélectionné.
  const loadForm = useCallback(async (id: string) => {
    if (!id) return;
    const prog = await getProgram(id);
    if (prog?.endForm && (prog.endForm.fields?.length || prog.endForm.consents?.length)) {
      setForm(prog.endForm);
    } else {
      const partnerShort = prog?.name ?? undefined;
      setForm(defaultEndForm(partnerShort));
    }
    setSelectedFieldId(null);
  }, []);

  useEffect(() => { if (programId) loadForm(programId); }, [programId, loadForm]);

  const selectedField = form.fields.find((f) => f.id === selectedFieldId) ?? null;

  const addField = (type: FormFieldType) =>
    setForm((prev) => ({ ...prev, fields: [...prev.fields, newField(type)] }));
  const removeField = (id: string) =>
    setForm((prev) => ({ ...prev, fields: prev.fields.filter((f) => f.id !== id) }));
  const updateField = (id: string, patch: Partial<ProgramFormField>) =>
    setForm((prev) => ({ ...prev, fields: prev.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  const moveField = (fromId: string, toId: string) =>
    setForm((prev) => {
      const from = prev.fields.findIndex((f) => f.id === fromId);
      const to = prev.fields.findIndex((f) => f.id === toId);
      if (from < 0 || to < 0 || from === to) return prev;
      const next = [...prev.fields];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...prev, fields: next };
    });

  const updateConsent = (id: string, patch: Partial<ProgramEndForm['consents'][number]>) =>
    setForm((prev) => ({ ...prev, consents: prev.consents.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  const handleSave = async () => {
    if (!programId) return;
    setSaving(true);
    try {
      const prog = await getProgram(programId);
      if (!prog) throw new Error('Programme introuvable');
      const { id: _id, ...rest } = prog;
      void _id;
      await saveProgram(programId, { ...rest, endForm: form });
      toast.success('Formulaire enregistré');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  if (programs.length === 0) {
    return (
      <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
        Aucun programme accessible. {isSuperAdmin ? 'Créez un programme.' : 'Aucun programme ne vous est assigné.'}
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>Formulaire de fin</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
            Configurez le formulaire rempli par les joueurs en fin de parcours
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isSuperAdmin && programs.length > 1 && (
            <select className="input-field" value={programId} onChange={(e) => setProgramId(e.target.value)} style={{ maxWidth: 220 }}>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: '220px 1fr 280px' }}>
        {/* Palette */}
        <div className="glass-card p-4" style={{ alignSelf: 'flex-start' }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 12 }}>Champs disponibles</p>
          <div className="flex flex-col gap-2">
            {PALETTE.map((p) => (
              <button
                key={p.type}
                onClick={() => addField(p.type)}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}
              >
                <GripVertical size={13} style={{ opacity: 0.4 }} />
                {p.icon}
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Zone de construction */}
        <div className="flex flex-col gap-3">
          <div className="glass-card p-5">
            {form.fields.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 13, padding: '20px 0' }}>
                Ajoutez des champs depuis la palette.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {form.fields.map((field) => (
                  <div
                    key={field.id}
                    draggable={dragId === field.id}
                    onDragOver={(e) => { if (dragId) e.preventDefault(); }}
                    onDrop={(e) => { e.preventDefault(); if (dragId) moveField(dragId, field.id); setDragId(null); }}
                    onClick={() => setSelectedFieldId(field.id)}
                    className="flex items-center gap-3 p-3 rounded-lg"
                    style={{
                      cursor: 'pointer',
                      background: selectedFieldId === field.id ? 'rgba(91,141,239,0.12)' : 'var(--color-surface)',
                      border: `1px solid ${selectedFieldId === field.id ? '#5B8DEF' : 'var(--color-card-border)'}`,
                    }}
                  >
                    <span onMouseDown={() => setDragId(field.id)} onDragEnd={() => setDragId(null)} style={{ cursor: 'grab', color: 'var(--color-text-muted)' }}>
                      <GripVertical size={15} />
                    </span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{field.label}</span>
                        {field.required && <span className="badge badge-error" style={{ fontSize: 10 }}>Requis</span>}
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{TYPE_LABEL[field.type]}{field.maxLength ? ` · ${field.maxLength}` : ''}</span>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeField(field.id); }} className="p-1.5 rounded-lg" style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Consentements RGPD */}
          <div className="glass-card p-5">
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 12 }}>Consentements RGPD</p>
            <div className="flex flex-col gap-2">
              {form.consents.map((c) => (
                <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)' }}>
                  <input type="checkbox" checked={c.required} onChange={(e) => updateConsent(c.id, { required: e.target.checked })} title="Requis" />
                  <input
                    className="input-field flex-1"
                    value={c.label}
                    onChange={(e) => updateConsent(c.id, { label: e.target.value })}
                    style={{ fontSize: 13 }}
                  />
                  <Toggle checked={c.enabled} onChange={(v) => updateConsent(c.id, { enabled: v })} />
                </div>
              ))}
            </div>
          </div>

          {/* Bloc CONCREE verrouillé */}
          <div className="glass-card p-5" style={{ background: 'var(--color-surface)' }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 10 }}>
              🔒 Questions de qualification CONCREE · non modifiables
            </p>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8 }}>Le profil incarné correspond-il à votre situation réelle ?</p>
            <div className="flex gap-2 mb-4">
              {['Oui', 'Partiellement', 'Non'].map((o) => (
                <span key={o} style={{ padding: '5px 14px', borderRadius: 999, fontSize: 12, border: '1px solid var(--color-card-border)', color: 'var(--color-text-muted)' }}>{o}</span>
              ))}
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 6 }}>Intention sérieuse de candidater (1 à 10) ?</p>
            <input type="range" min={1} max={10} defaultValue={5} disabled style={{ width: '100%', opacity: 0.5 }} />
          </div>
        </div>

        {/* Propriétés du champ */}
        <div className="glass-card p-4" style={{ alignSelf: 'flex-start' }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 12 }}>Propriétés du champ</p>
          {!selectedField ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Sélectionnez un champ pour l’éditer.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <PropField label="Label">
                <input className="input-field" value={selectedField.label} onChange={(e) => updateField(selectedField.id, { label: e.target.value })} />
              </PropField>
              <PropField label="Placeholder">
                <input className="input-field" value={selectedField.placeholder ?? ''} onChange={(e) => updateField(selectedField.id, { placeholder: e.target.value })} placeholder="Saisissez…" />
              </PropField>
              {HAS_OPTIONS.includes(selectedField.type) && (
                <PropField label="Options (une par ligne)">
                  <textarea
                    className="input-field"
                    rows={4}
                    value={(selectedField.options ?? []).join('\n')}
                    onChange={(e) => updateField(selectedField.id, { options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                  />
                </PropField>
              )}
              {selectedField.type === 'slider' && (
                <div className="grid grid-cols-2 gap-2">
                  <PropField label="Min"><input type="number" className="input-field" value={selectedField.min ?? 1} onChange={(e) => updateField(selectedField.id, { min: Number(e.target.value) })} /></PropField>
                  <PropField label="Max"><input type="number" className="input-field" value={selectedField.max ?? 10} onChange={(e) => updateField(selectedField.id, { max: Number(e.target.value) })} /></PropField>
                </div>
              )}
              {selectedField.type === 'long_text' && (
                <PropField label="Longueur max"><input type="number" className="input-field" value={selectedField.maxLength ?? 280} onChange={(e) => updateField(selectedField.id, { maxLength: Number(e.target.value) })} /></PropField>
              )}
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Champ requis</span>
                <Toggle checked={selectedField.required} onChange={(v) => updateField(selectedField.id, { required: v })} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PropField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{ width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: checked ? '#3FAE6B' : 'var(--color-surface-variant)', position: 'relative' }}
    >
      <span style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#FFFFFF', transition: 'left 0.15s' }} />
    </button>
  );
}
