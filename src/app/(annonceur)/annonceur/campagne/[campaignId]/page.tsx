'use client';

/**
 * Rapport d'UNE campagne — l'écran qui manquait.
 *
 * Les lignes « Carte » du tableau de bord n'étaient pas cliquables (`href:
 * null`) alors que les lignes « Édition » l'étaient : l'annonceur voyait ses
 * campagnes sans jamais pouvoir les ouvrir. C'était cohérent tant qu'aucune
 * destination n'existait — l'écran de détail historique est bâti sur les
 * `MiseEnVisibilite` de l'ancien modèle, qu'une campagne ne produit pas.
 *
 * POURQUOI EN LECTURE SEULE, et non le wizard : les règles Firestore
 * n'autorisent l'écriture que sur une campagne `draft` ou `in_review`. Ouvrir
 * une campagne ACTIVE dans le wizard, dont la sauvegarde est automatique,
 * aurait produit des erreurs d'écriture en boucle sur un écran censé
 * simplement rendre compte. La modification passe par la modération.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getCampagne } from '@/lib/campaign-service';
import { getSponsorDailyMetrics, jourLocal } from '@/lib/sponsor-metrics-service';
import { fcfa } from '@/lib/annonceur-service';
import { finExclusivite, joursRestants } from '@/lib/reservations';
import ApercuCarteCampagne from '@/components/annonceur/ApercuCarteCampagne';
import CourbeQuotidienne, { type PointJour } from '@/components/annonceur/CourbeQuotidienne';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { Campaign } from '@/types';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

/** Libellés d'état, alignés sur ceux de la liste des campagnes. */
const STATUTS: Record<string, { libelle: string; fond: string; texte: string }> = {
  draft: { libelle: 'Brouillon', fond: 'rgba(15,28,46,0.06)', texte: '#5A6A7E' },
  in_review: { libelle: 'En modération', fond: 'rgba(245,166,35,0.15)', texte: '#B87A0C' },
  active: { libelle: 'Active', fond: 'rgba(46,160,67,0.12)', texte: '#2EA043' },
  paused: { libelle: 'En pause', fond: 'rgba(15,28,46,0.08)', texte: '#5A6A7E' },
  suspended: { libelle: 'Suspendue', fond: 'rgba(220,60,60,0.10)', texte: '#C0392B' },
  rejected: { libelle: 'Refusée', fond: 'rgba(220,60,60,0.10)', texte: '#C0392B' },
  ended: { libelle: 'Terminée', fond: 'rgba(15,28,46,0.06)', texte: '#5A6A7E' },
};

export default function RapportCampagnePage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { admin, loading: authLoading } = useAuth();
  const [campagne, setCampagne] = useState<Campaign | null>(null);
  const [serie, setSerie] = useState<PointJour[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (authLoading || !admin) return;
    let annule = false;
    (async () => {
      try {
        const c = await getCampagne(campaignId);
        if (annule) return;
        setCampagne(c);
        if (c) {
          // Les métriques d'une campagne sont indexées par SON id — même
          // mécanique que pour une édition, clé différente.
          const jours = await getSponsorDailyMetrics(c.id, 30);
          if (!annule) {
            // Même distinction qu'au tableau de bord : un habillage d'édition
            // se mesure en `editionPopupViews`, une carte en `views`.
            setSerie(
              jours.map((j) => ({
                date: j.date,
                vues: c.format === 'edition' ? j.totals.editionPopupViews : j.totals.views,
                clics: j.totals.clicks,
              }))
            );
          }
        }
      } catch (error) {
        console.error('Chargement de la campagne :', error);
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [authLoading, admin, campaignId]);

  const totaux = useMemo(() => {
    const vues = serie.reduce((s, j) => s + j.vues, 0);
    const clics = serie.reduce((s, j) => s + j.clics, 0);
    const perView = campagne?.pricing?.perView ?? 0;
    const perClick = campagne?.pricing?.perClick ?? 0;
    return { vues, clics, depense: vues * perView + clics * perClick };
  }, [serie, campagne]);

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  // Une campagne d'un autre compte n'est pas lisible (règles Firestore) :
  // `getCampagne` rend `null`, et l'écran le dit sans prétendre à une panne.
  if (!campagne) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: NAVY, fontWeight: 600 }}>Campagne introuvable.</p>
        <Link href="/annonceur/tableau-de-bord" style={{ fontSize: 13, color: '#B87A0C' }}>
          Retour au tableau de bord
        </Link>
      </div>
    );
  }

  const statut = STATUTS[campagne.status] ?? STATUTS.draft;
  const fin = campagne.period?.endAt ?? finExclusivite(campagne.reservationMonths);
  const jours = joursRestants(fin);
  const titre =
    campagne.card?.rectoText?.trim() ||
    `Édition ${campagne.editionSkin?.editionId ?? ''} — habillage`;

  return (
    <div>
      <Link
        href="/annonceur/tableau-de-bord"
        className="flex items-center gap-1.5"
        style={{ fontSize: 12.5, color: 'var(--color-text-muted)', textDecoration: 'none' }}
      >
        <ArrowLeft size={14} /> Tableau de bord
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap" style={{ marginTop: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: NAVY, maxWidth: 620 }}>{titre}</h1>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 3 }}>
            {campagne.card?.structure || campagne.editionSkin?.structure || '—'} ·{' '}
            {campagne.pricing.perView} F/vue
            {campagne.pricing.perClick > 0 ? ` · ${campagne.pricing.perClick} F/clic` : ''}
            {jours !== null && jours > 0 ? ` · encore ${jours} jour${jours > 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <span
          style={{
            fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 10,
            background: statut.fond, color: statut.texte, flexShrink: 0,
          }}
        >
          {statut.libelle}
        </span>
      </div>

      {campagne.status === 'suspended' && campagne.suspension && (
        <p style={{ fontSize: 12.5, color: '#C0392B', marginTop: 8 }}>
          {campagne.suspension.motif === 'plafond-atteint'
            ? `Plafond de ${campagne.budgetCapFcfa.toLocaleString('fr-FR')} FCFA atteint — relevez-le pour reprendre la diffusion.`
            : 'Solde insuffisant — rechargez votre compte pour reprendre la diffusion.'}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={{ marginTop: 18 }}>
        <Tuile libelle="Vues (30 j)" valeur={totaux.vues.toLocaleString('fr-FR')} />
        <Tuile libelle="Clics (30 j)" valeur={totaux.clics.toLocaleString('fr-FR')} />
        <Tuile
          libelle="CTR"
          valeur={totaux.vues > 0 ? `${((totaux.clics / totaux.vues) * 100).toFixed(1)} %` : '—'}
        />
        <Tuile libelle="Dépense (30 j)" valeur={fcfa(totaux.depense)} accent />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ marginTop: 18 }}>
        <div className="lg:col-span-2">
          <Carte titre="Vues et clics par jour" sous="30 derniers jours">
            {serie.length > 0 ? (
              <CourbeQuotidienne serie={serie} />
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                Aucune diffusion mesurée sur la période.
              </p>
            )}
          </Carte>
        </div>
        {campagne.card && (
          <Carte titre="Votre carte" sous="Cliquez pour voir le verso">
            <ApercuCarteCampagne card={campagne.card} />
          </Carte>
        )}
      </div>
    </div>
  );
}

function Tuile({ libelle, valeur, accent }: { libelle: string; valeur: string; accent?: boolean }) {
  return (
    <div
      style={{
        background: '#FFFFFF', border: '1px solid var(--color-card-border)',
        borderRadius: 12, padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 10.5, letterSpacing: 0.6, color: 'var(--color-text-muted)', fontWeight: 600 }}>
        {libelle.toUpperCase()}
      </div>
      <div style={{ fontSize: 21, fontWeight: 800, color: accent ? ORANGE : NAVY, marginTop: 4 }}>
        {valeur}
      </div>
    </div>
  );
}

function Carte({ titre, sous, children }: { titre: string; sous?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: '#FFFFFF', border: '1px solid var(--color-card-border)',
        borderRadius: 14, padding: '16px 18px', height: '100%',
      }}
    >
      <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: sous ? 2 : 10 }}>{titre}</h2>
      {sous && <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 10 }}>{sous}</p>}
      {children}
    </div>
  );
}
