'use client';

import { useEffect, useState } from 'react';
import { Building, Globe, Bell, Palette, Smartphone } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getAppVersionConfig, saveAppVersionConfig } from '@/lib/firestore-service';
import toast from 'react-hot-toast';

/**
 * Carte « Application mobile » — version minimale requise (mise à jour obligatoire).
 * Écrit le document Firestore `appConfig/version` lu par l'app mobile au démarrage.
 * Réservée aux super admins.
 */
function AppVersionCard() {
  const [minVersion, setMinVersion] = useState('');
  const [androidUrl, setAndroidUrl] = useState('');
  const [iosUrl, setIosUrl] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const config = await getAppVersionConfig();
        if (config) {
          setMinVersion(config.minSupportedVersion || '');
          setAndroidUrl(config.androidStoreUrl || '');
          setIosUrl(config.iosStoreUrl || '');
          setMessage(config.message || '');
        }
      } catch {
        toast.error('Impossible de charger la config de version');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    const version = minVersion.trim();
    if (!/^\d+(\.\d+){0,2}$/.test(version)) {
      toast.error('Version invalide (format attendu : 2.2.0)');
      return;
    }
    setSaving(true);
    try {
      await saveAppVersionConfig({
        minSupportedVersion: version,
        androidStoreUrl: androidUrl.trim(),
        iosStoreUrl: iosUrl.trim(),
        message: message.trim(),
      });
      toast.success('Config de version enregistrée');
    } catch {
      toast.error('Erreur lors de l’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass-card p-6 mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Smartphone size={16} color="#E5533C" />
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>Application mobile — mise à jour obligatoire</h2>
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>
        Les joueurs dont la version installée est inférieure à la version minimale verront un popup bloquant les invitant à mettre à jour.
      </p>

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Chargement…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 5 }}>Version minimale requise</label>
              <input className="input-field" value={minVersion} onChange={(e) => setMinVersion(e.target.value)} placeholder="2.2.0" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 5 }}>Lien Play Store (Android)</label>
              <input className="input-field" value={androidUrl} onChange={(e) => setAndroidUrl(e.target.value)} placeholder="https://play.google.com/store/apps/details?id=com.startupludo.app" />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 5 }}>Lien App Store (iOS)</label>
              <input className="input-field" value={iosUrl} onChange={(e) => setIosUrl(e.target.value)} placeholder="https://apps.apple.com/app/..." />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 5 }}>Message personnalisé (optionnel)</label>
              <input className="input-field" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Texte affiché dans le popup" />
            </div>
          </div>
          <button className="btn-primary mt-4" onClick={handleSave} disabled={saving}>
            {saving ? 'Enregistrement...' : 'Enregistrer la version'}
          </button>
        </>
      )}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} style={{ width: 44, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer', background: checked ? '#3FAE6B' : 'var(--color-surface-variant)', position: 'relative' }}>
      <span style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', transition: 'left 0.15s' }} />
    </button>
  );
}

export default function SettingsPage() {
  const { admin, isSuperAdmin } = useAuth();
  const [orgName, setOrgName] = useState(isSuperAdmin ? 'Startup Ludo' : 'Consortium Jeunesse Sénégal');
  const [country, setCountry] = useState('Sénégal');
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifLeads, setNotifLeads] = useState(true);
  const [notifWeekly, setNotifWeekly] = useState(false);

  const save = () => toast.success('Paramètres enregistrés');

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>Paramètres org.</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>Préférences de votre organisation</p>
        </div>
        <button className="btn-primary" onClick={save}>Enregistrer</button>
      </div>

      {/* Organisation */}
      <div className="glass-card p-6 mb-4">
        <div className="flex items-center gap-2 mb-4"><Building size={16} color="#5B8DEF" /><h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>Organisation</h2></div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 5 }}>Nom de l’organisation</label>
            <input className="input-field" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 5 }}>Pays</label>
            <input className="input-field" value={country} onChange={(e) => setCountry(e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 5 }}>Email de contact</label>
          <input className="input-field" value={admin?.email ?? ''} disabled readOnly style={{ opacity: 0.6 }} />
        </div>
      </div>

      {/* Application mobile — version minimale (super admin uniquement) */}
      {isSuperAdmin && <AppVersionCard />}

      {/* Préférences */}
      <div className="glass-card p-6 mb-4">
        <div className="flex items-center gap-2 mb-4"><Globe size={16} color="#3FAE6B" /><h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>Préférences</h2></div>
        {[
          { label: 'Langue par défaut', value: 'Français' },
          { label: 'Fuseau horaire', value: 'GMT (Dakar)' },
        ].map((r) => (
          <div key={r.label} className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid var(--color-card-border)' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{r.label}</span>
            <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* Notifications */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-2 mb-4"><Bell size={16} color="#F5A623" /><h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>Notifications</h2></div>
        {[
          { label: 'Recevoir les emails de la plateforme', v: notifEmail, set: setNotifEmail },
          { label: 'Alerte à chaque nouveau lead', v: notifLeads, set: setNotifLeads },
          { label: 'Rapport hebdomadaire', v: notifWeekly, set: setNotifWeekly },
        ].map((r) => (
          <div key={r.label} className="flex items-center justify-between py-3" style={{ borderBottom: '1px solid var(--color-card-border)' }}>
            <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{r.label}</span>
            <Toggle checked={r.v} onChange={r.set} />
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <Palette size={13} /> La persistance de ces préférences sera reliée à votre compte prochainement.
      </p>
    </div>
  );
}
