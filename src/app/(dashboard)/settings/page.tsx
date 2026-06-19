'use client';

import { useState } from 'react';
import { Building, Globe, Bell, Palette } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import toast from 'react-hot-toast';

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
