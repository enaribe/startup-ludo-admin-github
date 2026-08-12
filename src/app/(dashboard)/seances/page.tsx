'use client';

/**
 * Mode Classe — historique des séances.
 *
 * PÉRIMÈTRE selon le rôle, calqué sur `/classes` (lot 2) et sur ce qu'autorisent
 * les règles Firestore :
 *   - `teacher` : SES séances (`where teacherId == uid`) ;
 *   - `establishment_admin` : toutes les séances de son établissement
 *     (`where establishmentId == claim`) — c'est la seule forme de requête que
 *     sa règle accepte, un listing nu serait refusé en bloc ;
 *   - super admin : rien à afficher sans établissement choisi (le support passe
 *     par `/classes?etab=…`).
 *
 * Un directeur qui enseigne (double rôle) voit la vue établissement, plus large :
 * ses propres séances y figurent.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth-context';
import { getClassesByIds, getClasses } from '@/lib/school-service';
import { getSessionsByEstablishment, getSessionsByTeacher } from '@/lib/class-session-service';
import type { ClassSession, ClassSessionStatus, SchoolClass } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';

/** Libellés et couleurs des états, pour ne pas afficher l'anglais du modèle. */
const ETATS: Record<ClassSessionStatus, { label: string; classe: string }> = {
  scheduled: { label: 'Programmée', classe: 'badge' },
  running: { label: 'En cours', classe: 'badge badge-info' },
  ended: { label: 'Terminée', classe: 'badge' },
};

export default function SeancesPage() {
  const { admin, isEstablishmentAdmin, scopedClassIds, scopedEstablishmentId, loading: authLoading } =
    useAuth();

  const [seances, setSeances] = useState<ClassSession[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (authLoading || !admin) return;
    let annule = false;
    (async () => {
      try {
        const [liste, mesClasses] = await Promise.all([
          isEstablishmentAdmin && scopedEstablishmentId
            ? getSessionsByEstablishment(scopedEstablishmentId)
            : getSessionsByTeacher(admin.uid),
          isEstablishmentAdmin && scopedEstablishmentId
            ? getClasses(scopedEstablishmentId).catch(() => [] as SchoolClass[])
            : getClassesByIds(scopedClassIds).catch(() => [] as SchoolClass[]),
        ]);
        if (annule) return;
        setSeances(liste);
        setClasses(mesClasses);
      } catch (error) {
        console.error('Chargement des séances :', error);
        toast.error('Erreur lors du chargement des séances');
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [authLoading, admin, isEstablishmentAdmin, scopedEstablishmentId, scopedClassIds]);

  /** Nom de classe par id — évite une jointure par ligne. */
  const nomsClasses = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of classes) map.set(c.id, c.name || c.id);
    return map;
  }, [classes]);

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>Séances</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 640 }}>
            {isEstablishmentAdmin
              ? 'Toutes les séances de votre établissement.'
              : 'Vos séances passées et à venir. Une séance lancée apparaît directement sur le profil de vos élèves rattachés.'}
          </p>
        </div>
        {scopedClassIds.length > 0 && (
          <Link href="/seances/nouvelle" className="btn-primary flex items-center gap-2" style={{ flexShrink: 0 }}>
            <Plus size={16} /> Nouvelle séance
          </Link>
        )}
      </div>

      {seances.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={48} />}
          title="Aucune séance"
          description={
            scopedClassIds.length > 0
              ? 'Créez votre première séance : déposez votre cours, le contenu est généré dessus.'
              : 'Aucune classe ne vous est affectée : la création de séance est réservée aux enseignants d’une classe.'
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {seances.map((s) => {
            const etat = ETATS[s.status] ?? ETATS.scheduled;
            const quand = s.startedAt ?? s.scheduledAt ?? s.createdAt ?? 0;
            return (
              <Link
                key={s.id}
                href={`/seances/${s.id}`}
                className="glass-card flex items-center justify-between gap-3 p-4"
                style={{ textDecoration: 'none' }}
              >
                <div className="flex flex-col gap-1" style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {s.title || 'Séance sans titre'}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {nomsClasses.get(s.classId) ?? s.classId} · {s.durationMinutes} min
                    {s.hasGeneratedContent ? ' · contenu généré depuis un cours' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
                  <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                    {quand ? new Date(quand).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : ''}
                  </span>
                  <span className={etat.classe}>{etat.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
