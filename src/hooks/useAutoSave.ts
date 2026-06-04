'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions<T> {
  /** Donnees a sauvegarder. Toute modification declenche une sauvegarde. */
  data: T;
  /** Fonction de persistance (ex: saveEdition). Doit etre stable (useCallback). */
  save: (data: T) => Promise<void>;
  /** Active l'autosave. Mettre a false tant que les donnees ne sont pas chargees ou pas valides (ex: nouvelle entite sans ID). */
  enabled?: boolean;
  /** Delai de regroupement des frappes clavier avant ecriture (ms). */
  debounceMs?: number;
}

interface UseAutoSaveResult {
  /** Statut courant de la sauvegarde, pour l'indicateur visuel. */
  status: SaveStatus;
  /** Force une sauvegarde immediate du dernier etat (ex: avant navigation/blur). */
  flush: () => Promise<void>;
}

/**
 * Sauvegarde automatiquement `data` a chaque modification, sans bouton manuel.
 *
 * - Les changements sont regroupes pendant `debounceMs` (les frappes clavier
 *   rapides ne declenchent qu'une seule ecriture) puis persistes.
 * - `flush()` force l'ecriture immediate du dernier etat (utile au blur ou
 *   avant de quitter la page).
 * - La premiere valeur de `data` (chargement initial) ne declenche PAS de save.
 *
 * Usage:
 * ```tsx
 * const save = useCallback((d) => saveEdition(id, d), [id]);
 * const { status, flush } = useAutoSave({ data, save, enabled: !loading && !isNew });
 * ```
 */
export function useAutoSave<T>({
  data,
  save,
  enabled = true,
  debounceMs = 600,
}: UseAutoSaveOptions<T>): UseAutoSaveResult {
  const [status, setStatus] = useState<SaveStatus>('idle');

  // Refs pour acceder aux valeurs courantes sans re-creer les callbacks
  const dataRef = useRef(data);
  const saveRef = useRef(save);
  const enabledRef = useRef(enabled);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Empeche un save sur la valeur initiale (chargement) : on note le snapshot de depart.
  const lastSavedRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  dataRef.current = data;
  saveRef.current = save;
  enabledRef.current = enabled;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const persist = useCallback(async () => {
    if (!enabledRef.current) return;
    const snapshot = dataRef.current;
    const serialized = JSON.stringify(snapshot);
    // Rien de neuf a sauvegarder
    if (serialized === lastSavedRef.current) return;

    setStatus('saving');
    try {
      await saveRef.current(snapshot);
      lastSavedRef.current = serialized;
      if (isMountedRef.current) setStatus('saved');
    } catch (error) {
      console.error('Autosave error:', error);
      if (isMountedRef.current) setStatus('error');
    }
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await persist();
  }, [persist]);

  // Declenche un save debounce a chaque changement de data
  useEffect(() => {
    if (!enabled) return;

    const serialized = JSON.stringify(data);

    // Initialisation : on memorise la valeur de depart sans sauvegarder.
    if (lastSavedRef.current === null) {
      lastSavedRef.current = serialized;
      return;
    }

    // Aucun changement reel
    if (serialized === lastSavedRef.current) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      persist();
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, enabled, debounceMs, persist]);

  return { status, flush };
}
