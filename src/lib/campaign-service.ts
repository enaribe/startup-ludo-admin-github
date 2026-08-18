/**
 * Campagnes de l'Espace Annonceur — CRUD client (lot 4).
 *
 * Le sponsor manipule ici SES brouillons (`draft` ⇄ `in_review`) ; tout le
 * reste du cycle de vie passe par le serveur : la réservation d'exclusivité
 * (`POST /api/annonceur/reserver`) et les décisions de modération
 * (`POST /api/annonceur/decision`), qui publie le feed lu par le mobile.
 * Les règles Firestore rendent ces frontières non négociables — ce module se
 * contente de ne jamais essayer de les franchir.
 */

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, firestore, COLLECTIONS } from './firebase';
import type {
  Campaign,
  CampaignCardKind,
  CampaignFormat,
  CampaignObjectif,
  EditionReservation,
} from '@/types';

// ═══════════════════════════════════════════════════════════════════════════
// GRILLES TARIFAIRES (spec §1.3) — figées sur la campagne à la soumission
// ═══════════════════════════════════════════════════════════════════════════

export const GRILLES = {
  /** Carte opportunité : 15 F/vue · 100 F/clic, aucun frais fixe. */
  standard: { perView: 15, perClick: 100 },
  /** Édition sponsorisée : 25 F/vue · 150 F/clic, exclusivité mensuelle. */
  edition: { perView: 25, perClick: 150 },
  /** Visibilité renforcée — emplacements premium négociés, posée par CONCREE. */
  premium: { perView: 55, perClick: 200 },
} as const;

/** Bandeau produit par chaque objectif de l'étape 1 (spec §4.2). */
export const KIND_PAR_OBJECTIF: Record<CampaignObjectif, CampaignCardKind> = {
  offre_financement: 'financement',
  appel_candidatures: 'opportunite',
  programme_accompagnement: 'opportunite',
  evenement_formation: 'evenement',
};

/** Jetons de jeu par bandeau — règle du jeu, jamais configurable. */
export const JETONS_PAR_KIND: Record<CampaignCardKind, number> = {
  financement: 4,
  opportunite: 2,
  evenement: 2,
};

/** Longueurs imposées par la spec (message recto, texte édition, bouton). */
export const RECTO_MAX = 120;
export const SHORT_TEXT_MAX = 90;
export const CTA_LIBELLE_MAX = 34;

// ═══════════════════════════════════════════════════════════════════════════
// CRUD BROUILLONS
// ═══════════════════════════════════════════════════════════════════════════

function uidCourant(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Session expirée — reconnectez-vous.');
  return uid;
}

/** Purge les `undefined` (Firestore les refuse) sans toucher aux `null`. */
function sansIndefinis<T extends object>(objet: T): T {
  return Object.fromEntries(
    Object.entries(objet).filter(([, v]) => v !== undefined)
  ) as T;
}

/**
 * Crée un brouillon vierge et retourne son id. Le brouillon EST la sauvegarde
 * automatique du wizard : chaque étape le met à jour, quitter ne perd rien.
 */
export async function creerBrouillonCampagne(format: CampaignFormat): Promise<string> {
  const uid = uidCourant();
  const id = `camp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const grille = format === 'edition' ? 'edition' : 'standard';
  const maintenant = Date.now();

  const brouillon: Campaign = {
    id,
    ownerUid: uid,
    ownerEmail: auth.currentUser?.email ?? undefined,
    format,
    status: 'draft',
    targeting: { sectors: [], regions: [], contexts: [] },
    viewsGoal: 10_000,
    budgetCapFcfa: 0,
    pricing: { ...GRILLES[grille], grid: grille },
    createdAt: maintenant,
    updatedAt: maintenant,
  };

  await setDoc(doc(firestore, COLLECTIONS.campaigns, id), sansIndefinis(brouillon));
  return id;
}

export async function getCampagne(id: string): Promise<Campaign | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.campaigns, id));
  if (!snap.exists()) return null;
  return { ...(snap.data() as Campaign), id: snap.id };
}

/** Campagnes du compte courant, brouillons compris, plus récentes d'abord. */
export async function getMesCampagnes(): Promise<Campaign[]> {
  const uid = uidCourant();
  const snap = await getDocs(
    query(collection(firestore, COLLECTIONS.campaigns), where('ownerUid', '==', uid))
  );
  return snap.docs
    .map((d) => ({ ...(d.data() as Campaign), id: d.id }))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

/** Sauvegarde partielle d'un brouillon (appelée à chaque étape du wizard). */
export async function sauvegarderBrouillon(
  id: string,
  patch: Partial<Omit<Campaign, 'id' | 'ownerUid' | 'status' | 'reservationMonths'>>
): Promise<void> {
  await updateDoc(
    doc(firestore, COLLECTIONS.campaigns, id),
    sansIndefinis({ ...patch, updatedAt: Date.now() })
  );
}

/**
 * Soumet une campagne CARTE à la modération (draft → in_review).
 * Les campagnes ÉDITION passent par `POST /api/annonceur/reserver` : la
 * soumission et la réservation d'exclusivité doivent être atomiques.
 */
export async function soumettreCampagneCarte(id: string): Promise<void> {
  const maintenant = Date.now();
  await updateDoc(doc(firestore, COLLECTIONS.campaigns, id), {
    status: 'in_review',
    submittedAt: maintenant,
    consentAt: maintenant,
    updatedAt: maintenant,
  });
}

/** Supprime un brouillon abandonné (refusé par les règles au-delà de `draft`). */
export async function supprimerBrouillon(id: string): Promise<void> {
  await deleteDoc(doc(firestore, COLLECTIONS.campaigns, id));
}

// ═══════════════════════════════════════════════════════════════════════════
// RÉSERVATIONS (calendrier d'exclusivité)
// ═══════════════════════════════════════════════════════════════════════════

/** Toutes les réservations d'une édition — alimente le calendrier du wizard. */
export async function getReservationsEdition(editionId: string): Promise<EditionReservation[]> {
  const snap = await getDocs(
    query(
      collection(firestore, COLLECTIONS.editionReservations),
      where('editionId', '==', editionId)
    )
  );
  return snap.docs.map((d) => d.data() as EditionReservation);
}

/**
 * Réserve les mois choisis ET soumet la campagne — transaction serveur.
 * Résout en erreur lisible si un mois vient d'être pris par un concurrent.
 */
export async function reserverEtSoumettre(
  campaignId: string,
  editionId: string,
  months: string[]
): Promise<void> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Session expirée — reconnectez-vous.');

  const res = await fetch('/api/annonceur/reserver', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ campaignId, editionId, months }),
  });
  const json = (await res.json()) as { error?: string };
  if (!res.ok || json.error) {
    throw new Error(json.error || 'Réservation impossible — réessayez.');
  }
}

/** Les 12 prochains mois (AAAA-MM), mois courant inclus — l'axe du calendrier. */
export function prochainsMois(nombre = 12): string[] {
  const mois: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < nombre; i += 1) {
    mois.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() + 1);
  }
  return mois;
}

/** « octobre 2026 » depuis « 2026-10 ». */
export function libelleMois(mois: string): string {
  const [annee, m] = mois.split('-').map(Number);
  return new Date(annee, (m ?? 1) - 1, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
}
