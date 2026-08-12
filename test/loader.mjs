/**
 * Hook de résolution pour exécuter le code TypeScript du back-office sous
 * `node --test`, SANS ajouter de dépendance de build (ts-node, tsx, jest…).
 *
 * Node 22 sait déjà retirer les types (`--experimental-strip-types`). Il reste
 * trois écarts entre ce que Next.js accepte et ce que Node résout, et ce hook
 * ne fait que les combler :
 *
 *   1. L'ALIAS `@/…` de `tsconfig.json` → `src/…`.
 *   2. LES IMPORTS SANS EXTENSION (`./firebase`), légaux en résolution
 *      « bundler » mais refusés par le résolveur ESM de Node.
 *   3. LE MODULE `./firebase` LUI-MÊME, remplacé par un talon.
 *
 * ⚠️ Le point 3 est le plus important, et c'est un choix, pas un contournement.
 * `src/lib/firebase.ts` initialise Auth, Firestore, Realtime Database et
 * Storage AU CHARGEMENT du module. Or les fonctions testées ici sont pures :
 * elles n'ouvrent aucune connexion. Les laisser tirer un vrai SDK Firebase
 * rendrait la suite dépendante du réseau et de l'état d'un projet distant —
 * pour tester des additions et des divisions. Le talon garantit l'inverse :
 * si un jour une fonction d'agrégation se met à toucher Firestore, les tests
 * échouent immédiatement au lieu de partir en silence sur le réseau.
 *
 * `COLLECTIONS` est en revanche recopié fidèlement : ce sont des chaînes pures,
 * et les fonctions de lecture s'en servent.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { dirname, resolve as resolveChemin } from 'node:path';

const RACINE = resolveChemin(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolveChemin(RACINE, 'src');

/** URL du talon qui remplace `src/lib/firebase.ts`. */
const TALON_FIREBASE = pathToFileURL(resolveChemin(RACINE, 'test', 'stub-firebase.mjs')).href;

/** Extensions essayées pour un import sans extension, dans l'ordre. */
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs'];

/** Ajoute l'extension manquante d'un chemin absolu, ou renvoie `null`. */
function completerExtension(chemin) {
  if (existsSync(chemin) && !chemin.endsWith('/')) return chemin;
  for (const ext of EXTENSIONS) {
    if (existsSync(chemin + ext)) return chemin + ext;
  }
  for (const ext of EXTENSIONS) {
    const index = resolveChemin(chemin, `index${ext}`);
    if (existsSync(index)) return index;
  }
  return null;
}

export function resolve(specifier, context, nextResolve) {
  // Le SDK Firebase n'est jamais chargé : tout ce qui le vise est renvoyé sur
  // le talon, y compris `src/lib/firebase.ts` et l'alias `@/lib/firebase`.
  if (
    specifier === '@/lib/firebase' ||
    specifier === './firebase' ||
    specifier === '../lib/firebase' ||
    specifier.startsWith('firebase/')
  ) {
    return { url: TALON_FIREBASE, shortCircuit: true };
  }

  // Alias `@/…` → `src/…`
  if (specifier.startsWith('@/')) {
    const complet = completerExtension(resolveChemin(SRC, specifier.slice(2)));
    if (complet) return { url: pathToFileURL(complet).href, shortCircuit: true };
  }

  // Import relatif sans extension.
  if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
    const base = dirname(fileURLToPath(context.parentURL));
    const complet = completerExtension(resolveChemin(base, specifier));
    if (complet) return { url: pathToFileURL(complet).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
