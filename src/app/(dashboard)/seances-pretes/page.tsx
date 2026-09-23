'use client';

/**
 * Séances prêtes à l'emploi — LISTE.
 *
 * Premier jet : les six séances étaient éditables en ligne sur une seule page,
 * tous leurs champs ouverts en même temps. Rien ne hiérarchisait, et surtout
 * le contenu généré restait INVISIBLE — on cliquait « Générer » puis on devait
 * croire sur parole que le résultat tenait la route.
 *
 * Cette page ne fait donc plus qu'une chose : montrer l'état du catalogue et
 * mener au bon endroit. La préparation d'une séance vit sur SA page.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

import { useAuth } from '@/lib/auth-context';
import { getEditions } from '@/lib/firestore-service';
import {
  getReadySessions,
  resumeContenu,
  saveReadySession,
  type ReadySession,
} from '@/lib/ready-session-service';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { EditionData } from '@/types';

export default function SeancesPretesPage() {
  const router = useRouter();
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const [seances, setSeances] = useState<ReadySession[]>([]);
  const [editions, setEditions] = useState<EditionData[]>([]);
  const [chargement, setChargement] = useState(true);

  const charger = useCallback(async () => {
    try {
      const [liste, eds] = await Promise.all([getReadySessions(), getEditions()]);
      setSeances(liste);
      setEditions(eds);
    } catch (error) {
      console.error('Séances prêtes :', error);
      toast.error('Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !isSuperAdmin) return;
    void charger();
  }, [authLoading, isSuperAdmin, charger]);

  /** Crée la séance PUIS ouvre sa page : la préparation se fait là-bas. */
  const ajouter = async () => {
    const id = `rs_${Date.now().toString(36)}`;
    await saveReadySession(id, {
      titre: 'Nouvelle séance',
      duree: 30,
      difficulte: 'Débutant',
      editionId: editions[0]?.id ?? '',
      note: '',
      consignes: '',
      ordre: seances.length,
      active: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    router.push(`/seances-pretes/${id}`);
  };

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Réservé à l’équipe CONCREE.</p>;
  }

  const publiees = seances.filter((s) => s.active && !!s.contenu).length;

  return (
    <div>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Séances prêtes à l’emploi
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 3, maxWidth: 640 }}>
            Proposées à l’enseignant au moment de lancer une session.{' '}
            <strong style={{ color: 'var(--color-text-primary)' }}>
              {publiees} visible{publiees > 1 ? 's' : ''}
            </strong>{' '}
            sur {seances.length} — une séance sans contenu n’est jamais proposée.
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => void ajouter()}>
          <Plus size={16} /> Nouvelle séance
        </button>
      </div>

      {seances.length === 0 ? (
        <p
          style={{
            fontSize: 13, color: 'var(--color-text-muted)',
            background: 'var(--color-surface)', borderRadius: 12, padding: '18px 20px',
          }}
        >
          Aucune séance prête. Créez-en une, réglez sa composition, puis générez son contenu.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {seances.map((s) => {
            const edition = editions.find((e) => e.id === s.editionId);
            return (
              <Link
                key={s.id}
                href={`/seances-pretes/${s.id}`}
                className="glass-card flex items-center justify-between gap-4"
                style={{ padding: '14px 18px', textDecoration: 'none' }}
              >
                <div style={{ minWidth: 0 }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {s.titre}
                    </span>
                    {/* L'état se lit d'un coup d'œil : c'est la seule chose
                        qu'on vient vérifier sur une liste. */}
                    <span
                      style={{
                        fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 7,
                        background: s.active ? 'rgba(46,160,67,0.12)' : 'rgba(15,28,46,0.06)',
                        color: s.active ? '#2EA043' : 'var(--color-text-muted)',
                      }}
                    >
                      {s.active ? 'Visible' : 'Masquée'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 3 }}>
                    {edition?.name || s.editionId || 'édition non choisie'} · {s.difficulte} ·{' '}
                    {s.duree} min ·{' '}
                    <span style={{ color: s.contenu ? 'inherit' : '#B87A0C' }}>
                      {resumeContenu(s.contenu)}
                    </span>
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
