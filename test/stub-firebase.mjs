/**
 * Talon de `src/lib/firebase.ts` et du SDK `firebase/*` pour les tests unitaires.
 *
 * Les fonctions testées (`agregerNotions`, `calculerIndicateurs`,
 * `construireSuivi`, `construireCsvRapport`) sont PURES : elles ne doivent
 * jamais atteindre le réseau. Toute fonction du SDK exportée ici lève donc,
 * volontairement. Si une régression fait appeler Firestore depuis un calcul
 * d'agrégation, le test échoue avec un message explicite au lieu de tenter une
 * connexion et d'expirer.
 *
 * `COLLECTIONS` est recopié à l'identique de `src/lib/firebase.ts` : ce sont des
 * chaînes, et les tests peuvent légitimement vérifier un chemin.
 */

/** Refuse tout appel réseau depuis un test unitaire. */
const interdit = (nom) => () => {
  throw new Error(
    `Appel Firebase interdit dans les tests unitaires : ${nom}(). ` +
      `Les fonctions d'agrégation doivent rester pures.`
  );
};

export const firestore = { __talon: true };
export const auth = { __talon: true };
export const database = { __talon: true };
export const storage = { __talon: true };
export const app = { __talon: true };

export const collection = interdit('collection');
export const doc = interdit('doc');
export const getDoc = interdit('getDoc');
export const getDocs = interdit('getDocs');
export const onSnapshot = interdit('onSnapshot');
export const setDoc = interdit('setDoc');
export const updateDoc = interdit('updateDoc');
export const deleteDoc = interdit('deleteDoc');
export const query = interdit('query');
export const where = interdit('where');
export const orderBy = interdit('orderBy');

/** Chemins de collections — copie fidèle de `src/lib/firebase.ts`. */
export const COLLECTIONS = {
  classSessions: 'classSessions',
  classLearners: (classId) => `classes/${classId}/learners`,
  classSessionSourceDocs: (sessionId) => `classSessions/${sessionId}/sourceDocs`,
  classSessionContent: (sessionId) => `classSessions/${sessionId}/content`,
  classSessionParticipants: (sessionId) => `classSessions/${sessionId}/participants`,
};
