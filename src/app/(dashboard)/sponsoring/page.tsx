'use client';

/**
 * Espace sponsor — liste des éditions assignées.
 *
 * POURQUOI cet écran : le sponsoring d'une édition (popup au choix de la
 * thématique + cartes injectées en partie) se configurait jusqu'ici dans
 * l'onglet « Général » de l'édition, réservé au super admin. Un sponsor
 * (ADEPME, Mastercard Foundation…) doit pouvoir gérer LUI-MÊME sa présence
 * sans accéder au reste du back-office : ce dossier `/sponsoring` est son
 * périmètre complet.
 *
 * Périmètre : `scopedEditionIds` (liste d'éditions assignées au compte, sur le
 * modèle de `programIds` des admins de programme). Les éditions sont lues une
 * par une (`getEditionsByIds`) et non via un listing de la collection, qu'un
 * sponsor n'a pas à pouvoir faire. Le super admin, lui, voit tout : c'est
 * pratique pour vérifier le rendu avant de donner l'accès au partenaire.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Handshake, Coins, Star, ChevronRight, ImageOff } from 'lucide-react';
import { getEditions, getEditionsByIds } from '@/lib/firestore-service';
import type { EditionData } from '@/types';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import toast from 'react-hot-toast';

export default function SponsoringListPage() {
  const { isSuperAdmin, isSponsor, scopedEditionIds, loading: authLoading } = useAuth();
  const [editions, setEditions] = useState<EditionData[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Super admin : accès à toutes les éditions (test / support).
      // Sponsor : strictement les éditions de son périmètre.
      const data = isSuperAdmin ? await getEditions() : await getEditionsByIds(scopedEditionIds);
      setEditions(data.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)));
    } catch (error) {
      console.error('Failed to load sponsoring editions:', error);
      toast.error('Erreur lors du chargement des éditions');
    } finally {
      setLoading(false);
    }
  }, [isSuperAdmin, scopedEditionIds]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  if (authLoading || loading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  }

  const sponsoredCount = editions.filter((e) => e.sponsor?.enabled).length;

  return (
    <div>
      {/* En-tête */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Mes éditions sponsorisées
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 640 }}>
            Chaque édition est une thématique du jeu Startup&nbsp;Ludo. En la sponsorisant, votre
            marque apparaît au choix de la thématique et vos opportunités sont proposées aux
            joueurs pendant la partie.
          </p>
        </div>
        {editions.length > 0 && (
          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
            <span className="badge badge-success">{sponsoredCount} active{sponsoredCount !== 1 ? 's' : ''}</span>
            <span className="badge badge-info">{editions.length} au total</span>
          </div>
        )}
      </div>

      {editions.length === 0 ? (
        <EmptyState
          icon={<Handshake size={48} />}
          title="Aucune édition assignée"
          description={
            isSponsor
              ? 'Aucune édition ne vous est encore assignée — contactez l’équipe CONCREE.'
              : 'Aucune édition n’existe pour l’instant. Créez-en une depuis Contenu du jeu → Éditions.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {editions.map((edition) => (
            <EditionCard key={edition.id} edition={edition} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Carte d'une édition : visuel, statut de sponsoring et volume de cartes configurées. */
function EditionCard({ edition }: { edition: EditionData }) {
  const sponsor = edition.sponsor;
  const enabled = sponsor?.enabled === true;
  // Une carte sans texte n'est jamais tirée côté jeu : on ne compte que celles qui comptent.
  const opportunities = (sponsor?.opportunities ?? []).filter((c) => c.text.trim()).length;
  const fundings = (sponsor?.fundings ?? []).filter((c) => c.text.trim()).length;

  return (
    <Link href={`/sponsoring/${edition.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        className="glass-card"
        style={{ overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', transition: 'box-shadow 0.2s' }}
      >
        {/* Bandeau visuel : image du popup si renseignée, sinon la couleur de l'édition */}
        <div
          style={{
            height: 110,
            position: 'relative',
            background: sponsor?.imageUrl
              ? undefined
              : `linear-gradient(135deg, ${edition.color || '#FFBC40'}33, ${edition.color || '#FFBC40'}14)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {sponsor?.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sponsor.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div className="flex flex-col items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
              <ImageOff size={20} />
              <span style={{ fontSize: 11 }}>Aucun visuel</span>
            </div>
          )}
          <span
            className="badge"
            style={{
              position: 'absolute', top: 10, right: 10,
              background: enabled ? '#FFFFFF' : 'rgba(12,36,62,0.72)',
              color: enabled ? '#0E699C' : '#FFFFFF',
              boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
            }}
          >
            {enabled ? '✓ Sponsorisé' : 'Inactif'}
          </span>
        </div>

        {/* Corps */}
        <div className="p-4 flex flex-col gap-3" style={{ flex: 1 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              {edition.name || edition.id}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {sponsor?.name?.trim() || 'Nom du sponsor à renseigner'}
            </p>
          </div>

          <div className="flex items-center gap-4" style={{ marginTop: 'auto' }}>
            <CardCount icon={<Star size={13} />} color="var(--color-event-opportunity)" count={opportunities} label="opportunité" />
            <CardCount icon={<Coins size={13} />} color="var(--color-event-funding)" count={fundings} label="financement" />
            <ChevronRight size={16} color="var(--color-text-muted)" style={{ marginLeft: 'auto' }} />
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Compteur « N opportunités » / « N financements » avec pastille colorée. */
function CardCount({ icon, color, count, label }: { icon: React.ReactNode; color: string; count: number; label: string }) {
  return (
    <span className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
      <span style={{ color, display: 'flex' }}>{icon}</span>
      <strong style={{ color: 'var(--color-text-primary)' }}>{count}</strong>
      {label}{count !== 1 ? 's' : ''}
    </span>
  );
}
