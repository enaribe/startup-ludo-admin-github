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
import SponsorPopupPreview from '@/components/sponsor/SponsorPopupPreview';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

/**
 * Réduction de l'aperçu de carte en vignette d'en-tête.
 * `SponsorCardPreview` fait 244 px de large et environ 400 px de haut ; à 45 %
 * la vignette tient dans l'en-tête tout en restant reconnaissable.
 */
const ECHELLE_VIGNETTE = 0.45;
/** Hauteur de référence de l'aperçu de CARTE avant réduction, en pixels. */
const HAUTEUR_VIGNETTE = 400;
/**
 * Dimensions de la CARTE de `SponsorPopupPreview`, avant réduction — sans la
 * légende qu'il affiche en dessous. Elle explique comment interagir avec
 * l'aperçu en pleine page ; à 45 % elle serait illisible, et la réserver dans
 * la vignette creuserait un vide sous la carte. Le conteneur la rogne donc.
 */
const LARGEUR_POPUP = 276;
const HAUTEUR_POPUP = 291;

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
    <div style={{ maxWidth: 1440 }}>
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
        {/*
          L'APERÇU EN VIGNETTE, dès l'en-tête (maquette). L'annonceur reconnaît
          immédiatement DE QUELLE carte parlent les chiffres qui suivent — sur
          un compte qui en diffuse plusieurs, un titre seul ne suffit pas.
          C'est l'aperçu de `SponsorCardPreview` — une transposition sobre du
          rendu de partie (badge, logo, texte, jetons), pas une reproduction du
          flip 3D du jeu, qui parasiterait la lecture des chiffres.
        */}
        {/*
          Les deux aperçus ont une largeur FIXE : les contraindre par un
          conteneur plus étroit les ferait déborder (le contenu ne se recompose
          pas). On les met donc à l'échelle — le conteneur réserve la place
          réellement occupée APRÈS réduction, sinon il resterait un grand vide.
        */}
        {v.format === 'carte' && v.card && (
          <div
            style={{
              width: 244 * ECHELLE_VIGNETTE,
              height: HAUTEUR_VIGNETTE * ECHELLE_VIGNETTE,
              flexShrink: 0,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                transform: `scale(${ECHELLE_VIGNETTE})`,
                transformOrigin: 'top left',
                width: 244,
                flexShrink: 0,
              }}
            >
              <SponsorCardPreview
                card={v.card}
                kind={v.kind === 'funding' ? 'funding' : 'opportunity'}
                defaultTokens={v.kind === 'funding' ? 4 : 2}
              />
            </div>
          </div>
        )}
        {v.format === 'edition' && (
          // ⚠️ `SponsorPopupPreview` est centré et porte une LÉGENDE sous la
          // carte (« Touchez en savoir plus… ») : utile en pleine page, illisible
          // à 45 %. On borne donc la hauteur à celle de la carte seule, et
          // `alignItems: 'flex-start'` neutralise le centrage du composant —
          // sans quoi la carte est décalée et son bord gauche rogné.
          <div
            style={{
              width: LARGEUR_POPUP * ECHELLE_VIGNETTE,
              height: HAUTEUR_POPUP * ECHELLE_VIGNETTE,
              flexShrink: 0,
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                transform: `scale(${ECHELLE_VIGNETTE})`,
                transformOrigin: 'top left',
                width: LARGEUR_POPUP,
                flexShrink: 0,
              }}
            >
              <SponsorPopupPreview editionName={v.editionName} sponsor={v.sponsor} />
            </div>
          </div>
        )}

        <div style={{ minWidth: 240, flex: 1 }}>
          {/*
            Le titre d'une carte EST son texte d'accroche : il peut faire
            plusieurs phrases. Non tronqué, il repoussait les boutons hors de
            l'en-tête. Deux lignes maximum ; le texte complet reste lisible dans
            la vignette et dans l'infobulle.
          */}
          <h1
            title={v.titre}
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: NAVY,
              marginBottom: 6,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.3,
            }}
          >
            {v.titre}
          </h1>
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
            <span style={{ color: 'var(--color-text-secondary)' }}>
              {v.debutMs && v.finMs
                ? `${new Date(v.debutMs).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} → ${new Date(v.finMs).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : 'diffusion en continu'}
            </span>
            {/* L'habillage d'une édition est EXCLUSIF : un seul annonceur par
                édition à la fois, c'est ce qui en fait le format premium. */}
            {v.format === 'edition' && (
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: '4px 11px',
                  borderRadius: 10,
                  background: 'rgba(245,166,35,0.14)',
                  color: '#B87A0C',
                }}
              >
                Édition sponsorisée · exclusivité
              </span>
            )}
          </div>
          {v.format === 'carte' && v.card && (
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 8 }}>
              Aperçu de la carte telle qu’elle est tirée en partie.
            </p>
          )}
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
          {/* Pas de ventilation SECTORIELLE sur l'habillage d'une édition :
              l'écran sponsor s'affiche au choix de l'édition, avant que le
              joueur n'ait joué — son secteur ne dit rien de ce qui a été
              réservé. La région, elle, reste pertinente. */}
          <RepartitionAttribution
            bySector={metriquesEdition?.bySector ?? {}}
            byRegion={metriquesEdition?.byRegion ?? {}}
            avecSecteur={v.format === 'carte'}
          />
          <p style={{ fontSize: 10.5, color: 'var(--color-text-muted)', marginTop: 10 }}>
            {v.format === 'carte'
              ? `Échelle édition : toutes vos cartes de « ${v.editionName} » confondues.`
              : `Échelle édition : toute votre diffusion sur « ${v.editionName} ».`}
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
          <div style={{ borderBottom: '1px solid var(--color-card-border)', margin: '0 -18px 18px', padding: '0 18px 14px' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>
              {v.format === 'edition' ? 'Du regard à la partie jouée' : 'Du regard à l’action'}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
              {v.format === 'edition'
                ? 'Ce que les joueurs font de l’écran sponsor'
                : 'Ce que les joueurs font de votre carte'}
            </p>
          </div>
          <FunnelImpact etapes={construireFunnel(v, metriquesEdition)} />
        </div>

        {/*
          L'ÉCRAN SPONSOR DIFFUSÉ — format édition uniquement.
          Pour une carte, l'aperçu vit déjà dans l'en-tête et le répéter ici
          n'apporterait rien ; pour une édition, l'écran plein cadre est trop
          grand pour la vignette d'en-tête et mérite sa place à côté du funnel :
          l'annonceur voit CE QUE mesurent les chiffres de gauche.
        */}
        {v.format === 'edition' && (
          <div
            className="lg:col-span-2"
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--color-card-border)',
              borderRadius: 14,
              padding: '16px 18px',
            }}
          >
            <div style={{ borderBottom: '1px solid var(--color-card-border)', margin: '0 -18px 18px', padding: '0 18px 14px' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>L’écran sponsor diffusé</h3>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
                Tel qu’il s’affiche au choix de l’édition
              </p>
            </div>
            <div className="flex justify-center">
              <SponsorPopupPreview editionName={v.editionName} sponsor={v.sponsor} />
            </div>
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

/**
 * Période de réservation en jours, ou `null` si l'annonceur n'en a pas défini.
 *
 * ⚠️ La période est INFORMATIVE : le jeu ne coupe pas la diffusion à
 * l'échéance (seuls `paused` et l'objectif de vues l'arrêtent). Le libellé de
 * la tuile parle donc de « réservation », jamais d'un arrêt automatique.
 *
 * `restants` est borné à zéro : une réservation échue afficherait sinon un
 * nombre négatif de jours.
 */
function calculerReservation(
  debutMs: number | null,
  finMs: number | null
): { total: number; ecoules: number; restants: number; finLisible: string } | null {
  if (!debutMs || !finMs || finMs <= debutMs) return null;

  const JOUR = 86_400_000;
  const total = Math.max(1, Math.round((finMs - debutMs) / JOUR));
  const ecoules = Math.min(total, Math.max(0, Math.round((Date.now() - debutMs) / JOUR)));

  return {
    total,
    ecoules,
    restants: total - ecoules,
    finLisible: new Date(finMs).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
  };
}

function construireIndicateurs(
  v: MiseEnVisibilite,
  m: { totals: { views: number; uniqueViews: number; editionPopupViews: number; gamesPlayed: number; playSeconds: number } } | null
): Kpi[] {
  const uniques = m?.totals.uniqueViews ?? 0;
  const vuesEdition = m?.totals.views ?? 0;
  const prix = v.pricePerView ?? PRIX_PAR_VUE_FCFA;

  const reservation = calculerReservation(v.debutMs, v.finMs);

  if (v.format === 'edition') {
    const popup = v.vues;
    const parties = m?.totals.gamesPlayed ?? 0;
    const clics = v.clics;
    const ctrEdition = popup > 0 ? (clics / popup) * 100 : null;
    // L'habillage d'édition n'est pas facturé aujourd'hui (`depenseFcfa` nul) :
    // les deux dernières tuiles ne s'affichent donc QUE s'il l'est réellement.
    const depenseEdition = v.depenseFcfa;
    const coutParPersonne = depenseEdition != null && uniques > 0 ? depenseEdition / uniques : null;

    return [
      {
        libelle: 'Vues de l’écran sponsor',
        valeur: popup.toLocaleString('fr-FR'),
        detail: v.objectifVues && v.objectifVues > 0
          ? `objectif ${v.objectifVues.toLocaleString('fr-FR')}`
          : 'affiché au choix de l’édition',
        jaugePct: v.objectifVues && v.objectifVues > 0 ? (popup / v.objectifVues) * 100 : null,
      },
      {
        libelle: 'Personnes uniques touchées',
        valeur: uniques.toLocaleString('fr-FR'),
        detail:
          uniques > 0
            ? `${(popup / uniques).toFixed(2).replace('.', ',')} affichage par joueur en moyenne`
            : 'joueurs différents',
      },
      {
        libelle: 'Clics « en savoir plus »',
        valeur: clics.toLocaleString('fr-FR'),
        detail:
          ctrEdition != null
            ? `CTR ${ctrEdition.toFixed(1).replace('.', ',')} % — écran plein cadre`
            : 'aucun clic mesuré',
      },
      {
        libelle: 'Parties jouées dans l’édition',
        valeur: parties.toLocaleString('fr-FR'),
        detail:
          popup > 0
            ? `${((parties / popup) * 100).toFixed(1).replace('.', ',')} % des affichages débouchent sur une partie`
            : '—',
      },
      {
        libelle: 'Durée moyenne de jeu',
        valeur: dureeMoyenne(m?.totals.playSeconds ?? 0, parties),
        detail: 'exposition prolongée de votre marque, toute la partie',
        accent: true,
      },
      // La réservation n'apparaît que si l'annonceur a renseigné une période :
      // afficher « — / — » sur une diffusion en continu serait du bruit.
      ...(reservation
        ? [
            {
              libelle: 'Jours de réservation restants',
              valeur: `${reservation.restants}`,
              detail: `sur ${reservation.total} · jusqu’au ${reservation.finLisible}`,
              jaugePct: (reservation.ecoules / reservation.total) * 100,
            },
          ]
        : []),
      ...(depenseEdition != null
        ? [
            {
              libelle: 'Dépense engagée',
              valeur: `${depenseEdition.toLocaleString('fr-FR')} FCFA`,
              detail: `${popup.toLocaleString('fr-FR')} vues × ${prix} FCFA`,
              accent: true,
            },
            ...(coutParPersonne != null
              ? [
                  {
                    libelle: 'Coût par personne touchée',
                    valeur: `${Math.round(coutParPersonne).toLocaleString('fr-FR')} FCFA`,
                    detail:
                      clics > 0
                        ? `coût par clic réel : ${Math.round(depenseEdition / clics).toLocaleString('fr-FR')} FCFA`
                        : 'aucun clic pour l’instant',
                  },
                ]
              : []),
          ]
        : []),
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
      { libelle: 'Vues de l’écran sponsor', valeur: v.vues },
      { libelle: 'Parties jouées dans l’édition', valeur: m?.totals.gamesPlayed ?? 0 },
      // Le clic « en savoir plus » est la dernière marche : c'est l'action que
      // l'annonceur cherche, et elle vient APRÈS la partie dans le parcours.
      { libelle: 'Clics « en savoir plus »', valeur: v.clics },
    ];
  }
  return [
    { libelle: 'Vues', valeur: v.vues },
    { libelle: 'Flips de la carte', valeur: v.flips, aVenir: v.flips === 0 },
    { libelle: 'Clics sur le CTA', valeur: v.clics },
    { libelle: 'Sauvegardes', valeur: v.saves },
  ];
}
