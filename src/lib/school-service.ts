/**
 * Service Mode Classe — établissements, classes et élèves.
 *
 * Écrit avec le SDK **client** Firebase, comme `firestore-service.ts` : les
 * écrans du back-office passent par les règles Firestore, qui restent donc la
 * seule et vraie borne de sécurité. Une isolation qui n'existerait que dans
 * l'interface ne protégerait rien (leçon du chantier sponsor).
 *
 * Trois invariants sont tenus côté règles ET reflétés ici :
 *   1. un enseignant ne lit que les classes de son claim `classIds` — d'où
 *      `getClassesByIds`, qui lit document par document au lieu de lister la
 *      collection `classes` (listing qu'un enseignant n'a pas le droit de faire) ;
 *   2. un admin d'établissement ne sort jamais de son `establishmentId` ;
 *   3. un élève retiré n'est jamais supprimé (`isActive: false`).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
import { firestore, COLLECTIONS } from './firebase';
import type { Establishment, Learner, SchoolClass } from '@/types';

// ===== ÉTABLISSEMENTS =====

/** Charge un établissement, ou `null` s'il n'existe pas. */
export async function getEstablishment(establishmentId: string): Promise<Establishment | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.establishments, establishmentId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Establishment;
}

/**
 * Liste tous les établissements. **Réservé au super admin** : les règles
 * n'autorisent le listing de la collection à aucun rôle scolaire (un directeur
 * ne lit que SON document). Sert au sélecteur d'établissement du super admin.
 */
export async function getEstablishments(): Promise<Establishment[]> {
  const snap = await getDocs(collection(firestore, COLLECTIONS.establishments));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Establishment));
}

/**
 * Crée ou met à jour un établissement (merge : on ne réécrit que les champs
 * fournis, ce qui évite d'écraser des champs ajoutés par un lot ultérieur).
 */
export async function saveEstablishment(
  establishmentId: string,
  data: Omit<Establishment, 'id'>
): Promise<void> {
  await setDoc(
    doc(firestore, COLLECTIONS.establishments, establishmentId),
    { ...data, updatedAt: Date.now() },
    { merge: true }
  );
}

// ===== CLASSES =====

/**
 * Classes d'un établissement — usage d'un admin d'établissement.
 * La requête est filtrée sur `establishmentId`, exactement comme la règle
 * Firestore : sans ce `where`, la lecture serait refusée en bloc.
 */
export async function getClasses(establishmentId: string): Promise<SchoolClass[]> {
  if (!establishmentId) return [];
  const q = query(
    collection(firestore, COLLECTIONS.classes),
    where('establishmentId', '==', establishmentId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SchoolClass));
}

/**
 * Liste TOUTES les classes, tous établissements confondus.
 *
 * **Réservé au super admin** : les règles Firestore n'autorisent le listing de
 * la collection `classes` à aucun rôle scolaire (un directeur doit filtrer sur
 * son `establishmentId`, un enseignant lit document par document). Sert à
 * l'écran `/etablissements`, qui affiche le nombre de classes de chaque client —
 * une seule requête, plutôt qu'un `getClasses()` par établissement.
 */
export async function getAllClasses(): Promise<SchoolClass[]> {
  const snap = await getDocs(collection(firestore, COLLECTIONS.classes));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SchoolClass));
}

/** Charge une classe, ou `null` si elle n'existe pas. */
export async function getClass(classId: string): Promise<SchoolClass | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.classes, classId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as SchoolClass;
}

/**
 * Charge uniquement les classes dont les ids sont fournis — périmètre d'un
 * **enseignant** (`scopedClassIds`, image du claim `classIds`).
 *
 * On lit document par document, JAMAIS via un listing de `classes` : la règle
 * Firestore de l'enseignant s'exprime sur l'id du document (`cid in
 * token.classIds`), ce qu'une requête de collection ne peut pas satisfaire.
 * Les ids introuvables sont ignorés (classe supprimée depuis l'affectation).
 */
export async function getClassesByIds(classIds: string[]): Promise<SchoolClass[]> {
  if (classIds.length === 0) return [];
  const results = await Promise.all(classIds.map((id) => getClass(id)));
  return results.filter((c): c is SchoolClass => c !== null);
}

/**
 * Crée ou met à jour une classe (merge, comme `saveEstablishment`).
 * `establishmentId` fait partie des données : c'est lui que la règle Firestore
 * compare au claim de l'appelant, il ne doit donc jamais être omis.
 */
export async function saveClass(classId: string, data: Omit<SchoolClass, 'id'>): Promise<void> {
  await setDoc(
    doc(firestore, COLLECTIONS.classes, classId),
    { ...data, updatedAt: Date.now() },
    { merge: true }
  );
}

/**
 * Supprime une classe.
 *
 * ⚠️ Firestore ne supprime pas les sous-collections : les `learners` restent
 * orphelins. C'est volontairement conservé — supprimer une classe est un geste
 * rare (erreur de saisie), et perdre l'historique des élèves serait pire. Pour
 * retirer une classe de l'année en cours sans rien perdre, préférer le retrait
 * des élèves un par un.
 */
export async function deleteClass(classId: string): Promise<void> {
  await deleteDoc(doc(firestore, COLLECTIONS.classes, classId));
}

// ===== QUOTA D'ÉLÈVES =====

/**
 * Erreur de quota — distinguée d'une erreur réseau pour que l'écran affiche le
 * message tel quel (il indique combien de places restent) au lieu d'un « Erreur
 * lors de l'ajout » générique.
 */
export class QuotaDepasseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaDepasseError';
  }
}

/**
 * Places d'élèves restantes dans un établissement, ou `null` si le quota est
 * illimité (`maxLearners` à 0, convention de la fiche établissement).
 *
 * COMPTAGE : la somme des `learnerCount` des classes de l'établissement, qui ne
 * compte QUE les élèves actifs (l'écran de classe le réécrit à chaque mouvement,
 * cf. `majEffectif`). C'est une lecture de N documents `classes`, contre N
 * sous-collections `learners` si on comptait à la source — un ordre de grandeur
 * de moins, pour une donnée que le back-office maintient déjà.
 *
 * ⚠️ Ce contrôle est CÔTÉ CLIENT : il informe et bloque le geste normal, mais un
 * appel direct à Firestore le contournerait. Le quota d'élèves est un engagement
 * commercial, pas une frontière de sécurité (contrairement au périmètre
 * `establishmentId`, lui tenu par les règles) — l'arbitrage est assumé : le faire
 * appliquer par les règles imposerait un compteur transactionnel sur
 * l'établissement, que le lot 4 devra de toute façon revisiter.
 */
export async function getPlacesElevesRestantes(
  establishmentId: string
): Promise<number | null> {
  if (!establishmentId) return null;
  const etablissement = await getEstablishment(establishmentId);
  const maxLearners = Number(etablissement?.maxLearners ?? 0);
  if (!Number.isFinite(maxLearners) || maxLearners <= 0) return null; // 0 = illimité.

  const classes = await getClasses(establishmentId);
  const effectif = classes.reduce((somme, c) => somme + (c.learnerCount ?? 0), 0);
  return Math.max(0, maxLearners - effectif);
}

/**
 * Vérifie qu'on peut encore ajouter `nombre` élèves, et lève sinon.
 *
 * `establishmentId` peut être vide : c'est le cas d'un enseignant, qui n'a pas
 * le droit de lister les classes de son établissement (règles Firestore) et ne
 * peut donc pas calculer l'effectif global. Le contrôle est alors sauté —
 * l'enseignant ajoute au fil de l'eau, le directeur voit le quota sur sa fiche.
 */
export async function assertQuotaEleves(
  establishmentId: string,
  nombre: number
): Promise<void> {
  if (!establishmentId || nombre <= 0) return;
  const restantes = await getPlacesElevesRestantes(establishmentId);
  if (restantes === null || nombre <= restantes) return;
  throw new QuotaDepasseError(
    restantes === 0
      ? 'Quota d’élèves atteint : votre licence ne permet plus d’ajouter d’élève. Retirez un élève d’une classe ou contactez l’équipe CONCREE.'
      : `Quota d’élèves dépassé : il ne reste que ${restantes} place${restantes > 1 ? 's' : ''} sur votre licence, pour ${nombre} élève${nombre > 1 ? 's' : ''} à ajouter.`
  );
}

// ===== ÉLÈVES (sous-collection `classes/{classId}/learners`) =====

/** Tous les élèves d'une classe, retirés compris (le filtrage est fait à l'écran). */
export async function getLearners(classId: string): Promise<Learner[]> {
  const snap = await getDocs(collection(firestore, COLLECTIONS.classLearners(classId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Learner));
}

/**
 * Ajoute un élève et renvoie le document créé (id inclus).
 * Un nouvel élève est toujours actif et non rattaché : le rattachement se fera
 * par la fenêtre du lot 4.
 *
 * Lève `QuotaDepasseError` si `maxLearners` est atteint pour l'établissement
 * fourni (omis ou vide = aucun contrôle, cf. `assertQuotaEleves`).
 */
export async function addLearner(
  classId: string,
  data: Pick<Learner, 'firstName' | 'lastName'> & Partial<Pick<Learner, 'externalId'>>,
  establishmentId?: string
): Promise<Learner> {
  await assertQuotaEleves(establishmentId ?? '', 1);
  const ref = doc(collection(firestore, COLLECTIONS.classLearners(classId)));
  const now = Date.now();
  const learner: Omit<Learner, 'id'> = {
    firstName: data.firstName,
    lastName: data.lastName,
    externalId: data.externalId?.trim() || '',
    linkedUid: null,
    linkedAt: null,
    isActive: true,
    totalSessions: 0,
    lastPlayedAt: null,
    masteryByCategory: {},
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, learner);
  return { id: ref.id, ...learner };
}

/**
 * Ajoute plusieurs élèves en une seule écriture (import CSV).
 *
 * Un `writeBatch` plutôt que N `addLearner` : c'est atomique (une classe n'est
 * jamais importée à moitié) et ça évite N allers-retours réseau. La limite de
 * 500 opérations par lot est couverte par un découpage en tranches — une liste
 * de classe la dépasse rarement, mais un fichier collé à la va-vite le peut.
 *
 * Le quota est vérifié pour la TOTALITÉ du fichier avant la première écriture :
 * un import est tout ou rien, importer 20 élèves sur 35 laisserait une liste de
 * classe fausse et silencieusement incomplète.
 */
export async function addLearners(
  classId: string,
  entries: Array<Pick<Learner, 'firstName' | 'lastName'> & Partial<Pick<Learner, 'externalId'>>>,
  establishmentId?: string
): Promise<Learner[]> {
  if (entries.length === 0) return [];
  await assertQuotaEleves(establishmentId ?? '', entries.length);
  const now = Date.now();
  const created: Learner[] = [];
  const TAILLE_LOT = 400; // marge sous la limite Firestore de 500 opérations.

  for (let i = 0; i < entries.length; i += TAILLE_LOT) {
    const batch = writeBatch(firestore);
    for (const entry of entries.slice(i, i + TAILLE_LOT)) {
      const ref = doc(collection(firestore, COLLECTIONS.classLearners(classId)));
      const learner: Omit<Learner, 'id'> = {
        firstName: entry.firstName,
        lastName: entry.lastName,
        externalId: entry.externalId?.trim() || '',
        linkedUid: null,
        linkedAt: null,
        isActive: true,
        totalSessions: 0,
        lastPlayedAt: null,
        masteryByCategory: {},
        createdAt: now,
        updatedAt: now,
      };
      batch.set(ref, learner);
      created.push({ id: ref.id, ...learner });
    }
    await batch.commit();
  }

  return created;
}

/** Met à jour les champs fournis d'un élève. */
export async function updateLearner(
  classId: string,
  learnerId: string,
  patch: Partial<Omit<Learner, 'id'>>
): Promise<void> {
  await updateDoc(doc(firestore, COLLECTIONS.classLearners(classId), learnerId), {
    ...patch,
    updatedAt: Date.now(),
  });
}

/**
 * Retire un élève de la classe — **jamais une suppression**.
 *
 * `isActive: false` conserve l'historique (les séances passées et le bilan de
 * classe doivent rester justes), et `linkedUid: null` **libère le compte de
 * l'élève**, qui pourra être rattaché à une autre classe. C'est exactement le
 * geste décrit dans SPEC « Mouvements d'élèves ».
 */
export async function removeLearner(classId: string, learnerId: string): Promise<void> {
  await updateLearner(classId, learnerId, { isActive: false, linkedUid: null, linkedAt: null });
  // ⚠️ DETTE CONNUE — le miroir `classLinks/{uid}` n'est pas effacé ici.
  // Il est en `allow write: if false` (écrit uniquement par l'Admin SDK, cf.
  // /api/class/link) et ce service tourne côté client : impossible d'y toucher.
  // Conséquence : un élève retiré ne peut plus être identifié dans la classe
  // (son `linkedUid` est effacé, son nom redevient libre) mais il conserve la
  // LECTURE des séances `running` de son ancienne classe.
  // À corriger au lot 5 : passer ce retrait derrière une route serveur qui
  // supprime aussi `classLinks/{uid}` dans la même opération.
}

/** Réintègre un élève retiré (annulation d'un retrait). Le compte reste à relier. */
export async function restoreLearner(classId: string, learnerId: string): Promise<void> {
  await updateLearner(classId, learnerId, { isActive: true });
}

/**
 * S'abonne en direct aux élèves d'une classe (`onSnapshot`).
 *
 * Utilisé par l'écran de projection du rattachement : le prof voit les coches
 * vertes apparaître au fur et à mesure que les élèves lient leur compte, sans
 * rafraîchir. C'est le seul temps réel du back-office avec le suivi de séance,
 * et il est **borné à une seule sous-collection** — jamais un listing global.
 *
 * @returns la fonction de désabonnement, à appeler au démontage du composant
 *          (sans quoi l'écouteur survit à la navigation et continue de facturer).
 */
export function ecouterLearners(
  classId: string,
  onChange: (eleves: Learner[]) => void,
  onError?: (erreur: Error) => void
): () => void {
  return onSnapshot(
    collection(firestore, COLLECTIONS.classLearners(classId)),
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Learner))),
    (erreur) => onError?.(erreur)
  );
}

// ===== FENÊTRE DE RATTACHEMENT (lot 4a) =====

/**
 * Alphabet du code de rattachement — **sans caractère ambigu** : ni O/0, ni I/1.
 *
 * C'est exactement celui de `generateRoomCode` du projet mobile
 * (`src/services/multiplayer/MultiplayerSync.ts:105`), et ce n'est pas un détail
 * cosmétique : le code est **dicté à voix haute** et écrit au tableau. Un « 0 »
 * lu « O » par un élève au fond de la salle, c'est une tentative perdue et un
 * appel au prof.
 */
const ALPHABET_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Longueur du code de rattachement, alignée sur les codes de partie du mobile. */
const LONGUEUR_CODE = 6;

/** Durées de fenêtre proposées à l'enseignant, en minutes. */
export const DUREES_RATTACHEMENT = [5, 15, 30, 60] as const;

/** Durée par défaut d'une fenêtre de rattachement, en minutes (cf. SPEC §1). */
export const DUREE_RATTACHEMENT_DEFAUT = 15;

/** Nombre de tirages avant d'abandonner sur une collision de code. */
const TENTATIVES_CODE = 5;

/** Tire un code de 6 caractères dans l'alphabet sans ambiguïté. */
function genererCode(): string {
  let code = '';
  for (let i = 0; i < LONGUEUR_CODE; i += 1) {
    code += ALPHABET_CODE.charAt(Math.floor(Math.random() * ALPHABET_CODE.length));
  }
  return code;
}

/**
 * Le code est-il déjà porté par une classe dont la fenêtre est **encore active** ?
 *
 * ⚠️ REQUÊTE INDEXÉE, jamais un listing complet. C'est précisément
 * l'anti-pattern de `joinRoom()` côté mobile (`MultiplayerSync.ts:209-227`), qui
 * télécharge toute la table avant de chercher un code : à 30 établissements et
 * 500 classes, ce serait 500 documents lus à chaque ouverture de fenêtre.
 *
 * L'expiration est filtrée **en mémoire** sur le seul document trouvé, et non
 * dans la requête : un `where('joinCode', '==', …)` combiné à un
 * `where('joinCodeExpiresAt', '>', …)` exigerait un index composite, pour
 * économiser la lecture d'un unique document. Le `limit(1)` suffit — deux
 * classes ne peuvent pas porter le même code actif, c'est l'invariant tenu ici.
 */
async function codeDejaActif(code: string): Promise<boolean> {
  // Passe par le serveur : ce contrôle est un LISTING de `classes`, que les
  // règles refusent à un enseignant (sa permission porte sur l'ID du document,
  // via le claim `classIds`, pas sur un champ). L'autoriser dans les règles
  // laisserait n'importe qui énumérer les classes de tous les établissements.
  const { getAuth } = await import('firebase/auth');
  const token = await getAuth().currentUser?.getIdToken();
  if (!token) throw new Error('Session expirée : reconnectez-vous.');

  const reponse = await fetch('/api/class/verifier-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ code }),
  });
  if (!reponse.ok) {
    // En cas d'échec, on considère le code comme pris : l'appelant en tirera un
    // autre. Mieux vaut un tirage de plus qu'un doublon de code actif.
    return true;
  }
  const data = (await reponse.json()) as { actif?: boolean };
  return data.actif === true;
}

/** Résultat de l'ouverture d'une fenêtre : le code à dicter et son échéance. */
export interface FenetreRattachement {
  /** Code à 6 caractères, à dicter à voix haute. */
  joinCode: string;
  /** Instant d'expiration, en millisecondes epoch. */
  joinCodeExpiresAt: number;
}

/**
 * Erreur d'ouverture de fenêtre — distinguée pour afficher un message utile
 * plutôt qu'un « Erreur » générique (cf. `QuotaDepasseError`).
 */
export class RattachementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RattachementError';
  }
}

/**
 * Ouvre une fenêtre de rattachement sur une classe.
 *
 * Le code vit sur `classes/{id}`, **pas** sur la séance : il sert au
 * rattachement (une fois par élève), pas au jeu. Sa brièveté est ce qui protège
 * la liste nominative d'élèves mineurs — un code qui fuit est déjà expiré.
 *
 * UNICITÉ : le code est retiré parmi les classes dont la fenêtre est encore
 * active, avec jusqu'à 5 tirages. Sur 32^6 ≈ 1,07 milliard de combinaisons et
 * quelques dizaines de fenêtres ouvertes simultanément, une collision est déjà
 * improbable ; cinq essais la rendent négligeable. Au-delà, on lève plutôt que
 * d'écrire un code ambigu — deux classes partageant un code enverraient des
 * élèves dans la mauvaise liste.
 *
 * ⚠️ COURSE POSSIBLE : entre la vérification et l'écriture, une autre classe
 * peut poser le même code. Le risque est accepté ici (probabilité négligeable,
 * fenêtre de quelques millisecondes) ; le supprimer imposerait une transaction
 * sur toute la collection `classes`, hors de portée des règles côté client.
 *
 * @param classId       Classe sur laquelle ouvrir la fenêtre.
 * @param dureeMinutes  Durée de validité (5 / 15 / 30 / 60), 15 par défaut.
 */
export async function ouvrirFenetreRattachement(
  classId: string,
  dureeMinutes: number = DUREE_RATTACHEMENT_DEFAUT
): Promise<FenetreRattachement> {
  const duree = Number.isFinite(dureeMinutes) && dureeMinutes > 0
    ? Math.floor(dureeMinutes)
    : DUREE_RATTACHEMENT_DEFAUT;

  let code: string | null = null;
  for (let essai = 0; essai < TENTATIVES_CODE; essai += 1) {
    const candidat = genererCode();
    if (!(await codeDejaActif(candidat))) {
      code = candidat;
      break;
    }
  }
  if (!code) {
    throw new RattachementError(
      'Impossible de générer un code disponible. Réessayez dans quelques instants.'
    );
  }

  const joinCodeExpiresAt = Date.now() + duree * 60_000;
  // `updateDoc` et non `setDoc(merge)` : la classe DOIT exister. Créer un
  // document de classe par accident depuis cet écran laisserait une classe
  // fantôme sans `establishmentId`, donc invisible et illisible pour tous.
  await updateDoc(doc(firestore, COLLECTIONS.classes, classId), {
    joinCode: code,
    joinCodeExpiresAt,
    updatedAt: Date.now(),
  });

  return { joinCode: code, joinCodeExpiresAt };
}

/**
 * Ferme la fenêtre de rattachement d'une classe : les deux champs repassent à
 * `null`, le code ne vaut plus rien immédiatement.
 *
 * On écrit `null` plutôt que de supprimer les champs : `joinCode: null` reste
 * indexé et interrogeable, et le type `SchoolClass` les déclare nullables. Une
 * fenêtre est **réouvrable à tout moment** (absents du jour, nouvel élève).
 */
export async function fermerFenetreRattachement(classId: string): Promise<void> {
  await updateDoc(doc(firestore, COLLECTIONS.classes, classId), {
    joinCode: null,
    joinCodeExpiresAt: null,
    updatedAt: Date.now(),
  });
}

/** Une fenêtre est-elle actuellement ouverte sur cette classe ? */
export function fenetreEstOuverte(classe: Pick<SchoolClass, 'joinCode' | 'joinCodeExpiresAt'>): boolean {
  return !!classe.joinCode && (classe.joinCodeExpiresAt ?? 0) > Date.now();
}
