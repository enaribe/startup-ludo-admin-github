'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getPartner, savePartner } from '@/lib/firestore-service';
import type { ProgramPartner } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ImageUploadField from '@/components/ui/ImageUploadField';
import SaveStatusIndicator from '@/components/ui/SaveStatusIndicator';
import { useAutoSave } from '@/hooks/useAutoSave';
import toast from 'react-hot-toast';

const EMPTY: Omit<ProgramPartner, 'id'> = {
  slug: '',
  name: '',
  shortName: '',
  description: '',
  logoUrl: '',
  bannerUrl: '',
  heroImageUrl: '',
  primaryColor: '#FFB347',
  secondaryColor: '#0C243E',
  isActive: true,
};

export default function PartnerEditorPage() {
  const router = useRouter();
  const params = useParams();
  const partnerId = params.partnerId as string;
  const isNew = partnerId === 'new';

  const [data, setData] = useState<Omit<ProgramPartner, 'id'>>(EMPTY);
  const [newId, setNewId] = useState('');
  const [loading, setLoading] = useState(!isNew);
  const [creating, setCreating] = useState(false);

  const persist = useCallback(
    (d: Omit<ProgramPartner, 'id'>) => savePartner(partnerId, d),
    [partnerId]
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
        const partner = await getPartner(partnerId);
        if (partner) {
          const { id: _id, ...rest } = partner;
          void _id;
          setData({ ...EMPTY, ...rest });
        } else {
          toast.error('Partenaire non trouvé');
          router.push('/partners');
        }
      } catch {
        toast.error('Erreur de chargement');
      } finally {
        setLoading(false);
      }
    })();
  }, [partnerId, isNew, router]);

  const update = <K extends keyof Omit<ProgramPartner, 'id'>>(key: K, value: Omit<ProgramPartner, 'id'>[K]) =>
    setData((prev) => ({ ...prev, [key]: value }));

  const handleCreate = async () => {
    const id = newId.trim().toLowerCase().replace(/\s+/g, '-');
    if (!id || !data.name.trim()) { toast.error('ID et nom requis'); return; }
    setCreating(true);
    try {
      await savePartner(id, { ...data, slug: data.slug || id });
      toast.success('Partenaire créé !');
      router.push(`/partners/${id}`);
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

  // Doit correspondre à l'ID final du document (cf. handleCreate) pour que le chemin Storage soit cohérent.
  const normalizedNewId = newId.trim().toLowerCase().replace(/\s+/g, '-');
  const storageId = isNew ? normalizedNewId : partnerId;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => handleNavigate('/partners')} className="flex items-center gap-2" style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 13 }}>
          <ArrowLeft size={16} />
          Partenaires
        </button>
        {!isNew && <SaveStatusIndicator status={saveStatus} />}
      </div>

      <div className="glass-card p-6" style={{ maxWidth: 720 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#FFFFFF', marginBottom: 20 }}>
          {isNew ? 'Nouveau partenaire' : data.name || partnerId}
        </h2>

        {isNew && (
          <Field label="ID (identifiant unique, ex: mastercard)">
            <input className="input-field" value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="mastercard" />
          </Field>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Nom complet">
            <input className="input-field" value={data.name} onChange={(e) => update('name', e.target.value)} placeholder="Mastercard Foundation" />
          </Field>
          <Field label="Nom court">
            <input className="input-field" value={data.shortName} onChange={(e) => update('shortName', e.target.value)} placeholder="Mastercard" />
          </Field>
        </div>

        <Field label="Slug">
          <input className="input-field" value={data.slug} onChange={(e) => update('slug', e.target.value)} placeholder="mastercard-foundation" />
        </Field>

        <Field label="Description">
          <textarea className="input-field" rows={3} value={data.description} onChange={(e) => update('description', e.target.value)} placeholder="Présentation du partenaire..." />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Couleur primaire">
            <ColorInput value={data.primaryColor} onChange={(v) => update('primaryColor', v)} />
          </Field>
          <Field label="Couleur secondaire">
            <ColorInput value={data.secondaryColor} onChange={(v) => update('secondaryColor', v)} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ImageUploadField
            label="Logo (En partenariat avec)"
            value={data.logoUrl || ''}
            onChange={(url) => update('logoUrl', url)}
            storagePath={`partners/${storageId}/logo`}
            aspectRatio="square"
            disabled={isNew && !newId.trim()}
            disabledHint="Renseignez d'abord l'ID du partenaire."
          />
          <ImageUploadField
            label="Image de fond (carte d'accueil)"
            value={data.bannerUrl || ''}
            onChange={(url) => update('bannerUrl', url)}
            storagePath={`partners/${storageId}/banner`}
            aspectRatio="banner"
            disabled={isNew && !newId.trim()}
            disabledHint="Renseignez d'abord l'ID du partenaire."
          />
        </div>

        <div className="mt-4">
          <ImageUploadField
            label="Visuel détouré du header (PNG transparent, à droite)"
            value={data.heroImageUrl || ''}
            onChange={(url) => update('heroImageUrl', url)}
            storagePath={`partners/${storageId}/hero`}
            aspectRatio="square"
            disabled={isNew && !newId.trim()}
            disabledHint="Renseignez d'abord l'ID du partenaire."
          />
        </div>

        <label className="flex items-center gap-3 mt-4" style={{ cursor: 'pointer' }}>
          <input type="checkbox" checked={data.isActive} onChange={(e) => update('isActive', e.target.checked)} />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>Partenaire actif</span>
        </label>

        {isNew && (
          <button className="btn-primary mt-6" onClick={handleCreate} disabled={creating}>
            {creating ? 'Création...' : 'Créer le partenaire'}
          </button>
        )}
      </div>
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
