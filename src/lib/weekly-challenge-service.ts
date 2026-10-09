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
import { appelerGeneration } from '@/lib/ai-client';
import { normaliserContenu, type MixSeance } from '@/lib/class-session-generation';
import { auth, firestore, COLLECTIONS } from './firebase';
import type { ClassSessionContent } from '@/types';
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
  /** Édition imposée au joueur : le contenu généré y est ancré. */
  editionId: string;
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

/**
 * Génère le contenu de jeu d'un défi depuis son thème.
 *
 * ═══ POURQUOI RÉUTILISER `class_session_content` ═══
 *
 * Le prompt du Mode Classe produit exactement la forme attendue : les cinq
 * types de cartes, ancrés sur un sujet donné. La seule différence est la source
 * du sujet — un cours déposé par l'enseignant là-bas, le thème du défi ici.
 *
 * Ajouter un type de génération dédié dupliquerait un prompt de plusieurs
 * centaines de lignes pour changer une phrase d'amorce. On passe donc le thème
 * en `sourceText`, qui est le champ que le prompt lit comme matière première.
 *
 * ═══ LE CONTENU EST GÉNÉRÉ UNE FOIS, PUIS RELU ═══
 *
 * Il n'est PAS régénéré à chaque partie : ce serait un appel modèle par joueur,
 * un contenu différent pour un même défi annoncé — et donc un classement qui
 * comparerait des épreuves différentes. Même raison que `readySessions`, dont
 * le contenu est figé à la création.
 *
 * La relecture humaine est le garde-fou : `normaliserContenu` écarte les cartes
 * malformées, mais rien ne détecte une question fausse ou hors sujet.
 */
export async function genererContenuDefi(
  defi: { id: string; titre: string; description: string; editionId: string },
  mix: MixSeance = MIX_DEFI_DEFAUT
): Promise<ClassSessionContent> {
  const sujet = [defi.titre, defi.description].filter(Boolean).join('\n\n');

  const res = await appelerGeneration({
    type: 'class_session_content',
    prompt:
      `Défi entrepreneurial hebdomadaire sur le thème : « ${defi.titre} ». ` +
      `Les cartes doivent toutes porter sur ce thème, dans un contexte de création ` +
      `d'entreprise en Afrique de l'Ouest.`,
    context: {
      sessionTitle: defi.titre,
      // Le thème EST la matière première, à la place du cours de l'enseignant.
      sourceText: sujet,
      mix,
    },
  });

  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || 'Génération impossible.');

  // Le seed horodaté garantit des ids uniques entre deux générations du même
  // défi : régénérer ne crée pas de collision avec le contenu précédent.
  return normaliserContenu(json.data, `d${Date.now().toString(36)}`);
}

/**
 * Mix par défaut d'un défi.
 *
 * Plus court qu'une séance de classe (8 quiz) : un défi se joue en quelques
 * minutes, seul, et doit pouvoir être rejoué dans la semaine. Un contenu trop
 * long ferait abandonner avant la fin, et le score ne refléterait alors que la
 * patience du joueur.
 */
export const MIX_DEFI_DEFAUT: MixSeance = {
  quiz: 6,
  duel: 2,
  funding: 2,
  opportunity: 2,
  challenge: 2,
};

/** Enregistre le contenu généré sur le défi, après relecture. */
export async function enregistrerContenuDefi(
  id: string,
  contenu: ClassSessionContent
): Promise<void> {
  const reponse = await fetch('/api/defi/contenu', {
    method: 'POST',
    headers: await enTetesAuth(),
    body: JSON.stringify({ id, contenu }),
  });
  const donnees = await reponse.json();
  if (!reponse.ok) throw new Error(donnees.error || 'Enregistrement du contenu impossible');
}
