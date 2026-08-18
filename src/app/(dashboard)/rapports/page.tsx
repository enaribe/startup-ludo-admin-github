'use client';

/**
 * Mode Classe — Rapports de session (maquette du 14/08, vue établissement).
 *
 * Toutes les sessions jouées, avec pour chacune : participation (barre +
 * actifs/effectif), score moyen (réussite aux quiz) et prolongement. Filtre
 * par classe en onglets, tuiles de synthèse, export consolidé PDF.
 *
 * COÛT BORNÉ : participation et score exigent une lecture de `participants`
 * par session — calculés pour les 15 sessions les plus récentes (au-delà, la
 * ligne affiche « — » et le rapport détaillé reste à un clic). Les tuiles
 * agrègent ce qui est calculé, jamais plus.
 *
 * PROLONGEMENT : le nombre de rendus n'est pas encore instrumenté côté mobile
 * — la colonne affiche « 0 / n » quand un prolongement est assigné (vérité du
 * moment) et « — » sinon. Le jour où l'app remonte les rendus, la colonne
 * vivra sans changer d'écran.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { Award, Download, Play, TrendingUp, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { firestore, COLLECTIONS } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { getClasses, getClassesByIds } from '@/lib/school-service';
import { getSessionsByEstablishment, getSessionsByTeacher } from '@/lib/class-session-service';
import { getParticipants } from '@/lib/class-report-service';
import { telechargerPdf } from '@/lib/rapport-session-pdf';
import { SCHOOL_LEVEL_LABELS, type ClassSession, type SchoolClass } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';
/** Sessions dont participation/score sont calculés (1 lecture chacune). */
const MAX_CALCULEES = 15;

interface LigneRapport extends ClassSession {
  nomClasse: string;
  niveau: string;
  nomProf: string;
  actifs: number | null;
  effectif: number;
  scorePct: number | null;
}

export default function RapportsSessionsPage() {
  const { admin, loading: authLoading, isEstablishmentAdmin, scopedEstablishmentId, scopedClassIds } = useAuth();

  const [vueClasses, setVueClasses] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setVueClasses(window.localStorage.getItem('mode-classe-vue') === 'classes');
    }
  }, []);
  const vueEnseignant = !isEstablishmentAdmin || (vueClasses && scopedClassIds.length > 0);

  const [lignes, setLignes] = useState<LigneRapport[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [filtre, setFiltre] = useState('toutes');
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

        // Noms des enseignants (users/ en lecture publique, dédupliqués).
        const uids = [...new Set(sess.map((s) => s.teacherId))].slice(0, 15);
        const noms: Record<string, string> = {};
        await Promise.all(
          uids.map(async (uid) => {
            const snap = await getDoc(doc(firestore, COLLECTIONS.users, uid)).catch(() => null);
            noms[uid] = (snap?.data()?.displayName as string) ?? '';
          })
        );

        const effectifs = new Map<string, number>(cls.map((c) => [c.id, c.learnerCount ?? 0]));
        const jouees = sess.filter((s) => s.status !== 'scheduled');
        const resultats: LigneRapport[] = [];
        for (const [i, s] of jouees.entries()) {
          let actifs: number | null = null;
          let scorePct: number | null = null;
          if (i < MAX_CALCULEES) {
            const participants = await getParticipants(s.id).catch(() => []);
            actifs = participants.length;
            const reponses = participants.flatMap((p) => p.answers ?? []);
            const correctes = reponses.filter((r) => r.correct === true).length;
            scorePct = reponses.length > 0 ? Math.round((correctes / reponses.length) * 100) : null;
          }
          resultats.push({
            ...s,
            nomClasse: cls.find((c) => c.id === s.classId)?.name ?? s.classId,
            niveau: (() => {
              const lvl = cls.find((c) => c.id === s.classId)?.level;
              return lvl ? SCHOOL_LEVEL_LABELS[lvl] ?? lvl : '';
            })(),
            nomProf: noms[s.teacherId] ?? '',
            actifs,
            effectif: effectifs.get(s.classId) ?? 0,
            scorePct,
          });
          if (annule) return;
        }
        setLignes(resultats);
      } catch (error) {
        console.error('Rapports de session :', error);
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [authLoading, admin, vueEnseignant, scopedEstablishmentId, scopedClassIds]);

  const filtrees = useMemo(
    () => (filtre === 'toutes' ? lignes : lignes.filter((l) => l.classId === filtre)),
    [lignes, filtre]
  );

  // ── Tuiles : agrégées sur ce qui est réellement calculé ──
  const synthese = useMemo(() => {
    const calculees = lignes.filter((l) => l.actifs != null);
    const touches = calculees.reduce((somme, l) => somme + (l.actifs ?? 0), 0);
    const participations = calculees
      .filter((l) => l.effectif > 0)
      .map((l) => Math.min(1, (l.actifs ?? 0) / l.effectif));
    const scores = calculees.map((l) => l.scorePct).filter((x): x is number => x != null);
    const plusAncienne = lignes.reduce(
      (min, l) => Math.min(min, l.endedAt ?? l.startedAt ?? l.createdAt ?? Infinity),
      Infinity
    );
    return {
      total: lignes.length,
      depuis: Number.isFinite(plusAncienne)
        ? new Date(plusAncienne).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
        : null,
      touches,
      participationPct: participations.length
        ? Math.round((participations.reduce((a, b) => a + b, 0) / participations.length) * 100)
        : null,
      scorePct: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    };
  }, [lignes]);

  /** Export consolidé — le tableau tel qu'affiché, en PDF pdf-lib. */
  const exporterConsolide = async () => {
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const pdf = await PDFDocument.create();
      const normal = await pdf.embedFont(StandardFonts.Helvetica);
      const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
      const page = pdf.addPage([841.89, 595.28]); // A4 paysage : le tableau respire
      const nettoie = (t: string) => t.replace(/[’‘]/g, "'").replace(/[–—]/g, '-').replace(/[^\x00-\xFF]/g, '');
      let y = 545;
      page.drawRectangle({ x: 0, y: 595.28 - 70, width: 841.89, height: 70, color: rgb(15 / 255, 28 / 255, 46 / 255) });
      page.drawText('CONCREE - Startup Ludo - Mode Classe', { x: 40, y: 560, size: 9, font: gras, color: rgb(245 / 255, 166 / 255, 35 / 255) });
      page.drawText(nettoie('Rapport consolide des sessions'), { x: 40, y: 540, size: 15, font: gras, color: rgb(1, 1, 1) });
      y = 500;
      page.drawText(
        nettoie(`${synthese.total} sessions - ${synthese.touches} participations - participation moyenne ${synthese.participationPct ?? '-'} % - score moyen ${synthese.scorePct ?? '-'} %`),
        { x: 40, y, size: 10, font: normal, color: rgb(0.24, 0.3, 0.38) }
      );
      y -= 24;
      const colonnes: Array<[string, number]> = [['SEANCE', 40], ['CLASSE', 250], ['ENSEIGNANT', 400], ['DATE', 530], ['PARTICIPATION', 620], ['SCORE', 750]];
      for (const [titre, x] of colonnes) page.drawText(titre, { x, y, size: 8, font: gras, color: rgb(0.45, 0.5, 0.56) });
      y -= 14;
      for (const l of filtrees) {
        if (y < 40) break;
        page.drawText(nettoie((l.title || 'Séance').slice(0, 38)), { x: 40, y, size: 9, font: gras, color: rgb(15 / 255, 28 / 255, 46 / 255) });
        page.drawText(nettoie(l.nomClasse.slice(0, 24)), { x: 250, y, size: 9, font: normal, color: rgb(0.24, 0.3, 0.38) });
        page.drawText(nettoie(l.nomProf.slice(0, 22)), { x: 400, y, size: 9, font: normal, color: rgb(0.24, 0.3, 0.38) });
        page.drawText(new Date(l.endedAt ?? l.startedAt ?? l.createdAt ?? 0).toLocaleDateString('fr-FR'), { x: 530, y, size: 9, font: normal, color: rgb(0.24, 0.3, 0.38) });
        page.drawText(l.actifs != null ? `${l.actifs} / ${l.effectif}` : '-', { x: 620, y, size: 9, font: normal, color: rgb(0.24, 0.3, 0.38) });
        page.drawText(l.scorePct != null ? `${l.scorePct} %` : '-', { x: 750, y, size: 9, font: gras, color: rgb(15 / 255, 28 / 255, 46 / 255) });
        y -= 15;
      }
      telechargerPdf(await pdf.save(), `rapport-consolide-${Date.now()}.pdf`);
    } catch (error) {
      console.error('Export consolidé :', error);
      toast.error('Export impossible.');
    }
  };

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1220 }}>
      {/* ═══ En-tête ═══ */}
      <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: NAVY }}>Rapports de session</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 480 }}>
            {vueEnseignant
              ? 'Toutes vos sessions jouées — ouvrez une ligne pour son rapport détaillé.'
              : 'Toutes les sessions jouées dans l’établissement — ouvrez une ligne pour son rapport détaillé.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void exporterConsolide()}
          className="flex items-center gap-2"
          style={{ fontSize: 13, fontWeight: 600, color: NAVY, border: '1px solid rgba(15,28,46,0.15)', borderRadius: 10, padding: '9px 15px', background: '#FFF', cursor: 'pointer', flexShrink: 0 }}
        >
          <Download size={14} /> Export consolidé (PDF)
        </button>
      </div>

      {/* ═══ Tuiles ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Tuile Icon={Play} libelle="Sessions jouées" valeur={String(synthese.total)} detail={synthese.depuis ? `Depuis le ${synthese.depuis}` : '—'} />
        <Tuile Icon={Users} libelle="Apprenants touchés" valeur={synthese.touches.toLocaleString('fr-FR')} detail="Cumul des participations" />
        <Tuile Icon={TrendingUp} libelle="Participation moyenne" valeur={synthese.participationPct != null ? `${synthese.participationPct} %` : '—'} detail="Toutes classes confondues" />
        <Tuile Icon={Award} libelle="Score moyen" valeur={synthese.scorePct != null ? `${synthese.scorePct} %` : '—'} detail="Sur l’ensemble des séances" />
      </div>

      {/* ═══ Tableau ═══ */}
      <div style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.1)', borderRadius: 16, overflow: 'hidden' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ padding: '16px 20px 10px' }}>
          <div>
            <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Sessions jouées</h2>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
              {filtrees.length} session{filtrees.length > 1 ? 's' : ''}
            </p>
          </div>
          {/* Filtre par classe */}
          <div className="flex items-center flex-wrap" style={{ background: '#F1F3F7', borderRadius: 10, padding: 3, gap: 2 }}>
            {[{ id: 'toutes', nom: 'Toutes les classes' }, ...classes.map((c) => ({ id: c.id, nom: c.name || c.id }))].map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setFiltre(o.id)}
                style={{
                  fontSize: 12, padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontWeight: filtre === o.id ? 700 : 400,
                  background: filtre === o.id ? '#FFF' : 'transparent',
                  color: filtre === o.id ? NAVY : '#5A6A70',
                  boxShadow: filtre === o.id ? '0 1px 3px rgba(15,28,46,0.15)' : 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                {o.nom}
              </button>
            ))}
          </div>
        </div>

        {filtrees.length === 0 ? (
          <p style={{ padding: '20px 20px 26px', fontSize: 13, color: 'var(--color-text-muted)' }}>
            Aucune session jouée pour l’instant — les rapports apparaîtront après la première séance.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ fontSize: 10.5, letterSpacing: 0.8, color: 'var(--color-text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 20px', fontWeight: 600 }}>SÉANCE</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>CLASSE</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>ENSEIGNANT</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>DATE</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>PARTICIPATION</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>SCORE MOYEN</th>
                  <th style={{ padding: '8px 20px', fontWeight: 600, textAlign: 'right' }}>PROLONGEMENT</th>
                </tr>
              </thead>
              <tbody>
                {filtrees.map((l) => (
                  <LigneTableau key={l.id} l={l} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function LigneTableau({ l }: { l: LigneRapport }) {
  const pct = l.actifs != null && l.effectif > 0 ? Math.min(100, Math.round((l.actifs / l.effectif) * 100)) : null;
  const date = l.endedAt ?? l.startedAt ?? l.createdAt;
  return (
    <tr
      style={{ borderTop: '1px solid rgba(15,28,46,0.06)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(15,28,46,0.02)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <td style={{ padding: '13px 20px' }}>
        <Link href={`/seances/${l.id}`} style={{ textDecoration: 'none' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>{l.title || 'Séance'}</div>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>Édition {l.editionId || '—'}</div>
        </Link>
      </td>
      <td style={{ padding: '13px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{l.nomClasse}</div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{l.niveau}</div>
      </td>
      <td style={{ padding: '13px 12px', color: 'var(--color-text-secondary)' }}>{l.nomProf || '—'}</td>
      <td style={{ padding: '13px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{dateRelative(date)}</div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
          {date ? new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
        </div>
      </td>
      <td style={{ padding: '13px 12px', minWidth: 150 }}>
        {pct != null ? (
          <>
            <div style={{ height: 7, borderRadius: 4, background: 'rgba(15,28,46,0.08)', overflow: 'hidden', marginBottom: 4, maxWidth: 130 }}>
              <div style={{ width: `${Math.max(3, pct)}%`, height: '100%', borderRadius: 4, background: pct >= 80 ? ORANGE : NAVY }} />
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
              <strong style={{ color: NAVY }}>{l.actifs}</strong> / {l.effectif} actifs
            </span>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>—</span>
        )}
      </td>
      <td style={{ padding: '13px 12px', textAlign: 'right', fontWeight: 800, color: NAVY }}>
        {l.scorePct != null ? `${l.scorePct} %` : '—'}
      </td>
      <td style={{ padding: '13px 20px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
        {l.prolongement?.actif ? `0 / ${l.effectif}` : '—'}
      </td>
    </tr>
  );
}

function Tuile({ Icon, libelle, valeur, detail }: { Icon: typeof Users; libelle: string; valeur: string; detail: string }) {
  return (
    <div style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.1)', borderRadius: 16, padding: '15px 17px' }}>
      <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>
        <Icon size={13} /> {libelle}
      </div>
      <div style={{ fontSize: 25, fontWeight: 800, color: NAVY }}>{valeur}</div>
      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 3 }}>{detail}</div>
    </div>
  );
}

function dateRelative(ms?: number): string {
  if (!ms) return '—';
  const jours = Math.floor((Date.now() - ms) / 86_400_000);
  if (jours <= 0) return 'Aujourd’hui';
  if (jours === 1) return 'Hier';
  if (jours === 2) return 'Avant-hier';
  return `Il y a ${jours} jours`;
}
