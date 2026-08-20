'use client';

/**
 * Mode Classe — « Session en direct » (entrée dédiée de la barre latérale).
 *
 * L'écran de suivi vit sur `/seances/{id}` : cette page sert de PORTE D'ENTRÉE
 * permanente depuis le menu, sans que l'enseignant ait à retrouver sa séance
 * dans l'historique :
 *   - UNE séance en cours  → redirection immédiate vers son suivi ;
 *   - plusieurs en cours   → liste pour choisir (cas direction, ou séance
 *                            oubliée ouverte) ;
 *   - aucune               → les séances programmées prêtes à ouvrir, et le
 *                            bouton « Lancer une session ».
 *
 * PÉRIMÈTRE identique à `/seances` : l'enseignant voit SES séances, la
 * direction celles de son établissement (seules formes de requêtes que les
 * règles Firestore acceptent).
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, Play, Radio, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth-context';
import { getClasses, getClassesByIds } from '@/lib/school-service';
import { getSessionsByEstablishment, getSessionsByTeacher } from '@/lib/class-session-service';
import type { ClassSession, SchoolClass } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';

export default function SessionEnDirectPage() {
  const router = useRouter();
  const { admin, isEstablishmentAdmin, scopedEstablishmentId, scopedClassIds, loading: authLoading } =
    useAuth();

  /** `null` tant que la recherche (et l'éventuelle redirection) est en cours. */
  const [enCours, setEnCours] = useState<ClassSession[] | null>(null);
  const [programmees, setProgrammees] = useState<ClassSession[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);

  useEffect(() => {
    if (authLoading || !admin) return;
    let annule = false;
    (async () => {
      try {
        const [sessions, cls] = await Promise.all([
          isEstablishmentAdmin && scopedEstablishmentId
            ? getSessionsByEstablishment(scopedEstablishmentId)
            : getSessionsByTeacher(admin.uid),
          isEstablishmentAdmin && scopedEstablishmentId
            ? getClasses(scopedEstablishmentId).catch(() => [] as SchoolClass[])
            : getClassesByIds(scopedClassIds).catch(() => [] as SchoolClass[]),
        ]);
        if (annule) return;

        const running = sessions.filter((s) => s.status === 'running');
        // Le cas nominal : une seule séance en cours — on y va sans détour.
        if (running.length === 1) {
          router.replace(`/seances/${running[0].id}`);
          return;
        }
        setClasses(cls);
        setEnCours(running);
        setProgrammees(sessions.filter((s) => s.status === 'scheduled'));
      } catch (error) {
        console.error('Recherche de la session en direct :', error);
        if (!annule) {
          toast.error('Impossible de charger vos séances');
          setEnCours([]);
        }
      }
    })();
    return () => {
      annule = true;
    };
  }, [authLoading, admin, isEstablishmentAdmin, scopedEstablishmentId, scopedClassIds, router]);

  const nomClasse = useMemo(() => {
    const parId = new Map(classes.map((c) => [c.id, c.name || c.id]));
    return (classId: string) => parId.get(classId) ?? classId;
  }, [classes]);

  if (authLoading || enCours === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (enCours.length === 0 && programmees.length === 0) {
    return (
      <EmptyState
        icon={<Radio size={48} />}
        title="Aucune session en cours"
        description="Lancez une session : vos élèves rattachés la verront apparaître sur leur profil, et son suivi en direct s'ouvrira ici."
        action={
          <div className="flex items-center gap-3">
            <Link href="/seances/nouvelle" className="btn-primary flex items-center gap-2" style={{ textDecoration: 'none' }}>
              <Zap size={15} /> Lancer une session
            </Link>
            <Link href="/rapports" className="btn-secondary" style={{ textDecoration: 'none' }}>
              Voir les rapports
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5" style={{ maxWidth: 900 }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text-primary)' }}>
          Session en direct
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
          {enCours.length > 0
            ? `${enCours.length} séance${enCours.length > 1 ? 's' : ''} en cours — choisissez celle à suivre.`
            : 'Aucune séance en cours pour l’instant. Vos séances programmées sont prêtes à ouvrir.'}
        </p>
      </div>

      {enCours.length > 0 && (
        <section className="glass-card p-5 flex flex-col gap-2">
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
            En cours
          </h2>
          {enCours.map((s) => (
            <Link
              key={s.id}
              href={`/seances/${s.id}`}
              className="flex items-center justify-between gap-3"
              style={{
                textDecoration: 'none', padding: '12px 16px', borderRadius: 12,
                border: '1.5px solid var(--color-primary)', background: 'rgba(255,188,64,0.09)',
              }}
            >
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)', display: 'block' }}>
                  {s.title || 'Séance sans titre'}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                  {nomClasse(s.classId)}
                  {s.startedAt &&
                    ` · ouverte à ${new Date(s.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                </span>
              </span>
              <span className="flex items-center gap-2" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--color-text-primary)', flexShrink: 0 }}>
                <Play size={14} /> Rejoindre le suivi
              </span>
            </Link>
          ))}
        </section>
      )}

      {programmees.length > 0 && (
        <section className="glass-card p-5 flex flex-col gap-2">
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
            Programmées — prêtes à ouvrir
          </h2>
          {programmees.map((s) => (
            <Link
              key={s.id}
              href={`/seances/${s.id}`}
              className="flex items-center justify-between gap-3"
              style={{
                textDecoration: 'none', padding: '11px 16px', borderRadius: 12,
                border: '1.5px solid var(--color-card-border)', background: '#FFFFFF',
              }}
            >
              <span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)', display: 'block' }}>
                  {s.title || 'Séance sans titre'}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                  {nomClasse(s.classId)}
                  {s.scheduledAt
                    ? ` · programmée pour le ${new Date(s.scheduledAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                    : ' · à ouvrir manuellement'}
                </span>
              </span>
              <span className="flex items-center gap-1.5" style={{ fontSize: 12.5, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                <CalendarClock size={14} /> Ouvrir
              </span>
            </Link>
          ))}
        </section>
      )}

      <div className="flex items-center gap-4" style={{ fontSize: 12.5 }}>
        <Link href="/seances/nouvelle" className="btn-primary flex items-center gap-2" style={{ textDecoration: 'none', fontSize: 13 }}>
          <Zap size={15} /> Lancer une session
        </Link>
        <Link href="/seances" style={{ color: 'var(--color-text-muted)' }}>
          Historique complet des séances
        </Link>
      </div>
    </div>
  );
}
