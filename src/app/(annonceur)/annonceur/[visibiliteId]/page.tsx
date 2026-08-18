'use client';

/**
 * Espace Annonceur — tableau de bord d'impact d'UNE mise en visibilité
 * (écran 1 des maquettes).
 *
 * HONNÊTETÉ DES ÉCHELLES — le point délicat de cet écran : certaines mesures
 * existent PAR CARTE (vues, clics, sauvegardes, flips), d'autres seulement À
 * L'ÉCHELLE DE L'ÉDITION (personnes uniques, ventilation secteur/région, reste
 * du plafond — l'objectif de vues est partagé par toutes les cartes d'une
 * édition). Chaque indicateur d'échelle édition porte la mention « échelle
 * édition » : un chargé de programme qui cite le chiffre doit savoir ce qu'il
 * compte. Le passage au modèle campagnes (lot 4) alignera tout par campagne.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Download, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth-context';
import { getEditions, getEditionsByIds } from '@/lib/firestore-service';
import {
  chargerEspaceAnnonceur,
  fcfa,
  parseIdVisibilite,
  type EspaceAnnonceur,
  type MiseEnVisibilite,
} from '@/lib/annonceur-service';
import { PRIX_PAR_VUE_FCFA } from '@/lib/sponsor-pricing';
import { genererRapportImpactPdf, telechargerRapport, type LigneRapport } from '@/lib/annonceur-rapport-pdf';
import CourbeQuotidienne, { type PointJour } from '@/components/annonceur/CourbeQuotidienne';
import RepartitionAttribution from '@/components/annonceur/RepartitionAttribution';
import FunnelImpact, { type EtapeFunnel } from '@/components/annonceur/FunnelImpact';
import SponsorCardPreview from '@/components/sponsor/SponsorCardPreview';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

const STATUTS = {
  active: { libelle: 'Active', fond: 'rgba(46, 160, 67, 0.12)', texte: '#2EA043' },
  en_pause: { libelle: 'En pause', fond: 'rgba(15, 28, 46, 0.08)', texte: '#5A6A7E' },
  objectif_atteint: { libelle: 'Objectif atteint', fond: 'rgba(245, 166, 35, 0.15)', texte: '#B87A0C' },
} as const;

/** Durée « 21 min » depuis des secondes cumulées et un nombre de parties. */
function dureeMoyenne(playSeconds: number, gamesPlayed: number): string {
  if (gamesPlayed <= 0 || playSeconds <= 0) return '—';
  return `${Math.round(playSeconds / gamesPlayed / 60)} min`;
}

export default function TableauDeBordImpactPage() {
  const params = useParams();
  const router = useRouter();
  const visibiliteId = decodeURIComponent(String(params?.visibiliteId ?? ''));
  const { loading: authLoading, isSuperAdmin, scopedEditionIds } = useAuth();

  const [espace, setEspace] = useState<EspaceAnnonceur | null>(null);
  const [chargement, setChargement] = useState(true);
  const [exportEnCours, setExportEnCours] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    let annule = false;
    (async () => {
      try {
        const editions = isSuperAdmin
          ? await getEditions()
          : await getEditionsByIds(scopedEditionIds);
        const data = await chargerEspaceAnnonceur(editions);
        if (!annule) setEspace(data);
      } catch (error) {
        console.error('Chargement du tableau de bord :', error);
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [authLoading, isSuperAdmin, scopedEditionIds]);

  const v: MiseEnVisibilite | null = useMemo(
    () => espace?.visibilites.find((x) => x.id === visibiliteId) ?? null,
    [espace, visibiliteId]
  );

  const cible = useMemo(() => parseIdVisibilite(visibiliteId), [visibiliteId]);
  const metriquesEdition = v ? espace?.metriques[v.editionId] ?? null : null;
  const serieEdition = v ? espace?.quotidien[v.editionId] ?? [] : [];

  /** Série 14 jours de LA mise en visibilité (carte : ses compteurs à elle). */
  const serie14: PointJour[] = useMemo(() => {
    const serie = serieEdition.slice(-14);
    if (!cible) return [];
    if (cible.type === 'edition') {
      return serie.map((j) => ({ date: j.date, vues: j.totals.editionPopupViews, clics: 0 }));
    }
    return serie.map((j) => ({
      date: j.date,
      vues: j.cards[cible.cardId]?.views ?? 0,
      clics: j.cards[cible.cardId]?.clicks ?? 0,
    }));
  }, [serieEdition, cible]);

  const exporterPdf = useCallback(async () => {
    if (!v) return;
    setExportEnCours(true);
    try {
      const octets = await genererRapportImpactPdf({
        visibilite: v,
        indicateurs: construireIndicateurs(v, metriquesEdition),
        funnel: construireFunnel(v, metriquesEdition).map(({ libelle, valeur }) => ({ libelle, valeur })),
        serie14j: serie14,
      });
      telechargerRapport(octets, `rapport-impact-${v.editionId}-${Date.now()}.pdf`);
    } catch (error) {
      console.error('Export du rapport :', error);
      toast.error('Export impossible — réessayez.');
    } finally {
      setExportEnCours(false);
    }
  }, [v, metriquesEdition, serie14]);

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  if (!v) {
    return (
      <div style={{ maxWidth: 600 }}>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          Cette mise en visibilité n’existe plus, ou elle ne relève pas de votre compte.
        </p>
        <button className="btn-secondary" style={{ marginTop: 12 }} onClick={() => router.push('/annonceur')}>
          Retour à la liste
        </button>
      </div>
    );
  }

  const statut = STATUTS[v.statut];
  const kpis = construireIndicateurs(v, metriquesEdition);

  return (
    <div style={{ maxWidth: 1180 }}>
      <Link
        href="/annonceur"
        className="flex items-center gap-2"
        style={{ fontSize: 12.5, color: 'var(--color-text-muted)', textDecoration: 'none', marginBottom: 14 }}
      >
        <ArrowLeft size={14} /> Mises en visibilité
      </Link>

      {/* ===== En-tête ===== */}
      <div
        className="flex items-start justify-between gap-4 flex-wrap"
        style={{
          background: '#FFFFFF',
          border: '1px solid var(--color-card-border)',
          borderRadius: 14,
          padding: '18px 20px',
          marginBottom: 18,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 6 }}>{v.titre}</h1>
          <div className="flex items-center gap-3 flex-wrap" style={{ fontSize: 12.5 }}>
            <span
              style={{
                fontWeight: 700,
                padding: '3px 10px',
                borderRadius: 10,
                background: statut.fond,
                color: statut.texte,
              }}
            >
              ● {statut.libelle}
            </span>
            <span style={{ color: 'var(--color-text-secondary)' }}>{v.structure}</span>
            <span style={{ color: 'var(--color-text-muted)' }}>·</span>
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {v.format === 'edition'
                ? `Écran sponsor — édition ${v.editionName}`
                : `Carte ${v.kind === 'funding' ? 'FINANCEMENT' : 'OPPORTUNITÉ'} — édition ${v.editionName}`}
            </span>
            <span style={{ color: 'var(--color-text-muted)' }}>·</span>
            <span style={{ color: 'var(--color-text-secondary)' }}>diffusion en continu</span>
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
          <Link
            href={`/sponsoring/${v.editionId}`}
            className="flex items-center gap-2"
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              padding: '9px 14px',
              borderRadius: 10,
              border: '1px solid var(--color-card-border)',
              color: NAVY,
              textDecoration: 'none',
              background: '#FFFFFF',
            }}
          >
            <Pencil size={13} /> Modifier
          </Link>
          <button
            type="button"
            onClick={() => void exporterPdf()}
            disabled={exportEnCours}
            className="flex items-center gap-2"
            style={{
              fontSize: 12.5,
              fontWeight: 700,
              padding: '9px 14px',
              borderRadius: 10,
              border: 'none',
              background: ORANGE,
              color: NAVY,
              cursor: 'pointer',
              opacity: exportEnCours ? 0.6 : 1,
            }}
          >
            <Download size={13} /> {exportEnCours ? 'Export…' : 'Exporter le rapport (PDF)'}
          </button>
        </div>
      </div>

      {/* ===== KPI ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {kpis.map((kpi) => (
          <div
            key={kpi.libelle}
            style={{
              background: kpi.accent ? 'rgba(245, 166, 35, 0.10)' : '#FFFFFF',
              border: `1px solid ${kpi.accent ? 'rgba(245,166,35,0.35)' : 'var(--color-card-border)'}`,
              borderRadius: 14,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>
              {kpi.libelle}
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, color: NAVY }}>{kpi.valeur}</div>
            {kpi.detail && (
              <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 3 }}>
                {kpi.detail}
              </div>
            )}
            {kpi.jaugePct != null && (
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: 'var(--color-surface)',
                  overflow: 'hidden',
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    width: `${Math.min(100, Math.max(2, kpi.jaugePct))}%`,
                    height: '100%',
                    background: kpi.accent ? ORANGE : NAVY,
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ===== Courbe + répartition ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-5">
        <div
          className="lg:col-span-3"
          style={{
            background: '#FFFFFF',
            border: '1px solid var(--color-card-border)',
            borderRadius: 14,
            padding: '16px 18px',
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 2 }}>
            Vues et clics par jour
          </h3>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 12 }}>
            14 derniers jours
          </p>
          <CourbeQuotidienne serie={serie14} />
        </div>
        <div
          className="lg:col-span-2"
          style={{
            background: '#FFFFFF',
            border: '1px solid var(--color-card-border)',
            borderRadius: 14,
            padding: '16px 18px',
          }}
        >
          <RepartitionAttribution
            bySector={metriquesEdition?.bySector ?? {}}
            byRegion={metriquesEdition?.byRegion ?? {}}
          />
          <p style={{ fontSize: 10.5, color: 'var(--color-text-muted)', marginTop: 10 }}>
            Échelle édition : toutes vos cartes de « {v.editionName} » confondues.
          </p>
        </div>
      </div>

      {/* ===== Funnel + aperçu ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div
          className="lg:col-span-3"
          style={{
            background: '#FFFFFF',
            border: '1px solid var(--color-card-border)',
            borderRadius: 14,
            padding: '16px 18px',
          }}
        >
          <h3 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 12 }}>
            {v.format === 'edition' ? 'De l’affichage à la partie' : 'Parcours du joueur'}
          </h3>
          <FunnelImpact etapes={construireFunnel(v, metriquesEdition)} />
        </div>
        {v.format === 'carte' && v.card && (
          <div
            className="lg:col-span-2"
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--color-card-border)',
              borderRadius: 14,
              padding: '16px 18px',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 12 }}>
              La carte diffusée
            </h3>
            <SponsorCardPreview
              card={v.card}
              kind={v.kind === 'funding' ? 'funding' : 'opportunity'}
              defaultTokens={v.kind === 'funding' ? 4 : 2}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUCTION DES INDICATEURS
// ═══════════════════════════════════════════════════════════════════════════

type Kpi = LigneRapport & { jaugePct?: number | null; accent?: boolean };

function construireIndicateurs(
  v: MiseEnVisibilite,
  m: { totals: { views: number; uniqueViews: number; editionPopupViews: number; gamesPlayed: number; playSeconds: number } } | null
): Kpi[] {
  const uniques = m?.totals.uniqueViews ?? 0;
  const vuesEdition = m?.totals.views ?? 0;
  const prix = v.pricePerView ?? PRIX_PAR_VUE_FCFA;

  if (v.format === 'edition') {
    const popup = v.vues;
    const parties = m?.totals.gamesPlayed ?? 0;
    return [
      {
        libelle: 'Vues de l’écran sponsor',
        valeur: popup.toLocaleString('fr-FR'),
        detail: 'affiché au choix de l’édition',
      },
      {
        libelle: 'Personnes uniques touchées (échelle édition)',
        valeur: uniques.toLocaleString('fr-FR'),
        detail: 'joueurs différents',
      },
      {
        libelle: 'Parties jouées dans l’édition',
        valeur: parties.toLocaleString('fr-FR'),
        detail:
          popup > 0 ? `${((parties / popup) * 100).toFixed(1).replace('.', ',')} % des affichages` : '—',
      },
      {
        libelle: 'Durée moyenne de jeu',
        valeur: dureeMoyenne(m?.totals.playSeconds ?? 0, parties),
        detail: 'exposition prolongée de la marque',
        accent: true,
      },
    ];
  }

  const tauxCuriosite = v.vues > 0 ? (v.flips / v.vues) * 100 : null;
  const ctr = v.vues > 0 ? (v.clics / v.vues) * 100 : null;
  const depense = v.depenseFcfa ?? 0;
  const budgetCap =
    v.objectifVues && v.objectifVues > 0 ? v.objectifVues * prix : null;
  const depenseEdition = vuesEdition * prix;
  const restePlafond = budgetCap != null ? Math.max(0, budgetCap - depenseEdition) : null;

  return [
    {
      libelle: 'Vues totales',
      valeur: v.vues.toLocaleString('fr-FR'),
      detail:
        v.objectifVues && v.objectifVues > 0
          ? `objectif ${v.objectifVues.toLocaleString('fr-FR')} (échelle édition)`
          : 'pas d’objectif défini',
      jaugePct:
        v.objectifVues && v.objectifVues > 0 ? (vuesEdition / v.objectifVues) * 100 : null,
    },
    {
      libelle: 'Personnes uniques touchées (échelle édition)',
      valeur: uniques.toLocaleString('fr-FR'),
      detail:
        uniques > 0
          ? `${(vuesEdition / uniques).toFixed(2).replace('.', ',')} vue par joueur en moyenne`
          : 'en attente de la mise à jour de l’app',
    },
    {
      libelle: 'Flips de la carte',
      valeur: v.flips.toLocaleString('fr-FR'),
      detail:
        tauxCuriosite != null && v.flips > 0
          ? `taux de curiosité ${tauxCuriosite.toFixed(1).replace('.', ',')} %`
          : 'mesuré à l’arrivée de la carte recto/verso',
    },
    {
      libelle: 'Clics sur le CTA',
      valeur: v.clics.toLocaleString('fr-FR'),
      detail: ctr != null ? `CTR ${ctr.toFixed(1).replace('.', ',')} %` : '—',
    },
    {
      libelle: 'Cartes sauvegardées',
      valeur: v.saves.toLocaleString('fr-FR'),
      detail: 'gardées pour après la partie',
    },
    {
      libelle: 'Dépense engagée',
      valeur: fcfa(depense),
      detail: `${v.vues.toLocaleString('fr-FR')} vues × ${prix} FCFA`,
      accent: true,
    },
    {
      libelle: 'Coût par personne touchée (échelle édition)',
      valeur: uniques > 0 ? fcfa(Math.round(depenseEdition / uniques)) : '—',
      detail: uniques > 0 ? 'toutes cartes confondues' : 'en attente des uniques',
    },
    {
      libelle: 'Reste du plafond (échelle édition)',
      valeur: restePlafond != null ? fcfa(restePlafond) : '—',
      detail: budgetCap != null ? `plafond de ${fcfa(budgetCap)}` : 'pas de plafond défini',
      jaugePct: budgetCap ? (depenseEdition / budgetCap) * 100 : null,
    },
  ];
}

function construireFunnel(
  v: MiseEnVisibilite,
  m: { totals: { gamesPlayed: number } } | null
): EtapeFunnel[] {
  if (v.format === 'edition') {
    return [
      { libelle: 'Vue de l’écran sponsor', valeur: v.vues },
      { libelle: 'Partie jouée dans l’édition', valeur: m?.totals.gamesPlayed ?? 0 },
    ];
  }
  return [
    { libelle: 'Vue de la carte', valeur: v.vues },
    { libelle: 'Flip (verso consulté)', valeur: v.flips, aVenir: v.flips === 0 },
    { libelle: 'Clic sur le CTA', valeur: v.clics },
    { libelle: 'Sauvegarde', valeur: v.saves },
  ];
}
