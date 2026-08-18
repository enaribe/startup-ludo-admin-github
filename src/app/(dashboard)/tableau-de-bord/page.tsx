'use client';

/**
 * Mode Classe — Tableau de bord (lot M2, alignement maquette du 14/08).
 *
 * UNE page, DEUX périmètres (direction / enseignant ou vue « Mes classes »).
 * FIDÈLE À LA MAQUETTE : tuiles avec icônes, cartes de classes riches (badge
 * code, niveau coloré, enseignant responsable, dernière séance + engagement),
 * tuile pointillée « Voir les N classes », puis deux colonnes — dernières
 * sessions (avec % d'actifs) et encart Enseignants.
 *
 * COÛT BORNÉ, CHIFFRES HONNÊTES : l'engagement par session est calculé pour
 * les 3 sessions affichées uniquement (participants / effectif), les noms des
 * enseignants viennent de `users/{uid}` (lecture publique). Ce qui n'est pas
 * calculable s'affiche « — », jamais inventé.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { LayoutGrid, Play, TrendingUp, User, Users, Zap } from 'lucide-react';
import { firestore, COLLECTIONS } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { getClasses, getClassesByIds } from '@/lib/school-service';
import { getSessionsByEstablishment, getSessionsByTeacher } from '@/lib/class-session-service';
import { getParticipants } from '@/lib/class-report-service';
import { SCHOOL_LEVEL_LABELS, type ClassSession, type SchoolClass } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

/** Couleurs des badges de niveau — mêmes familles que la maquette. */
const NIVEAU_STYLE: Record<string, { fond: string; texte: string }> = {
  universite: { fond: 'rgba(31,145,208,0.12)', texte: '#1F6FA8' },
  lycee: { fond: 'rgba(155,89,182,0.12)', texte: '#8E44AD' },
  college: { fond: 'rgba(230,126,34,0.12)', texte: '#CA6F1E' },
  formation: { fond: 'rgba(46,160,67,0.12)', texte: '#2EA043' },
};

interface SessionEnrichie extends ClassSession {
  nomClasse: string;
  nomProf: string;
  /** % d'actifs (participants / effectif), null si effectif inconnu. */
  engagementPct: number | null;
  actifs: number;
  effectif: number;
}

export default function TableauDeBordEcolePage() {
  const { admin, loading: authLoading, isEstablishmentAdmin, scopedEstablishmentId, scopedClassIds } = useAuth();

  const [vueClasses, setVueClasses] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setVueClasses(window.localStorage.getItem('mode-classe-vue') === 'classes');
    }
  }, []);
  const vueEnseignant = !isEstablishmentAdmin || (vueClasses && scopedClassIds.length > 0);

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [sessions, setSessions] = useState<SessionEnrichie[]>([]);
  const [nomsProfs, setNomsProfs] = useState<Record<string, string>>({});
  const [engagement, setEngagement] = useState<number | null>(null);
  const [tendance, setTendance] = useState<number | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (authLoading || !admin) return;
    let annule = false;
    (async () => {
      try {
        const [cls, sess] = await Promise.all([
          vueEnseignant ? getClassesByIds(scopedClassIds) : getClasses(scopedEstablishmentId ?? ''),
          vueEnseignant ? getSessionsByTeacher(admin.uid) : getSessionsByEstablishment(scopedEstablishmentId ?? ''),
        ]);
        if (annule) return;
        setClasses(cls);

        // Noms des enseignants (lecture publique de users/{uid}, bornée).
        const uids = [...new Set(cls.flatMap((c) => c.teacherIds ?? []))].slice(0, 12);
        const noms: Record<string, string> = {};
        await Promise.all(
          uids.map(async (uid) => {
            const snap = await getDoc(doc(firestore, COLLECTIONS.users, uid)).catch(() => null);
            noms[uid] = (snap?.data()?.displayName as string) ?? '';
          })
        );
        if (annule) return;
        setNomsProfs(noms);

        // Sessions enrichies : engagement calculé pour les 3 affichées + 3
        // précédentes (tendance) — coût borné à 6 lectures de sous-collection.
        const effectifs = new Map<string, number>(cls.map((c) => [c.id, c.learnerCount ?? 0]));
        const terminees = sess.filter((x) => x.status === 'ended');
        const aEnrichir = sess.slice(0, 3);
        const enrichies: SessionEnrichie[] = [];
        for (const x of aEnrichir) {
          const effectif = effectifs.get(x.classId) ?? 0;
          const participants = x.status !== 'scheduled' ? await getParticipants(x.id).catch(() => []) : [];
          enrichies.push({
            ...x,
            nomClasse: cls.find((c) => c.id === x.classId)?.name ?? x.classId,
            nomProf: noms[x.teacherId] ?? '',
            actifs: participants.length,
            effectif,
            engagementPct: effectif > 0 && x.status !== 'scheduled'
              ? Math.round(Math.min(1, participants.length / effectif) * 100)
              : null,
          });
        }
        if (annule) return;
        setSessions(enrichies);

        // Engagement moyen + tendance (3 dernières vs 3 précédentes terminées).
        const tauxDe = async (liste: ClassSession[]) => {
          const taux: number[] = [];
          for (const x of liste) {
            const effectif = effectifs.get(x.classId) ?? 0;
            if (!effectif) continue;
            const deja = enrichies.find((e) => e.id === x.id);
            const n = deja ? deja.actifs : (await getParticipants(x.id).catch(() => [])).length;
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
        console.error('Tableau de bord école :', error);
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [authLoading, admin, vueEnseignant, scopedEstablishmentId, scopedClassIds]);

  const apprenants = useMemo(() => classes.reduce((somme, c) => somme + (c.learnerCount ?? 0), 0), [classes]);
  const nbEnseignants = useMemo(() => new Set(classes.flatMap((c) => c.teacherIds ?? [])).size, [classes]);
  const prenom = (admin?.displayName || '').split(' ').slice(-1)[0] || admin?.displayName || '';

  /** Enseignants de l'encart : nom + classes affectées. */
  const enseignantsEncart = useMemo(() => {
    const parProf = new Map<string, string[]>();
    for (const c of classes) {
      for (const uid of c.teacherIds ?? []) {
        parProf.set(uid, [...(parProf.get(uid) ?? []), c.name || c.id]);
      }
    }
    return [...parProf.entries()].slice(0, 4).map(([uid, cls]) => ({
      uid,
      nom: nomsProfs[uid] || 'Enseignant',
      classes: cls.join(' · '),
    }));
  }, [classes, nomsProfs]);

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1180 }}>
      {/* ═══ En-tête ═══ */}
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: NAVY }}>Bonjour {prenom || 'à vous'}</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 520 }}>
            {vueEnseignant
              ? 'Vos classes, vos sessions, vos rapports — concentrez-vous sur vos apprenants.'
              : 'Pilotez Startup Ludo pour tout l’établissement — classes, enseignants et engagement des apprenants, du collège à l’université.'}
          </p>
        </div>
        {vueEnseignant && (
          <Link
            href="/seances/nouvelle"
            className="flex items-center gap-2"
            style={{ background: ORANGE, color: NAVY, fontWeight: 700, fontSize: 13, padding: '10px 16px', borderRadius: 10, textDecoration: 'none', flexShrink: 0 }}
          >
            <Zap size={14} /> Lancer une session
          </Link>
        )}
      </div>

      {/* ═══ Tuiles ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <Tuile Icon={LayoutGrid} libelle={vueEnseignant ? 'Mes classes' : 'Classes actives'} valeur={String(classes.length)} detail={niveauxResume(classes)} />
        {vueEnseignant ? (
          <Tuile Icon={Play} libelle="Sessions jouées" valeur={String(sessions.length ? sessions.length : 0)} detail="depuis la rentrée" />
        ) : (
          <Tuile Icon={User} libelle="Enseignants" valeur={String(nbEnseignants)} detail="rattachés à la licence établissement" />
        )}
        <Tuile Icon={Users} libelle="Apprenants" valeur={apprenants.toLocaleString('fr-FR')} detail={vueEnseignant ? 'sur vos classes affectées' : 'sur l’ensemble des classes'} />
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

      {/* ═══ Vos classes ═══ */}
      <div className="flex items-center justify-between mb-3">
        <h2 style={{ fontSize: 17, fontWeight: 700, color: NAVY }}>Vos classes</h2>
        <Link
          href="/classes"
          className="flex items-center gap-2"
          style={{ fontSize: 12.5, fontWeight: 600, color: NAVY, textDecoration: 'none', border: '1px solid rgba(15,28,46,0.15)', borderRadius: 10, padding: '8px 14px', background: '#FFF' }}
        >
          <LayoutGrid size={13} /> Gérer les classes
        </Link>
      </div>

      {classes.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', background: '#FFF', border: '1px dashed rgba(15,28,46,0.25)', borderRadius: 14, padding: '26px 20px', marginBottom: 26, textAlign: 'center' }}>
          {vueEnseignant
            ? 'Aucune classe ne vous est affectée pour l’instant — rapprochez-vous de votre direction.'
            : 'Aucune classe pour l’instant — créez vos classes, invitez vos enseignants et affectez-leur les classes : ils pourront lancer des sessions dès leur première connexion.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-7">
          {classes.slice(0, 3).map((c) => (
            <CarteClasse key={c.id} classe={c} nomProf={nomsProfs[(c.teacherIds ?? [])[0] ?? ''] ?? ''} derniere={sessions.find((s) => s.classId === c.id) ?? null} />
          ))}
          {classes.length > 3 && (
            <Link href="/classes" style={{ textDecoration: 'none' }}>
              <div
                className="flex flex-col items-center justify-center gap-1"
                style={{ border: '1.5px dashed rgba(15,28,46,0.25)', borderRadius: 16, minHeight: 180, background: '#FFF', height: '100%' }}
              >
                <LayoutGrid size={18} color={ORANGE} />
                <span style={{ fontSize: 13.5, fontWeight: 600, color: NAVY }}>Voir les {classes.length} classes</span>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>Créer, affecter, suivre</span>
              </div>
            </Link>
          )}
        </div>
      )}

      {/* ═══ Deux colonnes : sessions + enseignants ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2" style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.1)', borderRadius: 16, padding: '16px 20px' }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>
            {vueEnseignant ? 'Vos dernières sessions' : 'Dernières sessions de l’établissement'}
          </h2>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            {vueEnseignant ? 'Chaque ligne ouvre le suivi ou le rapport.' : 'Toutes classes et enseignants confondus.'}
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
                        {s.nomProf ? ` · ${s.nomProf}` : ''}
                        {s.editionId ? ` · édition ${s.editionId}` : ''}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>
                      {s.engagementPct != null ? `${s.engagementPct} %` : s.status === 'scheduled' ? 'programmée' : '—'}
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

        {!vueEnseignant && (
          <div style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.1)', borderRadius: 16, padding: '16px 20px' }}>
            <div className="flex items-center justify-between mb-2">
              <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Enseignants</h2>
              <Link href="/enseignants" style={{ fontSize: 12.5, fontWeight: 700, color: '#B87A0C', textDecoration: 'none' }}>
                Gérer
              </Link>
            </div>
            {enseignantsEncart.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>Aucun enseignant affecté pour l’instant.</p>
            ) : (
              enseignantsEncart.map((e) => (
                <div key={e.uid} className="flex items-center justify-between gap-2" style={{ padding: '9px 0', borderBottom: '1px solid rgba(15,28,46,0.06)' }}>
                  <div className="flex items-center gap-2.5" style={{ minWidth: 0 }}>
                    <span className="flex items-center justify-center" style={{ width: 32, height: 32, borderRadius: 16, background: NAVY, color: '#FFF', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                      {initiales(e.nom)}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{e.nom}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>{e.classes}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 10, background: 'rgba(46,160,67,0.12)', color: '#2EA043', flexShrink: 0 }}>
                    Actif
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Carte d'une classe — badge code, niveau coloré, enseignant et dernière séance. */
function CarteClasse({ classe, nomProf, derniere }: { classe: SchoolClass; nomProf: string; derniere: SessionEnrichie | null }) {
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
          <div className="flex items-center gap-1.5" style={{ fontSize: 12.5, fontWeight: 700, color: NAVY }}>
            <User size={12} /> {nomProf || 'À affecter'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
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

function initiales(nom: string): string {
  return nom.split(' ').filter(Boolean).slice(0, 2).map((m) => m[0]?.toUpperCase() ?? '').join('') || '–';
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
