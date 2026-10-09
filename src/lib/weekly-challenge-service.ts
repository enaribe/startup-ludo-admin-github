/**
 * Défi de la semaine — service du back-office.
 *
 * ═══ POURQUOI LES LECTURES SONT CLIENT ET LES ÉCRITURES SERVEUR ═══
 *
 * Le dépôt lit le contenu de jeu directement avec le SDK Firestore client
 * (`ready-session-service.ts`, `getAchievements()`) : la règle autorise le
 * super admin, une route API n'apporterait rien. Les lectures ci-dessous
 * suivent cette convention.
 *
 * Les ÉCRITURES passent par `/api/defi/enregistrer` et `/api/defi/cloturer`,
 * pour un invariant que les règles Firestore ne peuvent pas tenir : **un seul
 * défi `ouvert` à la fois**. Une règle juge un document isolé, jamais une
 * collection — elle ne peut pas savoir qu'un autre défi est déjà ouvert. Or le
 * mobile lit le défi en cours avec `where('statut','==','ouvert') + limit(1)` :
 * deux défis ouverts donneraient un affichage arbitraire et deux classements
 * concurrents.
 *
 * `defiScores` est en LECTURE SEULE ici : c'est le mobile qui l'écrit pendant
 * les parties (cf. `COLLECTIONS.defiScores`).
 */
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { auth, firestore, COLLECTIONS } from './firebase';
import type { DefiScore, WeeklyChallenge } from '@/types/weeklyChallenge';

/** En-têtes d'appel des routes `/api/defi/*`, avec le jeton de l'admin. */
async function enTetesAuth(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

/**
 * Tous les défis, du plus récent au plus ancien.
 *
 * Tri sur `debutAt` et non sur l'id : `AAAA-Sxx` se trie correctement en texte
 * SAUF au passage d'année (`2025-S52` > `2026-S01` en comparaison de chaînes).
 */
export async function getDefis(): Promise<WeeklyChallenge[]> {
  const snap = await getDocs(
    query(collection(firestore, COLLECTIONS.weeklyChallenges), orderBy('debutAt', 'desc'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WeeklyChallenge);
}

/** Le défi ouvert, ou `null`. Sert à prévenir avant d'en ouvrir un autre. */
export async function getDefiOuvert(): Promise<WeeklyChallenge | null> {
  const snap = await getDocs(
    query(
      collection(firestore, COLLECTIONS.weeklyChallenges),
      where('statut', '==', 'ouvert'),
      limit(1)
    )
  );
  const premier = snap.docs[0];
  return premier ? ({ id: premier.id, ...premier.data() } as WeeklyChallenge) : null;
}

/**
 * Classement d'un défi, du meilleur au moins bon.
 *
 * Tri `xp desc` puis `parties asc` — à XP égal, moins de parties passe devant.
 * ⚠️ CE TRI DOIT RESTER IDENTIQUE à `getClassementDefi()` du mobile et à la
 * route de clôture : sinon le champion figé ne serait pas celui que le
 * classement affiche en tête.
 */
export async function getClassementDefi(defiId: string, nombre = 100): Promise<DefiScore[]> {
  const snap = await getDocs(
    query(
      collection(firestore, COLLECTIONS.defiScores),
      where('defiId', '==', defiId),
      orderBy('xp', 'desc'),
      orderBy('parties', 'asc'),
      limit(nombre)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DefiScore);
}

export interface SaisieDefi {
  /** Vide à la création : le serveur dérive l'id de la semaine de `debutAt`. */
  id?: string;
  titre: string;
  description: string;
  statut: WeeklyChallenge['statut'];
  debutAt: number;
  finAt: number;
}

/**
 * Crée ou modifie un défi.
 *
 * Lève avec le message du serveur — notamment le 409 « un défi est déjà
 * ouvert », qui doit remonter tel quel à l'écran : il nomme le défi en conflit
 * et dit quoi faire.
 */
export async function enregistrerDefi(
  saisie: SaisieDefi
): Promise<{ id: string; cree: boolean }> {
  const reponse = await fetch('/api/defi/enregistrer', {
    method: 'POST',
    headers: await enTetesAuth(),
    body: JSON.stringify(saisie),
  });
  const donnees = await reponse.json();
  if (!reponse.ok) throw new Error(donnees.error || 'Enregistrement impossible');
  return { id: donnees.id, cree: !!donnees.cree };
}

/**
 * Clôture un défi et fige son champion.
 *
 * Irréversible par conception : un second appel renvoie 409. Rejouer une
 * clôture après l'arrivée d'un score tardif changerait le champion déjà
 * annoncé aux joueurs.
 */
export async function cloturerDefi(
  id: string
): Promise<{ champion: WeeklyChallenge['champion']; participants: number }> {
  const reponse = await fetch('/api/defi/cloturer', {
    method: 'POST',
    headers: await enTetesAuth(),
    body: JSON.stringify({ id }),
  });
  const donnees = await reponse.json();
  if (!reponse.ok) throw new Error(donnees.error || 'Clôture impossible');
  return { champion: donnees.champion ?? null, participants: donnees.participants ?? 0 };
}

/**
 * Bornes de la semaine prochaine : lundi 00:00 UTC → dimanche 23:00 UTC.
 *
 * ⚠️ LA CLÔTURE EST À 23:00, PAS À MINUIT. `resetWeeklyStats` tourne le lundi à
 * 00:00 UTC : une clôture à minuit pile courrait contre elle. L'heure d'écart
 * laisse la désignation du champion se faire avant toute remise à zéro.
 */
export function prochaineSemaine(depuis = Date.now()): { debutAt: number; finAt: number } {
  const d = new Date(depuis);
  const jour = d.getUTCDay(); // 0 = dimanche
  // Jours jusqu'au prochain lundi ; un lundi, on vise le lundi SUIVANT (7).
  const joursJusquaLundi = ((8 - jour) % 7) || 7;
  const lundi = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + joursJusquaLundi)
  );
  const dimanche = new Date(lundi.getTime());
  dimanche.setUTCDate(dimanche.getUTCDate() + 6);
  dimanche.setUTCHours(23, 0, 0, 0);
  return { debutAt: lundi.getTime(), finAt: dimanche.getTime() };
}
