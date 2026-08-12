/**
 * Firebase Configuration for Admin Dashboard
 * Same project as mobile app: startup-ludo-new
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getDatabase, type Database } from 'firebase/database';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyB3TEuMAMfV0crfAMc0u63EFy-9rXwFRYc',
  authDomain: 'startup-ludo-new.firebaseapp.com',
  projectId: 'startup-ludo-new',
  storageBucket: 'startup-ludo-new.firebasestorage.app',
  messagingSenderId: '767192713144',
  appId: '1:767192713144:web:admin_dashboard',
  databaseURL: 'https://startup-ludo-new-default-rtdb.firebaseio.com',
};

// Initialize Firebase (singleton)
let app: FirebaseApp;
let auth: Auth;
let firestore: Firestore;
let database: Database;
let storage: FirebaseStorage;

if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0]!;
}

auth = getAuth(app);
firestore = getFirestore(app);
database = getDatabase(app);
storage = getStorage(app);

export { app, auth, firestore, database, storage };

// ===== Collection paths (mirrored from mobile) =====
export const COLLECTIONS = {
  users: 'users',
  userStats: 'userStats',
  userStartups: (userId: string) => `users/${userId}/startups`,
  editions: 'editions',
  leaderboards: 'leaderboards',
  gameSessions: 'gameSessions',
  achievements: 'achievements',
  reports: 'reports',
  challenges: 'challenges',
  challengeEnrollments: 'challengeEnrollments',
  // Programmes partenaires (nouveau modèle)
  partners: 'partners',
  programs: 'programs',
  programEnrollments: 'programEnrollments',
  programSessions: 'programSessions',
  // New admin-managed collections
  gameData: 'gameData',
  ideationCards: 'ideationCards',
  defaultProjects: 'defaultProjects',
  progression: 'progression',
  boardConfig: 'boardConfig',
  // Config applicative (version minimale de l'app mobile, liens stores)
  appConfig: 'appConfig',
  // Site vitrine (startupludo web) : précommandes et messages de contact
  preorders: 'preorders',
  contactMessages: 'contactMessages',
  // Métriques de sponsoring (vues / sauvegardes / clics), écrites par le MOBILE.
  // L'admin est en lecture seule sur cette collection : un compteur de
  // facturation ne doit jamais être modifiable depuis le back-office.
  sponsorMetrics: 'sponsorMetrics',
  // ===== Mode Classe =====
  // Établissements clients, leurs classes, et les élèves de chaque classe.
  // Les élèves vivent en SOUS-COLLECTION de la classe : leur identité relève de
  // l'établissement (mineurs), et le périmètre Firestore suit la classe.
  establishments: 'establishments',
  classes: 'classes',
  classLearners: (classId: string) => `classes/${classId}/learners`,
  // Séances de classe. Collection RACINE et non sous-collection de la classe :
  // l'enseignant doit pouvoir lister SES séances toutes classes confondues
  // (`where teacherId ==`), ce qu'une sous-collection interdirait sans
  // collectionGroup — donc sans règle de sécurité exprimable simplement.
  classSessions: 'classSessions',
  // Cours déposés par l'enseignant : texte extrait + chunks, même forme que
  // `programs/{id}/sourceDocs` (cf. saveSourceDocText / getSourceDocsText).
  classSessionSourceDocs: (sessionId: string) => `classSessions/${sessionId}/sourceDocs`,
  // Contenu généré, isolé du document de séance pour ne pas le faire grossir
  // (limite Firestore de 1 Mo, et la séance est lue à chaque liste).
  classSessionContent: (sessionId: string) => `classSessions/${sessionId}/content`,
  // Participation des élèves, écrite par le MOBILE pendant la partie et lue par
  // l'enseignant (suivi en direct et rapport, lot 6). Le back-office n'y écrit
  // JAMAIS : la règle Firestore réserve l'écriture à l'élève lui-même.
  classSessionParticipants: (sessionId: string) => `classSessions/${sessionId}/participants`,
} as const;
