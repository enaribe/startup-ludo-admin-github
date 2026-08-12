'use client';

/**
 * SponsorCardWizard — création / édition guidée d'une carte sponsor.
 *
 * POURQUOI ce composant plutôt que `SponsorCardListEditor` : ce dernier est une
 * liste de champs, adaptée à un super admin qui sait déjà ce qu'il fait. Depuis
 * que le sponsoring est VENDU au volume de vues, l'écran est montré à des
 * partenaires payants (ADEPME, Mastercard Foundation…) qui découvrent le
 * produit. Trois choses leur manquaient et justifient ce parcours dédié :
 *   1. comprendre ce qu'ils achètent — d'où le rendu de la carte en grand, mis à
 *      jour à la frappe, plutôt qu'une vignette dans un coin ;
 *   2. relier leur saisie à un budget — d'où l'étape « Visibilité & tarif », qui
 *      transforme un objectif de vues en nombre de parties, durée et coût ;
 *   3. être rassurés avant publication — d'où le récapitulatif final.
 *
 * `SponsorCardListEditor` n'est volontairement PAS modifié : il reste utilisé
 * par l'écran super admin `editions/[editionId]/page.tsx`. Les deux coexistent.
 *
 * Le wizard n'écrit rien lui-même : il rend une carte via `onSave`, et c'est
 * l'écran parent qui persiste (autosave sur le champ `sponsor` de l'édition).
 * Cela garde le composant testable et sans dépendance à Firestore.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  Coins,
  Eye,
  Info,
  Star,
  Target,
  Wallet,
} from 'lucide-react';
import type { SponsorEventCard } from '@/types';
import ImageUploadField from '@/components/ui/ImageUploadField';
import SponsorCardPreview, { type SponsorCardKind } from '@/components/sponsor/SponsorCardPreview';
import {
  CHANCE_CARTE_SPONSOR,
  JOUEURS_PAR_PARTIE,
  OBJECTIF_VUES_MAX,
  OBJECTIF_VUES_MIN,
  OBJECTIF_VUES_PAS,
  PARTIES_PAR_JOUR,
  PRIX_PAR_VUE_FCFA,
  estimerDiffusion,
  formatDuree,
  formatFcfa,
  formatNombre,
} from '@/lib/sponsor-pricing';

/** Longueur conseillée du message : au-delà, le texte déborde de la carte mobile. */
const LONGUEUR_CONSEILLEE = 120;
/** Longueur maximale acceptée (garde-fou dur). */
const LONGUEUR_MAX = 200;

/** Jetons attribués par type — règle du jeu, non configurable par le sponsor. */
const JETONS_PAR_TYPE: Record<SponsorCardKind, number> = {
  opportunity: 2,
  funding: 4,
};

interface SponsorCardWizardProps {
  /** Carte en cours d'édition, ou `null` pour une création. */
  card: SponsorEventCard | null;
  /** Type de la carte éditée (ignoré en création : l'étape 1 le demande). */
  kind: SponsorCardKind;
  /** Base du chemin Storage pour le logo. */
  storagePathBase: string;
  /** Objectif de vues courant de l'édition (partagé par toutes les cartes). */
  viewsGoal: number;
  /** Nombre de cartes déjà présentes, par type — sert à l'estimation. */
  nbOpportunites: number;
  nbFinancements: number;
  /** Vues déjà livrées sur l'édition (0 si aucune métrique). */
  vuesActuelles: number;
  onSave: (card: SponsorEventCard, kind: SponsorCardKind, viewsGoal: number) => void;
  onCancel: () => void;
}

const ETAPES = ['Type', 'Contenu', 'Visibilité & tarif', 'Récapitulatif'] as const;

/** Identifiant stable d'une nouvelle carte (même forme que l'éditeur existant). */
function nouvelId(): string {
  return `sponsor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function SponsorCardWizard({
  card,
  kind: kindInitial,
  storagePathBase,
  viewsGoal: viewsGoalInitial,
  nbOpportunites,
  nbFinancements,
  vuesActuelles,
  onSave,
  onCancel,
}: SponsorCardWizardProps) {
  const isEdition = card !== null;
  // En édition on saute l'étape « Type » : changer le type d'une carte déjà
  // diffusée fausserait ses statistiques (les vues resteraient attachées à un
  // type qu'elle n'a plus).
  const [etape, setEtape] = useState(isEdition ? 1 : 0);
  const [kind, setKind] = useState<SponsorCardKind>(kindInitial);
  const [brouillon, setBrouillon] = useState<SponsorEventCard>(
    () => card ?? { id: nouvelId(), text: '', tokens: JETONS_PAR_TYPE[kindInitial], logoUrl: '', linkUrl: '' }
  );
  const [viewsGoal, setViewsGoal] = useState(viewsGoalInitial || 10_000);

  // Les jetons suivent le type tant que le sponsor n'a pas figé la carte :
  // c'est une règle du jeu, pas un réglage — on évite un champ de plus.
  useEffect(() => {
    setBrouillon((prev) => ({ ...prev, tokens: JETONS_PAR_TYPE[kind] }));
  }, [kind]);

  const texte = brouillon.text.trim();
  const aDuTexte = texte.length > 0;

  // L'estimation compte la carte en cours si elle est exploitable : le sponsor
  // doit voir l'effet de SA carte sur la diffusion, pas celle des autres seules.
  const estimation = useMemo(() => {
    const ajout = aDuTexte && !isEdition ? 1 : 0;
    return estimerDiffusion({
      objectifVues: viewsGoal,
      nbOpportunites: nbOpportunites + (kind === 'opportunity' ? ajout : 0),
      nbFinancements: nbFinancements + (kind === 'funding' ? ajout : 0),
    });
  }, [viewsGoal, nbOpportunites, nbFinancements, kind, aDuTexte, isEdition]);

  // On ne laisse pas publier une carte sans texte : côté jeu elle ne serait
  // jamais tirée, le sponsor paierait un emplacement fantôme.
  const peutAvancer = etape !== 1 || aDuTexte;
  const derniereEtape = etape === ETAPES.length - 1;

  const valider = () => {
    if (!aDuTexte) return;
    onSave({ ...brouillon, text: texte }, kind, viewsGoal);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
      {/* ================= COLONNE GAUCHE : parcours ================= */}
      <div className="flex flex-col gap-5">
        {/* Navigation libre entre étapes : on n'exige la saisie du texte que
            pour VALIDER la carte, pas pour consulter la visibilité. */}
        <Stepper etape={etape} onAller={setEtape} verrouilleType={isEdition} />

        {etape === 0 && <EtapeType kind={kind} onChange={setKind} />}

        {etape === 1 && (
          <EtapeContenu
            brouillon={brouillon}
            onChange={(patch) => setBrouillon((prev) => ({ ...prev, ...patch }))}
            storagePath={`${storagePathBase}-${brouillon.id}`}
          />
        )}

        {etape === 2 && (
          <EtapeVisibilite
            viewsGoal={viewsGoal}
            onChange={setViewsGoal}
            estimation={estimation}
            vuesActuelles={vuesActuelles}
          />
        )}

        {etape === 3 && (
          <EtapeRecap
            brouillon={brouillon}
            kind={kind}
            viewsGoal={viewsGoal}
            estimation={estimation}
          />
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="btn-secondary flex items-center gap-2"
            onClick={() => (etape === (isEdition ? 1 : 0) ? onCancel() : setEtape(etape - 1))}
            style={{ fontSize: 13 }}
          >
            <ArrowLeft size={14} />
            {etape === (isEdition ? 1 : 0) ? 'Annuler' : 'Précédent'}
          </button>

          <div className="flex items-center gap-3">
            {!peutAvancer && (
              <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                Le message de la carte est obligatoire.
              </span>
            )}
            <button
              type="button"
              className="btn-primary flex items-center gap-2"
              onClick={() => (derniereEtape ? valider() : setEtape(etape + 1))}
              disabled={!peutAvancer}
              style={{ fontSize: 13, opacity: peutAvancer ? 1 : 0.5 }}
            >
              {derniereEtape ? (
                <>
                  <Check size={14} />
                  {isEdition ? 'Enregistrer la carte' : 'Publier la carte'}
                </>
              ) : (
                <>
                  Continuer
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ================= COLONNE DROITE : la carte en grand ================= */}
      <div className="flex flex-col gap-3" style={{ position: 'sticky', top: 16 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            color: 'var(--color-text-muted)',
          }}
        >
          Ce que voit le joueur
        </p>
        <div className="flex justify-center">
          <SponsorCardPreview card={brouillon} kind={kind} defaultTokens={JETONS_PAR_TYPE[kind]} />
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
          Aperçu mis à jour à chaque frappe. Le gain de{' '}
          <strong>+{JETONS_PAR_TYPE[kind]} jetons</strong> est fixé par les règles du jeu.
          {brouillon.linkUrl?.trim()
            ? ' Avec un lien, le joueur peut sauvegarder l’opportunité et la retrouver dans son profil.'
            : ' Sans lien, le joueur ne pourra pas sauvegarder votre opportunité.'}
        </p>
      </div>
    </div>
  );
}

/** Fil d'étapes numérotées. Les étapes déjà franchies restent cliquables. */
function Stepper({
  etape,
  onAller,
  verrouilleType,
}: {
  etape: number;
  onAller: (index: number) => void;
  verrouilleType: boolean;
}) {
  return (
    <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
      {ETAPES.map((label, i) => {
        const actif = i === etape;
        const franchi = i < etape;
        const desactive = verrouilleType && i === 0;
        return (
          <div key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => !desactive && onAller(i)}
              // Toutes les étapes restent atteignables (sauf « Type » verrouillé
              // en modification) : en édition de carte, le sponsor doit pouvoir
              // sauter directement à « Visibilité & tarif » sans re-parcourir le
              // formulaire — c'est l'info qu'il vient chercher le plus souvent.
              disabled={desactive}
              className="flex items-center gap-2"
              style={{
                padding: '6px 12px',
                borderRadius: 999,
                border: `1px solid ${actif ? 'transparent' : 'var(--color-card-border)'}`,
                background: actif ? 'var(--color-primary)' : franchi ? 'var(--color-success-light)' : '#FFFFFF',
                color: actif ? '#0C243E' : franchi ? 'var(--color-success)' : 'var(--color-text-muted)',
                cursor: !desactive && i < etape ? 'pointer' : 'default',
                fontSize: 12.5,
                fontWeight: actif ? 700 : 500,
                opacity: desactive ? 0.45 : 1,
              }}
            >
              <span
                className="flex items-center justify-center"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  fontSize: 10.5,
                  fontWeight: 800,
                  background: actif ? 'rgba(12,36,62,0.14)' : franchi ? 'var(--color-success)' : 'var(--color-surface-variant)',
                  color: actif ? '#0C243E' : franchi ? '#FFFFFF' : 'var(--color-text-muted)',
                }}
              >
                {franchi ? <Check size={11} /> : i + 1}
              </span>
              {label}
            </button>
            {i < ETAPES.length - 1 && (
              <span style={{ width: 14, height: 1, background: 'var(--color-card-border)' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Étape 1 — type de carte, avec la différence de gain expliquée. */
function EtapeType({ kind, onChange }: { kind: SponsorCardKind; onChange: (k: SponsorCardKind) => void }) {
  const options = [
    {
      key: 'opportunity' as const,
      titre: 'Opportunité',
      icone: <Star size={18} />,
      couleur: 'var(--color-event-opportunity)',
      texte:
        'Appel à candidatures, programme d’accompagnement, formation. Le joueur découvre votre dispositif au moment où il cherche à avancer.',
    },
    {
      key: 'funding' as const,
      titre: 'Financement',
      icone: <Coins size={18} />,
      couleur: 'var(--color-event-funding)',
      texte:
        'Subvention, prêt, garantie, ligne de crédit. Tirée quand le joueur cherche à financer son projet — le moment le plus qualifié de la partie.',
    },
  ];

  return (
    <div className="glass-card p-6 flex flex-col gap-4">
      <TitreEtape
        titre="Quel type de carte souhaitez-vous créer ?"
        sous="Ce choix détermine le bandeau de la carte et le gain en jetons du joueur."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((o) => {
          const actif = kind === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              className="flex flex-col gap-2 text-left"
              style={{
                padding: 16,
                borderRadius: 12,
                border: `1.5px solid ${actif ? o.couleur : 'var(--color-card-border)'}`,
                background: actif ? 'var(--color-surface)' : '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              <span className="flex items-center gap-2" style={{ color: o.couleur }}>
                {o.icone}
                <strong style={{ fontSize: 14, color: 'var(--color-text-primary)' }}>{o.titre}</strong>
                {actif && <Check size={15} style={{ marginLeft: 'auto', color: o.couleur }} />}
              </span>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{o.texte}</p>
              <span
                className="badge"
                style={{ alignSelf: 'flex-start', background: 'var(--color-success-light)', color: 'var(--color-success)' }}
              >
                +{JETONS_PAR_TYPE[o.key]} jetons pour le joueur
              </span>
            </button>
          );
        })}
      </div>

      <Encart ton="info">
        Le financement rapporte <strong>+4 jetons</strong> contre <strong>+2</strong> pour une opportunité :
        c’est un moment plus fort de la partie, et votre carte y est perçue comme un coup de pouce décisif.
        Ce gain fait partie des règles du jeu et n’est pas modifiable.
      </Encart>
    </div>
  );
}

/** Étape 2 — message, logo et lien de la carte. */
function EtapeContenu({
  brouillon,
  onChange,
  storagePath,
}: {
  brouillon: SponsorEventCard;
  onChange: (patch: Partial<SponsorEventCard>) => void;
  storagePath: string;
}) {
  const longueur = brouillon.text.length;
  const tropLong = longueur > LONGUEUR_CONSEILLEE;

  return (
    <div className="glass-card p-6 flex flex-col gap-5">
      <TitreEtape
        titre="Le contenu de votre carte"
        sous="Le message doit se lire comme un événement que le joueur vient de vivre, pas comme un slogan."
      />

      <div>
        <label className="label">Message de la carte</label>
        <textarea
          className="input-field"
          rows={3}
          maxLength={LONGUEUR_MAX}
          placeholder="Ex. Le DER t’accorde une subvention de 1 500 000 FCFA pour lancer ton projet !"
          value={brouillon.text}
          onChange={(e) => onChange({ text: e.target.value })}
          style={{ resize: 'vertical' }}
        />
        <div className="flex items-center justify-between" style={{ marginTop: 4 }}>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
            Formulez à la deuxième personne, comme le jeu : « Tu bénéficies de… », « Tu es sélectionné pour… ».
          </p>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: tropLong ? 'var(--color-warning)' : 'var(--color-text-muted)',
              flexShrink: 0,
            }}
          >
            {longueur} / {LONGUEUR_CONSEILLEE}
          </span>
        </div>
        {tropLong && (
          <p style={{ fontSize: 11.5, color: 'var(--color-warning)', marginTop: 4 }}>
            Au-delà de {LONGUEUR_CONSEILLEE} caractères, le texte devient dense sur un écran mobile.
            Vérifiez l’aperçu à droite.
          </p>
        )}
      </div>

      <ImageUploadField
        label="Logo affiché sur la carte (optionnel)"
        value={brouillon.logoUrl || ''}
        onChange={(url) => onChange({ logoUrl: url })}
        storagePath={storagePath}
        aspectRatio="square"
      />

      <div>
        <label className="label">Lien de l’opportunité (optionnel)</label>
        <input
          className="input-field"
          type="url"
          placeholder="https://… (page de candidature, site du programme)"
          value={brouillon.linkUrl || ''}
          onChange={(e) => onChange({ linkUrl: e.target.value })}
        />
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
          Avec un lien, un bouton « Sauvegarder » apparaît sur la carte : le joueur retrouve
          l’opportunité dans son profil après la partie, et son clic est compté.
        </p>
      </div>
    </div>
  );
}

/** Étape 3 — objectif de vues, estimation et coût. C'est l'étape qui vend. */
function EtapeVisibilite({
  viewsGoal,
  onChange,
  estimation,
  vuesActuelles,
}: {
  viewsGoal: number;
  onChange: (v: number) => void;
  estimation: ReturnType<typeof estimerDiffusion>;
  vuesActuelles: number;
}) {
  return (
    <div className="glass-card p-6 flex flex-col gap-5">
      <TitreEtape
        titre="Visibilité et tarif"
        sous="Vous achetez un volume de vues. La diffusion s’arrête d’elle-même une fois l’objectif atteint."
      />

      <div>
        <label className="label">Objectif de vues</label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={OBJECTIF_VUES_MIN}
            max={OBJECTIF_VUES_MAX}
            step={OBJECTIF_VUES_PAS}
            value={viewsGoal}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            style={{ flex: 1, accentColor: 'var(--color-primary)' }}
          />
          <input
            className="input-field"
            type="number"
            min={OBJECTIF_VUES_MIN}
            max={OBJECTIF_VUES_MAX}
            step={OBJECTIF_VUES_PAS}
            value={viewsGoal}
            onChange={(e) => onChange(Math.max(0, parseInt(e.target.value, 10) || 0))}
            style={{ width: 130, flexShrink: 0 }}
          />
        </div>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
          L’objectif est commun à toutes vos cartes de cette édition : elles se partagent le volume acheté.
          {vuesActuelles > 0 && ` ${formatNombre(vuesActuelles)} vues ont déjà été livrées.`}
        </p>
      </div>

      {/* Chiffres clés de l'estimation */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Chiffre
          icone={<Target size={15} />}
          valeur={estimation.aucuneCarte ? '—' : formatNombre(estimation.partiesNecessaires)}
          label="parties nécessaires"
        />
        <Chiffre
          icone={<Eye size={15} />}
          valeur={estimation.aucuneCarte ? '—' : formatDuree(estimation.joursEstimes)}
          label="durée estimée"
        />
        <Chiffre
          icone={<Wallet size={15} />}
          valeur={formatFcfa(estimation.coutTotal)}
          label="coût total"
          accent
        />
      </div>

      {/* Explication du calcul — l'estimation ne doit pas être une boîte noire. */}
      <Encart ton="info">
        Sur une case financement, votre carte a{' '}
        <strong>{Math.round(CHANCE_CARTE_SPONSOR * 100)} % de chance</strong> d’être tirée à la place
        d’une carte classique, et une même carte n’apparaît qu’une fois par partie. Avec vos cartes
        actuelles, une partie à {JOUEURS_PAR_PARTIE} joueurs génère en moyenne{' '}
        <strong>{estimation.vuesParPartie.toFixed(1)} vues</strong> : il faut donc{' '}
        {estimation.aucuneCarte ? '—' : formatNombre(estimation.partiesNecessaires)} parties pour livrer{' '}
        {formatNombre(viewsGoal)} vues, soit {formatDuree(estimation.joursEstimes)} au rythme actuel
        d’environ {PARTIES_PAR_JOUR} parties par jour.
      </Encart>

      <div
        className="flex items-center justify-between"
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          background: 'var(--color-surface)',
          fontSize: 12.5,
          color: 'var(--color-text-secondary)',
        }}
      >
        <span>
          Tarif appliqué : <strong style={{ color: 'var(--color-text-primary)' }}>{PRIX_PAR_VUE_FCFA} FCFA</strong> par vue
        </span>
        <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
          Aucun frais fixe — vous ne payez que les vues livrées.
        </span>
      </div>

      {estimation.aucuneCarte && (
        <Encart ton="alerte">
          Aucune carte exploitable pour l’instant : tant qu’aucune carte n’a de message, rien ne peut
          être diffusé et aucune vue ne sera facturée.
        </Encart>
      )}

      {estimation.opportunitesNonDiffusables && (
        <Encart ton="alerte">
          Attention : le plateau de jeu ne comporte aujourd’hui <strong>aucune case « opportunité »</strong>.
          Vos cartes opportunité ne seront donc pas tirées en partie — seules les cartes
          <strong> financement</strong> sont réellement diffusées. L’estimation ci-dessus en tient compte.
        </Encart>
      )}
    </div>
  );
}

/** Étape 4 — récapitulatif avant publication. */
function EtapeRecap({
  brouillon,
  kind,
  viewsGoal,
  estimation,
}: {
  brouillon: SponsorEventCard;
  kind: SponsorCardKind;
  viewsGoal: number;
  estimation: ReturnType<typeof estimerDiffusion>;
}) {
  const lignes: { cle: string; valeur: string }[] = [
    { cle: 'Type de carte', valeur: kind === 'opportunity' ? 'Opportunité (+2 jetons)' : 'Financement (+4 jetons)' },
    { cle: 'Message', valeur: brouillon.text.trim() || '—' },
    { cle: 'Logo', valeur: brouillon.logoUrl ? 'Ajouté' : 'Aucun logo' },
    {
      cle: 'Lien',
      valeur: brouillon.linkUrl?.trim() || 'Aucun — le joueur ne pourra pas sauvegarder',
    },
    { cle: 'Objectif de vues', valeur: `${formatNombre(viewsGoal)} vues` },
    {
      cle: 'Diffusion estimée',
      valeur: estimation.aucuneCarte
        ? '—'
        : `${formatNombre(estimation.partiesNecessaires)} parties · ${formatDuree(estimation.joursEstimes)}`,
    },
    { cle: 'Coût total', valeur: formatFcfa(estimation.coutTotal) },
  ];

  return (
    <div className="glass-card p-6 flex flex-col gap-4">
      <TitreEtape
        titre="Récapitulatif avant publication"
        sous="Vérifiez une dernière fois : la carte entre dans le tirage dès l’enregistrement."
      />

      <div className="flex flex-col">
        {lignes.map((l, i) => (
          <div
            key={l.cle}
            className="flex items-start gap-4"
            style={{
              padding: '10px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--color-card-border)',
            }}
          >
            <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)', width: 150, flexShrink: 0 }}>
              {l.cle}
            </span>
            <span style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.55 }}>
              {l.valeur}
            </span>
          </div>
        ))}
      </div>

      <Encart ton="info">
        Vous pourrez mettre la diffusion en pause à tout moment depuis la liste des cartes, et suivre
        les vues, sauvegardes et clics réellement livrés.
      </Encart>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Éléments partagés
// ═══════════════════════════════════════════════════════════════════════════

function TitreEtape({ titre, sous }: { titre: string; sous: string }) {
  return (
    <div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>{titre}</h3>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 3, lineHeight: 1.6 }}>{sous}</p>
    </div>
  );
}

/** Chiffre clé de l'estimation. */
function Chiffre({
  icone,
  valeur,
  label,
  accent,
}: {
  icone: React.ReactNode;
  valeur: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        background: accent ? 'rgba(255,188,64,0.12)' : 'var(--color-surface)',
        border: `1px solid ${accent ? 'rgba(255,188,64,0.35)' : 'transparent'}`,
      }}
    >
      <span
        className="flex items-center gap-1.5"
        style={{ color: accent ? 'var(--color-primary-dark)' : 'var(--color-text-muted)', fontSize: 11.5 }}
      >
        {icone}
        {label}
      </span>
      <p style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 6 }}>
        {valeur}
      </p>
    </div>
  );
}

/** Encart pédagogique ou d'alerte. */
function Encart({ ton, children }: { ton: 'info' | 'alerte'; children: React.ReactNode }) {
  const alerte = ton === 'alerte';
  return (
    <div
      className="flex items-start gap-2.5"
      style={{
        padding: 14,
        borderRadius: 12,
        background: alerte ? 'var(--color-warning-light)' : 'var(--color-info-light)',
        border: `1px solid ${alerte ? 'rgba(245,166,35,0.3)' : 'rgba(59,130,246,0.22)'}`,
      }}
    >
      <span style={{ color: alerte ? 'var(--color-warning)' : 'var(--color-info)', flexShrink: 0, display: 'flex', marginTop: 1 }}>
        {alerte ? <AlertTriangle size={15} /> : <Info size={15} />}
      </span>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>{children}</p>
    </div>
  );
}
