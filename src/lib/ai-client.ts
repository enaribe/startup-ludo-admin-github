/**
 * Client des routes IA du back-office (`/api/generate`, `/api/extract`).
 *
 * POURQUOI CE MODULE — depuis la sécurisation de ces deux routes (cf.
 * `api-auth.ts`), chaque appel doit porter l'ID token Firebase de l'appelant.
 * Six écrans les appelaient en `fetch` direct ; répéter la récupération du jeton
 * dans chacun garantissait qu'un septième l'oublierait et casserait en 401.
 * Tous passent désormais par ici : le jeton est ajouté en un seul endroit.
 *
 * Ce module s'exécute côté navigateur (il lit `auth.currentUser`) et ne connaît
 * rien du métier : il transporte, il ne valide pas. Pas de directive
 * `'use client'` — comme `firebase.ts`, il doit rester importable depuis des
 * modules utilitaires non marqués (ex. `studio-generation.ts`).
 */

import { auth } from '@/lib/firebase';

/**
 * En-têtes d'authentification pour une requête JSON vers une route API.
 * Retourne les en-têtes sans `Authorization` si aucun compte n'est connecté —
 * l'API répondra 401, ce qui est le comportement voulu (pas d'échec silencieux).
 */
export async function enTetesAuth(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Corps attendu par `/api/generate`. */
export interface RequeteGeneration {
  /** Type de prompt (clé de `PROMPTS` dans `ai-prompts.ts`). */
  type: string;
  /** Consigne libre passée au prompt. */
  prompt: string;
  /** Contexte injecté par `buildUserPrompt` (nom du programme, niveau…). */
  context?: Record<string, unknown>;
}

/**
 * Appelle `/api/generate` avec l'ID token de l'utilisateur connecté.
 *
 * Retourne la réponse `fetch` telle quelle : les appelants historiques lisent
 * eux-mêmes `res.ok` et `json.error`, on ne change pas leur gestion d'erreur.
 */
export async function appelerGeneration(body: RequeteGeneration): Promise<Response> {
  return fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await enTetesAuth()) },
    body: JSON.stringify(body),
  });
}

/** Résultat d'une extraction de document réussie. */
export interface TexteExtrait {
  /** Texte brut extrait du document. */
  text: string;
  /** Nombre de caractères extraits. */
  charCount: number;
  /** Nombre de pages (0 hors PDF). */
  pages: number;
}

/**
 * Appelle `/api/extract` avec l'ID token de l'utilisateur connecté.
 *
 * ⚠️ On ne fixe PAS `Content-Type` : le navigateur doit poser lui-même le
 * `multipart/form-data; boundary=…`. L'écraser casserait le parsing serveur.
 */
export async function appelerExtraction(file: File): Promise<Response> {
  const fd = new FormData();
  fd.append('file', file);
  return fetch('/api/extract', {
    method: 'POST',
    headers: await enTetesAuth(),
    body: fd,
  });
}
