'use client';

/**
 * Mode Classe — fiche d'UN enseignant, vue par la direction.
 *
 * MÊME ÉCRAN que le tableau de bord « vue enseignant » (tuiles, cartes de
 * classes, dernières sessions), mais recentré sur l'enseignant choisi : la
 * direction voit ce que lui voit en se connectant, sans se connecter à sa
 * place. Tuiles, cartes et calculs d'engagement reprennent le patron exact de
 * `/tableau-de-bord`.
 *
 * LECTURES BORNÉES PAR LES RÈGLES : un directeur ne peut interroger les
 * classes et les séances QUE filtrées sur SON `establishmentId` — on charge
 * donc le périmètre de l'établissement puis on filtre sur l'enseignant côté
 * client (volume : un établissement, quelques dizaines de documents).
 * L'engagement est calculé pour les 3 sessions affichées + 3 précédentes
 * (participants / effectif), comme sur le tableau de bord — coût borné.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, LayoutGrid, Pencil, Play, TrendingUp, User, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { getClasses } from '@/lib/school-service';
import { getSessionsByEstablishment } from '@/lib/class-session-service';
import { getParticipants } from '@/lib/class-report-service';
import { SCHOOL_LEVEL_LABELS, type ClassSession, type SchoolClass } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

/** Couleurs des badges de niveau — mêmes familles que le tableau de bord. */
const NIVEAU_STYLE: Record<string, { fond: string; texte: string }> = {
  universite: { fond: 'rgba(31,145,208,0.12)', texte: '#1F6FA8' },
  lycee: { fond: 'rgba(155,89,182,0.12)', texte: '#8E44AD' },
  college: { fond: 'rgba(230,126,34,0.12)', texte: '#CA6F1E' },
  formation: { fond: 'rgba(46,160,67,0.12)', texte: '#2EA043' },
};

interface SessionEnrichie extends ClassSession {
  nomClasse: string;
  engagementPct: number | null;
  actifs: number;
  effectif: number;
}

interface CompteEnseignant {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  establishmentId?: string | null;
  teachingClassIds?: string[] | null;
  mustChangePassword?: boolean;
}

export default function FicheEnseignantPage() {
  const params = useParams();
  const router = useRouter();
  const uid = String(params?.uid ?? '');
  const { isSuperAdmin, isEstablishmentAdmin, scopedEstablishmentId, loading: authLoading } = useAuth();

  const peutAcceder = isEstablishmentAdmin || isSuperAdmin;

  const [enseignant, setEnseignant] = useState<CompteEnseignant | null>(null);
  const [introuvable, setIntrouvable] = useState(false);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sessions, setSessions] = useState<SessionEnrichie[]>([]);
  const [engagement, setEngagement] = useState<number | null>(null);
  const [tendance, setTendance] = useState<number | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (!authLoading && !peutAcceder) router.replace('/classes');
  }, [authLoading, peutAcceder, router]);

  useEffect(() => {
    if (authLoading || !peutAcceder || !uid) return;
    let annule = false;
    (async () => {
      try {
        // 1. Le compte — via l'API scopée (un directeur ne reçoit que les siens).
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/admins', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) throw new Error('Chargement impossible');
        const donnees = (await res.json()) as { admins?: CompteEnseignant[] };
        const compte = (donnees.admins ?? []).find((a) => a.uid === uid && a.role === 'teacher') ?? null;
        if (annule) return;
        if (!compte) {
          setIntrouvable(true);
          return;
        }
        setEnseignant(compte);

        // 2. Son périmètre — classes et séances de l'établissement, filtrées.
        const etabId = compte.establishmentId ?? scopedEstablishmentId ?? '';
        const [toutesClasses, toutesSessions] = await Promise.all([
          etabId ? getClasses(etabId).catch(() => [] as SchoolClass[]) : Promise.resolve([] as SchoolClass[]),
          etabId ? getSessionsByEstablishment(etabId).catch(() => [] as ClassSession[]) : Promise.resolve([] as ClassSession[]),
        ]);
        if (annule) return;

        const affectees = new Set(compte.teachingClassIds ?? []);
        const sesClasses = toutesClasses
          .filter((c) => affectees.has(c.id) || (c.teacherIds ?? []).includes(uid))
          .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'fr'));
        setClasses(sesClasses);
        const sesSessions = toutesSessions.filter((s) => s.teacherId === uid);

        // 3. Engagement des 3 sessions affichées + tendance (3 précédentes) —
        //    même patron borné que le tableau de bord école.
        const effectifs = new Map(sesClasses.map((c) => [c.id, c.learnerCount ?? 0]));
        const terminees = sesSessions.filter((s) => s.status === 'ended');
        const enrichies: SessionEnrichie[] = [];
        for (const s of sesSessions.slice(0, 3)) {
          const effectif = effectifs.get(s.classId) ?? 0;
          const participants = s.status !== 'scheduled' ? await getParticipants(s.id).catch(() => []) : [];
          enrichies.push({
            ...s,
            nomClasse: sesClasses.find((c) => c.id === s.classId)?.name ?? s.classId,
            actifs: participants.length,
            effectif,
            engagementPct:
              effectif > 0 && s.status !== 'scheduled'
                ? Math.round(Math.min(1, participants.length / effectif) * 100)
                : null,
          });
        }
        if (annule) return;
        setSessions(enrichies);

        const tauxDe = async (liste: ClassSession[]) => {
          const taux: number[] = [];
          for (const s of liste) {
            const effectif = effectifs.get(s.classId) ?? 0;
            if (!effectif) continue;
            const deja = enrichies.find((e) => e.id === s.id);
            const n = deja ? deja.actifs : (await getParticipants(s.id).catch(() => [])).length;
            taux.push(Math.min(1, n / effectif));
          }
          return taux.length ? Math.round((taux.reduce((a, b) => a + b, 0) / taux.length) * 100) : null;
        };
        const recentes = await tauxDe(terminees.slice(0, 3));
        const precedentes = await tauxDe(terminees.slice(3, 6));
        if (annule) return;
        setEngagement(recentes);
        setTendance(recentes != null && precedentes != null ? recentes - precedentes : null);
      } catch (error) {
        console.error('Fiche enseignant :', error);
        toast.error('Erreur lors du chargement de la fiche');
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [authLoading, peutAcceder, uid, scopedEstablishmentId]);

  const apprenants = useMemo(
    () => classes.reduce((somme, c) => somme + (c.learnerCount ?? 0), 0),
    [classes]
  );

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }
  if (!peutAcceder) return null;

  if (introuvable || !enseignant) {
    return (
      <EmptyState
        icon={<Users size={48} />}
        title="Enseignant introuvable"
        description="Ce compte n’existe plus, ou il ne relève pas de votre établissement."
        action={
          <Link href="/enseignants" className="btn-primary" style={{ textDecoration: 'none' }}>
            Retour aux enseignants
          </Link>
        }
      />
    );
  }

  return (
    <div style={{ maxWidth: 1440 }}>
      <Link
        href="/enseignants"
        className="flex items-center gap-1.5 mb-4"
        style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none', width: 'fit-content' }}
      >
        <ArrowLeft size={14} /> Retour aux enseignants
      </Link>

      {/* ═══ En-tête — identité, statut, action ═══ */}
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div className="flex items-center gap-4">
          <div
            className="flex items-center justify-center"
            style={{ width: 52, height: 52, borderRadius: 26, background: NAVY, color: '#FFF', fontSize: 17, fontWeight: 800, flexShrink: 0 }}
          >
            {(enseignant.displayName || enseignant.email).split(/\s+/).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? '').join('') || '·'}
          </div>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: NAVY }}>
              {enseignant.displayName || enseignant.email}
            </h1>
            <p className="flex items-center gap-2" style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 3 }}>
              {enseignant.email}
              <span
                style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10,
                  background: enseignant.mustChangePassword ? 'rgba(245,166,35,0.12)' : 'rgba(46,160,67,0.1)',
                  color: enseignant.mustChangePassword ? '#B87A0C' : '#2EA043',
                }}
                title={enseignant.mustChangePassword ? 'N’a pas encore changé son mot de passe temporaire' : undefined}
              >
                {enseignant.mustChangePassword ? 'Invité' : 'Actif'}
              </span>
            </p>
          </div>
        </div>
        <Link
          href="/enseignants"
          className="flex items-center gap-2"
          style={{ fontSize: 12.5, fontWeight: 600, color: NAVY, textDecoration: 'none', border: '1px solid rgba(15,28,46,0.15)', borderRadius: 10, padding: '8px 14px', background: '#FFF', flexShrink: 0 }}
        >
          <Pencil size={13} /> Affecter des classes
        </Link>
      </div>

      {/* ═══ Tuiles — mêmes que le tableau de bord vue enseignant ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <Tuile Icon={LayoutGrid} libelle="Ses classes" valeur={String(classes.length)} detail={niveauxResume(classes)} />
        <Tuile Icon={Play} libelle="Sessions jouées" valeur={String(sessions.length)} detail="depuis la rentrée" />
        <Tuile Icon={Users} libelle="Apprenants" valeur={apprenants.toLocaleString('fr-FR')} detail="sur ses classes affectées" />
        <Tuile
          Icon={TrendingUp}
          libelle="Engagement moyen"
          valeur={engagement != null ? `${engagement} %` : '—'}
          detail={
            engagement == null
              ? 'dès la première session terminée'
              : tendance != null
                ? `${tendance >= 0 ? '+' : ''}${tendance} pts vs les 3 sessions précédentes`
                : 'sur les 3 dernières sessions terminées'
          }
          accentDetail={tendance != null && tendance >= 0}
        />
      </div>

      {/* ═══ Ses classes ═══ */}
      <h2 style={{ fontSize: 17, fontWeight: 700, color: NAVY, marginBottom: 12 }}>Ses classes</h2>
      {classes.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', background: '#FFF', border: '1px dashed rgba(15,28,46,0.25)', borderRadius: 14, padding: '26px 20px', marginBottom: 26, textAlign: 'center' }}>
          Aucune classe affectée — utilisez « Affecter » depuis la liste des enseignants.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-7">
          {classes.map((c) => (
            <CarteClasse key={c.id} classe={c} derniere={sessions.find((s) => s.classId === c.id) ?? null} />
          ))}
        </div>
      )}

      {/* ═══ Ses dernières sessions ═══ */}
      <div style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.1)', borderRadius: 16, padding: '16px 20px' }}>
        <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Ses dernières sessions</h2>
        <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>
          Chaque ligne ouvre le suivi ou le rapport.
        </p>
        {sessions.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', padding: '10px 0' }}>Aucune session pour l’instant.</p>
        ) : (
          sessions.map((s) => (
            <Link key={s.id} href={`/seances/${s.id}`} style={{ textDecoration: 'none' }}>
              <div className="flex items-center justify-between gap-3" style={{ padding: '11px 0', borderBottom: '1px solid rgba(15,28,46,0.06)' }}>
                <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                  <span className="flex items-center justify-center" style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(15,28,46,0.05)', flexShrink: 0 }}>
                    <Play size={14} color={NAVY} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 380 }}>
                      {s.title || 'Séance'} · {s.nomClasse}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                      {dateRelative(s.endedAt ?? s.startedAt ?? s.createdAt)}
                      {s.editionId ? ` · édition ${s.editionId}` : ''}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>
                    {s.engagementPct != null ? `${s.engagementPct} %` : s.status === 'scheduled' ? 'programmée' : s.status === 'running' ? 'en cours' : '—'}
                  </div>
                  {s.engagementPct != null && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {s.actifs} / {s.effectif} actifs
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

/** Carte de classe — même patron que le tableau de bord (sans redite du prof). */
function CarteClasse({ classe, derniere }: { classe: SchoolClass; derniere: SessionEnrichie | null }) {
  const niveau = NIVEAU_STYLE[classe.level] ?? { fond: 'rgba(15,28,46,0.07)', texte: '#5A6A70' };
  return (
    <Link href={`/classes/${classe.id}`} style={{ textDecoration: 'none' }}>
      <div style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.1)', borderRadius: 16, padding: '16px 18px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center justify-between mb-3">
          <span style={{ background: NAVY, color: ORANGE, fontWeight: 800, fontSize: 12, borderRadius: 10, padding: '8px 10px', letterSpacing: 0.5 }}>
            {codeClasse(classe)}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, background: niveau.fond, color: niveau.texte, borderRadius: 10, padding: '4px 10px' }}>
            {SCHOOL_LEVEL_LABELS[classe.level] ?? classe.level}
          </span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, color: NAVY, lineHeight: 1.35 }}>{classe.name || classe.id}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '6px 0 10px' }}>
          {(classe.learnerCount ?? 0).toLocaleString('fr-FR')} apprenants
        </div>
        <div style={{ borderTop: '1px solid rgba(15,28,46,0.08)', paddingTop: 10, marginTop: 'auto' }}>
          <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            <User size={12} />
            {derniere
              ? `${derniere.title || 'Séance'}${derniere.engagementPct != null ? ` · ${derniere.engagementPct} % d'engagement` : ''}`
              : 'Aucune séance pour l’instant'}
          </div>
        </div>
      </div>
    </Link>
  );
}

function Tuile({ Icon, libelle, valeur, detail, accentDetail }: {
  Icon: typeof Users; libelle: string; valeur: string; detail: string; accentDetail?: boolean;
}) {
  return (
    <div style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.1)', borderRadius: 16, padding: '15px 17px' }}>
      <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>
        <Icon size={13} /> {libelle}
      </div>
      <div style={{ fontSize: 25, fontWeight: 800, color: NAVY }}>{valeur}</div>
      <div style={{ fontSize: 11.5, color: accentDetail ? '#2EA043' : 'var(--color-text-muted)', marginTop: 3, fontWeight: accentDetail ? 700 : 400 }}>
        {detail}
      </div>
    </div>
  );
}

/** « M1 » depuis « Master 1 — … », sinon 3 premières lettres. */
function codeClasse(c: SchoolClass): string {
  const nom = c.name || c.id;
  const majuscules = nom.match(/[A-ZÉ0-9]/g) ?? [];
  const compact = (nom.match(/^([A-Za-z]+)\s*(\d)/) ?? [])[0];
  if (compact) return `${compact[0].toUpperCase()}${compact.match(/\d/)?.[0] ?? ''}`;
  return majuscules.slice(0, 3).join('') || nom.slice(0, 2).toUpperCase();
}

function niveauxResume(classes: SchoolClass[]): string {
  const niveaux = [...new Set(classes.map((c) => SCHOOL_LEVEL_LABELS[c.level] ?? c.level))];
  return niveaux.length ? niveaux.slice(0, 3).join(' · ') : '—';
}

function dateRelative(ms?: number): string {
  if (!ms) return '—';
  const jours = Math.floor((Date.now() - ms) / 86_400_000);
  if (jours <= 0) return 'Aujourd’hui';
  if (jours === 1) return 'Hier';
  if (jours === 2) return 'Avant-hier';
  return `Il y a ${jours} jours`;
}
