'use client';

import { useEffect, useState } from 'react';
import { Target, Zap, Shield, Star, Trophy } from 'lucide-react';
import { getSessionsByUserProgram } from '@/lib/firestore-service';
import type { ProgramEnrollment, ProgramLeadStatus, EntrepreneurProfile, ProgramSessionDoc } from '@/types';

export const STATUS_META: Record<ProgramLeadStatus, { label: string; color: string; bg: string }> = {
  new: { label: 'Nouveau', color: '#5B8DEF', bg: 'rgba(91,141,239,0.15)' },
  contacted: { label: 'Contacté', color: '#F5A623', bg: 'rgba(245,166,35,0.15)' },
  converted: { label: 'Converti', color: '#3FAE6B', bg: 'rgba(63,174,107,0.15)' },
  rejected: { label: 'Rejeté', color: '#F44336', bg: 'rgba(244,67,54,0.15)' },
};

export const PROFILE_META: Record<EntrepreneurProfile, { label: string; icon: React.ReactNode; color: string }> = {
  strategist: { label: 'Stratège', icon: <Target size={13} />, color: '#5B8DEF' },
  goer: { label: 'Fonceur', icon: <Zap size={13} />, color: '#F5A623' },
  cautious: { label: 'Prudent', icon: <Shield size={13} />, color: '#3FAE6B' },
  creative: { label: 'Créatif', icon: <Star size={13} />, color: '#9B59B6' },
  builder: { label: 'Bâtisseur', icon: <Trophy size={13} />, color: '#C9821E' },
};

export const MATCH_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  yes: { label: 'Oui', color: '#3FAE6B', bg: 'rgba(63,174,107,0.15)' },
  partial: { label: 'Partiellement', color: '#F5A623', bg: 'rgba(245,166,35,0.15)' },
  no: { label: 'Non', color: '#F44336', bg: 'rgba(244,67,54,0.15)' },
};

const SESSION_STATUS_META: Record<ProgramEnrollment['status'], { label: string; color: string; bg: string }> = {
  active: { label: 'En cours', color: '#5B8DEF', bg: 'rgba(91,141,239,0.15)' },
  completed: { label: 'Terminé', color: '#3FAE6B', bg: 'rgba(63,174,107,0.15)' },
  paused: { label: 'En pause', color: '#F5A623', bg: 'rgba(245,166,35,0.15)' },
};

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return "à l'instant";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return `il y a ${d} j`;
}

function formatDate(ts: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Affiche une valeur de réponse (string, array, number, bool) de façon lisible. */
function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  return String(v);
}

interface LeadDetailProps {
  lead: ProgramEnrollment;
  programId: string;
  fieldLabels: Map<string, string>;
  consentLabels: Map<string, string>;
  onClose: () => void;
  /** Mode dashboard : permet de modifier le statut CRM. Absent = lecture seule (partage public). */
  onStatus?: (s: ProgramLeadStatus) => void;
  /** Sessions fournies (mode public). Si absent, elles sont chargées via Firestore (mode dashboard). */
  sessions?: ProgramSessionDoc[];
}

export function LeadDetail({ lead, programId, fieldLabels, consentLabels, onClose, onStatus, sessions: sessionsProp }: LeadDetailProps) {
  const fd = lead.formData;
  const status = lead.leadStatus ?? 'new';
  const custom = fd?.customResponses ?? {};
  const customC = fd?.customConsents ?? {};
  const customKeys = Object.keys(custom);
  const customCKeys = Object.keys(customC);
  const readOnly = !onStatus;

  // Historique des parties : fourni en props (public) ou chargé via Firestore (dashboard).
  const [loaded, setLoaded] = useState<ProgramSessionDoc[] | null>(sessionsProp ?? null);
  useEffect(() => {
    if (sessionsProp) { setLoaded([...sessionsProp].sort((a, b) => b.startedAt - a.startedAt)); return; }
    let alive = true;
    setLoaded(null);
    getSessionsByUserProgram(lead.userId, programId)
      .then((s) => { if (alive) setLoaded(s.sort((a, b) => b.startedAt - a.startedAt)); })
      .catch(() => { if (alive) setLoaded([]); });
    return () => { alive = false; };
  }, [lead.userId, programId, sessionsProp]);

  const totalSessions = lead.totalSessions ?? 0;
  const totalWins = lead.totalWins ?? 0;
  const winRate = totalSessions > 0 ? Math.round((totalWins / totalSessions) * 100) : 0;
  const progStatus = SESSION_STATUS_META[lead.status] ?? SESSION_STATUS_META.active;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div
        className="h-full overflow-y-auto"
        style={{ width: 'min(440px, 92vw)', background: 'var(--color-card)', borderLeft: '1px solid var(--color-card-border)', padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h2 style={{ fontSize: 19, fontWeight: 700, color: 'var(--color-text-primary)' }}>{fd?.fullName || 'Candidat'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16 }}>Candidature reçue {timeAgo(lead.enrolledAt)}</p>

        {/* Statut (modifiable en dashboard, badge en lecture seule) */}
        <div className="mb-5">
          {readOnly ? (
            <span style={{ borderRadius: 999, padding: '5px 14px', fontSize: 13, fontWeight: 600, color: STATUS_META[status].color, background: STATUS_META[status].bg }}>
              {STATUS_META[status].label}
            </span>
          ) : (
            <select
              value={status}
              onChange={(e) => onStatus!(e.target.value as ProgramLeadStatus)}
              style={{ border: 'none', cursor: 'pointer', borderRadius: 999, padding: '5px 14px', fontSize: 13, fontWeight: 600, color: STATUS_META[status].color, background: STATUS_META[status].bg }}
            >
              {(Object.keys(STATUS_META) as ProgramLeadStatus[]).map((s) => (
                <option key={s} value={s} style={{ color: '#000' }}>{STATUS_META[s].label}</option>
              ))}
            </select>
          )}
        </div>

        {/* Progression du joueur sur le programme */}
        <Section title="Progression sur le programme">
          <div className="flex items-center justify-between mb-1">
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Avancement</span>
            <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, color: progStatus.color, background: progStatus.bg }}>{progStatus.label}</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Stat label="Niveau actuel" value={(lead.currentLevel ?? 0) + 1} />
            <Stat label="Niveaux complétés" value={lead.completedLevels ?? 0} />
            <Stat label="Parties jouées" value={totalSessions} />
            <Stat label="Victoires" value={`${totalWins} (${winRate}%)`} />
            <Stat label="XP total" value={lead.totalXp ?? 0} />
            <Stat label="Dernière partie" value={lead.lastPlayedAt ? timeAgo(lead.lastPlayedAt) : '—'} />
          </div>
        </Section>

        {/* Historique des parties */}
        <Section title="Historique des parties">
          {loaded === null ? (
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Chargement…</span>
          ) : loaded.length === 0 ? (
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Aucune partie enregistrée.</span>
          ) : (
            <div className="flex flex-col gap-2">
              {loaded.map((s) => (
                <div key={s.id} className="flex items-center justify-between" style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--color-surface)' }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>Niveau {s.levelIndex + 1}</span>
                    {s.isTrial && <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 6 }}>(essai)</span>}
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{formatDate(s.startedAt)} · +{s.xpGained} XP · {s.tokensEarned} jetons</div>
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                    color: s.won === true ? '#3FAE6B' : s.won === false ? '#F44336' : '#F5A623',
                    background: s.won === true ? 'rgba(63,174,107,0.15)' : s.won === false ? 'rgba(244,67,54,0.15)' : 'rgba(245,166,35,0.15)',
                  }}>
                    {s.won === true ? 'Gagné' : s.won === false ? 'Perdu' : 'En cours'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Coordonnées (champs fixes) */}
        <Section title="Coordonnées">
          <Row label="Nom complet" value={fd?.fullName} />
          <Row label="Téléphone" value={fd?.phone} />
          <Row label="Email" value={fd?.email} />
          <Row label="Ville" value={fd?.city} />
          <Row label="Statut professionnel" value={fd?.professionalStatus} />
        </Section>

        {/* Parcours / scoring */}
        <Section title="Profil & intention">
          <Row label="Persona incarné" value={lead.profileName} />
          <Row label="Concordance profil" value={fd?.profileMatch ? (MATCH_LABEL[fd.profileMatch]?.label ?? fd.profileMatch) : undefined} />
          <Row label="Intention de candidature" value={fd?.applicationIntent != null ? `${fd.applicationIntent} / 10` : undefined} />
        </Section>

        {/* Réponses dynamiques (custom) */}
        {customKeys.length > 0 && (
          <Section title="Réponses au formulaire">
            {customKeys.map((id) => (
              <Row key={id} label={fieldLabels.get(id) ?? id} value={renderValue(custom[id])} />
            ))}
          </Section>
        )}

        {/* Consentements */}
        <Section title="Consentements">
          <Row label="Traitement des données" value={fd?.consentDataProcessing ? 'Oui' : 'Non'} />
          <Row label="Accepte d’être recontacté" value={fd?.consentContact ? 'Oui' : 'Non'} />
          <Row label="Newsletter" value={fd?.newsletterOptIn ? 'Oui' : 'Non'} />
          {customCKeys.map((id) => (
            <Row key={id} label={consentLabels.get(id) ?? id} value={customC[id] ? 'Oui' : 'Non'} />
          ))}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>{title}</p>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: unknown }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span style={{ fontSize: 13, color: 'var(--color-text-muted)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--color-text-primary)', textAlign: 'right', fontWeight: 500 }}>{renderValue(value)}</span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--color-surface)' }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</div>
    </div>
  );
}
