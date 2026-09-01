'use client';

/**
 * Tableau de bord de l'Espace Annonceur (maquette 19/08) — vue d'ensemble
 * tous formats confondus sur les 30 derniers jours.
 *
 * SOURCES — rien d'inventé :
 *  - buckets quotidiens `sponsorMetrics/{clé}/daily` : clé = editionId pour le
 *    sponsoring historique, campaignId pour les campagnes du wizard ;
 *  - dépense = vues × grille figée de chaque campagne (le modèle historique
 *    facture à la vue seule) — le même calcul que la page Facturation ;
 *  - « personnes touchées » = somme des `uniqueViews` quotidiens, disponibles
 *    par campagne mais pas par carte historique : les lignes sans mesure
 *    affichent « — », jamais une estimation déguisée en mesure.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CalendarClock,
  Coins,
  Download,
  Eye,
  LayoutGrid,
  MousePointerClick,
  Plus,
  Users,
  Wallet,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { firestore, COLLECTIONS } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { getEditions, getEditionsByIds } from '@/lib/firestore-service';
import { chargerEspaceAnnonceur, fcfa } from '@/lib/annonceur-service';
import { getMesCampagnes } from '@/lib/campaign-service';
import {
  getSponsorDailyMetrics,
  jourLocal,
  type SponsorDailyMetrics,
} from '@/lib/sponsor-metrics-service';
import { PRIX_PAR_VUE_FCFA } from '@/lib/sponsor-pricing';
import {
  genererRapportConsolidePdf,
  telechargerRapport,
} from '@/lib/annonceur-rapport-pdf';
import CourbeQuotidienne, { type PointJour } from '@/components/annonceur/CourbeQuotidienne';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { Campaign } from '@/types';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

/** Une ligne du tableau « Performance comparée » (30 derniers jours). */
interface LigneDash {
  cle: string;
  titre: string;
  sousTitre: string;
  format: 'carte' | 'edition';
  vues30: number;
  /** null = non mesurable pour cette ligne (cartes historiques). */
  uniques30: number | null;
  clics30: number;
  depense30: number;
  /** Rapport d'impact détaillé — null quand la ligne n'a pas de page dédiée. */
  href: string | null;
}

interface DonneesDash {
  vues30: number;
  tendancePct: number | null;
  uniques30: number;
  clics30: number;
  depense30: number;
  actives: number;
  detailStatuts: string;
  solde: number | null;
  autonomieJours: number | null;
  serie14: PointJour[];
  lignes: LigneDash[];
}

const LIBELLES_STATUT: Record<string, string> = {
  active: 'active',
  in_review: 'en modération',
  paused: 'en pause',
  ended: 'terminée',
};

/** « 2,15 M » / « 454 K » — les montants compacts de la répartition. */
function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} M`;
  if (n >= 1_000) return `${Math.round(n / 1_000).toLocaleString('fr-FR')} K`;
  return n.toLocaleString('fr-FR');
}

export default function TableauDeBordAnnonceurPage() {
  const { admin, loading: authLoading, isSuperAdmin, scopedEditionIds } = useAuth();
  const [donnees, setDonnees] = useState<DonneesDash | null>(null);
  const [chargement, setChargement] = useState(true);
  const [exportEnCours, setExportEnCours] = useState(false);

  useEffect(() => {
    if (authLoading || !admin) return;
    let annule = false;
    (async () => {
      try {
        const editions = isSuperAdmin
          ? await getEditions()
          : await getEditionsByIds(scopedEditionIds);
        const [espace, campagnes, compteSnap] = await Promise.all([
          chargerEspaceAnnonceur(editions),
          getMesCampagnes().catch(() => [] as Campaign[]),
          getDoc(doc(firestore, COLLECTIONS.advertisers, admin.uid)).catch(() => null),
        ]);

        // Séries 60 jours des campagnes diffusées (les brouillons et refus n'ont rien à mesurer).
        const diffusees = campagnes.filter((c) => ['active', 'paused', 'ended'].includes(c.status));
        const seriesCampagnes = new Map<string, SponsorDailyMetrics[]>();
        await Promise.all(
          diffusees.map(async (c) => {
            seriesCampagnes.set(c.id, await getSponsorDailyMetrics(c.id, 60));
          })
        );
        if (annule) return;

        const j30 = jourLocal(-29);
        const j14 = jourLocal(-13);
        let vues30 = 0;
        let vuesPrec = 0;
        let uniques30 = 0;
        let clics30 = 0;
        let depense30 = 0;
        const parJour = new Map<string, { vues: number; clics: number }>();
        const cumulerJour = (date: string, vues: number, clics: number) => {
          if (date < j14) return;
          const j = parJour.get(date) ?? { vues: 0, clics: 0 };
          j.vues += vues;
          j.clics += clics;
          parJour.set(date, j);
        };

        const lignes: LigneDash[] = [];

        // ── Sponsoring historique : séries par édition, dépense à la vue ──
        for (const [editionId, serie] of Object.entries(espace.quotidien)) {
          const edition = editions.find((e) => e.id === editionId);
          const prix = edition?.sponsor?.pricePerView ?? PRIX_PAR_VUE_FCFA;
          for (const jour of serie) {
            if (jour.date >= j30) {
              vues30 += jour.totals.views;
              uniques30 += jour.totals.uniqueViews;
              clics30 += jour.totals.clicks;
              depense30 += jour.totals.views * prix;
            } else {
              vuesPrec += jour.totals.views;
            }
            cumulerJour(jour.date, jour.totals.views, jour.totals.clicks);
          }
        }

        // Lignes historiques : une par carte (+ l'habillage d'édition s'il a des vues).
        for (const v of espace.visibilites) {
          const serie = espace.quotidien[v.editionId] ?? [];
          if (v.format === 'carte' && v.card) {
            let vues = 0;
            let clics = 0;
            for (const jour of serie) {
              if (jour.date < j30) continue;
              const cm = jour.cards[v.card.id];
              if (!cm) continue;
              vues += cm.views;
              clics += cm.clicks;
            }
            lignes.push({
              cle: v.id,
              titre: v.titre,
              sousTitre: `${v.structure} · ${v.statut === 'active' ? 'active' : v.statut === 'en_pause' ? 'en pause' : 'objectif atteint'}`,
              format: 'carte',
              vues30: vues,
              uniques30: null,
              clics30: clics,
              depense30: vues * (v.pricePerView ?? PRIX_PAR_VUE_FCFA),
              href: `/annonceur/${encodeURIComponent(v.id)}`,
            });
          } else if (v.format === 'edition') {
            let vuesPopup = 0;
            for (const jour of serie) {
              if (jour.date >= j30) vuesPopup += jour.totals.editionPopupViews;
            }
            if (vuesPopup === 0) continue; // habillage jamais affiché sur la période
            lignes.push({
              cle: v.id,
              titre: v.titre,
              sousTitre: `${v.structure} · écran sponsor`,
              format: 'edition',
              vues30: vuesPopup,
              uniques30: null,
              clics30: 0,
              depense30: 0,
              href: `/annonceur/${encodeURIComponent(v.id)}`,
            });
          }
        }

        // ── Campagnes du wizard : grille figée vue + clic, uniques mesurés ──
        for (const c of diffusees) {
          const serie = seriesCampagnes.get(c.id) ?? [];
          let vues = 0;
          let uniques = 0;
          let clics = 0;
          for (const jour of serie) {
            if (jour.date >= j30) {
              vues += jour.totals.views;
              uniques += jour.totals.uniqueViews;
              clics += jour.totals.clicks;
            } else {
              vuesPrec += jour.totals.views;
            }
            cumulerJour(jour.date, jour.totals.views, jour.totals.clicks);
          }
          const depense = vues * c.pricing.perView + clics * c.pricing.perClick;
          vues30 += vues;
          uniques30 += uniques;
          clics30 += clics;
          depense30 += depense;
          lignes.push({
            cle: c.id,
            titre:
              c.card?.rectoText?.slice(0, 80) ||
              `Édition ${c.editionSkin?.editionId ?? ''} — habillage sponsorisé`,
            sousTitre: `${c.card?.structure || c.editionSkin?.structure || '—'} · ${LIBELLES_STATUT[c.status] ?? c.status}`,
            format: c.format === 'card' ? 'carte' : 'edition',
            vues30: vues,
            uniques30: uniques,
            clics30: clics,
            depense30: depense,
            href: null,
          });
        }

        lignes.sort((a, b) => b.depense30 - a.depense30 || b.vues30 - a.vues30);

        // ── Tuile « Mises en visibilité » : actives + détail des autres statuts ──
        const activesLegacy = espace.visibilites.filter((v) => v.format === 'carte' && v.statut === 'active').length;
        const activesCampagnes = campagnes.filter((c) => c.status === 'active').length;
        const detail: string[] = [];
        const enModeration = campagnes.filter((c) => c.status === 'in_review').length;
        const enPause =
          campagnes.filter((c) => c.status === 'paused').length +
          espace.visibilites.filter((v) => v.format === 'carte' && v.statut === 'en_pause').length;
        const terminees = campagnes.filter((c) => c.status === 'ended').length;
        if (enModeration) detail.push(`${enModeration} en modération`);
        if (enPause) detail.push(`${enPause} en pause`);
        if (terminees) detail.push(`${terminees} terminée${terminees > 1 ? 's' : ''}`);

        const solde = (compteSnap?.data()?.balanceFcfa as number | undefined) ?? null;

        // Série continue des 14 derniers jours pour la courbe.
        const serie14: PointJour[] = [];
        for (let i = 13; i >= 0; i -= 1) {
          const date = jourLocal(-i);
          const j = parJour.get(date) ?? { vues: 0, clics: 0 };
          serie14.push({ date, vues: j.vues, clics: j.clics });
        }

        setDonnees({
          vues30,
          tendancePct: vuesPrec > 0 ? Math.round(((vues30 - vuesPrec) / vuesPrec) * 100) : null,
          uniques30,
          clics30,
          depense30,
          actives: activesLegacy + activesCampagnes,
          detailStatuts: detail.join(' · '),
          solde,
          autonomieJours:
            solde != null && depense30 > 0 ? Math.max(0, Math.round(solde / (depense30 / 30))) : null,
          serie14,
          lignes,
        });
      } catch (error) {
        console.error('Chargement tableau de bord annonceur :', error);
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [authLoading, admin, isSuperAdmin, scopedEditionIds]);

  // ── Répartition de la dépense + note comparative (dérivées des lignes) ──
  const repartition = useMemo(() => {
    if (!donnees) return [];
    return donnees.lignes.slice(0, 6);
  }, [donnees]);

  const comparaison = useMemo(() => {
    if (!donnees) return null;
    const mesurees = donnees.lignes
      .filter((l) => (l.uniques30 ?? 0) > 0 && l.depense30 > 0)
      .map((l) => ({ ...l, cout: l.depense30 / (l.uniques30 as number) }))
      .sort((a, b) => a.cout - b.cout);
    if (mesurees.length < 2) return null;
    const meilleure = mesurees[0];
    const autre = mesurees[mesurees.length - 1];
    if (Math.round(meilleure.cout) >= Math.round(autre.cout)) return null;
    return { meilleure, autre };
  }, [donnees]);

  const exporterConsolide = async () => {
    if (!donnees || exportEnCours) return;
    setExportEnCours(true);
    try {
      const octets = await genererRapportConsolidePdf({
        structure: admin?.displayName || admin?.email || 'Annonceur',
        periode: '30 derniers jours',
        tuiles: [
          ['Vues livrées', donnees.vues30.toLocaleString('fr-FR')],
          ['Personnes touchées', donnees.uniques30 > 0 ? donnees.uniques30.toLocaleString('fr-FR') : '—'],
          ['Clics', donnees.clics30.toLocaleString('fr-FR')],
          ['Dépense engagée', fcfa(donnees.depense30)],
          ['Mises en visibilité actives', String(donnees.actives)],
        ],
        lignes: donnees.lignes.map((l) => ({
          titre: l.titre,
          format: l.format === 'carte' ? 'Carte' : 'Édition',
          vues: l.vues30.toLocaleString('fr-FR'),
          personnes: l.uniques30 != null ? l.uniques30.toLocaleString('fr-FR') : '—',
          clicsCtr: `${l.clics30.toLocaleString('fr-FR')}${l.vues30 > 0 ? ` · ${((l.clics30 / l.vues30) * 100).toFixed(1).replace('.', ',')} %` : ''}`,
          coutPersonne: l.uniques30 ? `${Math.round(l.depense30 / l.uniques30)} FCFA` : '—',
          depense: fcfa(l.depense30),
        })),
      });
      telechargerRapport(octets, `rapport-consolide-${jourLocal(0)}.pdf`);
    } catch (error) {
      console.error(error);
      toast.error('Export impossible — réessayez.');
    } finally {
      setExportEnCours(false);
    }
  };

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }
  if (!donnees) {
    return <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Chargement impossible — rechargez la page.</p>;
  }

  const d = donnees;
  const totalDepense = repartition.reduce((s, l) => s + l.depense30, 0);
  const maxDepense = Math.max(...repartition.map((l) => l.depense30), 1);
  const prochaineCloture = (() => {
    const maintenant = new Date();
    const premier = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1);
    return premier.toLocaleDateString('fr-FR', { month: 'short' });
  })();

  return (
    <div style={{ maxWidth: 1440 }}>
      {/* ═══ En-tête ═══ */}
      <div className="flex items-start justify-between gap-4 flex-wrap" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>Tableau de bord</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 480 }}>
            Vue d’ensemble de vos mises en visibilité — tous formats confondus, sur les 30 derniers
            jours.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void exporterConsolide()}
            disabled={exportEnCours}
            className="flex items-center gap-2"
            style={{
              fontSize: 13, fontWeight: 600, padding: '10px 16px', borderRadius: 10, cursor: 'pointer',
              border: '1px solid rgba(15,28,46,0.15)', background: '#FFFFFF', color: NAVY,
              opacity: exportEnCours ? 0.6 : 1,
            }}
          >
            <Download size={14} /> {exportEnCours ? 'Export…' : 'Rapport consolidé (PDF)'}
          </button>
          <Link
            href="/annonceur/nouvelle"
            className="flex items-center gap-2"
            style={{
              fontSize: 13, fontWeight: 700, padding: '10px 16px', borderRadius: 10,
              background: ORANGE, color: NAVY, textDecoration: 'none',
            }}
          >
            <Plus size={15} /> Nouvelle mise en visibilité
          </Link>
        </div>
      </div>

      {/* ═══ Tuiles ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" style={{ marginBottom: 16 }}>
        <Tuile
          Icon={Eye}
          libelle="Vues livrées"
          valeur={d.vues30.toLocaleString('fr-FR')}
          detail={
            d.tendancePct != null ? (
              <>
                <strong style={{ color: d.tendancePct >= 0 ? '#2E7D32' : '#C62828' }}>
                  {d.tendancePct >= 0 ? '+' : ''}{d.tendancePct} %
                </strong>{' '}
                vs 30 jours précédents
              </>
            ) : (
              'Pas encore de base de comparaison'
            )
          }
        />
        <Tuile
          Icon={Users}
          libelle="Personnes touchées"
          valeur={d.uniques30 > 0 ? d.uniques30.toLocaleString('fr-FR') : '—'}
          detail={
            d.uniques30 > 0 && d.vues30 > 0
              ? `${(d.vues30 / d.uniques30).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} vue${d.vues30 / d.uniques30 >= 2 ? 's' : ''} par joueur en moyenne`
              : 'Mesurées sur les campagnes du wizard'
          }
        />
        <Tuile
          Icon={MousePointerClick}
          libelle="Clics"
          valeur={d.clics30.toLocaleString('fr-FR')}
          detail={
            d.vues30 > 0 ? (
              <>
                CTR moyen{' '}
                <strong style={{ color: NAVY }}>
                  {((d.clics30 / d.vues30) * 100).toFixed(1).replace('.', ',')} %
                </strong>
              </>
            ) : (
              'Aucune vue sur la période'
            )
          }
        />
        <Tuile
          Icon={Coins}
          libelle="Dépense engagée"
          valeur={fcfa(d.depense30)}
          detail="Sur 30 jours · facturée à la vue réelle"
          accent
        />
        <Tuile
          Icon={LayoutGrid}
          libelle="Mises en visibilité"
          valeur={`${d.actives}`}
          suffixe="actives"
          detail={d.detailStatuts || 'Aucune en modération ni en pause'}
        />
        <Tuile
          Icon={Users}
          libelle="Coût par personne touchée"
          valeur={d.uniques30 > 0 ? `${Math.round(d.depense30 / d.uniques30)}` : '—'}
          suffixe={d.uniques30 > 0 ? 'FCFA' : undefined}
          detail="Toutes campagnes confondues"
        />
        <Tuile
          Icon={Wallet}
          libelle="Solde du compte"
          valeur={d.solde != null ? d.solde.toLocaleString('fr-FR') : '—'}
          suffixe={d.solde != null ? 'FCFA' : undefined}
          detail={
            d.autonomieJours != null ? (
              <>
                Environ <strong style={{ color: NAVY }}>{d.autonomieJours} jours</strong> de diffusion au
                rythme actuel
              </>
            ) : (
              'Alimentez le compte auprès de CONCREE'
            )
          }
        />
        <Tuile
          Icon={CalendarClock}
          libelle="Prochaine clôture"
          valeur={`1ᵉʳ ${prochaineCloture}`}
          detail="Reçu détaillé disponible à cette date"
        />
      </div>

      {/* ═══ Courbe + répartition ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ marginBottom: 16 }}>
        <div className="lg:col-span-3" style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '18px 20px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>Vues et clics par jour</h2>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '2px 0 12px' }}>
            Toutes mises en visibilité confondues · 14 derniers jours
          </p>
          <CourbeQuotidienne serie={d.serie14} />
        </div>

        <div className="lg:col-span-2" style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '18px 20px', alignSelf: 'start' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>Répartition de la dépense</h2>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '2px 0 14px' }}>
            Par mise en visibilité, sur 30 jours
          </p>
          {repartition.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              Aucune diffusion sur la période.
            </p>
          )}
          {repartition.map((l) => (
            <div key={l.cle} className="flex items-center gap-3" style={{ padding: '7px 0' }}>
              <span style={{ fontSize: 12, color: NAVY, width: 130, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.titre}>
                {l.titre}
              </span>
              <span style={{ flex: 1, height: 7, borderRadius: 4, background: 'rgba(15,28,46,0.07)', overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', borderRadius: 4, background: NAVY, width: `${Math.max(2, (l.depense30 / maxDepense) * 100)}%` }} />
              </span>
              <span style={{ width: 62, textAlign: 'right', flexShrink: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: NAVY }}>{compact(l.depense30)}</span>
                <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                  {l.depense30 === 0
                    ? l.sousTitre.includes('pause') ? 'en pause' : '0'
                    : totalDepense > 0 ? `${((l.depense30 / totalDepense) * 100).toFixed(1).replace('.', ',')} %` : ''}
                </span>
              </span>
            </div>
          ))}
          {comparaison && (
            <p style={{ fontSize: 11.5, color: '#5A4A1A', background: 'rgba(245,166,35,0.09)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, padding: '10px 12px', marginTop: 12, lineHeight: 1.55 }}>
              ⓘ <strong style={{ color: NAVY }}>{comparaison.meilleure.titre.slice(0, 40)}</strong> revient à{' '}
              {Math.round(comparaison.meilleure.cout)} FCFA par personne touchée, contre{' '}
              {Math.round(comparaison.autre.cout)} FCFA pour {comparaison.autre.titre.slice(0, 40)} — à
              budget égal, la première touche plus de joueurs.
            </p>
          )}
        </div>
      </div>

      {/* ═══ Performance comparée ═══ */}
      <div style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '18px 20px' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 4 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>Performance comparée</h2>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
              Les lignes avec rapport détaillé s’ouvrent au clic.
            </p>
          </div>
          <Link href="/annonceur" style={{ fontSize: 12.5, fontWeight: 700, color: '#B87A0C', textDecoration: 'none' }}>
            Toutes les mises en visibilité
          </Link>
        </div>
        {d.lignes.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 10 }}>
            Aucune diffusion sur les 30 derniers jours —{' '}
            <Link href="/annonceur/nouvelle" style={{ color: '#B87A0C', fontWeight: 700 }}>
              lancez votre première mise en visibilité
            </Link>
            .
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ fontSize: 10.5, letterSpacing: 0.6, color: 'var(--color-text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 12px 8px', fontWeight: 600 }}>MISE EN VISIBILITÉ</th>
                  <th style={{ padding: '10px 12px 8px', fontWeight: 600 }}>FORMAT</th>
                  <th style={{ padding: '10px 12px 8px', fontWeight: 600, textAlign: 'right' }}>VUES</th>
                  <th style={{ padding: '10px 12px 8px', fontWeight: 600, textAlign: 'right' }}>PERSONNES TOUCHÉES</th>
                  <th style={{ padding: '10px 12px 8px', fontWeight: 600, textAlign: 'right' }}>CLICS · CTR</th>
                  <th style={{ padding: '10px 12px 8px', fontWeight: 600, textAlign: 'right' }}>COÛT / PERSONNE</th>
                  <th style={{ padding: '10px 12px 8px', fontWeight: 600, textAlign: 'right' }}>DÉPENSE</th>
                </tr>
              </thead>
              <tbody>
                {d.lignes.map((l) => {
                  const contenu = (
                    <>
                      <td style={{ padding: '11px 12px' }}>
                        <span style={{ display: 'block', fontWeight: 700, color: NAVY, maxWidth: 330, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.titre}>
                          {l.titre}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{l.sousTitre}</span>
                      </td>
                      <td style={{ padding: '11px 12px' }}>
                        <span
                          style={{
                            fontSize: 11, fontWeight: 700, borderRadius: 8, padding: '3px 10px',
                            border: `1px solid ${l.format === 'edition' ? 'rgba(245,166,35,0.5)' : 'rgba(15,28,46,0.18)'}`,
                            background: l.format === 'edition' ? 'rgba(245,166,35,0.1)' : '#FFFFFF',
                            color: l.format === 'edition' ? '#B87A0C' : NAVY,
                          }}
                        >
                          {l.format === 'edition' ? 'Édition' : 'Carte'}
                        </span>
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>{l.vues30.toLocaleString('fr-FR')}</td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        {l.uniques30 != null ? l.uniques30.toLocaleString('fr-FR') : '—'}
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        {l.clics30.toLocaleString('fr-FR')}
                        {l.vues30 > 0 && ` · ${((l.clics30 / l.vues30) * 100).toFixed(1).replace('.', ',')} %`}
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                        {l.uniques30 ? `${Math.round(l.depense30 / l.uniques30)} FCFA` : '—'}
                      </td>
                      <td style={{ padding: '11px 12px', textAlign: 'right', fontWeight: 800, color: NAVY }}>
                        {l.depense30.toLocaleString('fr-FR')} F
                      </td>
                    </>
                  );
                  return l.href ? (
                    <tr
                      key={l.cle}
                      style={{ borderTop: '1px solid rgba(15,28,46,0.07)', cursor: 'pointer' }}
                      onClick={() => {
                        window.location.href = l.href!;
                      }}
                    >
                      {contenu}
                    </tr>
                  ) : (
                    <tr key={l.cle} style={{ borderTop: '1px solid rgba(15,28,46,0.07)' }}>
                      {contenu}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Tuile({
  Icon,
  libelle,
  valeur,
  suffixe,
  detail,
  accent,
}: {
  Icon: typeof Eye;
  libelle: string;
  valeur: string;
  suffixe?: string;
  detail: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        background: accent ? 'rgba(245,166,35,0.07)' : '#FFFFFF',
        border: `1px solid ${accent ? 'rgba(245,166,35,0.45)' : 'rgba(15,28,46,0.08)'}`,
        borderRadius: 14,
        padding: '15px 17px',
      }}
    >
      <div className="flex items-center gap-2" style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>
        <Icon size={13} /> {libelle}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: NAVY, lineHeight: 1.1 }}>
        {valeur}
        {suffixe && (
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-muted)', marginLeft: 6 }}>{suffixe}</span>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 7, lineHeight: 1.45 }}>{detail}</div>
    </div>
  );
}
