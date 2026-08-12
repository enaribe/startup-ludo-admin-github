'use client';

/**
 * SponsorCardDetail — écran de performance d'UNE carte sponsor.
 *
 * POURQUOI un écran dédié : dans la liste, les chiffres de visibilité tenaient
 * sur une ligne et passaient inaperçus. Or c'est l'information que le partenaire
 * paie — elle mérite sa page, avec la place de montrer l'entonnoir, la
 * progression vers l'objectif acheté, le budget consommé et la projection.
 *
 * RÈGLE D'HONNÊTETÉ : l'entonnoir est affiché même à zéro (grisé, mention « en
 * attente de diffusion ») pour que le sponsor voie la structure de ce qui sera
 * mesuré, mais AUCUN chiffre n'est inventé — un 0 est présenté comme une
 * absence de diffusion, jamais comme un échec.
 */

import {
  ArrowLeft,
  Bookmark,
  Coins,
  Eye,
  MousePointerClick,
  Pencil,
  Star,
  TrendingUp,
} from 'lucide-react';
import type { SponsorEventCard } from '@/types';
import type { SponsorCardKind } from '@/components/sponsor/SponsorCardPreview';
import SponsorCardPreview from '@/components/sponsor/SponsorCardPreview';
import type { SponsorCardMetrics } from '@/lib/sponsor-metrics-service';
import {
  CASES_PAR_TYPE_PAR_PARTIE,
  CHANCE_CARTE_SPONSOR,
  JOUEURS_PAR_PARTIE,
  PARTIES_PAR_JOUR,
  PRIX_PAR_VUE_FCFA,
  formatDuree,
  formatFcfa,
  formatNombre,
} from '@/lib/sponsor-pricing';

interface SponsorCardDetailProps {
  card: SponsorEventCard;
  kind: SponsorCardKind;
  editionName: string;
  /** Métriques de CETTE carte ; `null` si elle n'a jamais été vue. */
  metrics: SponsorCardMetrics | null;
  /** Vues cumulées des cartes du même type (pour situer celle-ci). */
  vuesDuLot: number;
  /** Nombre de cartes exploitables du même type (elles se partagent les tirages). */
  nbCartesDuType: number;
  /** Objectif de vues acheté au niveau de l'édition (0 si non défini). */
  viewsGoal: number;
  /** Prix unitaire figé sur la campagne. */
  pricePerView: number;
  onEdit: () => void;
  onBack: () => void;
}

export default function SponsorCardDetail({
  card,
  kind,
  editionName,
  metrics,
  vuesDuLot,
  nbCartesDuType,
  viewsGoal,
  pricePerView,
  onEdit,
  onBack,
}: SponsorCardDetailProps) {
  const vues = metrics?.views ?? 0;
  const clics = metrics?.clicks ?? 0;
  const sauvegardes = metrics?.saves ?? 0;
  const diffusee = vues > 0;

  // Projection : capacité du type partagée entre les cartes exploitables.
  const capaciteType = CASES_PAR_TYPE_PAR_PARTIE[kind] * CHANCE_CARTE_SPONSOR;
  const part = nbCartesDuType > 0 ? Math.min(1, 1 / nbCartesDuType) : 0;
  const vuesParPartie = capaciteType * part * JOUEURS_PAR_PARTIE;
  const partiesPourMille = vuesParPartie > 0 ? Math.ceil(1000 / vuesParPartie) : 0;
  const joursPourMille = vuesParPartie > 0 ? partiesPourMille / PARTIES_PAR_JOUR : 0;

  const progression = viewsGoal > 0 ? Math.min(100, (vues / viewsGoal) * 100) : 0;
  const partDuLot = vuesDuLot > 0 ? (vues / vuesDuLot) * 100 : 0;
  const meta = META[kind];

  return (
    <div>
      {/* En-tête */}
      <div className="flex items-start gap-3 mb-6">
        <button
          onClick={onBack}
          className="flex items-center justify-center"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            flexShrink: 0,
            marginTop: 2,
            background: 'var(--color-surface)',
            color: 'var(--color-text-secondary)',
            border: 'none',
            cursor: 'pointer',
          }}
          aria-label="Retour aux cartes"
        >
          <ArrowLeft size={17} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 23, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Performance de la carte
            </h1>
            <span
              className="badge"
              style={{ background: 'var(--color-surface)', color: meta.couleur, fontWeight: 700 }}
            >
              {meta.label}
            </span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
            {editionName} · {diffusee ? 'en diffusion' : 'en attente de diffusion'}
          </p>
        </div>
        <button className="btn-secondary flex items-center gap-1.5" onClick={onEdit} style={{ fontSize: 12.5 }}>
          <Pencil size={13} />
          Modifier
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
        {/* ============ COLONNE GAUCHE : les chiffres ============ */}
        <div className="flex flex-col gap-5">
          {/* Entonnoir */}
          <section className="glass-card p-5">
            <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
              Parcours des joueurs
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
              {diffusee
                ? 'Ce que la carte a réellement produit depuis sa mise en diffusion.'
                : 'Voici ce qui sera mesuré dès que la carte apparaîtra en partie. Aucune donnée pour l’instant — rien n’est facturé.'}
            </p>

            <div className="flex flex-col gap-2.5">
              <EtapeEntonnoir
                icone={<Eye size={14} />}
                label="Vues en partie"
                valeur={vues}
                largeur={100}
                couleur="#152941"
                actif={diffusee}
              />
              <ConversionEntreEtapes valeur={vues > 0 ? (clics / vues) * 100 : null} />
              <EtapeEntonnoir
                icone={<MousePointerClick size={14} />}
                label="Clics sur le lien"
                valeur={clics}
                largeur={vues > 0 ? Math.max(14, (clics / vues) * 100) : 62}
                couleur="#2F5C8F"
                actif={diffusee}
              />
              <ConversionEntreEtapes valeur={clics > 0 ? (sauvegardes / clics) * 100 : null} />
              <EtapeEntonnoir
                icone={<Bookmark size={14} />}
                label="Opportunités sauvegardées"
                valeur={sauvegardes}
                largeur={vues > 0 ? Math.max(10, (sauvegardes / vues) * 100) : 34}
                couleur="var(--color-primary)"
                actif={diffusee}
                texteSombre
              />
            </div>

            {!card.linkUrl?.trim() && (
              <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 14, lineHeight: 1.6 }}>
                Cette carte n’a pas de lien : les joueurs ne peuvent ni cliquer ni sauvegarder
                l’opportunité. Ajoutez un lien pour activer ces deux étapes.
              </p>
            )}

            {metrics && metrics.lastSeenAt > 0 && (
              <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 14 }}>
                Dernière apparition en partie le{' '}
                {new Date(metrics.lastSeenAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
          </section>

          {/* Progression vers l'objectif acheté */}
          {viewsGoal > 0 && (
            <section className="glass-card p-5">
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 12 }}>
                Objectif de la campagne
              </h2>
              <div className="flex items-center justify-between" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  <strong style={{ color: 'var(--color-text-primary)' }}>{formatNombre(vues)}</strong> /{' '}
                  {formatNombre(viewsGoal)} vues livrées
                </span>
                <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                  facturé à ce jour :{' '}
                  <strong style={{ color: 'var(--color-text-primary)' }}>{formatFcfa(vues * pricePerView)}</strong> sur{' '}
                  {formatFcfa(viewsGoal * pricePerView)}
                </span>
              </div>
              <div
                style={{
                  height: 8,
                  borderRadius: 999,
                  background: 'var(--color-surface-variant)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progression}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: 'var(--color-primary)',
                    transition: 'width .3s ease',
                  }}
                />
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 10, lineHeight: 1.6 }}>
                L’objectif est défini pour l’ensemble de l’édition : toutes vos cartes y contribuent.
                {vuesDuLot > 0 && diffusee && (
                  <>
                    {' '}
                    Cette carte représente <strong>{partDuLot.toFixed(0)} %</strong> des vues de vos
                    cartes {meta.label.toLowerCase()}.
                  </>
                )}
              </p>
            </section>
          )}

          {/* Projection */}
          <section className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={15} color="var(--color-text-muted)" />
              <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Ce qui est attendu
              </h2>
            </div>
            {vuesParPartie > 0 ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Chiffre
                    valeur={formatNombre(Math.round(vuesParPartie * 10) / 10)}
                    label={`vue${vuesParPartie >= 2 ? 's' : ''} par partie`}
                  />
                  <Chiffre valeur={formatNombre(partiesPourMille)} label="parties pour 1 000 vues" />
                  <Chiffre valeur={formatDuree(joursPourMille)} label="pour livrer 1 000 vues" />
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 14, lineHeight: 1.65 }}>
                  Calcul : sur les cases {meta.label.toLowerCase()}, une carte sponsor sort{' '}
                  <strong>{Math.round(CHANCE_CARTE_SPONSOR * 100)} %</strong> du temps ; vos{' '}
                  <strong>{nbCartesDuType}</strong> carte{nbCartesDuType > 1 ? 's' : ''} de ce type se
                  partage{nbCartesDuType > 1 ? 'nt' : ''} ces tirages, sur une partie à{' '}
                  {JOUEURS_PAR_PARTIE} joueurs. Estimation à {formatNombre(PARTIES_PAR_JOUR)} parties
                  par jour — à ajuster selon l’activité réelle de l’édition.
                </p>
              </>
            ) : (
              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                Cette carte ne peut pas être diffusée en l’état : ajoutez-lui un message pour qu’elle
                entre dans les tirages.
              </p>
            )}
          </section>
        </div>

        {/* ============ COLONNE DROITE : la carte telle qu'elle est vue ============ */}
        <div className="flex flex-col gap-3" style={{ position: 'sticky', top: 16 }}>
          <p
            style={{
              fontSize: 10.5,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              color: 'var(--color-text-muted)',
              fontWeight: 600,
            }}
          >
            Vue par le joueur
          </p>
          <SponsorCardPreview card={card} kind={kind} defaultTokens={kind === 'opportunity' ? 2 : 4} />
        </div>
      </div>
    </div>
  );
}

const META: Record<SponsorCardKind, { label: string; couleur: string; icone: React.ReactNode }> = {
  opportunity: { label: 'Opportunité', couleur: 'var(--color-event-opportunity)', icone: <Star size={13} /> },
  funding: { label: 'Financement', couleur: 'var(--color-event-funding)', icone: <Coins size={13} /> },
};

/** Une barre de l'entonnoir. Grisée tant que la carte n'a pas été diffusée. */
function EtapeEntonnoir({
  icone,
  label,
  valeur,
  largeur,
  couleur,
  actif,
  texteSombre = false,
}: {
  icone: React.ReactNode;
  label: string;
  valeur: number;
  largeur: number;
  couleur: string;
  actif: boolean;
  texteSombre?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        width: `${largeur}%`,
        minWidth: 210,
        background: actif ? couleur : 'var(--color-surface-variant)',
        color: actif ? (texteSombre ? '#0C243E' : '#FFFFFF') : 'var(--color-text-muted)',
        borderRadius: 8,
        padding: '10px 14px',
        gap: 12,
        opacity: actif ? 1 : 0.75,
      }}
    >
      <span className="flex items-center gap-2" style={{ fontSize: 12.5 }}>
        {icone}
        {label}
      </span>
      <strong style={{ fontSize: 15 }}>{formatNombre(valeur)}</strong>
    </div>
  );
}

/** Taux de passage entre deux étapes ; masqué tant qu'il n'est pas calculable. */
function ConversionEntreEtapes({ valeur }: { valeur: number | null }) {
  return (
    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', paddingLeft: 14 }}>
      {valeur === null ? '↓' : `↓ ${valeur.toFixed(1).replace('.', ',')} % de l’étape précédente`}
    </span>
  );
}

/** Un chiffre de projection. */
function Chiffre({ valeur, label }: { valeur: string; label: string }) {
  return (
    <div>
      <div style={{ fontSize: 21, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
        {valeur}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}
