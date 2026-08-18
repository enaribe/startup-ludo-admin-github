/**
 * Publication du FEED sponsor — la projection compacte lue par le mobile.
 *
 * Le jeu ne lit JAMAIS la collection `campaigns` (trop large, trop sensible :
 * budgets, e-mails, campagnes refusées). À chaque décision de modération, le
 * serveur reconstruit `sponsorFeed/cards` DEPUIS ZÉRO à partir des seules
 * campagnes carte ACTIVES : reconstruire est idempotent, un état corrompu ne
 * survit pas à la décision suivante — même philosophie que le recalcul des
 * cumuls du Mode Classe.
 *
 * Module SERVEUR uniquement (Admin SDK) : le feed est en `allow write: if
 * false` côté règles, c'est ici que vit la seule plume.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from './firebase';
import { JETONS_PAR_KIND } from './campaign-service';
import type { Campaign } from '@/types';

/**
 * Une carte du feed — le contrat partagé avec le mobile
 * (startup-ludo/src/services/firebase/sponsorFeedService.ts).
 */
export interface FeedCard {
  /** = id de la campagne : les métriques mobiles s'écrivent sous cette clé. */
  id: string;
  kind: 'financement' | 'opportunite' | 'evenement';
  tokens: number;
  text: string;
  structure: string;
  logoUrl: string | null;
  ctaUrl: string | null;
  ctaLabel: string | null;
  verso: {
    description: string;
    avantage: string | null;
    criteres: string | null;
    dateLimite: string | null;
  } | null;
  targeting: { sectors: string[]; regions: string[] };
  viewsGoal: number;
  perView: number;
  /** Bornes de diffusion (ms epoch), null = en continu. */
  startAt: number | null;
  endAt: number | null;
}

/** Projette une campagne carte active vers sa forme feed. */
export function projeterCarteFeed(campagne: Campaign): FeedCard | null {
  const carte = campagne.card;
  if (!carte || !carte.rectoText?.trim()) return null;
  return {
    id: campagne.id,
    kind: carte.kind,
    tokens: JETONS_PAR_KIND[carte.kind] ?? 2,
    text: carte.rectoText.trim(),
    structure: carte.structure?.trim() || '',
    logoUrl: carte.logoUrl || null,
    ctaUrl: carte.cta?.url || null,
    ctaLabel: carte.cta?.libelle || null,
    verso: carte.verso?.description
      ? {
          description: carte.verso.description,
          avantage: carte.verso.avantage || null,
          criteres: carte.verso.criteres || null,
          dateLimite: carte.verso.dateLimite || null,
        }
      : null,
    targeting: {
      sectors: campagne.targeting?.sectors ?? [],
      regions: campagne.targeting?.regions ?? [],
    },
    viewsGoal: campagne.viewsGoal ?? 0,
    perView: campagne.pricing?.perView ?? 15,
    startAt: campagne.period?.startAt ?? null,
    endAt: campagne.period?.endAt ?? null,
  };
}

/** Reconstruit et écrit `sponsorFeed/cards` depuis les campagnes actives. */
export async function publierFeed(db: Firestore): Promise<number> {
  const snap = await db
    .collection(COLLECTIONS.campaigns)
    .where('status', '==', 'active')
    .where('format', '==', 'card')
    .get();

  const cards = snap.docs
    .map((d) => projeterCarteFeed({ ...(d.data() as Campaign), id: d.id }))
    .filter((c): c is FeedCard => c !== null);

  await db.collection(COLLECTIONS.sponsorFeed).doc('cards').set({
    cards,
    updatedAt: Date.now(),
  });
  return cards.length;
}
