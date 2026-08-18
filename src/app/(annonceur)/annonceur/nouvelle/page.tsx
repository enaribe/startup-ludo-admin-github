'use client';

/**
 * Nouvelle mise en visibilité — wizard 5 étapes, deux branches (lot 4).
 *
 * Branche A (carte) : Objectif → La carte (aperçu live retournable) → Ciblage
 * → Objectifs & budget (simulation) → Aperçu & validation (consentement).
 * Branche B (édition) : Édition & réservation (calendrier d'exclusivité) →
 * Habillage → Ciblage réduit → Budget → Validation.
 *
 * LE BROUILLON EST LE DOCUMENT : `creerBrouillonCampagne` au choix du format,
 * puis chaque « Suivant » sauvegarde (`sauvegarderBrouillon`). Fermer l'onglet
 * ne perd rien — le brouillon réapparaîtra dans la liste (statut Brouillon).
 * La soumission passe en `in_review` : cartes via une écriture directe (les
 * règles l'autorisent), éditions via la TRANSACTION serveur qui pose aussi
 * l'exclusivité des mois — les deux doivent être atomiques.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CalendarRange,
  CheckCircle2,
  GraduationCap,
  HandCoins,
  Megaphone,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth-context';
import { getEditions } from '@/lib/firestore-service';
import {
  CTA_LIBELLE_MAX,
  GRILLES,
  KIND_PAR_OBJECTIF,
  RECTO_MAX,
  SHORT_TEXT_MAX,
  creerBrouillonCampagne,
  getCampagne,
  getReservationsEdition,
  libelleMois,
  prochainsMois,
  reserverEtSoumettre,
  sauvegarderBrouillon,
  soumettreCampagneCarte,
} from '@/lib/campaign-service';
import type {
  CampaignCard,
  CampaignEditionSkin,
  CampaignObjectif,
  CampaignTargeting,
  EditionData,
  EditionReservation,
} from '@/types';
import ApercuCarteCampagne from '@/components/annonceur/ApercuCarteCampagne';
import ImageUploadField from '@/components/ui/ImageUploadField';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

/** Les 14 secteurs de la spec (étape ciblage). */
const SECTEURS = [
  'Agribusiness', 'Finance', 'Énergie', 'Numérique', 'Healthtech', 'Artisanat', 'Éducation',
  'Commerce', 'Tourisme', 'Transport', 'Industries créatives', 'Environnement', 'Construction',
  'Services',
];

/** Régions du ciblage — mêmes ids que le profil joueur mobile. */
const REGIONS: Array<{ id: string; label: string }> = [
  { id: 'dakar', label: 'Dakar' }, { id: 'diourbel', label: 'Diourbel' },
  { id: 'fatick', label: 'Fatick' }, { id: 'kaffrine', label: 'Kaffrine' },
  { id: 'kaolack', label: 'Kaolack' }, { id: 'kedougou', label: 'Kédougou' },
  { id: 'kolda', label: 'Kolda' }, { id: 'louga', label: 'Louga' },
  { id: 'matam', label: 'Matam' }, { id: 'saint-louis', label: 'Saint-Louis' },
  { id: 'sedhiou', label: 'Sédhiou' }, { id: 'tambacounda', label: 'Tambacounda' },
  { id: 'thies', label: 'Thiès' }, { id: 'ziguinchor', label: 'Ziguinchor' },
  { id: 'diaspora', label: 'Diaspora' },
];

const OBJECTIFS: Array<{
  id: CampaignObjectif;
  titre: string;
  texte: string;
  Icon: typeof HandCoins;
}> = [
  { id: 'offre_financement', titre: 'Offre de financement', texte: 'Prêt, subvention, garantie — le joueur la vit comme un FINANCEMENT du jeu.', Icon: HandCoins },
  { id: 'appel_candidatures', titre: 'Appel à candidatures', texte: 'Concours, programme ouvert — diffusé en carte OPPORTUNITÉ.', Icon: Megaphone },
  { id: 'programme_accompagnement', titre: 'Programme d’accompagnement', texte: 'Incubation, mentorat — diffusé en carte OPPORTUNITÉ.', Icon: Award },
  { id: 'evenement_formation', titre: 'Événement ou formation', texte: 'Salon, atelier, bootcamp — diffusé en carte ÉVÉNEMENT.', Icon: GraduationCap },
];

const ETAPES_CARTE = ['Objectif', 'La carte', 'Ciblage', 'Objectifs et budget', 'Aperçu et validation'];
const ETAPES_EDITION = ['Édition et réservation', 'L’habillage', 'Ciblage', 'Objectifs et budget', 'Aperçu et validation'];

/** « il y a 2 min » — l'horodatage du brouillon dans le footer. */
function depuis(ms: number): string {
  const secondes = Math.floor((Date.now() - ms) / 1000);
  if (secondes < 60) return 'à l’instant';
  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  return `il y a ${Math.floor(minutes / 60)} h`;
}

/** Carte vierge de départ (branche A). */
function carteVierge(objectif: CampaignObjectif): CampaignCard {
  return {
    kind: KIND_PAR_OBJECTIF[objectif],
    objectif,
    structure: '',
    rectoText: '',
    verso: { description: '' },
    cta: { type: 'candidature', url: '', libelle: 'POSTULER' },
  };
}

export default function NouvelleMiseEnVisibilitePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: authLoading } = useAuth();

  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [format, setFormat] = useState<'card' | 'edition' | null>(null);
  const [etape, setEtape] = useState(0);
  const [enCours, setEnCours] = useState(false);

  // ── État branche A ──
  const [objectif, setObjectif] = useState<CampaignObjectif | null>(null);
  const [card, setCard] = useState<CampaignCard | null>(null);

  // ── État branche B ──
  const [editions, setEditions] = useState<EditionData[]>([]);
  const [editionId, setEditionId] = useState('');
  /** Réservations PAR édition — badges Disponible/Réservée + calendrier. */
  const [reservationsParEdition, setReservationsParEdition] = useState<Record<string, EditionReservation[]>>({});
  const [moisChoisis, setMoisChoisis] = useState<string[]>([]);
  const [skin, setSkin] = useState<CampaignEditionSkin>({
    editionId: '',
    structure: '',
    shortText: '',
  });

  // ── Commun ──
  const [targeting, setTargeting] = useState<CampaignTargeting>({
    sectors: [], regions: [], contexts: ['opportunites', 'financement'],
    zone: 'tous', ageRange: 'toutes', situations: ['etudiant', 'entrepreneur', 'porteur'],
  });
  /** Dernier enregistrement du brouillon (ms) — affiché dans le footer. */
  const [dernierEnregistrement, setDernierEnregistrement] = useState<number | null>(null);
  /** Total de joueurs inscrits — base RÉELLE de l'estimation d'audience. */
  const [totalJoueurs, setTotalJoueurs] = useState<number | null>(null);
  useEffect(() => {
    void (async () => {
      try {
        const { collection, getCountFromServer } = await import('firebase/firestore');
        const { firestore } = await import('@/lib/firebase');
        const agg = await getCountFromServer(collection(firestore, 'userStats'));
        setTotalJoueurs(agg.data().count);
      } catch {
        // Sans comptage, l'audience affiche « — » : jamais un chiffre inventé.
      }
    })();
  }, []);
  const [viewsGoal, setViewsGoal] = useState(50_000);
  const [budgetCap, setBudgetCap] = useState(1_000_000);
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [consent, setConsent] = useState(false);
  const [soumis, setSoumis] = useState(false);

  const grille = format === 'edition' ? GRILLES.edition : GRILLES.standard;

  // ── Reprise d'un brouillon (?id=…) — la sauvegarde auto n'a de sens que si
  // on peut revenir. On réhydrate TOUT l'état du wizard depuis le document.
  useEffect(() => {
    const idRepris = searchParams?.get('id');
    if (!idRepris || campaignId || authLoading) return;
    let annule = false;
    void (async () => {
      const campagne = await getCampagne(idRepris).catch(() => null);
      if (annule || !campagne || campagne.status !== 'draft') {
        if (!annule && idRepris) toast.error('Ce brouillon n’est plus modifiable.');
        return;
      }
      setCampaignId(campagne.id);
      setFormat(campagne.format);
      if (campagne.card) {
        setObjectif(campagne.card.objectif);
        setCard(campagne.card);
      }
      if (campagne.editionSkin) {
        setSkin(campagne.editionSkin);
        setEditionId(campagne.editionSkin.editionId || '');
      }
      setTargeting(campagne.targeting ?? { sectors: [], regions: [], contexts: [] });
      setViewsGoal(campagne.viewsGoal || 10_000);
      setBudgetCap(campagne.budgetCapFcfa || 0);
      if (campagne.period?.startAt) setDebut(new Date(campagne.period.startAt).toISOString().slice(0, 10));
      if (campagne.period?.endAt) setFin(new Date(campagne.period.endAt).toISOString().slice(0, 10));
    })();
    return () => {
      annule = true;
    };
  }, [searchParams, campaignId, authLoading]);

  // Éditions chargées à l'entrée de la branche B (lecture publique).
  useEffect(() => {
    if (format !== 'edition' || editions.length > 0) return;
    getEditions()
      .then(setEditions)
      .catch(() => toast.error('Impossible de charger les éditions.'));
  }, [format, editions.length]);

  // Réservations de TOUTES les éditions — un seul chargement alimente les
  // badges Disponible/Réservée des tuiles et le calendrier de la sélection.
  useEffect(() => {
    if (format !== 'edition' || editions.length === 0) return;
    let annule = false;
    void Promise.all(
      editions.map(async (e) => [e.id, await getReservationsEdition(e.id).catch(() => [])] as const)
    ).then((paires) => {
      if (!annule) setReservationsParEdition(Object.fromEntries(paires));
    });
    return () => {
      annule = true;
    };
  }, [format, editions]);

  /** Choix du format = création du brouillon (la sauvegarde auto commence là). */
  const choisirFormat = async (f: 'card' | 'edition') => {
    setEnCours(true);
    try {
      const id = await creerBrouillonCampagne(f);
      setCampaignId(id);
      setFormat(f);
      setEtape(0);
      if (f === 'edition') setViewsGoal(40_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Création impossible');
    } finally {
      setEnCours(false);
    }
  };

  /** Sauvegarde le brouillon avec l'état courant (appelée à chaque « Suivant »). */
  const sauvegarder = useCallback(async () => {
    if (!campaignId) return;
    // Le tirage mobile ne lit que `regions` : la zone choisie s'y traduit.
    const regionsPourMobile =
      targeting.zone === 'diaspora' ? ['diaspora']
      : targeting.zone === 'regions' ? targeting.regions.filter((r) => r !== 'diaspora')
      : [];
    const patch = {
      card: card ?? undefined,
      editionSkin: format === 'edition' ? { ...skin, editionId } : undefined,
      targeting: { ...targeting, regions: regionsPourMobile },
      viewsGoal,
      budgetCapFcfa: budgetCap,
      period:
        format === 'card'
          ? {
              startAt: debut ? new Date(debut).getTime() : null,
              endAt: fin ? new Date(`${fin}T23:59:59`).getTime() : null,
            }
          : undefined,
    };
    await sauvegarderBrouillon(campaignId, patch).catch(() => {
      // La sauvegarde auto ne bloque jamais la navigation : la suivante rattrapera.
    });
  }, [campaignId, card, format, skin, editionId, targeting, viewsGoal, budgetCap, debut, fin]);

  const suivant = async () => {
    await sauvegarder();
    setDernierEnregistrement(Date.now());
    setEtape((e) => e + 1);
  };

  // Sauvegarde automatique : 2 s après la dernière modification (maquette :
  // « Brouillon enregistré automatiquement · il y a X min »).
  useEffect(() => {
    if (!campaignId) return;
    const minuteur = setTimeout(() => {
      void sauvegarder().then(() => setDernierEnregistrement(Date.now()));
    }, 2000);
    return () => clearTimeout(minuteur);
  }, [campaignId, sauvegarder]);

  /** Enregistre et retourne à la liste (bouton du footer). */
  const enregistrerEtQuitter = async () => {
    await sauvegarder();
    router.push('/annonceur');
  };

  /** Repart au choix du format (le brouillon reste réutilisable). */
  const changerFormat = () => {
    setFormat(null);
    setEtape(0);
  };

  /** Validation finale — la branche décide du canal de soumission. */
  const soumettre = async () => {
    if (!campaignId || !consent) return;
    setEnCours(true);
    try {
      await sauvegarder();
      if (format === 'edition') {
        await reserverEtSoumettre(campaignId, editionId, moisChoisis);
      } else {
        await soumettreCampagneCarte(campaignId);
      }
      setSoumis(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Soumission impossible');
    } finally {
      setEnCours(false);
    }
  };

  // ── Peut-on avancer ? (garde-fous par étape) ──
  const etapeValide = useMemo(() => {
    if (format === 'card') {
      if (etape === 0) return objectif !== null;
      if (etape === 1)
        return !!card && card.structure.trim().length > 0 && card.rectoText.trim().length > 0
          && card.verso.description.trim().length > 0 && card.cta.url.trim().length > 0;
      if (etape === 3) return viewsGoal >= 1000 && budgetCap > 0;
      return true;
    }
    if (format === 'edition') {
      if (etape === 0) return !!editionId && moisChoisis.length > 0;
      if (etape === 1) return skin.structure.trim().length > 0 && skin.shortText.trim().length > 0;
      if (etape === 3) return viewsGoal >= 1000 && budgetCap > 0;
      return true;
    }
    return false;
  }, [format, etape, objectif, card, editionId, moisChoisis, skin, viewsGoal, budgetCap]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  // ═══ Confirmation finale ═══
  if (soumis) {
    return (
      <div style={{ maxWidth: 560, margin: '60px auto', textAlign: 'center' }}>
        <CheckCircle2 size={48} color="#2EA043" style={{ margin: '0 auto 16px' }} />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, marginBottom: 10 }}>
          Soumise pour validation
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          Votre mise en visibilité part en vérification par l’équipe CONCREE — réponse sous
          48 h ouvrées. En cas de retour, vous recevrez le motif précis et une reformulation
          proposée. Elle entrera en diffusion dès validation
          {format === 'edition' ? ', sur les mois que vous avez réservés.' : '.'}
        </p>
        <button
          className="flex items-center gap-2"
          style={{
            margin: '24px auto 0', background: ORANGE, color: NAVY, fontWeight: 700,
            fontSize: 13, padding: '10px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
          }}
          onClick={() => router.push('/annonceur')}
        >
          Retour à mes mises en visibilité
        </button>
      </div>
    );
  }

  // ═══ Choix du format ═══
  if (!format) {
    return (
      <div style={{ maxWidth: 860 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>Nouvelle mise en visibilité</h1>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, marginBottom: 22 }}>
          Choisissez un format, puis laissez-vous guider étape par étape. Votre brouillon est
          enregistré automatiquement.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CarteFormat
            titre="Mettre en avant une opportunité"
            texte="Votre dispositif — financement, appel à candidatures, programme — devient une carte du jeu, tirée pendant les parties."
            action="CARTE OPPORTUNITÉ CO-BRANDÉE"
            grille={`${GRILLES.standard.perView} F/vue · ${GRILLES.standard.perClick} F/clic`}
            disabled={enCours}
            onClick={() => void choisirFormat('card')}
          />
          <CarteFormat
            titre="Sponsoriser une édition thématique"
            texte="Votre marque porte tout un univers de jeu : écran sponsor exclusif à chaque partie lancée dans l’édition réservée."
            action="ÉDITION SPONSORISÉE · EXCLUSIVITÉ"
            grille={`${GRILLES.edition.perView} F/vue · ${GRILLES.edition.perClick} F/clic`}
            disabled={enCours}
            onClick={() => void choisirFormat('edition')}
          />
        </div>
      </div>
    );
  }

  const etapes = format === 'card' ? ETAPES_CARTE : ETAPES_EDITION;
  const derniere = etape === etapes.length - 1;

  return (
    <div style={{ maxWidth: 980 }}>
      {/* Stepper (maquette) : cercles numérotés — orange en cours, navy fait */}
      <div
        className="flex items-center justify-between gap-2 mb-6 flex-wrap"
        style={{ background: '#FFFFFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '16px 22px' }}
      >
        {etapes.map((nom, i) => (
          <div key={nom} className="flex items-center gap-3" style={{ flex: i < etapes.length - 1 ? 1 : undefined }}>
            <div className="flex items-center gap-2.5">
              <span
                className="flex items-center justify-center"
                style={{
                  width: 26, height: 26, borderRadius: 13, fontSize: 12, fontWeight: 800,
                  background: i < etape ? NAVY : i === etape ? ORANGE : '#EEF1F6',
                  color: i <= etape ? '#FFFFFF' : '#8A94A6',
                }}
              >
                {i + 1}
              </span>
              <span style={{ fontSize: 13, fontWeight: i === etape ? 700 : 400, color: i <= etape ? NAVY : '#8A94A6', whiteSpace: 'nowrap' }}>
                {nom}
              </span>
            </div>
            {i < etapes.length - 1 && (
              <span style={{ flex: 1, minWidth: 24, height: 1, background: 'rgba(15,28,46,0.12)' }} />
            )}
          </div>
        ))}
      </div>

      {/* ═══ Corps de l'étape ═══ */}
      {format === 'card' ? (
        <BrancheCarte
          etape={etape}
          totalJoueurs={totalJoueurs}
          objectif={objectif}
          onObjectif={(o) => {
            setObjectif(o);
            setCard((prev) => (prev ? { ...prev, kind: KIND_PAR_OBJECTIF[o], objectif: o } : carteVierge(o)));
          }}
          card={card}
          onCard={setCard}
          campaignId={campaignId!}
          targeting={targeting}
          onTargeting={setTargeting}
          viewsGoal={viewsGoal}
          onViewsGoal={setViewsGoal}
          budgetCap={budgetCap}
          onBudgetCap={setBudgetCap}
          debut={debut}
          onDebut={setDebut}
          fin={fin}
          onFin={setFin}
          consent={consent}
          onConsent={setConsent}
        />
      ) : (
        <BrancheEdition
          etape={etape}
          editions={editions}
          editionId={editionId}
          onEdition={(id) => {
            setEditionId(id);
            setMoisChoisis([]);
          }}
          reservationsParEdition={reservationsParEdition}
          moisChoisis={moisChoisis}
          onMois={setMoisChoisis}
          skin={skin}
          onSkin={setSkin}
          campaignId={campaignId!}
          targeting={targeting}
          onTargeting={setTargeting}
          totalJoueurs={totalJoueurs}
          viewsGoal={viewsGoal}
          onViewsGoal={setViewsGoal}
          budgetCap={budgetCap}
          onBudgetCap={setBudgetCap}
          consent={consent}
          onConsent={setConsent}
        />
      )}

      {/* Barre de navigation (maquette) */}
      <div
        className="flex items-center justify-between gap-3 mt-6 flex-wrap"
        style={{ background: '#FFFFFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '12px 16px' }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            className="flex items-center gap-2"
            style={{ fontSize: 13, fontWeight: 600, padding: '9px 15px', borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(15,28,46,0.15)', background: '#FFF', color: NAVY }}
            onClick={() => (etape === 0 ? router.push('/annonceur') : setEtape(etape - 1))}
          >
            <ArrowLeft size={14} /> {etape === 0 ? 'Annuler' : 'Précédent'}
          </button>
          <button
            type="button"
            onClick={changerFormat}
            style={{ fontSize: 12.5, color: '#5A6A70', border: 'none', background: 'none', cursor: 'pointer' }}
          >
            ‹ Changer de format
          </button>
          <span style={{ fontSize: 12, color: '#8A94A6' }}>
            {dernierEnregistrement
              ? `✓ Brouillon enregistré automatiquement · ${depuis(dernierEnregistrement)}`
              : 'Brouillon enregistré automatiquement'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void enregistrerEtQuitter()}
            style={{ fontSize: 13, fontWeight: 600, color: NAVY, border: 'none', background: 'none', cursor: 'pointer' }}
          >
            Enregistrer et quitter
          </button>
          {derniere ? (
            <button
              type="button"
              disabled={!consent || enCours}
              onClick={() => void soumettre()}
              className="flex items-center gap-2"
              style={{
                fontSize: 13, fontWeight: 700, padding: '11px 20px', borderRadius: 10, border: 'none',
                background: ORANGE, color: NAVY, cursor: 'pointer',
                opacity: !consent || enCours ? 0.5 : 1,
              }}
            >
              ✓ {enCours ? 'Soumission…' : 'Soumettre pour validation'}
            </button>
          ) : (
            <button
              type="button"
              disabled={!etapeValide}
              onClick={() => void suivant()}
              className="flex items-center gap-2"
              style={{
                fontSize: 13, fontWeight: 700, padding: '11px 20px', borderRadius: 10, border: 'none',
                background: NAVY, color: '#FFFFFF', cursor: 'pointer', opacity: etapeValide ? 1 : 0.45,
              }}
            >
              Suivant <ArrowRight size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BRANCHE A — CARTE
// ═══════════════════════════════════════════════════════════════════════════

function BrancheCarte(props: {
  etape: number;
  totalJoueurs: number | null;
  objectif: CampaignObjectif | null;
  onObjectif: (o: CampaignObjectif) => void;
  card: CampaignCard | null;
  onCard: (c: CampaignCard) => void;
  campaignId: string;
  targeting: CampaignTargeting;
  onTargeting: (t: CampaignTargeting) => void;
  viewsGoal: number;
  onViewsGoal: (n: number) => void;
  budgetCap: number;
  onBudgetCap: (n: number) => void;
  debut: string;
  onDebut: (v: string) => void;
  fin: string;
  onFin: (v: string) => void;
  consent: boolean;
  onConsent: (v: boolean) => void;
}) {
  const { etape, card } = props;

  // ── Étape 1 : objectif (maquette 17/08) ──
  if (etape === 0) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3" style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '18px 20px' }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Que souhaitez-vous mettre en avant ?</h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 14px' }}>
            Ce choix détermine le bandeau de votre carte dans le jeu.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {OBJECTIFS.map(({ id, titre, texte, Icon }) => {
              const actif = props.objectif === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => props.onObjectif(id)}
                  style={{
                    position: 'relative', textAlign: 'left', padding: '16px 16px 14px', borderRadius: 14, cursor: 'pointer',
                    border: `1.5px solid ${actif ? ORANGE : 'rgba(15,28,46,0.12)'}`,
                    background: '#FFFFFF',
                    boxShadow: actif ? '0 2px 10px rgba(245,166,35,0.18)' : 'none',
                  }}
                >
                  <span
                    className="flex items-center justify-center"
                    style={{
                      position: 'absolute', top: 14, right: 14, width: 22, height: 22, borderRadius: 11,
                      border: actif ? 'none' : '1.5px solid rgba(15,28,46,0.2)',
                      background: actif ? ORANGE : 'transparent', color: '#FFF', fontSize: 12, fontWeight: 800,
                    }}
                  >
                    {actif ? '✓' : ''}
                  </span>
                  <span
                    className="flex items-center justify-center"
                    style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(245,166,35,0.12)' }}
                  >
                    <Icon size={18} color="#B87A0C" />
                  </span>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: NAVY, marginTop: 10 }}>{titre}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.5 }}>{texte}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 10 }}>
                    Bandeau de la carte :{' '}
                    <strong style={{ color: '#2E7D32', letterSpacing: 0.4 }}>
                      {KIND_PAR_OBJECTIF[id].toUpperCase() === 'OPPORTUNITE' ? 'OPPORTUNITÉ' : KIND_PAR_OBJECTIF[id] === 'evenement' ? 'ÉVÉNEMENT' : 'FINANCEMENT'}
                    </strong>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* « Comment ça marche » — carte blanche, 4 temps (maquette) */}
        <div className="lg:col-span-2" style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '18px 20px', alignSelf: 'start' }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY, marginBottom: 12 }}>Comment ça marche</h2>
          {(
            [
              ['1. Vous créez la carte', 'Votre opportunité', 'Elle prend la forme d’une carte de jeu Startup Ludo, co-brandée avec votre logo.'],
              ['2. CONCREE valide', 'Sous 48 heures', 'Vérification du contenu et de la conformité aux règles du jeu.'],
              ['3. Les joueurs la tirent', 'Pendant les parties', 'La carte apparaît sur les cases Opportunités et Financement, selon votre ciblage.'],
              ['4. Vous payez à la vue', '15 FCFA / vue · 100 FCFA / clic', 'Aucun frais fixe. Vous ne payez que ce qui est réellement vu.'],
            ] as const
          ).map(([etiquette, titre, texte], i) => (
            <div key={etiquette} className="flex gap-4" style={{ padding: '10px 0', borderBottom: i < 3 ? '1px solid rgba(15,28,46,0.07)' : 'none' }}>
              <span style={{ fontSize: 11.5, color: '#8A94A6', width: 120, flexShrink: 0, paddingTop: 1 }}>{etiquette}</span>
              <span>
                <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, display: 'block' }}>{titre}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{texte}</span>
              </span>
            </div>
          ))}
          <p style={{ fontSize: 11.5, color: '#8A6D1F', background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, padding: '10px 12px', marginTop: 12, lineHeight: 1.5 }}>
            ⓘ Le jeton de gain (« +2 ») affiché sur la carte appartient aux règles du jeu : il n’est pas configurable.
          </p>
        </div>
      </div>
    );
  }

  // ── Étape 2 : la carte ──
  if (etape === 1 && card) {
    const majCard = (patch: Partial<CampaignCard>) => props.onCard({ ...card, ...patch });
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 flex flex-col gap-4">
          <Bloc titre="Structure">
            <label className="label">Nom affiché sur la carte</label>
            <input
              className="input-field"
              value={card.structure}
              onChange={(e) => majCard({ structure: e.target.value })}
              placeholder="Ex. ADEPME"
            />
            <div style={{ marginTop: 10 }}>
              <ImageUploadField
                label="Logo (PNG fond transparent conseillé)"
                value={card.logoUrl ?? ''}
                onChange={(url) => majCard({ logoUrl: url })}
                storagePath={`campaigns/${props.campaignId}/logo`}
                aspectRatio="square"
              />
            </div>
          </Bloc>

          <Bloc titre="Message recto">
            <textarea
              className="input-field"
              rows={2}
              maxLength={RECTO_MAX + 30}
              value={card.rectoText}
              onChange={(e) => majCard({ rectoText: e.target.value })}
              placeholder="Vous bénéficiez d’une subvention d’appui de 1 500 000 FCFA du programme ETER de l’ADEPME"
            />
            <p style={{ fontSize: 11.5, color: card.rectoText.length > RECTO_MAX ? 'var(--color-warning)' : 'var(--color-text-muted)', marginTop: 4 }}>
              {card.rectoText.length}/{RECTO_MAX} — votre message doit se lire comme un événement du
              jeu, pas comme un slogan.
            </p>
          </Bloc>

          <Bloc titre="Contenu verso">
            <label className="label">Description</label>
            <textarea
              className="input-field"
              rows={2}
              value={card.verso.description}
              onChange={(e) => majCard({ verso: { ...card.verso, description: e.target.value } })}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ marginTop: 10 }}>
              <div>
                <label className="label">Montant ou avantage</label>
                <input
                  className="input-field"
                  value={card.verso.avantage ?? ''}
                  onChange={(e) => majCard({ verso: { ...card.verso, avantage: e.target.value } })}
                  placeholder="Jusqu’à 1 500 000 FCFA"
                />
              </div>
              <div>
                <label className="label">Date limite (optionnel)</label>
                <input
                  className="input-field"
                  type="date"
                  value={card.verso.dateLimite ?? ''}
                  onChange={(e) => majCard({ verso: { ...card.verso, dateLimite: e.target.value } })}
                />
              </div>
            </div>
            <label className="label" style={{ marginTop: 10 }}>Critères d’éligibilité</label>
            <input
              className="input-field"
              value={card.verso.criteres ?? ''}
              onChange={(e) => majCard({ verso: { ...card.verso, criteres: e.target.value } })}
              placeholder="Entreprise formalisée, moins de 5 ans…"
            />
          </Bloc>

          <Bloc titre="Bouton du verso">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Destination</label>
                <select
                  className="input-field"
                  value={card.cta.type}
                  onChange={(e) => majCard({ cta: { ...card.cta, type: e.target.value as CampaignCard['cta']['type'] } })}
                >
                  <option value="candidature">Appel à candidatures</option>
                  <option value="formulaire">Formulaire</option>
                  <option value="site">Site internet</option>
                  <option value="video">Vidéo</option>
                </select>
              </div>
              <div>
                <label className="label">URL</label>
                <input
                  className="input-field"
                  type="url"
                  value={card.cta.url}
                  onChange={(e) => majCard({ cta: { ...card.cta, url: e.target.value } })}
                  placeholder="https://…"
                />
              </div>
              <div>
                <label className="label">Libellé ({card.cta.libelle.length}/{CTA_LIBELLE_MAX})</label>
                <input
                  className="input-field"
                  maxLength={CTA_LIBELLE_MAX}
                  value={card.cta.libelle}
                  onChange={(e) => majCard({ cta: { ...card.cta, libelle: e.target.value.toUpperCase() } })}
                />
              </div>
            </div>
          </Bloc>
        </div>

        <div className="lg:col-span-2">
          <div style={{ position: 'sticky', top: 20, background: '#EDF0F5', borderRadius: 16, padding: '16px 16px 20px' }}>
            <div className="flex items-center gap-2" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: '#5A6A70', marginBottom: 14 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: '#2EA043', display: 'inline-block' }} />
              APERÇU EN DIRECT
            </div>
            <ApercuCarteCampagne card={card} />
          </div>
        </div>
      </div>
    );
  }

  // ── Étape 3 : ciblage (maquette 17/08) ──
  if (etape === 2) {
    return (
      <EtapeCiblageCarte
        targeting={props.targeting}
        onTargeting={props.onTargeting}
        totalJoueurs={props.totalJoueurs}
      />
    );
  }

  // ── Étape 4 : objectifs et budget (maquette 17/08) ──
  if (etape === 3) {
    const grille = GRILLES.standard;
    const CTR_REF = 0.03;
    const coutParVue = grille.perView + CTR_REF * grille.perClick;
    const vuesCouvertes = props.budgetCap > 0 ? Math.floor(props.budgetCap / coutParVue) : 0;
    const clicsEstimes = Math.round(vuesCouvertes * CTR_REF);
    const jours = props.debut && props.fin
      ? Math.max(1, Math.round((new Date(props.fin).getTime() - new Date(props.debut).getTime()) / 86_400_000))
      : null;
    const modeContinu = !props.debut && !props.fin;
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3" style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '18px 20px' }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Objectifs et budget</h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 16px' }}>
            Vous fixez un objectif et un plafond : la diffusion s'arrête d'elle-même.
          </p>

          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>Objectif de personnes touchées</h3>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '2px 0 10px' }}>
            Nombre de joueurs que vous souhaitez atteindre.
          </p>
          <div className="flex items-center gap-4" style={{ marginBottom: 20 }}>
            <input
              type="range" min={10_000} max={200_000} step={5_000}
              value={props.viewsGoal}
              onChange={(e) => props.onViewsGoal(Number(e.target.value))}
              style={{ flex: 1, accentColor: ORANGE }}
            />
            <input
              className="input-field" type="number" min={1000} step={1000}
              value={props.viewsGoal}
              onChange={(e) => props.onViewsGoal(Math.max(0, Number(e.target.value) || 0))}
              style={{ width: 110 }}
            />
          </div>

          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>Tarifs appliqués</h3>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '2px 0 10px' }}>
            Grille standard — diffusion sur les cases Opportunités et Financement.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ marginBottom: 20 }}>
            {(
              [
                [`${grille.perView}`, 'FCFA / vue', 'Carte affichée à un joueur'],
                [`${grille.perClick}`, 'FCFA / clic', 'Joueur qui ouvre votre lien'],
                ['0', 'FCFA', 'Frais de création et de mise en ligne'],
              ] as const
            ).map(([valeur, unite, texte]) => (
              <div key={unite + texte} style={{ border: '1px solid rgba(15,28,46,0.12)', borderRadius: 12, padding: '12px 14px' }}>
                <span style={{ fontSize: 19, fontWeight: 800, color: NAVY }}>{valeur}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 5 }}>{unite}</span>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>{texte}</div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>Plafond budgétaire</h3>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '2px 0 10px' }}>
            La diffusion s'arrête dès que ce montant est atteint.
          </p>
          <input
            className="input-field" type="number" min={0} step={50_000}
            value={props.budgetCap}
            onChange={(e) => props.onBudgetCap(Math.max(0, Number(e.target.value) || 0))}
            style={{ width: 200 }}
          />
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '5px 0 20px' }}>En FCFA, toutes taxes comprises.</p>

          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Période de diffusion</h3>
          <div className="flex gap-2" style={{ marginBottom: 12 }}>
            {(
              [['dates', 'Dates précises'], ['continu', 'En continu']] as const
            ).map(([mode, libelle]) => {
              const actif = mode === 'continu' ? modeContinu : !modeContinu;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    if (mode === 'continu') { props.onDebut(''); props.onFin(''); }
                    else if (modeContinu) {
                      const debut = new Date(); debut.setDate(debut.getDate() + 7);
                      const fin = new Date(); fin.setDate(fin.getDate() + 67);
                      props.onDebut(debut.toISOString().slice(0, 10));
                      props.onFin(fin.toISOString().slice(0, 10));
                    }
                  }}
                  style={{
                    fontSize: 12.5, padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
                    border: `1.5px solid ${actif ? ORANGE : 'rgba(15,28,46,0.15)'}`,
                    background: actif ? 'rgba(245,166,35,0.1)' : '#FFF', color: NAVY, fontWeight: actif ? 700 : 400,
                  }}
                >
                  {libelle}
                </button>
              );
            })}
          </div>
          {!modeContinu && (
            <div className="flex gap-3 flex-wrap">
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>Début</span>
                <input className="input-field" type="date" value={props.debut} onChange={(e) => props.onDebut(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1">
                <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>Fin</span>
                <input className="input-field" type="date" value={props.fin} onChange={(e) => props.onFin(e.target.value)} />
              </label>
            </div>
          )}
        </div>

        {/* Colonne droite : SIMULATION + détail */}
        <div className="lg:col-span-2 flex flex-col gap-4" style={{ alignSelf: 'start', position: 'sticky', top: 20 }}>
          <div style={{ background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.4)', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: '#B87A0C', marginBottom: 8 }}>SIMULATION</div>
            <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.6 }}>
              Avec un plafond de <strong>{props.budgetCap.toLocaleString('fr-FR')} FCFA</strong>, vous toucherez
              environ <strong>{vuesCouvertes.toLocaleString('fr-FR')} vues</strong> et{' '}
              <strong>~{clicsEstimes.toLocaleString('fr-FR')} clics</strong> estimés.
            </p>
            <p style={{ fontSize: 12, color: '#2E7D32', marginTop: 8, fontWeight: 600 }}>
              ✓ Vous ne payez que ce qui est réellement vu.
            </p>
          </div>
          <div style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '16px 18px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Détail de la dépense estimée</h3>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.9 }}>
              {vuesCouvertes.toLocaleString('fr-FR')} vues × {grille.perView} FCFA ={' '}
              <strong style={{ color: NAVY }}>{(vuesCouvertes * grille.perView).toLocaleString('fr-FR')} FCFA</strong>
              <br />
              {clicsEstimes.toLocaleString('fr-FR')} clics × {grille.perClick} FCFA ={' '}
              <strong style={{ color: NAVY }}>{(clicsEstimes * grille.perClick).toLocaleString('fr-FR')} FCFA</strong>
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 10, borderTop: '1px solid rgba(15,28,46,0.08)', paddingTop: 10 }}>
              {jours
                ? `Sur ${jours} jours, soit environ ${Math.round(vuesCouvertes / jours).toLocaleString('fr-FR')} vues par jour.`
                : 'Diffusion en continu, jusqu’au plafond ou à l’objectif.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Étape 5 : aperçu et validation (maquette 17/08) ──
  if (etape === 4 && card) {
    const audience = estimerAudience(props.targeting, props.totalJoueurs);
    const grille = GRILLES.standard;
    const CTR_REF = 0.03;
    const vuesCouvertes = props.budgetCap > 0 ? Math.floor(props.budgetCap / (grille.perView + CTR_REF * grille.perClick)) : 0;
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Aperçu final */}
        <div className="lg:col-span-3">
          <div style={{ background: '#EDF0F5', borderRadius: 16, padding: '18px 16px 22px' }}>
            <div className="flex items-center gap-2" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: '#5A6A70', marginBottom: 16 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: '#2EA043', display: 'inline-block' }} />
              APERÇU FINAL
            </div>
            <ApercuCarteCampagne card={card} />
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 6 }}>
              Cliquez la carte pour l'animation de retournement — c'est le geste du joueur.
            </p>
          </div>
        </div>

        {/* Récapitulatif + consentement */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '16px 18px' }}>
            <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Récapitulatif</h2>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>Vérifiez avant de soumettre.</p>
            {(
              [
                ['Type', OBJECTIFS.find((o) => o.id === card.objectif)?.titre ?? '—',
                  `Bandeau de la carte : ${card.kind === 'financement' ? 'FINANCEMENT' : card.kind === 'evenement' ? 'ÉVÉNEMENT' : 'OPPORTUNITÉ'}`],
                ['Structure', card.structure || '—', ''],
                ['Ciblage',
                  `${props.targeting.sectors.length ? `${props.targeting.sectors.length} secteur${props.targeting.sectors.length > 1 ? 's' : ''}` : 'Tous secteurs'} · ${props.targeting.zone === 'diaspora' ? 'Diaspora' : props.targeting.zone === 'regions' ? `${props.targeting.regions.length} région(s)` : 'Tout le Sénégal'}`,
                  props.targeting.sectors.slice(0, 5).map((x) => x.charAt(0).toUpperCase() + x.slice(1).replace(/-/g, ' ')).join(' · ')],
                ['Audience estimée', audience ? `${audience.min.toLocaleString('fr-FR')} – ${audience.max.toLocaleString('fr-FR')} joueurs` : '—', ''],
                ['Objectif', `${props.viewsGoal.toLocaleString('fr-FR')} personnes touchées`,
                  `Estimation avec le plafond : ${vuesCouvertes.toLocaleString('fr-FR')} vues · ~${Math.round(vuesCouvertes * CTR_REF).toLocaleString('fr-FR')} clics`],
                ['Budget', `${props.budgetCap.toLocaleString('fr-FR')} FCFA maximum`,
                  `${grille.perView} FCFA / vue · ${grille.perClick} FCFA / clic — facturation à la vue réelle`],
                ['Période', props.debut && props.fin
                  ? `${new Date(props.debut).toLocaleDateString('fr-FR')} → ${new Date(props.fin).toLocaleDateString('fr-FR')}`
                  : 'En continu', ''],
                ['Destination', card.cta.type === 'candidature' ? 'Appel à candidatures' : card.cta.type === 'formulaire' ? 'Formulaire' : card.cta.type === 'video' ? 'Vidéo' : 'Site internet',
                  card.cta.url || '—'],
              ] as const
            ).map(([libelle, valeur, detail]) => (
              <div key={libelle} className="flex justify-between gap-4" style={{ padding: '9px 0', borderTop: '1px solid rgba(15,28,46,0.07)' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0, width: 100 }}>{libelle}</span>
                <span style={{ textAlign: 'right', minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, display: 'block' }}>{valeur}</span>
                  {detail && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{detail}</span>}
                </span>
              </div>
            ))}
          </div>

          <label
            className="flex items-start gap-3"
            style={{ background: 'rgba(245,166,35,0.07)', border: '1.5px solid rgba(245,166,35,0.4)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }}
          >
            <input type="checkbox" checked={props.consent} onChange={(e) => props.onConsent(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, display: 'block' }}>
                J'accepte les règles de contenu de Startup Ludo
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
                Contenu exact et vérifiable, aucune donnée personnelle demandée dans le jeu, aucune
                promesse de gain garanti. Le jeton de gain reste défini par le jeu.
              </span>
            </span>
          </label>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
            🔒 Votre carte sera vérifiée par l'équipe CONCREE sous 48 h. Vous serez prévenu par
            e-mail dès sa mise en ligne.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// BRANCHE B — ÉDITION
// ═══════════════════════════════════════════════════════════════════════════

function BrancheEdition(props: {
  etape: number;
  editions: EditionData[];
  editionId: string;
  onEdition: (id: string) => void;
  reservationsParEdition: Record<string, EditionReservation[]>;
  moisChoisis: string[];
  onMois: (m: string[]) => void;
  skin: CampaignEditionSkin;
  onSkin: (s: CampaignEditionSkin) => void;
  campaignId: string;
  targeting: CampaignTargeting;
  onTargeting: (t: CampaignTargeting) => void;
  totalJoueurs: number | null;
  viewsGoal: number;
  onViewsGoal: (n: number) => void;
  budgetCap: number;
  onBudgetCap: (n: number) => void;
  consent: boolean;
  onConsent: (v: boolean) => void;
}) {
  const { etape, skin } = props;
  const grille = GRILLES.edition;
  const editionChoisie = props.editions.find((e) => e.id === props.editionId);
  const editionNom = editionChoisie?.name || 'votre édition';
  const periode = periodeReservation(props.moisChoisis);

  // ── Étape 1 : édition et réservation (maquette 17/08) ──
  if (etape === 0) {
    const moisAxe = prochainsMois(12);
    const moisCourant = moisAxe[0];
    const prisPar = new Map(
      (props.reservationsParEdition[props.editionId] ?? []).map((r) => [r.month, r.structure])
    );
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3" style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '18px 20px' }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Choisissez votre édition</h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 14px' }}>
            Une seule structure sponsorise une édition à la fois.
          </p>
          {props.editions.length === 0 && (
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>Chargement des éditions…</p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {props.editions.map((e) => {
              const actif = props.editionId === e.id;
              const occupee = (props.reservationsParEdition[e.id] ?? []).some((r) => r.month === moisCourant);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => props.onEdition(e.id)}
                  title={occupee ? 'Le mois en cours est réservé — des mois suivants restent ouverts au calendrier.' : undefined}
                  style={{
                    position: 'relative', padding: '18px 12px 14px', borderRadius: 14, cursor: 'pointer', textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    border: `1.5px solid ${actif ? ORANGE : 'rgba(15,28,46,0.12)'}`,
                    background: '#FFFFFF',
                    boxShadow: actif ? '0 2px 10px rgba(245,166,35,0.18)' : 'none',
                    opacity: occupee && !actif ? 0.65 : 1,
                  }}
                >
                  {actif && (
                    <span className="flex items-center justify-center" style={{ position: 'absolute', top: 10, left: 10, width: 20, height: 20, borderRadius: 10, background: ORANGE, color: '#FFF', fontSize: 11, fontWeight: 800 }}>
                      ✓
                    </span>
                  )}
                  <span className="flex items-center justify-center" style={{ width: 46, height: 46, borderRadius: 12, background: occupee ? '#9AA3B2' : NAVY, margin: '0 auto', fontSize: 22, flexShrink: 0 }}>
                    {emojiEdition(e)}
                  </span>
                  <div style={{ fontSize: 12.5, fontWeight: 900, color: NAVY, marginTop: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {e.name || e.id}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.4, minHeight: 30,
                      display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}
                  >
                    {e.description}
                  </div>
                  <span
                    style={{
                      display: 'inline-block', margin: 'auto auto 0', paddingTop: 8, fontSize: 10.5, fontWeight: 700,
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block', borderRadius: 12, padding: '3px 10px',
                        background: occupee ? '#EEF1F6' : 'rgba(46,160,67,0.12)', color: occupee ? '#8A94A6' : '#2E7D32',
                      }}
                    >
                      ● {occupee ? 'Réservée' : 'Disponible'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {editionChoisie && (
            <div style={{ borderTop: '1px solid rgba(15,28,46,0.08)', marginTop: 18, paddingTop: 16 }}>
              <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>
                Calendrier de réservation — édition {editionChoisie.name}
              </h3>
              <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '2px 0 12px' }}>
                Bloquez un ou plusieurs mois à l’avance, façon inventaire média.
                {periode && (
                  <>
                    {' '}Période sélectionnée : <strong style={{ color: NAVY }}>{periode.texte}</strong>
                  </>
                )}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {moisAxe.map((mois) => {
                  const pris = prisPar.get(mois);
                  const choisi = props.moisChoisis.includes(mois);
                  return (
                    <button
                      key={mois}
                      type="button"
                      disabled={!!pris}
                      title={pris ? `Réservé par ${pris}` : undefined}
                      onClick={() =>
                        props.onMois(
                          choisi ? props.moisChoisis.filter((m) => m !== mois) : [...props.moisChoisis, mois].sort()
                        )
                      }
                      style={{
                        padding: '10px 6px', borderRadius: 10, textAlign: 'center',
                        cursor: pris ? 'not-allowed' : 'pointer',
                        border: pris ? '1.5px dashed rgba(15,28,46,0.18)' : `1.5px solid ${choisi ? ORANGE : 'rgba(15,28,46,0.12)'}`,
                        background: pris ? '#F4F6F9' : choisi ? 'rgba(245,166,35,0.08)' : '#FFFFFF',
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 700, color: pris ? '#8A94A6' : NAVY }}>{moisCourt(mois)}</div>
                      <div style={{ fontSize: 10, fontWeight: choisi ? 700 : 400, color: pris ? '#8A94A6' : choisi ? '#B87A0C' : 'var(--color-text-muted)', marginTop: 2 }}>
                        {pris ? 'Réservé' : choisi ? 'Sélectionné' : 'Disponible'}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 flex-wrap" style={{ marginTop: 10, fontSize: 11, color: 'var(--color-text-muted)' }}>
                <span className="flex items-center gap-1.5">
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: ORANGE, display: 'inline-block' }} /> Sélectionné
                </span>
                <span className="flex items-center gap-1.5">
                  <span style={{ width: 10, height: 10, borderRadius: 3, border: '1.5px solid rgba(15,28,46,0.25)', display: 'inline-block' }} /> Disponible
                </span>
                <span className="flex items-center gap-1.5">
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: '#D5DAE2', display: 'inline-block' }} /> Réservé par une autre structure
                </span>
              </div>
            </div>
          )}
        </div>

        {/* « Comment ça marche » — carte blanche, 4 temps (maquette) */}
        <div className="lg:col-span-2" style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '18px 20px', alignSelf: 'start' }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY, marginBottom: 12 }}>Comment ça marche</h2>
          {(
            [
              ['1. Vous réservez', 'Une édition, des mois entiers', 'L’exclusivité : aucune autre marque sur cette édition pendant votre période.'],
              ['2. Votre écran sponsor', 'À chaque partie lancée', 'Il s’affiche quand un joueur choisit votre édition, avant le début de la partie.'],
              ['3. Les joueurs jouent', '≈ 20 min par partie', 'Toute la partie se déroule dans l’univers thématique que vous portez.'],
              ['4. Vous payez à la vue', `${grille.perView} FCFA / vue · ${grille.perClick} FCFA / clic`, 'Aucun frais fixe. Vous ne payez que ce qui est réellement vu.'],
            ] as const
          ).map(([etiquette, titre, texte], i) => (
            <div key={etiquette} className="flex gap-4" style={{ padding: '10px 0', borderBottom: i < 3 ? '1px solid rgba(15,28,46,0.07)' : 'none' }}>
              <span style={{ fontSize: 11.5, color: '#8A94A6', width: 120, flexShrink: 0, paddingTop: 1 }}>{etiquette}</span>
              <span>
                <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, display: 'block' }}>{titre}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{texte}</span>
              </span>
            </div>
          ))}
          <p style={{ fontSize: 11.5, color: '#8A6D1F', background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, padding: '10px 12px', marginTop: 12, lineHeight: 1.5 }}>
            ⓘ Le badge « Sponsorisé » et la mention « En partenariat avec » sont automatiques et non
            modifiables — transparence publicitaire constante.
          </p>
        </div>
      </div>
    );
  }

  // ── Étape 2 : l'habillage (maquette 17/08) ──
  if (etape === 1) {
    const majSkin = (patch: Partial<CampaignEditionSkin>) => props.onSkin({ ...skin, ...patch });
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3" style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '18px 20px' }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>L’habillage de l’écran sponsor</h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 16px' }}>
            Photo plein cadre, logo sur cartouche blanc, texte court et lien.
          </p>

          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Votre structure</h3>
          <label className="label">Nom affiché</label>
          <input
            className="input-field"
            value={skin.structure}
            onChange={(e) => majSkin({ structure: e.target.value })}
            placeholder="Ex. Mastercard Foundation"
          />

          <div style={{ borderTop: '1px solid rgba(15,28,46,0.08)', marginTop: 16, paddingTop: 14 }}>
            <ImageUploadField
              label="Logo — posé automatiquement sur cartouche blanc · PNG ou SVG"
              value={skin.logoUrl ?? ''}
              onChange={(url) => majSkin({ logoUrl: url })}
              storagePath={`campaigns/${props.campaignId}/logo`}
              aspectRatio="square"
            />
          </div>

          <div style={{ borderTop: '1px solid rgba(15,28,46,0.08)', marginTop: 16, paddingTop: 14 }}>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>Photo plein cadre</h3>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '2px 0 8px' }}>
              Elle habille tout l’écran sponsor. Personnage réel, contexte local · format vertical,
              min 1080 × 1350 px · zone basse dégagée pour le texte.
            </p>
            <ImageUploadField
              label="Photo de l’écran sponsor"
              value={skin.photoUrl ?? ''}
              onChange={(url) => majSkin({ photoUrl: url })}
              storagePath={`campaigns/${props.campaignId}/photo`}
              aspectRatio="banner"
            />
          </div>

          <div style={{ borderTop: '1px solid rgba(15,28,46,0.08)', marginTop: 16, paddingTop: 14 }}>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Texte court</h3>
            <textarea
              className="input-field"
              rows={2}
              maxLength={SHORT_TEXT_MAX}
              value={skin.shortText}
              onChange={(e) => majSkin({ shortText: e.target.value })}
              placeholder="Cette thématique est sponsorisée par la Mastercard Foundation"
            />
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'right', margin: '2px 0 8px' }}>
              {skin.shortText.length} / {SHORT_TEXT_MAX} caractères
            </p>
            <p style={{ fontSize: 11.5, color: '#8A6D1F', background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, padding: '10px 12px', lineHeight: 1.5 }}>
              ⓘ La mention « En partenariat avec » et le badge « Sponsorisé » s’ajoutent
              automatiquement — n’écrivez que la phrase du bloc partenaire.
            </p>
          </div>

          <div style={{ borderTop: '1px solid rgba(15,28,46,0.08)', marginTop: 16, paddingTop: 14 }}>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>Lien « en savoir plus »</h3>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '2px 0 10px' }}>
              Où le joueur arrive-t-il en cliquant ?
            </p>
            <p style={{ fontSize: 12, fontWeight: 600, color: NAVY, marginBottom: 8 }}>Type de destination</p>
            <Segment
              options={[['candidature', 'Appel à candidatures'], ['formulaire', 'Formulaire à remplir'], ['site', 'Site internet'], ['video', 'Vidéo']]}
              valeur={skin.linkType ?? 'site'}
              onChange={(linkType) => majSkin({ linkType: linkType as CampaignEditionSkin['linkType'] })}
            />
            <label className="label" style={{ marginTop: 12 }}>Lien de destination</label>
            <input
              className="input-field"
              type="url"
              value={skin.linkUrl ?? ''}
              onChange={(e) => majSkin({ linkUrl: e.target.value })}
              placeholder="https://…"
            />
          </div>
        </div>

        <div className="lg:col-span-2">
          <div style={{ position: 'sticky', top: 20, background: '#EDF0F5', borderRadius: 16, padding: '16px 16px 20px' }}>
            <div className="flex items-center gap-2" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: '#5A6A70', marginBottom: 14 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: '#2EA043', display: 'inline-block' }} />
              APERÇU EN DIRECT
            </div>
            <ApercuEcranSponsor skin={skin} editionNom={editionNom} />
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 12 }}>
              L’écran sponsor tel qu’il s’affiche quand un joueur choisit l’édition {editionNom}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Étape 3 : ciblage (maquette 17/08) ──
  if (etape === 2) {
    return (
      <EtapeCiblageEdition
        targeting={props.targeting}
        onTargeting={props.onTargeting}
        totalJoueurs={props.totalJoueurs}
        editionNom={editionNom}
        nbMois={props.moisChoisis.length}
      />
    );
  }

  // ── Étape 4 : objectifs et budget (maquette 17/08) ──
  if (etape === 3) {
    const CTR_REF = 0.03;
    const coutParVue = grille.perView + CTR_REF * grille.perClick;
    const vuesCouvertes = props.budgetCap > 0 ? Math.floor(props.budgetCap / coutParVue) : 0;
    const clicsEstimes = Math.round(vuesCouvertes * CTR_REF);
    const jours = periode
      ? Math.max(1, Math.round((periode.fin.getTime() - periode.debut.getTime()) / 86_400_000) + 1)
      : null;
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3" style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '18px 20px' }}>
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Objectifs et budget</h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 16px' }}>
            Objectif + plafond : la diffusion s’arrête d’elle-même.
          </p>

          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>Objectif de personnes touchées</h3>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '2px 0 10px' }}>
            Nombre de joueurs que vous souhaitez atteindre pendant votre réservation.
          </p>
          <div className="flex items-center gap-4" style={{ marginBottom: 20 }}>
            <input
              type="range" min={10_000} max={200_000} step={5_000}
              value={props.viewsGoal}
              onChange={(e) => props.onViewsGoal(Number(e.target.value))}
              style={{ flex: 1, accentColor: ORANGE }}
            />
            <input
              className="input-field" type="number" min={1000} step={1000}
              value={props.viewsGoal}
              onChange={(e) => props.onViewsGoal(Math.max(0, Number(e.target.value) || 0))}
              style={{ width: 110 }}
            />
          </div>

          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>Tarifs appliqués</h3>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '2px 0 10px' }}>
            Grille édition sponsorisée — écran plein cadre, exclusivité.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ marginBottom: 20 }}>
            {(
              [
                [`${grille.perView}`, 'FCFA / vue', 'Écran sponsor affiché à un joueur'],
                [`${grille.perClick}`, 'FCFA / clic', 'Joueur qui ouvre « en savoir plus »'],
                ['0', 'FCFA', 'Frais de création et de mise en ligne'],
              ] as const
            ).map(([valeur, unite, texte]) => (
              <div key={unite + texte} style={{ border: '1px solid rgba(15,28,46,0.12)', borderRadius: 12, padding: '12px 14px' }}>
                <span style={{ fontSize: 19, fontWeight: 800, color: NAVY }}>{valeur}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 5 }}>{unite}</span>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 3 }}>{texte}</div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>Plafond budgétaire</h3>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '2px 0 10px' }}>
            La diffusion s’arrête dès que ce montant est atteint.
          </p>
          <input
            className="input-field" type="number" min={0} step={50_000}
            value={props.budgetCap}
            onChange={(e) => props.onBudgetCap(Math.max(0, Number(e.target.value) || 0))}
            style={{ width: 200 }}
          />
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '5px 0 20px' }}>En FCFA, toutes taxes comprises.</p>

          <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Période de diffusion</h3>
          <div
            className="flex items-start gap-3"
            style={{ background: 'rgba(245,166,35,0.07)', border: '1px solid rgba(245,166,35,0.35)', borderRadius: 12, padding: '12px 14px' }}
          >
            <CalendarRange size={16} color="#B87A0C" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, display: 'block' }}>
                {periode ? periode.texte : 'Aucun mois réservé pour l’instant'}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                Héritée de votre réservation (étape 1). Modifiez les mois pour changer la période.
              </span>
            </span>
          </div>
        </div>

        {/* Colonne droite : SIMULATION + détail */}
        <div className="lg:col-span-2 flex flex-col gap-4" style={{ alignSelf: 'start', position: 'sticky', top: 20 }}>
          <div style={{ background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.4)', borderRadius: 14, padding: '16px 18px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: '#B87A0C', marginBottom: 8 }}>SIMULATION</div>
            <p style={{ fontSize: 13, color: NAVY, lineHeight: 1.6 }}>
              Sur votre réservation de <strong>{props.moisChoisis.length || '—'} mois</strong> de l’édition{' '}
              <strong>{editionNom}</strong>, avec un plafond de{' '}
              <strong>{props.budgetCap.toLocaleString('fr-FR')} FCFA</strong>, vous toucherez environ{' '}
              <strong>{vuesCouvertes.toLocaleString('fr-FR')} vues</strong> et{' '}
              <strong>~{clicsEstimes.toLocaleString('fr-FR')} clics</strong> estimés.
            </p>
            <p style={{ fontSize: 12, color: '#2E7D32', marginTop: 8, fontWeight: 600 }}>
              ✓ Vous ne payez que ce qui est réellement vu.
            </p>
          </div>
          <div style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '16px 18px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Détail de la dépense estimée</h3>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.9 }}>
              {vuesCouvertes.toLocaleString('fr-FR')} vues × {grille.perView} FCFA ={' '}
              <strong style={{ color: NAVY }}>{(vuesCouvertes * grille.perView).toLocaleString('fr-FR')} FCFA</strong>
              <br />
              {clicsEstimes.toLocaleString('fr-FR')} clics × {grille.perClick} FCFA ={' '}
              <strong style={{ color: NAVY }}>{(clicsEstimes * grille.perClick).toLocaleString('fr-FR')} FCFA</strong>
            </p>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 10, borderTop: '1px solid rgba(15,28,46,0.08)', paddingTop: 10 }}>
              {jours
                ? `Sur ${jours} jours de réservation, soit environ ${Math.round(vuesCouvertes / jours).toLocaleString('fr-FR')} vues par jour.`
                : 'Réservez vos mois à l’étape 1 pour voir le rythme quotidien.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Étape 5 : aperçu et validation (maquette 17/08) ──
  if (etape === 4) {
    const audience = estimerAudience({ ...props.targeting, sectors: [] }, props.totalJoueurs);
    const CTR_REF = 0.03;
    const vuesCouvertes = props.budgetCap > 0 ? Math.floor(props.budgetCap / (grille.perView + CTR_REF * grille.perClick)) : 0;
    const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    const destination = skin.linkType === 'candidature' ? 'Appel à candidatures'
      : skin.linkType === 'formulaire' ? 'Formulaire à remplir'
      : skin.linkType === 'video' ? 'Vidéo' : 'Site internet';
    return (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Aperçu final */}
        <div className="lg:col-span-3">
          <div style={{ background: '#EDF0F5', borderRadius: 16, padding: '18px 16px 22px' }}>
            <div className="flex items-center gap-2" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1, color: '#5A6A70', marginBottom: 16 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: '#2EA043', display: 'inline-block' }} />
              APERÇU FINAL
            </div>
            <ApercuEcranSponsor skin={skin} editionNom={editionNom} largeur={320} />
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 10 }}>
              L’écran sponsor seul, en grand — le badge et la mention partenaire sont automatiques.
            </p>
          </div>
        </div>

        {/* Récapitulatif + consentement */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '16px 18px' }}>
            <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Récapitulatif</h2>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>Vérifiez avant de soumettre.</p>
            {(
              [
                ['Format', 'Édition thématique sponsorisée', 'Exclusivité : une seule structure par édition et par période'],
                ['Édition', editionNom, ''],
                ['Structure', skin.structure || '—', ''],
                ['Réservation', periode ? `${fmt(periode.debut)} → ${fmt(periode.fin)}` : '—',
                  props.moisChoisis.length ? `${props.moisChoisis.length} mois bloqué${props.moisChoisis.length > 1 ? 's' : ''} au calendrier` : ''],
                ['Audience estimée', audience ? `${audience.min.toLocaleString('fr-FR')} – ${audience.max.toLocaleString('fr-FR')} joueurs` : '—', ''],
                ['Objectif', `${props.viewsGoal.toLocaleString('fr-FR')} personnes touchées`,
                  `Estimation avec le plafond : ${vuesCouvertes.toLocaleString('fr-FR')} vues · ~${Math.round(vuesCouvertes * CTR_REF).toLocaleString('fr-FR')} clics « en savoir plus »`],
                ['Budget', `${props.budgetCap.toLocaleString('fr-FR')} FCFA maximum`,
                  `${grille.perView} FCFA / vue de l’écran sponsor · ${grille.perClick} FCFA / clic`],
                ['Destination', destination, skin.linkUrl || '—'],
              ] as const
            ).map(([libelle, valeur, detail]) => (
              <div key={libelle} className="flex justify-between gap-4" style={{ padding: '9px 0', borderTop: '1px solid rgba(15,28,46,0.07)' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', flexShrink: 0, width: 100 }}>{libelle}</span>
                <span style={{ textAlign: 'right', minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, display: 'block' }}>{valeur}</span>
                  {detail && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{detail}</span>}
                </span>
              </div>
            ))}
          </div>

          <label
            className="flex items-start gap-3"
            style={{ background: 'rgba(245,166,35,0.07)', border: '1.5px solid rgba(245,166,35,0.4)', borderRadius: 12, padding: '14px 16px', cursor: 'pointer' }}
          >
            <input type="checkbox" checked={props.consent} onChange={(e) => props.onConsent(e.target.checked)} style={{ marginTop: 3 }} />
            <span>
              <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, display: 'block' }}>
                J'accepte les règles de contenu de Startup Ludo
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
                Photo authentique et respectueuse, contenu exact et vérifiable, aucune promesse de
                gain garanti. Le badge « Sponsorisé » reste affiché en permanence.
              </span>
            </span>
          </label>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
            🔒 Votre habillage sera vérifié par l'équipe CONCREE sous 48 h. Vous serez prévenu par
            e-mail dès sa mise en ligne.
          </p>
        </div>
      </div>
    );
  }

  return null;
}

/**
 * Ciblage de la branche édition : l'édition EST le ciblage thématique — il ne
 * reste que la géographie et le profil (consultatifs en v1, comme la carte).
 */
function EtapeCiblageEdition({
  targeting,
  onTargeting,
  totalJoueurs,
  editionNom,
  nbMois,
}: {
  targeting: CampaignTargeting;
  onTargeting: (t: CampaignTargeting) => void;
  totalJoueurs: number | null;
  editionNom: string;
  nbMois: number;
}) {
  const basculer = (liste: string[], valeur: string) =>
    liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur];
  // Les secteurs ne s'appliquent pas ici : l'écran sponsor est vu par tous les
  // joueurs de l'édition, quel que soit le projet qu'ils développent.
  const audience = estimerAudience({ ...targeting, sectors: [] }, totalJoueurs);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-3" style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '18px 20px' }}>
        <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Qui verra votre écran sponsor ?</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 14px' }}>
          L’édition est le ciblage thématique en soi.
        </p>

        <p style={{ fontSize: 12.5, color: '#5A4A1A', background: 'rgba(245,166,35,0.1)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 10, padding: '11px 14px', marginBottom: 18, lineHeight: 1.5 }}>
          ⓘ Votre marque sera vue par <strong>tous les joueurs qui choisissent l’édition {editionNom}</strong>.
          Il ne reste qu’à préciser la géographie et le profil.
        </p>

        <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Zone géographique</h3>
        <Segment
          options={[['tous', 'Tout le Sénégal'], ['regions', 'Régions choisies'], ['diaspora', 'Hors Sénégal (diaspora)']]}
          valeur={targeting.zone ?? 'tous'}
          onChange={(zone) => onTargeting({ ...targeting, zone: zone as CampaignTargeting['zone'] })}
        />
        {targeting.zone === 'regions' && (
          <div className="flex flex-wrap gap-2" style={{ marginTop: 10 }}>
            {REGIONS.filter((r) => r.id !== 'diaspora').map((r) => (
              <PilluleNavy
                key={r.id}
                actif={targeting.regions.includes(r.id)}
                libelle={r.label}
                onClick={() => onTargeting({ ...targeting, regions: basculer(targeting.regions, r.id) })}
              />
            ))}
          </div>
        )}

        <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, margin: '18px 0 4px' }}>Profil des joueurs</h3>
        <p style={{ fontSize: 12, fontWeight: 600, color: NAVY, margin: '8px 0 8px' }}>Tranche d'âge</p>
        <Segment
          options={[['toutes', 'Toutes'], ['18-24', '18 – 24 ans'], ['25-34', '25 – 34 ans'], ['35+', '35 ans et plus']]}
          valeur={targeting.ageRange ?? 'toutes'}
          onChange={(ageRange) => onTargeting({ ...targeting, ageRange })}
        />
        <p style={{ fontSize: 12, fontWeight: 600, color: NAVY, margin: '14px 0 8px' }}>Situation</p>
        <div className="flex flex-wrap gap-2">
          {(
            [['etudiant', 'Étudiant'], ['entrepreneur', 'Entrepreneur'], ['porteur', 'Porteur de projet']] as const
          ).map(([v, libelle]) => (
            <PilluleNavy
              key={v}
              actif={(targeting.situations ?? []).includes(v)}
              libelle={libelle}
              onClick={() => onTargeting({ ...targeting, situations: basculer(targeting.situations ?? [], v) })}
            />
          ))}
        </div>
      </div>

      {/* Panneau navy « Audience estimée » */}
      <div className="lg:col-span-2" style={{ alignSelf: 'start', position: 'sticky', top: 20, background: NAVY, borderRadius: 16, padding: '20px 22px', color: '#FFF' }}>
        <h3 style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 4 }}>Audience estimée</h3>
        <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginBottom: 14 }}>
          Joueurs correspondant à votre ciblage, sur votre période de réservation.
        </p>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 0.3 }}>
          {audience ? `${audience.min.toLocaleString('fr-FR')} – ${audience.max.toLocaleString('fr-FR')}` : '—'}
        </div>
        <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>joueurs sur votre période de réservation</p>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginBottom: 4 }}>
          <div style={{ width: `${audience && totalJoueurs ? Math.min(100, Math.max(4, (audience.max / totalJoueurs) * 100)) : 4}%`, height: '100%', background: ORANGE }} />
        </div>
        <div className="flex justify-between" style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
          <span>Ciblage restreint</span><span>Tous les joueurs de l’édition</span>
        </div>
        {(
          [
            ['Édition', editionNom],
            ['Réservation', nbMois ? `${nbMois} mois` : '—'],
            ['Zone', targeting.zone === 'diaspora' ? 'Diaspora' : targeting.zone === 'regions' ? `${targeting.regions.length} région${targeting.regions.length > 1 ? 's' : ''}` : 'Tout le Sénégal'],
            ['Situation', (targeting.situations?.length ?? 0) >= 3 || !targeting.situations?.length ? 'Toutes' : targeting.situations.map((x) => x === 'etudiant' ? 'Étudiant' : x === 'entrepreneur' ? 'Entrepreneur' : 'Porteur de projet').join(', ')],
          ] as const
        ).map(([libelle, valeur]) => (
          <div key={libelle} className="flex justify-between gap-3" style={{ fontSize: 12, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>{libelle}</span>
            <strong style={{ textAlign: 'right' }}>{valeur}</strong>
          </div>
        ))}
        <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', marginTop: 12, lineHeight: 1.5 }}>
          ⓘ Basée sur les {totalJoueurs ? totalJoueurs.toLocaleString('fr-FR') : '—'} joueurs
          inscrits — l’historique des choix d’édition affinera cette fourchette. Indicative, sans
          garantie de vues.
        </p>
      </div>
    </div>
  );
}

/**
 * L'écran sponsor tel que le mobile l'affiche au lancement d'une partie de
 * l'édition : photo plein cadre, badge « Sponsorisé », bloc partenaire
 * automatique (cartouche blanc + texte court) et bouton JOUER.
 */
function ApercuEcranSponsor({
  skin,
  editionNom,
  largeur = 260,
}: {
  skin: CampaignEditionSkin;
  editionNom: string;
  largeur?: number;
}) {
  return (
    <div style={{ width: largeur, maxWidth: '100%', margin: '0 auto' }}>
      <div
        style={{
          aspectRatio: '4 / 5', borderRadius: 18, overflow: 'hidden', position: 'relative',
          background: skin.photoUrl ? `url(${skin.photoUrl}) center/cover` : 'linear-gradient(160deg, #16324F, #0F1C2E)',
          boxShadow: '0 10px 26px rgba(15,28,46,0.28)',
        }}
      >
        <span
          style={{
            position: 'absolute', top: 12, left: 12, fontWeight: 900, fontStyle: 'italic', fontSize: 15,
            letterSpacing: 0.6, textTransform: 'uppercase', color: '#FFFFFF',
            textShadow: '0 2px 3px rgba(0,0,0,0.5), 0 0 10px rgba(31,145,208,0.7)',
          }}
        >
          {editionNom}
        </span>
        <span
          className="flex items-center gap-1"
          style={{ position: 'absolute', top: 12, right: 12, background: '#FFFFFF', borderRadius: 12, fontSize: 10, fontWeight: 700, padding: '4px 10px', color: NAVY }}
        >
          <CheckCircle2 size={11} color="#1F91D0" /> Sponsorisé
        </span>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 14, background: 'linear-gradient(transparent, rgba(0,0,0,0.8) 60%)' }}>
          <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.75)' }}>En partenariat avec</div>
          <div className="flex items-center gap-3" style={{ marginTop: 6 }}>
            <div className="flex items-center justify-center" style={{ background: '#FFFFFF', borderRadius: 8, padding: '8px 10px', flexShrink: 0, minWidth: 60, minHeight: 40 }}>
              {skin.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={skin.logoUrl} alt="" style={{ height: 26, maxWidth: 84, objectFit: 'contain', display: 'block' }} />
              ) : (
                <span style={{ fontSize: 10.5, fontWeight: 800, color: NAVY, textAlign: 'center', lineHeight: 1.2, maxWidth: 84, display: 'inline-block' }}>
                  {skin.structure || 'Votre structure'}
                </span>
              )}
            </div>
            <p style={{ fontSize: 11, color: '#FFFFFF', lineHeight: 1.45 }}>
              {skin.shortText || 'Votre texte court.'}
              {skin.linkUrl && (
                <span style={{ display: 'block', fontWeight: 700, textDecoration: 'underline', marginTop: 2 }}>en savoir plus</span>
              )}
            </p>
          </div>
          <div style={{ marginTop: 10, background: ORANGE, borderRadius: 16, textAlign: 'center', padding: '8px 0', fontWeight: 900, fontSize: 12.5, color: NAVY, letterSpacing: 0.8 }}>
            JOUER
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Emoji de la tuile d'édition. `EditionData.icon` porte un nom d'icône Ionicons
 * du mobile (« game-controller-outline ») — inutilisable tel quel sur le web :
 * on le traduit par mot-clé. Si le champ contient déjà un emoji, on le garde.
 */
function emojiEdition(e: EditionData): string {
  const icone = e.icon || '';
  // Déjà un emoji (caractère hors ASCII imprimable) : on l'affiche tel quel.
  if (icone && !/^[\x20-\x7E-]+$/.test(icone)) return icone;
  const cle = `${icone} ${e.id} ${e.name}`.toLowerCase();
  const correspondances: Array<[RegExp, string]> = [
    [/game|controller|classique|generique|génér/, '🎮'],
    [/leaf|agri|farm/, '🌱'],
    [/school|educat|book|éduc/, '🎓'],
    [/medkit|medical|health|sant/, '⚕️'],
    [/fitness|sport|football|basket/, '🏅'],
    [/color-palette|palette|brush|culture|creat/, '🎨'],
    [/cash|card|wallet|fintech|financ/, '💰'],
    [/airplane|globe|touris|travel/, '✈️'],
    [/briefcase|business/, '💼'],
  ];
  const trouvee = correspondances.find(([motif]) => motif.test(cle));
  return trouvee ? trouvee[1] : '🎲';
}

/** Période couverte par les mois réservés : 1er jour du premier → dernier jour du dernier. */
function periodeReservation(mois: string[]): { debut: Date; fin: Date; texte: string } | null {
  if (mois.length === 0) return null;
  const tries = [...mois].sort();
  const [a1, m1] = tries[0].split('-').map(Number);
  const [a2, m2] = tries[tries.length - 1].split('-').map(Number);
  const debut = new Date(a1, (m1 ?? 1) - 1, 1);
  const fin = new Date(a2, m2 ?? 1, 0);
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  return { debut, fin, texte: `${fmt(debut)} → ${fmt(fin)} · ${tries.length} mois` };
}

/** « Oct. 2026 » depuis « 2026-10 » — le libellé des tuiles du calendrier. */
function moisCourt(mois: string): string {
  const [annee, m] = mois.split('-').map(Number);
  const txt = new Date(annee, (m ?? 1) - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// ÉTAPES PARTAGÉES + BRIQUES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estimation d'audience INDICATIVE : part du total RÉEL de joueurs inscrits,
 * réduite par la sélectivité du ciblage (secteurs / zone / situation). C'est
 * une fourchette d'ordre de grandeur, jamais une promesse — le panneau le dit.
 */
function estimerAudience(t: CampaignTargeting, totalJoueurs: number | null): { min: number; max: number } | null {
  if (totalJoueurs == null || totalJoueurs === 0) return null;
  const fSecteurs = t.sectors.length === 0 ? 1 : Math.min(1, t.sectors.length / SECTEURS.length + 0.1);
  const fZone = t.zone === 'diaspora' ? 0.08 : t.zone === 'regions'
    ? Math.min(1, Math.max(1, t.regions.length) / 14 + 0.1)
    : 1;
  const fSituation = (t.situations?.length ?? 3) >= 3 ? 1 : 0.45 + 0.18 * (t.situations?.length ?? 3);
  const estimation = totalJoueurs * fSecteurs * fZone * fSituation;
  return { min: Math.max(1, Math.round(estimation * 0.7)), max: Math.max(2, Math.round(estimation * 1.05)) };
}

/** Pilule navy à coche — secteurs, régions, situations (maquette ciblage). */
function PilluleNavy({ actif, libelle, onClick }: { actif: boolean; libelle: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: 12.5, padding: '8px 16px', borderRadius: 20, cursor: 'pointer',
        border: `1.5px solid ${actif ? NAVY : 'rgba(15,28,46,0.15)'}`,
        background: actif ? NAVY : '#FFFFFF', color: actif ? '#FFFFFF' : NAVY,
        fontWeight: actif ? 700 : 400,
      }}
    >
      {actif ? '✓ ' : ''}{libelle}
    </button>
  );
}

/** Segmenté orange à choix unique — zone, tranche d'âge, type de destination. */
function Segment({ options, valeur, onChange }: { options: Array<[string, string]>; valeur: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap">
      {options.map(([v, libelle]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          style={{
            fontSize: 12.5, padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
            border: `1.5px solid ${valeur === v ? ORANGE : 'rgba(15,28,46,0.15)'}`,
            background: valeur === v ? 'rgba(245,166,35,0.1)' : '#FFFFFF',
            color: NAVY, fontWeight: valeur === v ? 700 : 400,
          }}
        >
          {libelle}
        </button>
      ))}
    </div>
  );
}

function EtapeCiblageCarte({
  targeting,
  onTargeting,
  totalJoueurs,
}: {
  targeting: CampaignTargeting;
  onTargeting: (t: CampaignTargeting) => void;
  totalJoueurs: number | null;
}) {
  const basculer = (liste: string[], valeur: string) =>
    liste.includes(valeur) ? liste.filter((v) => v !== valeur) : [...liste, valeur];
  const audience = estimerAudience(targeting, totalJoueurs);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      <div className="lg:col-span-3" style={{ background: '#FFF', border: '1px solid rgba(15,28,46,0.08)', borderRadius: 14, padding: '18px 20px' }}>
        <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>À qui votre carte doit-elle apparaître ?</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 16px' }}>
          Plus le ciblage est large, plus vite votre objectif est atteint.
        </p>

        <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>Secteurs d'activité</h3>
        <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '2px 0 10px' }}>
          Les joueurs sont rattachés au secteur du projet qu'ils développent dans le jeu.
        </p>
        <div className="flex flex-wrap gap-2" style={{ marginBottom: 18 }}>
          {SECTEURS.map((sct) => {
            const slug = sct.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
            return (
              <PilluleNavy
                key={sct}
                actif={targeting.sectors.includes(slug)}
                libelle={sct}
                onClick={() => onTargeting({ ...targeting, sectors: basculer(targeting.sectors, slug) })}
              />
            );
          })}
        </div>

        <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Zone géographique</h3>
        <Segment
          options={[['tous', 'Tout le Sénégal'], ['regions', 'Régions choisies'], ['diaspora', 'Hors Sénégal (diaspora)']]}
          valeur={targeting.zone ?? 'tous'}
          onChange={(zone) => onTargeting({ ...targeting, zone: zone as CampaignTargeting['zone'] })}
        />
        {targeting.zone === 'regions' && (
          <div className="flex flex-wrap gap-2" style={{ marginTop: 10 }}>
            {REGIONS.filter((r) => r.id !== 'diaspora').map((r) => (
              <PilluleNavy
                key={r.id}
                actif={targeting.regions.includes(r.id)}
                libelle={r.label}
                onClick={() => onTargeting({ ...targeting, regions: basculer(targeting.regions, r.id) })}
              />
            ))}
          </div>
        )}

        <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, margin: '18px 0 4px' }}>Profil des joueurs</h3>
        <p style={{ fontSize: 12, fontWeight: 600, color: NAVY, margin: '8px 0 8px' }}>Tranche d'âge</p>
        <Segment
          options={[['toutes', 'Toutes'], ['18-24', '18 – 24 ans'], ['25-34', '25 – 34 ans'], ['35+', '35 ans et plus']]}
          valeur={targeting.ageRange ?? 'toutes'}
          onChange={(ageRange) => onTargeting({ ...targeting, ageRange })}
        />
        <p style={{ fontSize: 12, fontWeight: 600, color: NAVY, margin: '14px 0 8px' }}>Situation</p>
        <div className="flex flex-wrap gap-2">
          {(
            [['etudiant', 'Étudiant'], ['entrepreneur', 'Entrepreneur'], ['porteur', 'Porteur de projet']] as const
          ).map(([v, libelle]) => (
            <PilluleNavy
              key={v}
              actif={(targeting.situations ?? []).includes(v)}
              libelle={libelle}
              onClick={() => onTargeting({ ...targeting, situations: basculer(targeting.situations ?? [], v) })}
            />
          ))}
        </div>

        <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, margin: '20px 0 4px' }}>Contexte de diffusion</h3>
        <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 10 }}>
          Les moments de la partie où votre carte peut être tirée.
        </p>
        {(
          [
            ['opportunites', 'Cases Opportunités', 'Le joueur tire une carte quand il tombe sur une case Opportunité.'],
            ['financement', 'Cases Financement', 'Le joueur tire une carte quand il tombe sur une case Financement.'],
          ] as const
        ).map(([v, titre, texte]) => {
          const actif = targeting.contexts.includes(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => onTargeting({ ...targeting, contexts: basculer(targeting.contexts, v) })}
              className="flex items-start gap-3"
              style={{
                width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                border: `1.5px solid ${actif ? ORANGE : 'rgba(15,28,46,0.12)'}`,
                background: actif ? 'rgba(245,166,35,0.06)' : '#FFFFFF', marginBottom: 8,
              }}
            >
              <span
                className="flex items-center justify-center"
                style={{ width: 20, height: 20, borderRadius: 6, background: actif ? ORANGE : '#EEF1F6', color: '#FFF', fontSize: 12, fontWeight: 800, flexShrink: 0, marginTop: 1 }}
              >
                {actif ? '✓' : ''}
              </span>
              <span>
                <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, display: 'block' }}>{titre}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{texte}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Panneau navy « Audience estimée » */}
      <div className="lg:col-span-2" style={{ alignSelf: 'start', position: 'sticky', top: 20, background: NAVY, borderRadius: 16, padding: '20px 22px', color: '#FFF' }}>
        <h3 style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 4 }}>Audience estimée</h3>
        <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginBottom: 14 }}>
          Joueurs actifs correspondant à votre ciblage sur les 30 derniers jours.
        </p>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 0.3 }}>
          {audience ? `${audience.min.toLocaleString('fr-FR')} – ${audience.max.toLocaleString('fr-FR')}` : '—'}
        </div>
        <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)', marginBottom: 10 }}>joueurs correspondants</p>
        <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.15)', overflow: 'hidden', marginBottom: 4 }}>
          <div style={{ width: `${audience && totalJoueurs ? Math.min(100, Math.max(4, (audience.max / totalJoueurs) * 100)) : 4}%`, height: '100%', background: ORANGE }} />
        </div>
        <div className="flex justify-between" style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
          <span>Ciblage restreint</span><span>Tous les joueurs</span>
        </div>
        {(
          [
            ['Secteurs', targeting.sectors.length ? `${targeting.sectors.length} secteur${targeting.sectors.length > 1 ? 's' : ''}` : 'Tous'],
            ['Zone', targeting.zone === 'diaspora' ? 'Diaspora' : targeting.zone === 'regions' ? `${targeting.regions.length} région${targeting.regions.length > 1 ? 's' : ''}` : 'Tout le Sénégal'],
            ['Situation', (targeting.situations?.length ?? 0) >= 3 || !targeting.situations?.length ? 'Toutes' : targeting.situations.map((x) => x === 'etudiant' ? 'Étudiant' : x === 'entrepreneur' ? 'Entrepreneur' : 'Porteur de projet').join(', ')],
            ['Contexte', targeting.contexts.map((c) => c === 'opportunites' ? 'Opportunités' : 'Financement').join(', ') || '—'],
          ] as const
        ).map(([libelle, valeur]) => (
          <div key={libelle} className="flex justify-between gap-3" style={{ fontSize: 12, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ color: 'rgba(255,255,255,0.6)' }}>{libelle}</span>
            <strong style={{ textAlign: 'right' }}>{valeur}</strong>
          </div>
        ))}
        <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', marginTop: 12, lineHeight: 1.5 }}>
          ⓘ Estimation indicative, recalculée à chaque changement. Elle ne garantit pas un nombre de vues.
        </p>
      </div>
    </div>
  );
}

function CarteFormat({
  titre, texte, action, grille, disabled, onClick,
}: {
  titre: string; texte: string; action: string; grille: string; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        textAlign: 'left', padding: 20, borderRadius: 16, cursor: 'pointer',
        border: '1px solid var(--color-card-border)', background: '#FFFFFF',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 800, color: NAVY }}>{titre}</div>
      <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.55 }}>{texte}</p>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 10 }}>{grille}</div>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: '#B87A0C', marginTop: 10, letterSpacing: 0.3 }}>
        {action} →
      </div>
    </button>
  );
}

function Bloc({ titre, sous, children }: { titre: string; sous?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid var(--color-card-border)', borderRadius: 14, padding: '16px 18px' }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: sous ? 2 : 10 }}>{titre}</h3>
      {sous && <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 10 }}>{sous}</p>}
      {children}
    </div>
  );
}
