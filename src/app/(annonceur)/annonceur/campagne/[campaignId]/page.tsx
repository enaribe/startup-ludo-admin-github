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

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, Pause, Pencil, Play } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getCampagne } from '@/lib/campaign-service';
import { auth } from '@/lib/firebase';
import {
  getSponsorDailyMetrics,
  getSponsorMetrics,
  jourLocal,
  type SponsorMetricsDocument,
} from '@/lib/sponsor-metrics-service';
import { fcfa } from '@/lib/annonceur-service';
import { finExclusivite, joursRestants } from '@/lib/reservations';
import ApercuCarteCampagne from '@/components/annonceur/ApercuCarteCampagne';
import CourbeQuotidienne, { type PointJour } from '@/components/annonceur/CourbeQuotidienne';
import RepartitionAttribution from '@/components/annonceur/RepartitionAttribution';
import FunnelImpact from '@/components/annonceur/FunnelImpact';
import { genererRapportImpactPdf, telechargerRapport } from '@/lib/annonceur-rapport-pdf';
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
  /** Totaux cumulés — uniques, flips, saves et ventilation ne vivent que là. */
  const [metriques, setMetriques] = useState<SponsorMetricsDocument | null>(null);
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
          const [jours, cumul] = await Promise.all([
            getSponsorDailyMetrics(c.id, 30),
            getSponsorMetrics(c.id).catch(() => null),
          ]);
          if (!annule) {
            setMetriques(cumul);
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

  /**
   * Cumulés depuis le début de la campagne.
   *
   * Distincts de `totaux`, qui porte la fenêtre 30 jours : « personnes uniques
   * touchées » ne se recalcule pas sur une fenêtre glissante — un joueur revu
   * après 30 jours ne redevient pas une nouvelle personne. Le compteur
   * `uniqueViews` est tenu côté mobile par un marqueur create-only par uid.
   */
  const cumul = useMemo(() => {
    const t = metriques?.totals;
    const estEdition = campagne?.format === 'edition';
    const vues = estEdition ? (t?.editionPopupViews ?? 0) : (t?.views ?? 0);
    const clics = t?.clicks ?? 0;
    return {
      vues,
      clics,
      uniques: t?.uniqueViews ?? 0,
      flips: t?.flips ?? 0,
      saves: t?.saves ?? 0,
      depense: vues * (campagne?.pricing?.perView ?? 0) + clics * (campagne?.pricing?.perClick ?? 0),
    };
  }, [metriques, campagne]);

  /**
   * Pause / reprise, comme sur l'écran d'une mise en visibilité : réversible,
   * sans effet sur le créneau. L'arrêt définitif reste à CONCREE.
   */
  const [enCoursPause, setEnCoursPause] = useState(false);
  const basculerPause = useCallback(async () => {
    if (!campagne) return;
    const versPause = campagne.status === 'active';
    setEnCoursPause(true);
    try {
      const jeton = await auth.currentUser?.getIdToken();
      const reponse = await fetch('/api/annonceur/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ campaignId: campagne.id, decision: versPause ? 'pause' : 'resume' }),
      });
      const data = (await reponse.json()) as { error?: string };
      if (!reponse.ok) throw new Error(data.error || 'Action impossible.');
      toast.success(versPause ? 'Diffusion mise en pause.' : 'Diffusion reprise.');
      setCampagne((c) => (c ? { ...c, status: versPause ? 'paused' : 'active' } : c));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action impossible.');
    } finally {
      setEnCoursPause(false);
    }
  }, [campagne]);

  /**
   * Export PDF — le même générateur que l'écran d'une mise en visibilité.
   *
   * Il attend une `MiseEnVisibilite` mais n'en lit que cinq champs (titre,
   * structure, format, kind, editionName) : on les dérive de la campagne
   * plutôt que de dupliquer 250 lignes de mise en page PDF.
   */
  const [exportEnCours, setExportEnCours] = useState(false);
  const exporterPdf = useCallback(async () => {
    if (!campagne) return;
    setExportEnCours(true);
    try {
      const octets = await genererRapportImpactPdf({
        visibilite: {
          titre: campagne.card?.rectoText?.trim() || `Édition ${campagne.editionSkin?.editionId ?? ''}`,
          structure: campagne.card?.structure || campagne.editionSkin?.structure || '—',
          format: campagne.format === 'edition' ? 'edition' : 'carte',
          kind: campagne.card?.kind === 'financement' ? 'funding' : 'opportunity',
          editionName: campagne.editionSkin?.editionId || '—',
        } as never,
        indicateurs: [
          { libelle: 'Vues totales', valeur: cumul.vues.toLocaleString('fr-FR') },
          { libelle: 'Personnes uniques touchées', valeur: cumul.uniques.toLocaleString('fr-FR') },
          { libelle: 'Flips de la carte', valeur: cumul.flips.toLocaleString('fr-FR') },
          { libelle: 'Clics sur le CTA', valeur: cumul.clics.toLocaleString('fr-FR') },
          { libelle: 'Cartes sauvegardées', valeur: cumul.saves.toLocaleString('fr-FR') },
          { libelle: 'Dépense engagée', valeur: fcfa(cumul.depense) },
        ],
        funnel: [
          { libelle: 'Vues', valeur: cumul.vues },
          { libelle: 'Flips de la carte', valeur: cumul.flips },
          { libelle: 'Clics sur le CTA', valeur: cumul.clics },
          { libelle: 'Sauvegardes', valeur: cumul.saves },
        ],
        serie14j: serie.slice(-14),
      });
      telechargerRapport(octets, `rapport-${campagne.id}.pdf`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export impossible.');
    } finally {
      setExportEnCours(false);
    }
  }, [campagne, cumul, serie]);

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

  const { vues: vuesCumul, clics: clicsCumul, uniques, flips, saves, depense: depenseCumul } = cumul;

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

      {/*
        * BANDEAU : la carte telle qu'elle est tirée en partie, à côté de son
        * nom. L'annonceur reconnaît sa campagne d'un coup d'œil — un titre
        * seul l'oblige à se souvenir de ce qu'il a écrit.
        */}
      <div
        className="flex items-start gap-4 flex-wrap"
        style={{
          marginTop: 12, background: '#FFFFFF', border: '1px solid var(--color-card-border)',
          borderRadius: 14, padding: '16px 18px',
        }}
      >
        {campagne.card && (
          <div style={{ width: 110, flexShrink: 0 }}>
            <div style={{ transform: 'scale(0.42)', transformOrigin: 'top left', width: 260, height: 160 }}>
              <ApercuCarteCampagne card={campagne.card} />
            </div>
          </div>
        )}
        <div className="flex items-start justify-between gap-3 flex-wrap" style={{ flex: 1, minWidth: 260 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: NAVY, maxWidth: 620 }}>{titre}</h1>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 3 }}>
            {campagne.card?.structure || campagne.editionSkin?.structure || '—'} ·{' '}
            {campagne.pricing.perView} F/vue
            {campagne.pricing.perClick > 0 ? ` · ${campagne.pricing.perClick} F/clic` : ''}
            {jours !== null && jours > 0 ? ` · encore ${jours} jour${jours > 1 ? 's' : ''}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
          {(campagne.status === 'active' || campagne.status === 'paused') && (
            <button
              type="button"
              onClick={() => void basculerPause()}
              disabled={enCoursPause}
              className="flex items-center gap-2"
              style={{
                fontSize: 12.5, fontWeight: 600, padding: '7px 13px', borderRadius: 10,
                border: '1px solid var(--color-card-border)', color: NAVY, background: '#FFFFFF',
                cursor: enCoursPause ? 'default' : 'pointer', opacity: enCoursPause ? 0.6 : 1,
              }}
            >
              {campagne.status === 'active' ? (
                <>
                  <Pause size={13} /> Mettre en pause
                </>
              ) : (
                <>
                  <Play size={13} /> Reprendre
                </>
              )}
            </button>
          )}
          {campagne.status === 'draft' || campagne.status === 'in_review' ? (
            <Link
              href={`/annonceur/nouvelle?id=${encodeURIComponent(campagne.id)}`}
              className="flex items-center gap-2"
              style={{
                fontSize: 12.5, fontWeight: 600, padding: '7px 13px', borderRadius: 10,
                border: '1px solid var(--color-card-border)', color: NAVY,
                background: '#FFFFFF', textDecoration: 'none',
              }}
            >
              <Pencil size={13} /> Modifier
            </Link>
          ) : (
            // Une campagne diffusée n'est plus modifiable : les règles
            // Firestore n'autorisent l'écriture que sur `draft`/`in_review`.
            // Ouvrir le wizard ici produirait des erreurs de sauvegarde.
            <span
              title="Une campagne en diffusion ne se modifie plus. Écrivez à annonceurs@concree.com pour la faire évoluer."
              className="flex items-center gap-2"
              style={{
                fontSize: 12.5, fontWeight: 600, padding: '7px 13px', borderRadius: 10,
                border: '1px solid var(--color-card-border)', color: '#8A94A6',
                background: '#F7F8FA', cursor: 'not-allowed',
              }}
            >
              <Pencil size={13} /> Modifier
            </span>
          )}
          <button
            type="button"
            onClick={() => void exporterPdf()}
            disabled={exportEnCours}
            className="flex items-center gap-2"
            style={{
              fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 10,
              border: 'none', background: ORANGE, color: '#FFFFFF',
              cursor: exportEnCours ? 'default' : 'pointer', opacity: exportEnCours ? 0.6 : 1,
            }}
          >
            <Download size={13} /> {exportEnCours ? 'Export…' : 'Exporter le rapport (PDF)'}
          </button>
          <span
            style={{
              fontSize: 11.5, fontWeight: 700, padding: '4px 12px', borderRadius: 10,
              background: statut.fond, color: statut.texte,
            }}
          >
            {statut.libelle}
          </span>
        </div>
        </div>
      </div>

      {campagne.status === 'suspended' && campagne.suspension && (
        <p style={{ fontSize: 12.5, color: '#C0392B', marginTop: 8 }}>
          {campagne.suspension.motif === 'plafond-atteint'
            ? `Plafond de ${campagne.budgetCapFcfa.toLocaleString('fr-FR')} FCFA atteint — relevez-le pour reprendre la diffusion.`
            : 'Solde insuffisant — rechargez votre compte pour reprendre la diffusion.'}
        </p>
      )}

      {/*
        * Les huit indicateurs de la maquette. Les cumulés (uniques, flips,
        * saves) viennent des TOTAUX de la campagne, pas de la fenêtre 30 jours :
        * « personnes uniques » n'a de sens que depuis le début — un joueur revu
        * après 30 jours ne redevient pas une nouvelle personne.
        */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={{ marginTop: 18 }}>
        <Tuile
          libelle="Vues totales"
          valeur={vuesCumul.toLocaleString('fr-FR')}
          detail={
            campagne.viewsGoal > 0
              ? `objectif ${campagne.viewsGoal.toLocaleString('fr-FR')} · ${Math.round((vuesCumul / campagne.viewsGoal) * 100)} % atteint`
              : 'pas d’objectif défini'
          }
          jaugePct={campagne.viewsGoal > 0 ? (vuesCumul / campagne.viewsGoal) * 100 : null}
        />
        <Tuile
          libelle="Personnes uniques touchées"
          valeur={uniques.toLocaleString('fr-FR')}
          detail={
            uniques > 0
              ? `${(vuesCumul / uniques).toFixed(2).replace('.', ',')} vue par joueur en moyenne`
              : 'en attente de la mise à jour de l’app'
          }
        />
        <Tuile
          libelle="Flips de la carte"
          valeur={flips.toLocaleString('fr-FR')}
          detail={
            flips > 0 && vuesCumul > 0
              ? `taux de curiosité ${((flips / vuesCumul) * 100).toFixed(1).replace('.', ',')} %`
              : 'retournements pour voir le verso'
          }
        />
        <Tuile
          libelle="Clics sur le CTA"
          valeur={clicsCumul.toLocaleString('fr-FR')}
          detail={
            vuesCumul > 0
              ? `CTR ${((clicsCumul / vuesCumul) * 100).toFixed(1).replace('.', ',')} %`
              : '—'
          }
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={{ marginTop: 12 }}>
        <Tuile
          libelle="Cartes sauvegardées"
          valeur={saves.toLocaleString('fr-FR')}
          detail="gardées pour après la partie"
        />
        <Tuile
          libelle="Dépense engagée"
          valeur={fcfa(depenseCumul)}
          detail={`${vuesCumul.toLocaleString('fr-FR')} vues × ${campagne.pricing.perView} FCFA${
            clicsCumul > 0 ? ` + ${clicsCumul} clics × ${campagne.pricing.perClick} FCFA` : ''
          }`}
          accent
        />
        <Tuile
          libelle="Coût par personne touchée"
          valeur={uniques > 0 ? fcfa(Math.round(depenseCumul / uniques)) : '—'}
          detail={
            clicsCumul > 0
              ? `coût par clic réel : ${fcfa(Math.round(depenseCumul / clicsCumul))}`
              : 'aucun clic pour l’instant'
          }
        />
        <Tuile
          libelle="Reste du plafond"
          valeur={campagne.budgetCapFcfa > 0 ? fcfa(Math.max(0, campagne.budgetCapFcfa - depenseCumul)) : '—'}
          detail={
            campagne.budgetCapFcfa > 0
              ? `plafond de ${fcfa(campagne.budgetCapFcfa)}`
              : 'pas de plafond défini'
          }
          jaugePct={
            campagne.budgetCapFcfa > 0 ? (depenseCumul / campagne.budgetCapFcfa) * 100 : null
          }
        />
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

      {/*
        * Ventilation des vues. Le secteur est celui de la startup du joueur :
        * il n'a de sens que pour une CARTE, tirée en cours de partie. Sur un
        * habillage d'édition, l'écran s'affiche avant que le joueur n'ait joué,
        * donc la bascule est masquée.
        */}
      {/*
        * « Du regard à l'action » : ce que les joueurs FONT de la carte, pas
        * seulement combien l'ont vue. Le composant se protège lui-même des
        * petits volumes — un entonnoir dessiné sur 3 vues inverse ses marches.
        */}
      {campagne.format === 'card' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ marginTop: 18 }}>
          <div className="lg:col-span-2">
            <Carte titre="Du regard à l’action" sous="Ce que les joueurs font de votre carte">
              <FunnelImpact
                etapes={[
                  { libelle: 'Vues', valeur: vuesCumul },
                  { libelle: 'Flips de la carte', valeur: flips, aVenir: flips === 0 },
                  { libelle: 'Clics sur le CTA', valeur: clicsCumul },
                  { libelle: 'Sauvegardes', valeur: saves },
                ]}
              />
            </Carte>
          </div>
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <Carte titre="Personnes touchées" sous="Ventilation des vues par profil de joueur">
          <RepartitionAttribution
            bySector={metriques?.bySector ?? {}}
            byRegion={metriques?.byRegion ?? {}}
            avecSecteur={campagne.format === 'card'}
          />
        </Carte>
      </div>
    </div>
  );
}

function Tuile({
  libelle,
  valeur,
  detail,
  jaugePct,
  accent,
}: {
  libelle: string;
  valeur: string;
  /** Ligne d'explication sous le chiffre — le contexte sans lequel il ne dit rien. */
  detail?: string;
  /** Progression vers un objectif ou un plafond, en pourcentage. */
  jaugePct?: number | null;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? 'rgba(245,166,35,0.07)' : '#FFFFFF',
        border: `1px solid ${accent ? 'rgba(245,166,35,0.35)' : 'var(--color-card-border)'}`,
        borderRadius: 12,
        padding: '14px 16px',
      }}
    >
      <div style={{ fontSize: 10.5, letterSpacing: 0.6, color: 'var(--color-text-muted)', fontWeight: 600 }}>
        {libelle.toUpperCase()}
      </div>
      <div style={{ fontSize: 21, fontWeight: 800, color: accent ? ORANGE : NAVY, marginTop: 4 }}>
        {valeur}
      </div>
      {detail && (
        <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3, lineHeight: 1.4 }}>
          {detail}
        </div>
      )}
      {jaugePct != null && (
        <div
          style={{
            height: 5, borderRadius: 3, background: 'var(--color-surface)',
            overflow: 'hidden', marginTop: 8,
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(1, jaugePct))}%`,
              height: '100%',
              background: accent ? ORANGE : NAVY,
            }}
          />
        </div>
      )}
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
