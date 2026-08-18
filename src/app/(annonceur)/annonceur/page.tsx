'use client';

/**
 * Espace Annonceur — liste des mises en visibilité (écran 2 des maquettes).
 *
 * Quatre tuiles de synthèse calculées sur les BUCKETS QUOTIDIENS (seule source
 * capable de dire « ces 30 derniers jours »), puis le tableau : une ligne par
 * carte diffusée et une par habillage d'édition. Chaque ligne ouvre son tableau
 * de bord d'impact.
 *
 * PÉRIODE : le modèle actuel n'a pas de dates de diffusion (elles arrivent avec
 * les campagnes, lot 4) — la colonne affiche « En continu », qui est la vérité
 * d'aujourd'hui, plutôt que des dates inventées.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Eye, LayoutGrid, MousePointerClick, Plus, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getEditions, getEditionsByIds } from '@/lib/firestore-service';
import {
  chargerEspaceAnnonceur,
  fcfa,
  type EspaceAnnonceur,
  type MiseEnVisibilite,
  type StatutVisibilite,
} from '@/lib/annonceur-service';
import { getMesCampagnes } from '@/lib/campaign-service';
import type { Campaign, CampaignStatus } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

const STATUTS: Record<StatutVisibilite, { libelle: string; fond: string; texte: string }> = {
  active: { libelle: 'Active', fond: 'rgba(46, 160, 67, 0.12)', texte: '#2EA043' },
  en_pause: { libelle: 'En pause', fond: 'rgba(15, 28, 46, 0.08)', texte: '#5A6A7E' },
  objectif_atteint: { libelle: 'Objectif atteint', fond: 'rgba(245, 166, 35, 0.15)', texte: '#B87A0C' },
};

export default function AnnonceurListePage() {
  const { loading: authLoading, isSuperAdmin, scopedEditionIds } = useAuth();
  const [espace, setEspace] = useState<EspaceAnnonceur | null>(null);
  const [campagnes, setCampagnes] = useState<Campaign[]>([]);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    let annule = false;
    (async () => {
      try {
        const editions = isSuperAdmin
          ? await getEditions()
          : await getEditionsByIds(scopedEditionIds);
        const [data, mesCampagnes] = await Promise.all([
          chargerEspaceAnnonceur(editions),
          getMesCampagnes().catch(() => [] as Campaign[]),
        ]);
        if (annule) return;
        setEspace(data);
        setCampagnes(mesCampagnes);
      } catch (error) {
        console.error('Chargement espace annonceur :', error);
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [authLoading, isSuperAdmin, scopedEditionIds]);

  const lignes = useMemo(
    () =>
      // Cartes d'abord (c'est ce qui se facture), habillages ensuite, puis par vues.
      (espace?.visibilites ?? []).slice().sort((a, b) => {
        if (a.format !== b.format) return a.format === 'carte' ? -1 : 1;
        return b.vues - a.vues;
      }),
    [espace]
  );

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  const s = espace?.synthese;

  return (
    <div style={{ maxWidth: 1180 }}>
      {/* ===== En-tête ===== */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>Mises en visibilité</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 460 }}>
            Vos opportunités diffusées dans les parties de Startup Ludo, sous forme de cartes de
            jeu co-brandées.
          </p>
        </div>
        <Link
          href="/annonceur/nouvelle"
          className="flex items-center gap-2"
          style={{
            background: ORANGE,
            color: NAVY,
            fontWeight: 700,
            fontSize: 13,
            padding: '10px 16px',
            borderRadius: 10,
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <Plus size={15} /> Nouvelle mise en visibilité
        </Link>
      </div>

      {/* ===== Tuiles de synthèse ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Tuile
          Icon={LayoutGrid}
          libelle="Mises en visibilité actives"
          valeur={`${s?.actives ?? 0}`}
          detail={`/ ${s?.total ?? 0} au total`}
        />
        <Tuile
          Icon={Eye}
          libelle="Vues livrées (30 jours)"
          valeur={(s?.vues30j ?? 0).toLocaleString('fr-FR')}
          detail={
            s?.tendancePct != null
              ? `${s.tendancePct >= 0 ? '+' : ''}${s.tendancePct} % vs 30 jours précédents`
              : 'pas encore de base de comparaison'
          }
        />
        <Tuile
          Icon={MousePointerClick}
          libelle="Clics sur les cartes (30 jours)"
          valeur={(s?.clics30j ?? 0).toLocaleString('fr-FR')}
          detail={s?.ctrMoyenPct != null ? `CTR moyen ${String(s.ctrMoyenPct).replace('.', ',')} %` : '—'}
        />
        <Tuile
          Icon={Wallet}
          libelle="Dépense du mois"
          valeur={fcfa(s?.depenseMoisFcfa ?? 0)}
          detail="facturé à la vue réelle"
          accent
        />
      </div>

      {/* ===== Tableau ===== */}
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 14,
          border: '1px solid var(--color-card-border)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px 12px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>Toutes les mises en visibilité</h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Cliquez sur une ligne pour ouvrir son tableau de bord d’impact.
          </p>
        </div>

        {lignes.length === 0 ? (
          <p style={{ padding: '24px 20px 28px', fontSize: 13, color: 'var(--color-text-muted)' }}>
            Aucune mise en visibilité pour l’instant — créez la première : votre opportunité
            apparaîtra dans les parties sous forme de carte de jeu, et vous ne payez que ce qui est
            réellement vu.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr
                  style={{
                    fontSize: 10.5,
                    letterSpacing: 0.8,
                    color: 'var(--color-text-muted)',
                    textAlign: 'left',
                  }}
                >
                  <th style={{ padding: '8px 20px', fontWeight: 600 }}>MISE EN VISIBILITÉ</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>FORMAT</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>STATUT</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>PÉRIODE</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>VUES / OBJECTIF</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>CLICS</th>
                  <th style={{ padding: '8px 20px', fontWeight: 600, textAlign: 'right' }}>
                    DÉPENSE ENGAGÉE
                  </th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((v) => (
                  <LigneVisibilite key={v.id} v={v} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== Campagnes du nouveau modèle (wizard 5 étapes) ===== */}
      {campagnes.length > 0 && (
        <div
          style={{
            background: '#FFFFFF',
            borderRadius: 14,
            border: '1px solid var(--color-card-border)',
            marginTop: 18,
            padding: '16px 20px',
          }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 2 }}>
            Vos campagnes en préparation
          </h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            Brouillons et soumissions du wizard — elles rejoignent la diffusion après validation
            CONCREE (48 h ouvrées).
          </p>
          <div className="flex flex-col gap-2">
            {campagnes.map((c) => (
              <LigneCampagne key={c.id} c={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const STATUTS_CAMPAGNE: Record<CampaignStatus, { libelle: string; fond: string; texte: string }> = {
  draft: { libelle: 'Brouillon', fond: 'rgba(15,28,46,0.06)', texte: '#5A6A7E' },
  in_review: { libelle: 'En modération', fond: 'rgba(245,166,35,0.15)', texte: '#B87A0C' },
  active: { libelle: 'Active', fond: 'rgba(46,160,67,0.12)', texte: '#2EA043' },
  paused: { libelle: 'En pause', fond: 'rgba(15,28,46,0.08)', texte: '#5A6A7E' },
  rejected: { libelle: 'Refusée', fond: 'rgba(220,60,60,0.10)', texte: '#C0392B' },
  ended: { libelle: 'Terminée', fond: 'rgba(15,28,46,0.06)', texte: '#5A6A7E' },
};

function LigneCampagne({ c }: { c: Campaign }) {
  const statut = STATUTS_CAMPAGNE[c.status];
  const titre =
    c.format === 'edition'
      ? `Édition ${c.editionSkin?.editionId || '—'} — ${c.editionSkin?.structure || 'habillage'}`
      : c.card?.rectoText?.trim() || 'Carte sans message';

  return (
    <div
      className="flex items-center justify-between gap-3 flex-wrap"
      style={{
        border: '1px solid var(--color-card-border)',
        borderRadius: 10,
        padding: '10px 14px',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 13, fontWeight: 600, color: NAVY, maxWidth: 480,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {titre}
        </div>
        {c.status === 'rejected' && c.review?.motifRefus && (
          <div style={{ fontSize: 11.5, color: '#C0392B', marginTop: 2 }}>
            Motif : {c.review.motifRefus}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
        <span
          style={{
            fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 10,
            background: statut.fond, color: statut.texte,
          }}
        >
          {statut.libelle}
        </span>
        {c.status === 'draft' && (
          <Link
            href={`/annonceur/nouvelle?id=${encodeURIComponent(c.id)}`}
            style={{
              fontSize: 12, fontWeight: 600, color: NAVY, textDecoration: 'none',
              border: '1px solid var(--color-card-border)', borderRadius: 8, padding: '5px 10px',
            }}
          >
            Reprendre
          </Link>
        )}
      </div>
    </div>
  );
}

function Tuile({
  Icon,
  libelle,
  valeur,
  detail,
  accent,
}: {
  Icon: typeof Eye;
  libelle: string;
  valeur: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? 'rgba(245, 166, 35, 0.10)' : '#FFFFFF',
        border: `1px solid ${accent ? 'rgba(245, 166, 35, 0.35)' : 'var(--color-card-border)'}`,
        borderRadius: 14,
        padding: '14px 16px',
      }}
    >
      <div
        className="flex items-center gap-1.5"
        style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8 }}
      >
        <Icon size={13} /> {libelle}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>{valeur}</div>
      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{detail}</div>
    </div>
  );
}

function LigneVisibilite({ v }: { v: MiseEnVisibilite }) {
  const statut = STATUTS[v.statut];
  const progression =
    v.objectifVues && v.objectifVues > 0 ? Math.min(100, (v.vues / v.objectifVues) * 100) : null;

  return (
    <tr
      style={{ borderTop: '1px solid var(--color-card-border)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(15,28,46,0.025)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <td style={{ padding: '12px 20px' }}>
        <Link
          href={`/annonceur/${encodeURIComponent(v.id)}`}
          style={{ textDecoration: 'none', display: 'block' }}
        >
          <div
            style={{
              fontWeight: 700,
              color: NAVY,
              maxWidth: 340,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {v.titre}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {v.structure}
            {v.format === 'carte'
              ? ` · carte ${v.kind === 'funding' ? 'FINANCEMENT' : 'OPPORTUNITÉ'}`
              : ' · écran sponsor exclusif'}
          </div>
        </Link>
      </td>
      <td style={{ padding: '12px 12px' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 8,
            border: `1px solid ${v.format === 'edition' ? 'rgba(245,166,35,0.5)' : 'var(--color-card-border)'}`,
            color: v.format === 'edition' ? '#B87A0C' : 'var(--color-text-secondary)',
            background: v.format === 'edition' ? 'rgba(245,166,35,0.08)' : 'transparent',
          }}
        >
          {v.format === 'edition' ? 'Édition' : 'Carte'}
        </span>
      </td>
      <td style={{ padding: '12px 12px' }}>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            padding: '3px 10px',
            borderRadius: 10,
            background: statut.fond,
            color: statut.texte,
            whiteSpace: 'nowrap',
          }}
        >
          ● {statut.libelle}
        </span>
      </td>
      <td style={{ padding: '12px 12px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
        En continu
      </td>
      <td style={{ padding: '12px 12px', minWidth: 150 }}>
        {progression != null ? (
          <>
            <div
              style={{
                height: 6,
                borderRadius: 3,
                background: 'var(--color-surface)',
                overflow: 'hidden',
                marginBottom: 4,
              }}
            >
              <div
                style={{
                  width: `${Math.max(2, progression)}%`,
                  height: '100%',
                  borderRadius: 3,
                  background: progression >= 100 ? ORANGE : NAVY,
                }}
              />
            </div>
            <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)' }}>
              <strong style={{ color: NAVY }}>{v.vues.toLocaleString('fr-FR')}</strong>
              {' '}/ {v.objectifVues!.toLocaleString('fr-FR')} vues
            </span>
          </>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            {v.vues.toLocaleString('fr-FR')} vues
          </span>
        )}
      </td>
      <td style={{ padding: '12px 12px', textAlign: 'right', color: NAVY, fontWeight: 600 }}>
        {v.format === 'edition' ? '—' : v.clics.toLocaleString('fr-FR')}
      </td>
      <td style={{ padding: '12px 20px', textAlign: 'right', color: NAVY, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {v.depenseFcfa != null ? fcfa(v.depenseFcfa) : '—'}
      </td>
    </tr>
  );
}
