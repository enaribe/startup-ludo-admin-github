'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Send, MessageSquare, Bell, Mail, Smartphone, Users } from 'lucide-react';
import { getScopedPrograms, getEnrollmentsByProgram } from '@/lib/firestore-service';
import type { PartnerProgram, ProgramEnrollment } from '@/types';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

type Channel = 'push' | 'sms' | 'email';
type Audience = 'all' | 'completed' | 'incomplete' | 'qualified';

const CHANNELS: { key: Channel; label: string; icon: React.ReactNode }[] = [
  { key: 'push', label: 'Notification push', icon: <Bell size={15} /> },
  { key: 'sms', label: 'SMS', icon: <Smartphone size={15} /> },
  { key: 'email', label: 'Email', icon: <Mail size={15} /> },
];

export default function CommunicationsPage() {
  const { isSuperAdmin, admin } = useAuth();
  const [programs, setPrograms] = useState<PartnerProgram[]>([]);
  const [programId, setProgramId] = useState('');
  const [enrollments, setEnrollments] = useState<ProgramEnrollment[]>([]);
  const [totalLevels, setTotalLevels] = useState(1);
  const [loading, setLoading] = useState(true);

  const [channel, setChannel] = useState<Channel>('push');
  const [audience, setAudience] = useState<Audience>('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await getScopedPrograms(admin);
        setPrograms(list);
        if (list.length > 0) setProgramId(list[0].id);
        else setLoading(false);
      } catch { setLoading(false); }
    })();
  }, [isSuperAdmin, admin?.uid]);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    setLoading(true);
    try {
      const prog = programs.find((p) => p.id === id);
      setTotalLevels(Math.max(1, prog?.contentPacks?.length ?? 1));
      setEnrollments(await getEnrollmentsByProgram(id));
    } finally { setLoading(false); }
  }, [programs]);

  useEffect(() => { if (programId) load(programId); }, [programId, load]);

  const audienceCount = useMemo(() => {
    switch (audience) {
      case 'completed': return enrollments.filter((e) => (e.completedLevels ?? 0) >= totalLevels).length;
      case 'incomplete': return enrollments.filter((e) => (e.completedLevels ?? 0) < totalLevels).length;
      case 'qualified': return enrollments.filter((e) => (e.formData?.applicationIntent ?? 0) >= 7).length;
      default: return enrollments.length;
    }
  }, [audience, enrollments, totalLevels]);

  const send = async () => {
    if (!message.trim()) { toast.error('Le message est requis'); return; }
    setSending(true);
    // Stub démo : l'envoi réel (push/SMS/email) sera branché à un service tiers.
    await new Promise((r) => setTimeout(r, 600));
    setSending(false);
    toast.success(`Message programmé pour ${audienceCount} joueur(s) — envoi à brancher (démo)`);
    setTitle('');
    setMessage('');
  };

  if (loading && programs.length === 0) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  if (programs.length === 0) return <div className="glass-card p-8" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>Aucun programme accessible.</div>;

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>Communications</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>Envoyez un message aux joueurs de votre parcours</p>
        </div>
        {isSuperAdmin && programs.length > 1 && (
          <select className="input-field" value={programId} onChange={(e) => setProgramId(e.target.value)} style={{ maxWidth: 200 }}>
            {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>

      <div className="glass-card p-6">
        {/* Canal */}
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 10 }}>Canal</label>
        <div className="flex gap-2 mb-5">
          {CHANNELS.map((c) => (
            <button key={c.key} onClick={() => setChannel(c.key)} className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ border: `1px solid ${channel === c.key ? '#5B8DEF' : 'var(--color-card-border)'}`, background: channel === c.key ? 'rgba(91,141,239,0.12)' : 'transparent', color: channel === c.key ? '#9DBDF7' : 'var(--color-text-secondary)', cursor: 'pointer', fontSize: 13 }}>
              {c.icon} {c.label}
            </button>
          ))}
        </div>

        {/* Audience */}
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 8 }}>Audience</label>
        <select className="input-field mb-1" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
          <option value="all">Tous les joueurs inscrits</option>
          <option value="incomplete">Parcours non terminé</option>
          <option value="completed">Parcours terminé</option>
          <option value="qualified">Leads qualifiés (intention ≥ 7)</option>
        </select>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={13} /> {audienceCount} destinataire(s)
        </p>

        {channel !== 'sms' && (
          <div className="mb-4">
            <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 5 }}>Titre</label>
            <input className="input-field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reprends ton parcours !" />
          </div>
        )}
        <div className="mb-4">
          <label style={{ display: 'block', fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 5 }}>Message</label>
          <textarea className="input-field" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Votre message…" maxLength={channel === 'sms' ? 160 : 500} />
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4, textAlign: 'right' }}>{message.length}/{channel === 'sms' ? 160 : 500}</p>
        </div>

        <div className="glass-card p-3 mb-4" style={{ background: 'rgba(245,166,35,0.06)', borderColor: 'rgba(245,166,35,0.18)' }}>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>⚠️ Frequency cap actif : max 2 messages / mois / joueur (configurable dans l’onglet Avancé du programme).</p>
        </div>

        <button className="btn-primary flex items-center gap-2" onClick={send} disabled={sending}>
          <Send size={16} /> {sending ? 'Envoi…' : 'Envoyer le message'}
        </button>
      </div>

      <div className="glass-card p-5 mt-4">
        <div className="flex items-center gap-2 mb-2"><MessageSquare size={15} color="var(--color-text-muted)" /><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Historique</span></div>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>L’historique des envois apparaîtra ici une fois le service de messagerie branché.</p>
      </div>
    </div>
  );
}
