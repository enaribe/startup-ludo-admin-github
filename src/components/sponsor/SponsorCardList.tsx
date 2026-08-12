'use client';

/**
 * SponsorCardList — liste des cartes sponsor d'une édition avec leurs métriques.
 *
 * POURQUOI ce composant : depuis que le sponsoring est facturé, la liste des
 * cartes n'est plus un simple sommaire d'édition — c'est le tableau de bord que
 * le partenaire consulte pour vérifier ce qu'il a acheté. Chaque ligne doit donc
 * répondre à trois questions : ma carte est-elle diffusée ? combien de fois
 * a-t-elle été vue ? où en est mon budget ?
 *
 * RÈGLE D'HONNÊTETÉ : les métriques viennent de `sponsorMetrics/{editionId}`,
 * écrit par le mobile. Tant que le document n'existe pas ou qu'une carte n'y
 * figure pas, on affiche un état vide explicite (« pas encore vue en partie »).
 * On n'invente JAMAIS de chiffre, et un 0 n'est jamais présenté comme un
 * résultat de diffusion : c'est une base de facturation.
 */

import { BarChart3, Bookmark, Coins, Eye, MousePointerClick, Star, Trash2 } from 'lucide-react';
import type { SponsorEventCard } from '@/types';
import type { SponsorCardKind } from '@/components/sponsor/SponsorCardPreview';
import type { SponsorCardMetrics } from '@/lib/sponsor-metrics-service';
import {
  CASES_PAR_TYPE_PAR_PARTIE,
  CHANCE_CARTE_SPONSOR,
  JOUEURS_PAR_PARTIE,
  PRIX_PAR_VUE_FCFA,
  formatFcfa,
  formatNombre,
} from '@/lib/sponsor-pricing';

/**
 * Visibilité prévisionnelle d'UNE carte, à cadence de diffusion normale.
 *
 * Les cartes d'un même type se partagent les tirages (une seule carte sponsor
 * par case, sans répétition dans la partie) : la part d'une carte est donc la
 * capacité du type divisée par le nombre de cartes qui se la partagent.
 * Sert à répondre à « qu'est-ce que j'achète ? » AVANT la première partie —
 * c'est une projection, jamais présentée comme une mesure.
 */
function projeterVisibiliteCarte(kind: SponsorCardKind, nbCartesDuType: number) {
  const capaciteType = CASES_PAR_TYPE_PAR_PARTIE[kind] * CHANCE_CARTE_SPONSOR;
  const partDeLaCarte = nbCartesDuType > 0 ? Math.min(1, 1 / nbCartesDuType) : 0;
  const vuesParPartie = capaciteType * partDeLaCarte * JOUEURS_PAR_PARTIE;
  return {
    vuesParPartie,
    partiesPourMille: vuesParPartie > 0 ? Math.ceil(1000 / vuesParPartie) : 0,
    coutMille: 1000 * PRIX_PAR_VUE_FCFA,
  };
}

interface SponsorCardListProps {
  cards: SponsorEventCard[];
  kind: SponsorCardKind;
  /** Métriques par id de carte ; `null` si le document n'existe pas encore. */
  metrics: Record<string, SponsorCardMetrics> | null;
  onEdit: (card: SponsorEventCard) => void;
  onDelete: (card: SponsorEventCard) => void;
}

const META: Record<SponsorCardKind, { label: string; couleur: string; icone: React.ReactNode }> = {
  opportunity: { label: 'Opportunité', couleur: 'var(--color-event-opportunity)', icone: <Star size={13} /> },
  funding: { label: 'Financement', couleur: 'var(--color-event-funding)', icone: <Coins size={13} /> },
};

export default function SponsorCardList({ cards, kind, metrics, onEdit, onDelete }: SponsorCardListProps) {
  if (cards.length === 0) {
    return (
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', padding: '10px 0', lineHeight: 1.6 }}>
        Aucune carte {META[kind].label.toLowerCase()} pour l’instant.
      </p>
    );
  }

  // Seules les cartes avec un message sont tirées en jeu : ce sont elles qui se
  // partagent les tirages du type (une carte vide ne dilue donc pas les autres).
  const nbJouables = cards.filter((c) => c.text.trim().length > 0).length;
  const projection = projeterVisibiliteCarte(kind, nbJouables);

  // Total de vues de la liste affichée : sert à situer chaque carte par rapport
  // aux autres (« cette carte représente 60 % des vues de vos financements »).
  const vuesDuLot = cards.reduce((total, c) => total + (metrics?.[c.id]?.views ?? 0), 0);

  return (
    <div className="flex flex-col gap-2.5">
      {cards.map((card) => (
        <LigneCarte
          key={card.id}
          card={card}
          kind={kind}
          metrics={metrics?.[card.id] ?? null}
          docExiste={metrics !== null}
          projection={projection}
          vuesDuLot={vuesDuLot}
          onEdit={() => onEdit(card)}
          onDelete={() => onDelete(card)}
        />
      ))}
    </div>
  );
}

/** Une carte : message, état, métriques réelles et actions. */
function LigneCarte({
  card,
  kind,
  metrics,
  docExiste,
  projection,
  vuesDuLot,
  onEdit,
  onDelete,
}: {
  card: SponsorEventCard;
  kind: SponsorCardKind;
  metrics: SponsorCardMetrics | null;
  docExiste: boolean;
  projection: ReturnType<typeof projeterVisibiliteCarte>;
  /** Vues cumulées des cartes du même type, pour situer celle-ci. */
  vuesDuLot: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = META[kind];
  const texte = card.text.trim();
  // Une carte sans texte n'est jamais tirée côté jeu : le dire tout de suite.
  const jouable = texte.length > 0;

  return (
    <div
      className="p-4"
      style={{
        borderRadius: 12,
        background: '#FFFFFF',
        border: '1px solid var(--color-card-border)',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Logo ou pastille de type */}
        <div
          className="flex items-center justify-center"
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            flexShrink: 0,
            background: card.logoUrl ? '#FFFFFF' : 'var(--color-surface)',
            border: '1px solid var(--color-card-border)',
            color: meta.couleur,
            overflow: 'hidden',
          }}
        >
          {card.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.logoUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : (
            meta.icone
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
            <span
              className="badge"
              style={{ background: 'var(--color-surface)', color: meta.couleur, fontWeight: 700 }}
            >
              {meta.label}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
              +{card.tokens ?? (kind === 'opportunity' ? 2 : 4)} jetons
            </span>
            {!jouable && (
              <span className="badge badge-error">Sans message — jamais tirée</span>
            )}
            {jouable && !card.linkUrl?.trim() && (
              <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>Sans lien</span>
            )}
            {/* Poids de la carte dans son type : répond à « laquelle marche ? »
                sans avoir à comparer les nombres de tête. */}
            {metrics && metrics.views > 0 && vuesDuLot > 0 && (
              <span
                className="badge"
                style={{ background: 'var(--color-surface)', color: 'var(--color-text-secondary)' }}
                title={`${formatNombre(metrics.views)} vues sur ${formatNombre(vuesDuLot)} pour ce type de carte`}
              >
                {((metrics.views / vuesDuLot) * 100).toFixed(0)} % des vues du type
              </span>
            )}
          </div>

          <p
            style={{
              fontSize: 13,
              color: jouable ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
              fontStyle: jouable ? 'normal' : 'italic',
              marginTop: 6,
              lineHeight: 1.55,
            }}
          >
            {jouable ? texte : 'Carte sans message.'}
          </p>

          {/* Parcours réel de la carte — jamais de chiffre inventé.
              Repris du prototype (entonnoir Vues → Clics → Sauvegardes) : le
              sponsor ne veut pas trois nombres côte à côte, il veut savoir OÙ
              ça s'arrête — combien de joueurs vus, combien ont cliqué, combien
              ont gardé l'opportunité. */}
          <div style={{ marginTop: 10 }}>
            {metrics && metrics.views > 0 ? (
              <>
                <Entonnoir metrics={metrics} />
                {metrics.lastSeenAt > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                    Dernière apparition en partie le{' '}
                    {new Date(metrics.lastSeenAt).toLocaleDateString('fr-FR')}
                  </span>
                )}
              </>
            ) : (
              <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                {docExiste
                  ? 'Pas encore vue en partie — la projection ci-dessous indique ce qui est attendu.'
                  : 'Aucune partie jouée sur cette édition — la projection ci-dessous indique ce qui est attendu.'}
              </p>
            )}
          </div>

          {/* Visibilité prévisionnelle — toujours affichée, y compris avant la
              première partie : c'est ce que le sponsor achète, il doit le voir
              sans avoir à ouvrir le wizard. */}
          {jouable && (
            <div
              className="flex items-center gap-4"
              style={{
                marginTop: 10,
                paddingTop: 10,
                borderTop: '1px dashed var(--color-card-border)',
                flexWrap: 'wrap',
                fontSize: 11.5,
                color: 'var(--color-text-secondary)',
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Visibilité prévue
              </span>
              <span>
                ≈ <b>{projection.vuesParPartie.toFixed(1).replace('.', ',')}</b> vue
                {projection.vuesParPartie >= 2 ? 's' : ''} / partie
              </span>
              <span>
                soit ~<b>{formatNombre(projection.partiesPourMille)}</b> parties pour 1 000 vues
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {formatFcfa(projection.coutMille)} / 1 000 vues
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
          <BoutonIcone titre="Voir les performances et modifier" onClick={onEdit}>
            <BarChart3 size={15} />
          </BoutonIcone>
          <BoutonIcone titre="Supprimer la carte" onClick={onDelete} danger>
            <Trash2 size={15} />
          </BoutonIcone>
        </div>
      </div>
    </div>
  );
}

/**
 * Entonnoir de performance d'une carte — repris du prototype.
 *
 * Trois étapes réelles, mesurées côté mobile : la carte est vue en partie, le
 * joueur ouvre le lien, le joueur garde l'opportunité dans son profil. La
 * largeur de chaque barre est proportionnelle aux vues (pas une largeur
 * décorative fixe comme dans la maquette) : on voit immédiatement où ça
 * décroche. Le taux affiché entre deux étapes se lit « part de l'étape
 * précédente ».
 */
function Entonnoir({ metrics }: { metrics: SponsorCardMetrics }) {
  const etapes = [
    { label: 'Vues en partie', valeur: metrics.views, couleur: '#152941', icone: <Eye size={12} /> },
    { label: 'Clics sur le lien', valeur: metrics.clicks, couleur: '#2F5C8F', icone: <MousePointerClick size={12} /> },
    { label: 'Sauvegardes', valeur: metrics.saves, couleur: 'var(--color-primary)', icone: <Bookmark size={12} /> },
  ];

  return (
    <div className="flex flex-col gap-1" style={{ marginBottom: 8 }}>
      {etapes.map((etape, i) => {
        // Proportionnel aux vues, avec un plancher pour rester lisible à 0.
        const largeur = metrics.views > 0 ? Math.max(6, (etape.valeur / metrics.views) * 100) : 6;
        const precedent = i > 0 ? etapes[i - 1]!.valeur : 0;
        const taux = i > 0 && precedent > 0 ? (etape.valeur / precedent) * 100 : null;
        const surPrimaire = etape.couleur === 'var(--color-primary)';
        return (
          <div key={etape.label} className="flex items-center gap-2">
            <div
              className="flex items-center justify-between"
              style={{
                width: `${largeur}%`,
                minWidth: 128,
                background: etape.couleur,
                color: surPrimaire ? '#0C243E' : '#FFFFFF',
                borderRadius: 6,
                padding: '5px 9px',
                fontSize: 11.5,
                gap: 10,
              }}
            >
              <span className="flex items-center gap-1.5" style={{ opacity: 0.92 }}>
                {etape.icone}
                {etape.label}
              </span>
              <strong>{formatNombre(etape.valeur)}</strong>
            </div>
            {taux !== null && (
              <span style={{ fontSize: 10.5, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                {taux.toFixed(1).replace('.', ',')} % de l’étape précédente
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Bouton d'action discret. */
function BoutonIcone({
  titre,
  onClick,
  danger,
  children,
}: {
  titre: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titre}
      aria-label={titre}
      className="flex items-center justify-center"
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        background: 'var(--color-surface)',
        color: danger ? 'var(--color-error)' : 'var(--color-text-secondary)',
      }}
    >
      {children}
    </button>
  );
}
