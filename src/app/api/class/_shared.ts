/**
 * Briques communes aux deux routes publiques de rattachement
 * (`/api/class/join/[code]` et `/api/class/link`).
 *
 * Le préfixe `_` exclut ce fichier du routage Next.js : ce n'est pas une route,
 * juste un module partagé — et surtout, le limiteur de tentatives DOIT être un
 * état unique aux deux routes, sinon un attaquant balaierait les codes par
 * `/api/class/link` pendant que `/api/class/join` le bloque.
 */

import type { NextRequest } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { COLLECTIONS } from '@/lib/firebase';

/**
 * Message unique du refus, exigé mot pour mot par la spécification.
 * Il est renvoyé pour un code inconnu COMME pour un code expiré : distinguer
 * les deux transformerait la route en oracle (« ce code existe, il est juste
 * expiré » suffit à confirmer un tirage réussi).
 */
export const MESSAGE_CODE_INVALIDE =
  'Ce code n’est plus valide. Demandez à votre enseignant de le réactiver.';

/** Alphabet du code — sans O/0 ni I/1 (cf. `school-service.ts`). */
const ALPHABET_CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/**
 * Nettoie et valide un code saisi : espaces retirés, majuscules forcées.
 * Renvoie `null` si le code ne peut pas être un code de rattachement — on
 * économise ainsi une lecture Firestore sur toute saisie manifestement fausse.
 */
export function normaliserCode(brut: string | undefined | null): string | null {
  if (typeof brut !== 'string') return null;
  const code = brut.trim().toUpperCase().replace(/\s+/g, '');
  return ALPHABET_CODE.test(code) ? code : null;
}

// ═════════════════════════════════════════════════════════════════════════
// LIMITE DE TENTATIVES PAR IP
// ═════════════════════════════════════════════════════════════════════════
//
// C'est la contrepartie indispensable de la fenêtre éphémère : sans elle, un
// script peut balayer les 32^6 codes possibles pendant qu'une fenêtre est
// ouverte quelque part et récupérer une liste d'élèves mineurs. Avec 10 essais
// par 5 min, balayer une fraction significative de l'espace prendrait des
// siècles — alors qu'une fenêtre dure 15 minutes.
//
// ⚠️ LIMITES ASSUMÉES DE CETTE IMPLÉMENTATION — à connaître avant de s'y fier :
//
//   1. EN MÉMOIRE DU PROCESSUS. Le compteur ne survit pas à un redémarrage, et
//      sur Vercel chaque instance serverless a le sien : à N instances, la
//      limite effective est N × 10. Elle freine le balayage, elle ne le rend
//      pas impossible.
//   2. L'IP est lue dans `x-forwarded-for`, en-tête que le client contrôle. Sur
//      Vercel, le proxy réécrit cet en-tête, donc la valeur est fiable EN
//      PRODUCTION ; en local ou derrière un proxy mal configuré, elle est
//      falsifiable — et il suffit alors d'en changer pour repartir à zéro.
//   3. Une salle de classe partage une IP (NAT de l'établissement). 30 élèves
//      qui saisissent le code en même temps depuis le même wifi partagent donc
//      le quota — d'où un plafond volontairement large (30 succès + tentatives
//      ratées tiennent dans la fenêtre grâce au point suivant).
//
// COMPENSATION du point 3 : seuls les ÉCHECS sont comptés (`enregistrerEchec`).
// Une classe entière qui se rattache correctement ne consomme aucun crédit ;
// seul celui qui se trompe — ou qui balaie — en consomme.
//
// À L'ÉCHELLE, il faudra un limiteur distribué (Upstash Redis, Vercel KV, ou
// Firestore avec un compteur transactionnel par IP). C'est un remplacement de
// `verifierQuota` / `enregistrerEchec`, pas une refonte des routes.

/** Nombre d'échecs tolérés par IP dans la fenêtre glissante. */
const MAX_ECHECS = 10;

/** Largeur de la fenêtre glissante, en millisecondes. */
const FENETRE_MS = 5 * 60_000;

/** Horodatages des échecs récents, par IP. Purgé à la volée. */
const echecsParIp = new Map<string, number[]>();

/**
 * Taille maximale de la table avant purge intégrale. Sans ce garde-fou, une
 * attaque en rotation d'IP ferait grossir la Map indéfiniment (fuite mémoire).
 */
const MAX_IPS_SUIVIES = 10_000;

/** Adresse de l'appelant, telle que la voit le proxy (cf. limite n°2 ci-dessus). */
function lireIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.headers.get('x-real-ip')?.trim() || 'inconnue';
}

/** Retire les horodatages sortis de la fenêtre glissante. */
function echecsRecents(ip: string, maintenant: number): number[] {
  const bruts = echecsParIp.get(ip) ?? [];
  return bruts.filter((t) => maintenant - t < FENETRE_MS);
}

/** Verdict du limiteur : autorisé, ou délai avant nouvelle tentative. */
export interface Quota {
  autorise: boolean;
  /** Secondes à attendre avant que le plus ancien échec ne sorte de la fenêtre. */
  retryAfterSeconds: number;
}

/**
 * L'IP appelante a-t-elle encore droit à une tentative ?
 * À appeler **avant toute lecture Firestore** : un balayage ne doit rien coûter
 * en quota de lecture.
 */
export function verifierQuota(req: NextRequest): Quota {
  const maintenant = Date.now();
  const ip = lireIp(req);
  const recents = echecsRecents(ip, maintenant);
  if (recents.length < MAX_ECHECS) return { autorise: true, retryAfterSeconds: 0 };
  const plusAncien = recents[0]!;
  return {
    autorise: false,
    retryAfterSeconds: Math.max(1, Math.ceil((FENETRE_MS - (maintenant - plusAncien)) / 1000)),
  };
}

/**
 * Comptabilise UN échec pour l'IP appelante (code inconnu, expiré, ou refus).
 * Les succès ne sont pas comptés : une classe entière qui se rattache derrière
 * la même IP ne doit pas s'auto-bloquer (cf. limite n°3).
 */
export function enregistrerEchec(req: NextRequest): void {
  const maintenant = Date.now();
  const ip = lireIp(req);
  // Purge intégrale au-delà du seuil : brutal mais borné, et sans effet de bord
  // sur la sécurité (au pire, un attaquant regagne des crédits — au prix d'avoir
  // dû faire tourner 10 000 IP distinctes).
  if (echecsParIp.size > MAX_IPS_SUIVIES) echecsParIp.clear();
  echecsParIp.set(ip, [...echecsRecents(ip, maintenant), maintenant]);
}

// ═════════════════════════════════════════════════════════════════════════
// RÉSOLUTION DU CODE
// ═════════════════════════════════════════════════════════════════════════

/** Classe résolue depuis un code de rattachement encore valide. */
export interface ClasseResolue {
  classId: string;
  className: string;
  /** Expiration de la fenêtre, en millisecondes epoch. */
  joinCodeExpiresAt: number;
}

/**
 * Trouve la classe portant ce code, **si et seulement si** sa fenêtre est
 * encore ouverte. Renvoie `null` dans tous les autres cas (inconnu, expiré).
 *
 * ⚠️ REQUÊTE INDEXÉE sur `joinCode` avec `limit(1)` — jamais un listing de la
 * collection `classes`. C'est l'anti-pattern explicitement proscrit par le plan
 * (`joinRoom()` du mobile télécharge toute la table avant de chercher un code) :
 * ici, il serait doublement coûteux puisque la route est publique et donc
 * balayable.
 *
 * L'expiration est vérifiée **en mémoire** sur l'unique document trouvé plutôt
 * que dans la requête : un second `where` sur `joinCodeExpiresAt` imposerait un
 * index composite pour économiser la lecture d'un seul document.
 */
export async function resoudreClasseParCode(
  db: Firestore,
  code: string
): Promise<ClasseResolue | null> {
  const snap = await db
    .collection(COLLECTIONS.classes)
    .where('joinCode', '==', code)
    .limit(1)
    .get();
  if (snap.empty) return null;

  const docSnap = snap.docs[0]!;
  const data = docSnap.data() as { name?: string; joinCodeExpiresAt?: number | null };
  const expiration = Number(data.joinCodeExpiresAt ?? 0);
  if (!expiration || expiration <= Date.now()) return null; // Fenêtre fermée.

  return {
    classId: docSnap.id,
    className: data.name ?? '',
    joinCodeExpiresAt: expiration,
  };
}

/** Une séance ouverte, résolue par son code de salle d'attente. */
export interface SeanceResolue {
  sessionId: string;
  /** Classe de la séance — c'est ELLE qui borne qui a le droit d'entrer. */
  classId: string;
  className: string;
  sessionTitle: string;
  /** Édition support, pour l'annoncer côté mobile. */
  editionId: string;
  /** True si l'enseignant a déjà cliqué « Démarrer la partie ». */
  demarree: boolean;
}

/**
 * Résout une SÉANCE par son code de salle d'attente.
 *
 * Décalque exact de `resoudreClasseParCode`, sur `classSessions` : même requête
 * indexée (jamais un listing), même filtrage de l'expiration en mémoire sur le
 * seul document trouvé, même `null` unique pour « inconnu » comme pour
 * « expiré » — l'appelant ne doit jamais pouvoir distinguer les deux.
 *
 * ⚠️ `status === 'running'` EST VÉRIFIÉ ICI : une séance `scheduled` n'a pas de
 * code, mais une séance `ended` peut en garder un le temps que l'écriture de
 * clôture se propage. Entrer dans une séance terminée écrirait une participation
 * après le calcul des cumuls — donc un résultat perdu.
 *
 * Ce que cette fonction NE fait PAS, et c'est essentiel : autoriser quoi que ce
 * soit. Elle désigne une séance ; c'est la règle Firestore `estCetEleve()` qui
 * vérifie ensuite que l'appelant est rattaché à CETTE classe.
 */
export async function resoudreSeanceParCode(
  db: Firestore,
  code: string
): Promise<SeanceResolue | null> {
  const snap = await db
    .collection(COLLECTIONS.classSessions)
    .where('joinCode', '==', code)
    .limit(1)
    .get();
  if (snap.empty) return null;

  const docSnap = snap.docs[0]!;
  const donnees = docSnap.data() as {
    classId?: string;
    title?: string;
    editionId?: string;
    status?: string;
    joinCodeExpiresAt?: number | null;
    startedPlayingAt?: number | null;
  };

  const finCode = Number(donnees.joinCodeExpiresAt ?? 0);
  if (!finCode || finCode <= Date.now()) return null; // Code expiré.
  if (donnees.status !== 'running') return null; // Séance close ou pas ouverte.
  if (!donnees.classId) return null; // Séance corrompue : rien à ouvrir.

  // Le nom de la classe est lu séparément : la séance ne le porte pas, et
  // l'annoncer permet le refus explicite (« réservée à la Terminale S2 »).
  const classeSnap = await db.collection(COLLECTIONS.classes).doc(donnees.classId).get();

  return {
    sessionId: docSnap.id,
    classId: donnees.classId,
    className: (classeSnap.data()?.name as string) ?? '',
    sessionTitle: donnees.title ?? '',
    editionId: donnees.editionId ?? '',
    demarree: !!donnees.startedPlayingAt,
  };
}
