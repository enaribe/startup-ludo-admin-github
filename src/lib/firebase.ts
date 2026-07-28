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
} as const;
