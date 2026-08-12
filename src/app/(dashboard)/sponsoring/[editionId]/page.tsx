'use client';

/**
 * Espace sponsor — configuration et pilotage du sponsoring d'une édition.
 *
 * POURQUOI cet écran plutôt que l'onglet « Général » de l'édition : celui-ci
 * mêle le sponsoring au contenu pédagogique (quiz, duels, défis…) et n'est
 * ouvert qu'au super admin. Ici, un partenaire externe édite SON sponsoring —
 * et rien d'autre — avec des aperçus temps réel du rendu mobile, parce qu'il
 * n'a aucun moyen de vérifier son visuel dans l'app avant publication.
 *
 * POURQUOI il a changé : le sponsoring est désormais PAYANT, facturé au volume
 * de vues. L'écran ne sert donc plus seulement à saisir du contenu, il doit
 * aussi rendre compte de ce qui a été livré (vues / sauvegardes / clics lus
 * dans `sponsorMetrics`) et de l'état de diffusion. La création d'une carte
 * passe par `SponsorCardWizard`, ouvert en VUE DÉDIÉE plein écran et non en
 * modale : le wizard affiche la carte en grand à côté du formulaire, et une
 * modale (limitée à 85vh, avec son propre défilement) écraserait précisément ce
 * qui fait la valeur du parcours.
 *
 * Sécurité : le périmètre est vérifié côté écran (l'édition doit être dans
 * `scopedEditionIds` du compte) ; les données ne sont pas chargées sinon. Le
 * super admin accède à toutes les éditions, ce qui permet de tester le rendu.
 *
 * Écriture : autosave sur le SEUL champ `sponsor` du document `editions/{id}`
 * (`saveEditionSponsor` fait un updateDoc ciblé). Le contenu de jeu — quizzes,
 * duels, fundings, opportunities, challenges — n'est jamais réécrit, même si un
 * super admin édite l'édition en parallèle. Les métriques, elles, sont en
 * LECTURE SEULE : elles servent de base de facturation et sont écrites par le
 * mobile uniquement.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Bookmark,
  Eye,
  Handshake,
  Info,
  Lock,
  MousePointerClick,
  Pause,
  Play,
  Plus,
  Star,
} from 'lucide-react';
import { getEdition, saveEditionSponsor } from '@/lib/firestore-service';
import { getSponsorMetrics, type SponsorMetricsDocument } from '@/lib/sponsor-metrics-service';
import type { EditionSponsor, SponsorEventCard } from '@/types';
import { useAuth } from '@/lib/auth-context';
import { useAutoSave } from '@/hooks/useAutoSave';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ImageUploadField from '@/components/ui/ImageUploadField';
import SaveStatusIndicator from '@/components/ui/SaveStatusIndicator';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import SponsorPopupPreview from '@/components/sponsor/SponsorPopupPreview';
import type { SponsorCardKind } from '@/components/sponsor/SponsorCardPreview';
import SponsorCardWizard from '@/components/sponsor/SponsorCardWizard';
import SponsorCardList from '@/components/sponsor/SponsorCardList';
import SponsorCardDetail from '@/components/sponsor/SponsorCardDetail';
import {
  ETAT_DIFFUSION_META,
  PRIX_PAR_VUE_FCFA,
  calculerEtatDiffusion,
  formatFcfa,
  formatNombre,
} from '@/lib/sponsor-pricing';
import toast from 'react-hot-toast';

/** Sponsoring vierge — même forme que la valeur par défaut de l'écran édition. */
const EMPTY_SPONSOR: EditionSponsor = {
  enabled: false,
  name: '',
  imageUrl: '',
  logoUrl: '',
  linkUrl: '',
  description: '',
  opportunities: [],
  fundings: [],
};

/** Cible d'ouverture du wizard : création d'un type, ou édition d'une carte. */
type CibleWizard =
  | { mode: 'create'; kind: SponsorCardKind }
  | { mode: 'edit'; kind: SponsorCardKind; card: SponsorEventCard };

export default function SponsoringEditorPage() {
  const params = useParams();
  const editionId = params.editionId as string;
  const { isSuperAdmin, isSponsor, scopedEditionIds, loading: authLoading } = useAuth();

  const [sponsor, setSponsor] = useState<EditionSponsor>(EMPTY_SPONSOR);
  const [editionName, setEditionName] = useState('');
  const [metrics, setMetrics] = useState<SponsorMetricsDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [wizard, setWizard] = useState<CibleWizard | null>(null);
  // Écran de performance d'une carte (ouvert au clic sur une carte de la liste).
  const [detail, setDetail] = useState<{ card: SponsorEventCard; kind: SponsorCardKind } | null>(null);
  const [suppression, setSuppression] = useState<{ card: SponsorEventCard; kind: SponsorCardKind } | null>(null);

  // Périmètre : un sponsor ne peut ouvrir que SES éditions ; le super admin, toutes.
  const inScope = isSuperAdmin || (isSponsor && scopedEditionIds.includes(editionId));

  // Persistance ciblée : uniquement le champ `sponsor` du document édition.
  const persist = useCallback(
    (value: EditionSponsor) => saveEditionSponsor(editionId, value),
    [editionId]
  );
  const { status: saveStatus, flush } = useAutoSave({
    data: sponsor,
    save: persist,
    enabled: inScope && !loading && !notFound,
  });

  useEffect(() => {
    if (authLoading || !inScope) return;
    let cancelled = false;
    (async () => {
      try {
        // Les métriques sont un enrichissement : leur absence ne doit pas
        // empêcher l'édition, d'où la lecture en parallèle et sans throw.
        const [edition, metricsDoc] = await Promise.all([
          getEdition(editionId),
          getSponsorMetrics(editionId),
        ]);
        if (cancelled) return;
        if (!edition) {
          setNotFound(true);
          return;
        }
        setEditionName(edition.name || edition.id);
        setSponsor({ ...EMPTY_SPONSOR, ...(edition.sponsor ?? {}) });
        setMetrics(metricsDoc);
      } catch (error) {
        console.error('Load sponsoring error:', error);
        if (!cancelled) toast.error('Erreur de chargement');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, inScope, editionId]);

  const updateSponsor = (patch: Partial<EditionSponsor>) =>
    setSponsor((prev) => ({ ...prev, ...patch }));

  // Cartes réellement jouables : côté mobile, une carte sans texte n'est jamais tirée.
  const opportunities = useMemo(() => sponsor.opportunities ?? [], [sponsor.opportunities]);
  const fundings = useMemo(() => sponsor.fundings ?? [], [sponsor.fundings]);
  const nbOpportunitesJouables = useMemo(
    () => opportunities.filter((c) => c.text.trim()).length,
    [opportunities]
  );
  const nbFinancementsJouables = useMemo(
    () => fundings.filter((c) => c.text.trim()).length,
    [fundings]
  );

  const vues = metrics?.totals.views ?? 0;
  const etat = calculerEtatDiffusion({
    enabled: sponsor.enabled,
    paused: sponsor.paused,
    viewsGoal: sponsor.viewsGoal,
    vuesActuelles: vues,
  });

  /** Enregistre la carte issue du wizard dans la bonne liste (création ou mise à jour). */
  const enregistrerCarte = (card: SponsorEventCard, kind: SponsorCardKind, viewsGoal: number) => {
    const liste = kind === 'opportunity' ? opportunities : fundings;
    const existe = liste.some((c) => c.id === card.id);
    const suivante = existe ? liste.map((c) => (c.id === card.id ? card : c)) : [...liste, card];

    updateSponsor({
      [kind === 'opportunity' ? 'opportunities' : 'fundings']: suivante,
      viewsGoal,
      // Le prix est figé à la première validation : une campagne déjà vendue ne
      // doit pas changer de tarif si la grille publique évolue ensuite.
      pricePerView: sponsor.pricePerView ?? PRIX_PAR_VUE_FCFA,
      budgetCap: viewsGoal * (sponsor.pricePerView ?? PRIX_PAR_VUE_FCFA),
    });
    setWizard(null);
    toast.success(existe ? 'Carte mise à jour' : 'Carte ajoutée');
  };

  /** Supprime définitivement une carte de sa liste. */
  const supprimerCarte = () => {
    if (!suppression) return;
    const { card, kind } = suppression;
    const liste = kind === 'opportunity' ? opportunities : fundings;
    updateSponsor({
      [kind === 'opportunity' ? 'opportunities' : 'fundings']: liste.filter((c) => c.id !== card.id),
    });
    setSuppression(null);
    toast.success('Carte supprimée');
  };

  if (authLoading || (inScope && loading)) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  }

  // ===== Accès refusé : hors périmètre, aucune donnée n'a été chargée =====
  if (!inScope) {
    return (
      <AccessDenied
        title="Accès refusé"
        message="Cette édition ne fait pas partie de votre périmètre. Contactez l’équipe CONCREE si vous pensez qu’il s’agit d’une erreur."
      />
    );
  }

  if (notFound) {
    return (
      <AccessDenied
        title="Édition introuvable"
        message="Cette édition n’existe plus. Elle a peut-être été supprimée depuis l’assignation de votre compte."
      />
    );
  }

  // ===== Vue dédiée : performance d'une carte =====
  // Placée AVANT le wizard : depuis le détail, « Modifier » ouvre le wizard,
  // et le retour du wizard ramène naturellement au détail encore ouvert.
  if (detail && !wizard) {
    const cartesDuType =
      detail.kind === 'opportunity' ? sponsor.opportunities ?? [] : sponsor.fundings ?? [];
    const vuesDuLot = cartesDuType.reduce(
      (total, c) => total + (metrics?.cards?.[c.id]?.views ?? 0),
      0
    );
    return (
      <SponsorCardDetail
        card={detail.card}
        kind={detail.kind}
        editionName={editionName}
        metrics={metrics?.cards?.[detail.card.id] ?? null}
        vuesDuLot={vuesDuLot}
        nbCartesDuType={cartesDuType.filter((c) => c.text.trim().length > 0).length}
        viewsGoal={sponsor.viewsGoal ?? 0}
        pricePerView={sponsor.pricePerView ?? PRIX_PAR_VUE_FCFA}
        onEdit={() => setWizard({ mode: 'edit', kind: detail.kind, card: detail.card })}
        onBack={() => setDetail(null)}
      />
    );
  }

  // ===== Vue dédiée : wizard de création / édition d'une carte =====
  if (wizard) {
    return (
      <div>
        <div className="flex items-start gap-3 mb-6">
          <button
            type="button"
            onClick={() => setWizard(null)}
            className="flex items-center justify-center"
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0, marginTop: 2,
              background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
              border: 'none', cursor: 'pointer',
            }}
            aria-label="Retour au sponsoring"
          >
            <ArrowLeft size={17} />
          </button>
          <div>
            <h1 style={{ fontSize: 23, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {wizard.mode === 'create' ? 'Créer une carte' : 'Modifier la carte'}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {editionName} · les modifications sont publiées automatiquement
            </p>
          </div>
        </div>

        <SponsorCardWizard
          card={wizard.mode === 'edit' ? wizard.card : null}
          kind={wizard.kind}
          storagePathBase={`editions/${editionId}/sponsor-${wizard.kind === 'opportunity' ? 'opp' : 'fund'}`}
          defaultLogoUrl={sponsor.logoUrl}
          viewsGoal={sponsor.viewsGoal ?? 0}
          nbOpportunites={nbOpportunitesJouables}
          nbFinancements={nbFinancementsJouables}
          vuesActuelles={vues}
          onSave={enregistrerCarte}
          onCancel={() => setWizard(null)}
        />
      </div>
    );
  }

  return (
    <div>
      {/* ===== En-tête : état de diffusion + totaux de l'édition ===== */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex items-start gap-3">
          <Link
            href="/sponsoring"
            onClick={() => { void flush(); }}
            className="flex items-center justify-center"
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0, marginTop: 2,
              background: 'var(--color-surface)', color: 'var(--color-text-secondary)',
            }}
            aria-label="Retour à mes éditions"
          >
            <ArrowLeft size={17} />
          </Link>
          <div>
            <div className="flex items-center gap-2.5" style={{ flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 23, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {editionName}
              </h1>
              <span className={`badge ${ETAT_DIFFUSION_META[etat].badgeClass}`}>
                {ETAT_DIFFUSION_META[etat].label}
              </span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>
              Sponsoring de la thématique · vos modifications sont publiées automatiquement
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3" style={{ flexShrink: 0, marginTop: 8 }}>
          {sponsor.enabled && (
            <button
              type="button"
              onClick={() => updateSponsor({ paused: !sponsor.paused })}
              className="btn-secondary flex items-center gap-1.5"
              style={{ fontSize: 12.5 }}
            >
              {sponsor.paused ? <Play size={13} /> : <Pause size={13} />}
              {sponsor.paused ? 'Reprendre la diffusion' : 'Mettre en pause'}
            </button>
          )}
          <SaveStatusIndicator status={saveStatus} />
        </div>
      </div>

      {/* ===== Bandeau de performance ===== */}
      <PerformancePanel sponsor={sponsor} metrics={metrics} vues={vues} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start" style={{ marginTop: 20 }}>
        {/* ================= COLONNE GAUCHE : formulaire ================= */}
        <div className="flex flex-col gap-5">
          {/* Activation */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-3">
              <label className="label" style={{ marginBottom: 0 }}>Édition sponsorisée</label>
              <button
                type="button"
                onClick={() => updateSponsor({ enabled: !sponsor.enabled })}
                className="relative w-10 h-5 rounded-full transition-colors"
                style={{
                  background: sponsor.enabled ? 'var(--color-success)' : 'var(--color-surface-variant)',
                  border: 'none',
                  cursor: 'pointer',
                }}
                aria-pressed={sponsor.enabled}
              >
                <span
                  className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                  style={{ left: sponsor.enabled ? 22 : 2 }}
                />
              </button>
              <span className={`badge ${sponsor.enabled ? 'badge-success' : 'badge-info'}`} style={{ marginLeft: 'auto' }}>
                {sponsor.enabled ? 'Visible par les joueurs' : 'Non publié'}
              </span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 8, lineHeight: 1.6 }}>
              Une fois activé, un popup s’affiche au choix de cette thématique (badge « Sponsorisé »,
              votre visuel, votre logo et un bouton JOUER), et vos cartes sont injectées pendant la partie.
              Tant que l’option est désactivée, rien n’est visible côté joueur.
            </p>
          </div>

          {/* Identité du sponsor */}
          <div className="glass-card p-6 flex flex-col gap-5">
            <SectionTitle icon={<Handshake size={15} />} title="Votre marque dans le jeu" />

            <div>
              <label className="label">Nom du sponsor</label>
              <input
                className="input-field"
                placeholder="Mastercard Foundation"
                value={sponsor.name}
                onChange={(e) => updateSponsor({ name: e.target.value })}
              />
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Utilisé dans la phrase « Cette thématique est sponsorisée par… ».
              </p>
            </div>

            <ImageUploadField
              label="Visuel du popup (image plein cadre — format portrait conseillé)"
              value={sponsor.imageUrl || ''}
              onChange={(url) => updateSponsor({ imageUrl: url })}
              storagePath={`editions/${editionId}/sponsor`}
              aspectRatio="banner"
            />

            <ImageUploadField
              label="Logo du sponsor (encart « En partenariat avec » — optionnel)"
              value={sponsor.logoUrl || ''}
              onChange={(url) => updateSponsor({ logoUrl: url })}
              storagePath={`editions/${editionId}/sponsor-logo`}
              aspectRatio="square"
            />

            <div>
              <label className="label">Lien « en savoir plus » (optionnel)</label>
              <input
                className="input-field"
                type="url"
                placeholder="https://www.mastercardfdn.org/..."
                value={sponsor.linkUrl || ''}
                onChange={(e) => updateSponsor({ linkUrl: e.target.value })}
              />
            </div>

            <div>
              <label className="label">Description (écran « en savoir plus » — optionnel)</label>
              <textarea
                className="input-field"
                rows={5}
                placeholder="Présentation de votre organisation et de la thématique, affichée quand le joueur appuie sur EN SAVOIR PLUS…"
                value={sponsor.description || ''}
                onChange={(e) => updateSponsor({ description: e.target.value })}
                style={{ resize: 'vertical' }}
              />
            </div>
          </div>

          {/* Cartes injectées en partie */}
          <div className="glass-card p-6 flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
              <SectionTitle icon={<Star size={15} />} title="Vos cartes en partie" />
            </div>

            <BlocCartes
              titre="Opportunités sponsor"
              hint="Tirées à la place d'une opportunité classique (25 % de chance). +2 jetons pour le joueur."
              cards={opportunities}
              kind="opportunity"
              metrics={metrics?.cards ?? null}
              onCreate={() => setWizard({ mode: 'create', kind: 'opportunity' })}
              onEdit={(card) => setDetail({ card, kind: 'opportunity' })}
              onDelete={(card) => setSuppression({ card, kind: 'opportunity' })}
            />

            <div style={{ borderTop: '1px dashed var(--color-card-border)', paddingTop: 18 }}>
              <BlocCartes
                titre="Financements sponsor"
                hint="Tirés à la place d'un financement classique (25 % de chance). +4 jetons pour le joueur."
                cards={fundings}
                kind="funding"
                metrics={metrics?.cards ?? null}
                onCreate={() => setWizard({ mode: 'create', kind: 'funding' })}
                onEdit={(card) => setDetail({ card, kind: 'funding' })}
                onDelete={(card) => setSuppression({ card, kind: 'funding' })}
              />
            </div>
          </div>
        </div>

        {/* ================= COLONNE DROITE : aperçu live (sticky) ================= */}
        <div className="flex flex-col gap-5" style={{ position: 'sticky', top: 24 }}>
          <div className="glass-card p-5">
            <PreviewLabel title="Aperçu du popup mobile" subtitle="Ce que voit le joueur au choix de la thématique" />
            <SponsorPopupPreview editionName={editionName} sponsor={sponsor} />
          </div>

          <MechanicsNote
            opportunityCount={nbOpportunitesJouables}
            fundingCount={nbFinancementsJouables}
          />
        </div>
      </div>

      <ConfirmDialog
        open={suppression !== null}
        title="Supprimer cette carte ?"
        message="La carte ne sera plus tirée en partie. Ses statistiques déjà enregistrées restent conservées."
        confirmLabel="Supprimer"
        onConfirm={supprimerCarte}
        onClose={() => setSuppression(null)}
        danger
      />
    </div>
  );
}

/**
 * Bandeau de performance de l'édition : totaux réels et progression vers
 * l'objectif. Affiche un état vide honnête tant que le mobile n'a rien écrit.
 */
function PerformancePanel({
  sponsor,
  metrics,
  vues,
}: {
  sponsor: EditionSponsor;
  metrics: SponsorMetricsDocument | null;
  vues: number;
}) {
  const objectif = sponsor.viewsGoal ?? 0;
  const prix = sponsor.pricePerView ?? PRIX_PAR_VUE_FCFA;
  const progression = objectif > 0 ? Math.min(100, (vues / objectif) * 100) : 0;

  if (!metrics) {
    return (
      <div
        className="flex items-start gap-2.5 p-5"
        style={{ borderRadius: 14, background: 'var(--color-info-light)', border: '1px solid rgba(59,130,246,0.22)' }}
      >
        <Info size={15} color="var(--color-info)" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
          <strong>Aucune donnée de diffusion pour l’instant.</strong> Les vues, sauvegardes et clics
          apparaîtront ici dès qu’une carte de cette édition aura été vue en partie. Rien n’est
          facturé tant qu’aucune vue n’a été livrée.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-card p-5 flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Total icone={<Eye size={15} />} valeur={formatNombre(metrics.totals.views)} label="vues de cartes" />
        <Total icone={<Bookmark size={15} />} valeur={formatNombre(metrics.totals.saves)} label="sauvegardes" />
        <Total icone={<MousePointerClick size={15} />} valeur={formatNombre(metrics.totals.clicks)} label="clics" />
        <Total
          icone={<Handshake size={15} />}
          valeur={formatNombre(metrics.totals.editionPopupViews)}
          label="vues du popup"
        />
      </div>

      {objectif > 0 && (
        <div>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>{formatNombre(vues)}</strong> /{' '}
              {formatNombre(objectif)} vues
            </span>
            <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              budget consommé : <strong style={{ color: 'var(--color-text-primary)' }}>{formatFcfa(vues * prix)}</strong>{' '}
              sur {formatFcfa(objectif * prix)}
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--color-surface-variant)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${progression}%`,
                height: '100%',
                borderRadius: 999,
                background: progression >= 100 ? 'var(--color-success)' : 'var(--color-primary)',
                transition: 'width 0.3s',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Un total de l'édition. */
function Total({ icone, valeur, label }: { icone: React.ReactNode; valeur: string; label: string }) {
  return (
    <div>
      <span className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
        {icone}
        {label}
      </span>
      <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 4 }}>{valeur}</p>
    </div>
  );
}

/** Un bloc de cartes d'un type, avec son bouton de création. */
function BlocCartes({
  titre,
  hint,
  cards,
  kind,
  metrics,
  onCreate,
  onEdit,
  onDelete,
}: {
  titre: string;
  hint: string;
  cards: SponsorEventCard[];
  kind: SponsorCardKind;
  metrics: SponsorMetricsDocument['cards'] | null;
  onCreate: () => void;
  onEdit: (card: SponsorEventCard) => void;
  onDelete: (card: SponsorEventCard) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <label className="label" style={{ marginBottom: 0 }}>{titre}</label>
        <button
          type="button"
          className="btn-primary flex items-center gap-1.5"
          onClick={onCreate}
          style={{ fontSize: 12, padding: '6px 12px' }}
        >
          <Plus size={13} />
          Créer une carte
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 10 }}>{hint}</p>

      <SponsorCardList cards={cards} kind={kind} metrics={metrics} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

/** Encart pédagogique : rappelle la mécanique de tirage côté jeu. */
function MechanicsNote({ opportunityCount, fundingCount }: { opportunityCount: number; fundingCount: number }) {
  const total = opportunityCount + fundingCount;
  return (
    <div
      className="p-5"
      style={{ borderRadius: 14, background: 'var(--color-info-light)', border: '1px solid rgba(59,130,246,0.22)' }}
    >
      <div className="flex items-center gap-2 mb-2.5">
        <Info size={15} color="var(--color-info)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Comment vos cartes sont tirées
        </span>
      </div>
      <ul style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.65, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li>• Sur chaque case opportunité ou financement, le joueur a <strong>25 % de chance</strong> de tomber sur une de vos cartes plutôt que sur une carte classique.</li>
        <li>• Une même carte n’est <strong>jamais tirée deux fois</strong> dans une même partie : vos cartes d’un même type se partagent les tirages.</li>
        <li>• Une carte <strong>sans texte n’est jamais tirée</strong> : {total} carte{total !== 1 ? 's' : ''} exploitable{total !== 1 ? 's' : ''} actuellement ({opportunityCount} opportunité{opportunityCount !== 1 ? 's' : ''}, {fundingCount} financement{fundingCount !== 1 ? 's' : ''}).</li>
        <li>• Avec un lien, le joueur peut <strong>sauvegarder l’opportunité</strong> et la retrouver dans son profil après la partie.</li>
        <li>• Dès que l’objectif de vues est atteint, la diffusion <strong>s’arrête automatiquement</strong> : rien n’est facturé au-delà.</li>
      </ul>
    </div>
  );
}

/** Titre de section du formulaire. */
function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color: 'var(--color-primary-dark)', display: 'flex' }}>{icon}</span>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</h2>
    </div>
  );
}

/** Intitulé d'un bloc d'aperçu. */
function PreviewLabel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--color-text-muted)' }}>
        {title}
      </p>
      <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{subtitle}</p>
    </div>
  );
}

/** Écran d'accès refusé / introuvable — aucune donnée d'édition n'est affichée. */
function AccessDenied({ title, message }: { title: string; message: string }) {
  return (
    <div className="glass-card p-8 flex flex-col items-center text-center" style={{ maxWidth: 480, margin: '40px auto' }}>
      <div
        className="flex items-center justify-center mb-4"
        style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--color-error-light)', color: 'var(--color-error)' }}
      >
        <Lock size={22} />
      </div>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>{title}</h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', lineHeight: 1.6, marginBottom: 20 }}>{message}</p>
      <Link href="/sponsoring" className="btn-secondary" style={{ fontSize: 13, textDecoration: 'none' }}>
        Retour à mes éditions
      </Link>
    </div>
  );
}
