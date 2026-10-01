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
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Eye, LayoutGrid, MousePointerClick, Plus, RotateCcw, Trash2, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getEditions, getEditionsByIds } from '@/lib/firestore-service';
import {
  chargerEspaceAnnonceur,
  fcfa,
  type EspaceAnnonceur,
  type MiseEnVisibilite,
  type StatutVisibilite,
} from '@/lib/annonceur-service';
import { getMesCampagnes, relancerCampagne, supprimerBrouillon } from '@/lib/campaign-service';
import { finExclusivite, joursRestants } from '@/lib/reservations';
import type { Campaign, CampaignStatus } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import VignetteCarte from '@/components/annonceur/VignetteCarte';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

/**
 * Statut d'une campagne → statut de ligne.
 *
 * `StatutVisibilite` ne connaît que trois états (active, en pause, objectif
 * atteint) : il vient du modèle habillage, qui n'a pas de cycle de validation.
 * Les états propres au wizard (brouillon, modération, refus) sont rabattus sur
 * le plus proche, et le libellé exact reste affiché par la ligne elle-même.
 */
const STATUT_DEPUIS_CAMPAGNE: Record<CampaignStatus, StatutVisibilite> = {
  draft: 'en_pause',
  in_review: 'en_pause',
  active: 'active',
  paused: 'en_pause',
  suspended: 'en_pause',
  rejected: 'objectif_atteint',
  ended: 'objectif_atteint',
};

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

  /**
   * UN SEUL TABLEAU pour tout ce que l'annonceur diffuse.
   *
   * Les campagnes du wizard vivaient dans une section « en préparation »
   * séparée, sous le tableau : une campagne ACTIVE y apparaissait comme une
   * simple ligne de liste, sans période, sans progression vers l'objectif,
   * sans dépense. Deux endroits à consulter pour une même question — « où en
   * sont mes diffusions ? ».
   *
   * Chaque campagne devient donc une ligne du tableau, au même format qu'une
   * visibilité. L'ordre suit l'urgence de lecture : ce qui diffuse d'abord,
   * ce qui attend une action ensuite, ce qui est clos en dernier.
   */
  const lignes = useMemo(() => {
    const depuisEditions = espace?.visibilites ?? [];

    // Une campagne pilotant déjà un habillage est DÉJÀ dans `visibilites` :
    // la rajouter ici la dupliquerait, comme au tableau de bord.
    const editionsPilotees = new Set(
      campagnes
        .filter((c) => c.format === 'edition' && c.editionSkin?.editionId)
        .map((c) => c.editionSkin!.editionId)
    );

    const depuisCampagnes: MiseEnVisibilite[] = campagnes.map((c) => ({
      id: c.id,
      format: c.format === 'edition' ? 'edition' : 'carte',
      editionId: c.editionSkin?.editionId ?? '',
      editionName: c.editionSkin?.editionId ?? '',
      titre:
        c.card?.rectoText?.trim() ||
        `Édition ${c.editionSkin?.editionId ?? '—'} — ${c.editionSkin?.structure || 'habillage'}`,
      structure: c.card?.structure || c.editionSkin?.structure || '—',
      kind: c.card?.kind === 'financement' ? 'funding' : 'opportunity',
      statut: STATUT_DEPUIS_CAMPAGNE[c.status],
      vues: 0,
      objectifVues: c.viewsGoal ?? null,
      clics: 0,
      saves: 0,
      flips: 0,
      pricePerView: c.pricing?.perView ?? null,
      depenseFcfa: 0,
      debutMs: c.period?.startAt ?? null,
      finMs: c.period?.endAt ?? finExclusivite(c.reservationMonths),
      card: undefined,
      campagne: c,
    }));

    /*
      ═══ REPLIAGE DES RELANCES ═══

      Relancer une campagne terminée en crée une copie (`relanceDe` pointe vers
      l'originale). Sans ce repliage, la liste affichait DEUX lignes au titre
      identique — l'ancienne « Terminée » et la copie « En modération » — sans
      rien pour les distinguer : l'annonceur ne pouvait pas savoir laquelle
      diffuse.

      On ne supprime PAS l'ancienne : ses vues et sa dépense sont la trace de
      ce qui lui a été facturé, et la supprimer effacerait une facture. On la
      retire de la liste principale et on la rattache à sa relance, qui affiche
      alors « 2e diffusion » — l'historique reste accessible par le rapport.

      `relanceDe` pointe toujours vers la campagne SOURCE (cf.
      `relancerCampagne`), donc une campagne relancée trois fois replie trois
      lignes en une, sans escalier.
    */
    const relanceesVers = new Map<string, number>();
    for (const c of campagnes) {
      if (!c.relanceDe) continue;
      relanceesVers.set(c.relanceDe, (relanceesVers.get(c.relanceDe) ?? 0) + 1);
    }

    const toutes = [
      ...depuisEditions.filter((v) => !(v.format === 'edition' && editionsPilotees.has(v.editionId))),
      ...depuisCampagnes,
    ]
      // Une campagne qui a été relancée sort de la liste : sa relance la
      // représente désormais.
      .filter((v) => !(v.campagne && relanceesVers.has(v.campagne.id)))
      // La relance porte son rang de diffusion (2e, 3e…) pour que l'annonceur
      // sache qu'il s'agit d'une reprise et non d'un doublon.
      .map((v) =>
        v.campagne?.relanceDe
          ? { ...v, rangRelance: (relanceesVers.get(v.campagne.relanceDe) ?? 0) + 1 }
          : v
      );

    // Ce qui diffuse en tête, ce qui demande une action ensuite, le clos après.
    const rang = (v: MiseEnVisibilite) => {
      const st = v.campagne?.status;
      if (st === 'active' || v.statut === 'active') return 0;
      if (st === 'in_review') return 1;
      if (st === 'paused' || st === 'suspended' || v.statut === 'en_pause') return 2;
      if (st === 'draft') return 3;
      return 4;
    };
    return toutes.sort((a, b) => rang(a) - rang(b) || b.vues - a.vues);
  }, [espace, campagnes]);

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  const s = espace?.synthese;

  return (
    <div style={{ maxWidth: 1440 }}>
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
                  <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>
                    DÉPENSE ENGAGÉE
                  </th>
                  <th style={{ padding: '8px 20px', fontWeight: 600 }} />
                </tr>
              </thead>
              <tbody>
                {lignes.map((v) => (
                  <LigneVisibilite
                    key={v.id}
                    v={v}
                    onSupprime={(id) => setCampagnes((liste) => liste.filter((x) => x.id !== id))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}

const STATUTS_CAMPAGNE: Record<CampaignStatus, { libelle: string; fond: string; texte: string }> = {
  draft: { libelle: 'Brouillon', fond: 'rgba(15,28,46,0.06)', texte: '#5A6A7E' },
  in_review: { libelle: 'En modération', fond: 'rgba(245,166,35,0.15)', texte: '#B87A0C' },
  active: { libelle: 'Active', fond: 'rgba(46,160,67,0.12)', texte: '#2EA043' },
  paused: { libelle: 'En pause', fond: 'rgba(15,28,46,0.08)', texte: '#5A6A7E' },
  // Rouge et non gris : contrairement à une pause, une suspension appelle une
  // action de l'annonceur (relever le plafond, recharger). La rendre neutre
  // reviendrait à lui cacher que sa diffusion s'est arrêtée toute seule.
  suspended: { libelle: 'Suspendue', fond: 'rgba(220,60,60,0.10)', texte: '#C0392B' },
  rejected: { libelle: 'Refusée', fond: 'rgba(220,60,60,0.10)', texte: '#C0392B' },
  ended: { libelle: 'Terminée', fond: 'rgba(15,28,46,0.06)', texte: '#5A6A7E' },
};

function LigneCampagne({ c, onSupprime }: { c: Campaign; onSupprime: (id: string) => void }) {
  const statut = STATUTS_CAMPAGNE[c.status];
  const [suppression, setSuppression] = useState(false);

  /**
   * Supprime un BROUILLON — le seul état que les règles Firestore laissent
   * effacer à l'annonceur. Une campagne soumise ou diffusée garde sa trace :
   * elle a été vue par CONCREE, et pour une diffusée, facturée.
   *
   * Confirmation explicite : un brouillon peut représenter un long travail de
   * rédaction, et rien ne permet de le récupérer ensuite.
   */
  const supprimer = async () => {
    if (!window.confirm(`Supprimer définitivement ce brouillon ?\n\nCette action est irréversible.`)) return;
    setSuppression(true);
    try {
      await supprimerBrouillon(c.id);
      toast.success('Brouillon supprimé.');
      onSupprime(c.id);
    } catch {
      toast.error('Suppression impossible.');
      setSuppression(false);
    }
  };
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
        {/*
          * Échéance de l'exclusivité — l'information manquait entièrement :
          * l'annonceur payait des mois sans jamais voir combien il lui en
          * restait. Affichée uniquement sur une campagne qui DIFFUSE : sur une
          * campagne terminée ou refusée, un décompte n'aurait aucun sens.
          */}
        {(c.status === 'active' || c.status === 'paused' || c.status === 'suspended') &&
          (() => {
            const fin = c.period?.endAt ?? finExclusivite(c.reservationMonths);
            const jours = joursRestants(fin);
            if (jours === null) return null;
            // Sous 15 jours, le décompte passe en orange : c'est le moment où
            // renouveler devient une décision, pas une information.
            const urgent = jours <= 15;
            return (
              <div style={{ fontSize: 11.5, color: urgent ? '#B87A0C' : 'var(--color-text-muted)', marginTop: 2 }}>
                {jours === 0
                  ? 'Période terminée — diffusion arrêtée.'
                  : `Encore ${jours} jour${jours > 1 ? 's' : ''} de diffusion · jusqu’au ${new Date(fin as number).toLocaleDateString('fr-FR')}`}
              </div>
            );
          })()}
        {c.status === 'rejected' && c.review?.motifRefus && (
          <div style={{ fontSize: 11.5, color: '#C0392B', marginTop: 2 }}>
            Motif : {c.review.motifRefus}
          </div>
        )}
        {c.status === 'suspended' && c.suspension && (
          <div style={{ fontSize: 11.5, color: '#C0392B', marginTop: 2 }}>
            {c.suspension.motif === 'plafond-atteint'
              ? `Plafond de ${c.budgetCapFcfa.toLocaleString('fr-FR')} FCFA atteint — relevez-le pour reprendre la diffusion.`
              : 'Solde insuffisant — rechargez votre compte pour reprendre la diffusion.'}
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
        {/*
          * Un brouillon se REPREND (wizard, écriture autorisée) ; une campagne
          * déjà soumise s'OUVRE en rapport (lecture seule — les règles
          * Firestore refusent l'écriture au-delà de `in_review`).
          */}
        {c.status !== 'draft' && (
          <Link
            // Même règle qu'au tableau de bord : un habillage d'édition a son
            // écran de détail complet ; `/annonceur/campagne/...` est le
            // rapport minimal réservé aux campagnes carte.
            href={
              c.format === 'edition' && c.editionSkin?.editionId
                ? `/annonceur/${encodeURIComponent(`${c.editionSkin.editionId}~edition`)}`
                : `/annonceur/campagne/${encodeURIComponent(c.id)}`
            }
            style={{
              fontSize: 12, fontWeight: 600, color: NAVY, textDecoration: 'none',
              border: '1px solid var(--color-card-border)', borderRadius: 8, padding: '5px 10px',
            }}
          >
            Voir le rapport
          </Link>
        )}
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
        {c.status === 'draft' && (
          <button
            type="button"
            onClick={() => void supprimer()}
            disabled={suppression}
            title="Supprimer ce brouillon"
            style={{
              fontSize: 12, fontWeight: 600, color: '#C0392B', background: '#FFFFFF',
              border: '1px solid rgba(192,57,43,0.25)', borderRadius: 8, padding: '5px 9px',
              cursor: suppression ? 'default' : 'pointer', opacity: suppression ? 0.5 : 1,
              display: 'inline-flex', alignItems: 'center',
            }}
          >
            <Trash2 size={13} />
          </button>
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

function LigneVisibilite({ v, onSupprime }: { v: MiseEnVisibilite; onSupprime: (id: string) => void }) {
  const statut = STATUTS[v.statut];
  const progression =
    v.objectifVues && v.objectifVues > 0 ? Math.min(100, (v.vues / v.objectifVues) * 100) : null;

  /** Campagne d'origine — absente pour une ligne dérivée d'un habillage posé à la main. */
  const c = v.campagne;
  const [suppression, setSuppression] = useState(false);
  /** Copie en cours : désactive le bouton le temps de l'écriture. */
  const [enRelance, setEnRelance] = useState(false);
  const router = useRouter();

  /**
   * Destination du clic : l'écran de détail d'une mise en visibilité quand
   * elle existe, le rapport de campagne sinon. Une campagne carte n'a pas
   * d'équivalent `MiseEnVisibilite` — son identifiant ne se parse pas.
   */
  const lien =
    c && c.format === 'card'
      ? `/annonceur/campagne/${encodeURIComponent(c.id)}`
      : `/annonceur/${encodeURIComponent(v.id)}`;

  /** Suppression d'un brouillon — irréversible, d'où la confirmation. */
  const supprimer = async () => {
    if (!c) return;
    if (!window.confirm('Supprimer définitivement ce brouillon ?\n\nCette action est irréversible.')) return;
    setSuppression(true);
    try {
      await supprimerBrouillon(c.id);
      toast.success('Brouillon supprimé.');
      onSupprime(c.id);
    } catch {
      toast.error('Suppression impossible.');
      setSuppression(false);
    }
  };

  /*
    ═══ LE STATUT STOCKÉ PEUT MENTIR — on le corrige à l'affichage ═══

    Le passage en `ended` est posé par `/api/annonceur/entretien`, déclenché à
    la main : aucun cron ne l'appelle. Une campagne dont la période s'est
    terminée garde donc `status: 'active'` jusqu'à ce que quelqu'un pense à
    lancer l'entretien.

    Résultat constaté le 28/09/2026 : une ligne affichait « ● Active » dans la
    colonne STATUT et « Terminée » dans la colonne PÉRIODE — deux colonnes de
    la même ligne se contredisant, sur l'écran où l'annonceur vérifie si sa
    diffusion tourne encore.

    On fait donc dire à l'affichage ce qui est VRAI : période close = terminée.
    Ce n'est pas un pansement sur l'entretien — le feed filtre lui aussi sur la
    période désormais (cf. `publierFeed`), donc rien ne diffuse plus. C'est
    simplement l'écran qui cesse d'affirmer le contraire.
  */
  /**
   * Relance : copie le contenu dans un brouillon, puis ouvre le wizard dessus.
   *
   * On n'envoie PAS directement en modération : l'annonceur doit choisir ses
   * nouvelles dates (pour une édition, le créneau d'origine peut être pris) et
   * garde l'occasion de corriger un texte avant de resoumettre.
   */
  const relancer = async () => {
    if (!c || enRelance) return;
    setEnRelance(true);
    try {
      const nouvelId = await relancerCampagne(c);
      toast.success('Copie créée — choisissez vos nouvelles dates.');
      router.push(`/annonceur/nouvelle?id=${encodeURIComponent(nouvelId)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Relance impossible.');
      setEnRelance(false);
    }
  };

  const finCampagne = v.finMs;
  const periodeClose = typeof finCampagne === 'number' && finCampagne < Date.now();
  const statutReel = c?.status ?? null;
  const statutAffiche: CampaignStatus | null =
    periodeClose && (statutReel === 'active' || statutReel === 'paused') ? 'ended' : statutReel;
  const statutMeta = statutAffiche ? STATUTS_CAMPAGNE[statutAffiche] : statut;
  const libelleStatut = statutMeta.libelle;

  return (
    <tr
      style={{ borderTop: '1px solid var(--color-card-border)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(15,28,46,0.025)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <td style={{ padding: '12px 20px' }}>
        <Link
          href={lien}
          className="flex items-center gap-2.5"
          style={{ textDecoration: 'none' }}
        >
          {/* Repère visuel : l'annonceur reconnaît sa campagne sans relire le
              titre, surtout quand plusieurs commencent par « Édition… ». */}
          <VignetteCarte
            format={v.format}
            kind={v.campagne?.card?.kind ?? v.kind}
            photoUrl={v.campagne?.editionSkin?.photoUrl ?? v.sponsor?.imageUrl}
          />
          <span style={{ minWidth: 0 }}>
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
            {/* Reprise d'une campagne terminée : sans cette mention, la ligne
                est indiscernable d'une campagne créée de zéro, alors que ses
                compteurs repartent bien à zéro pour cette diffusion-ci. */}
            {v.rangRelance && (
              <span style={{ color: '#B87A0C', fontWeight: 600 }}>
                {' '}· {v.rangRelance}<sup>e</sup> diffusion
              </span>
            )}
          </div>
          </span>
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
            background: statutMeta.fond,
            color: statutMeta.texte,
            whiteSpace: 'nowrap',
          }}
        >
          {/* Libellé EXACT de la campagne quand il y en a une : la table de
              correspondance rabat « brouillon » et « en modération » sur
              « en pause », ce qui serait faux à l'écran. */}
          ● {libelleStatut}
        </span>
      </td>
      {/*
        * PÉRIODE — « En continu » était écrit EN DUR, quelle que soit la
        * campagne : l'annonceur ne pouvait pas savoir combien de temps il lui
        * restait, alors que c'est précisément la colonne prévue pour le dire.
        */}
      <td style={{ padding: '12px 12px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
        {(() => {
          const jours = joursRestants(v.finMs);
          if (jours === null) return 'En continu';
          if (jours === 0) return <span style={{ color: '#8A94A6' }}>Terminée</span>;
          return (
            <>
              <span style={{ color: jours <= 15 ? '#B87A0C' : undefined, fontWeight: jours <= 15 ? 700 : 400 }}>
                Encore {jours} j
              </span>
              <span style={{ display: 'block', fontSize: 10.5, color: 'var(--color-text-muted)' }}>
                jusqu’au {new Date(v.finMs as number).toLocaleDateString('fr-FR')}
              </span>
            </>
          );
        })()}
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
      <td style={{ padding: '12px 12px', textAlign: 'right', color: NAVY, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {v.depenseFcfa != null ? fcfa(v.depenseFcfa) : '—'}
      </td>
      {/*
        * Actions de la ligne — le geste dépend de l'état, pas du format.
        * Un brouillon se REPREND (wizard, écriture autorisée) ; tout le reste
        * s'OUVRE en rapport. La suppression ne vaut que pour un brouillon :
        * les règles Firestore refusent d'effacer au-delà.
        */}
      <td style={{ padding: '12px 20px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {c?.status === 'draft' ? (
          <span className="inline-flex items-center gap-1.5">
            <Link
              href={`/annonceur/nouvelle?id=${encodeURIComponent(c.id)}`}
              style={{
                fontSize: 12, fontWeight: 600, color: NAVY, textDecoration: 'none',
                border: '1px solid var(--color-card-border)', borderRadius: 8, padding: '5px 10px',
              }}
            >
              Reprendre
            </Link>
            <button
              type="button"
              onClick={() => void supprimer()}
              disabled={suppression}
              title="Supprimer ce brouillon"
              style={{
                fontSize: 12, fontWeight: 600, color: '#C0392B', background: '#FFFFFF',
                border: '1px solid rgba(192,57,43,0.25)', borderRadius: 8, padding: '5px 9px',
                cursor: suppression ? 'default' : 'pointer', opacity: suppression ? 0.5 : 1,
                display: 'inline-flex', alignItems: 'center',
              }}
            >
              <Trash2 size={13} />
            </button>
          </span>
        ) : (
          <span className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
            {/*
              RELANCER — visible seulement quand la diffusion est réellement
              finie (`statutAffiche`, qui tient compte d'une période close même
              si l'entretien n'est pas passé).

              On duplique au lieu de prolonger : repousser la date de fin d'une
              campagne close mélangerait ses vues et sa dépense passées à une
              nouvelle diffusion, rendant son rapport illisible. Cf.
              `relancerCampagne()`.
            */}
            {c && statutAffiche === 'ended' && (
              <button
                type="button"
                onClick={() => void relancer()}
                disabled={enRelance}
                className="flex items-center gap-1.5"
                style={{
                  fontSize: 12, fontWeight: 600, color: NAVY,
                  border: '1px solid var(--color-card-border)', borderRadius: 8,
                  padding: '5px 10px', background: '#FFFFFF',
                  cursor: enRelance ? 'default' : 'pointer', opacity: enRelance ? 0.6 : 1,
                }}
                title="Créer une nouvelle campagne reprenant ce contenu, avec de nouvelles dates"
              >
                <RotateCcw size={13} /> {enRelance ? 'Copie…' : 'Relancer'}
              </button>
            )}
            <Link
              href={lien}
              style={{
                fontSize: 12, fontWeight: 600, color: NAVY, textDecoration: 'none',
                border: '1px solid var(--color-card-border)', borderRadius: 8, padding: '5px 10px',
              }}
            >
              Voir le rapport
            </Link>
          </span>
        )}
      </td>
    </tr>
  );
}
