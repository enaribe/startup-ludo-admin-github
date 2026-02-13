'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface UseUnsavedChangesOptions {
  hasUnsavedChanges: boolean;
  onNavigateAway?: () => void | Promise<void>;
}

/**
 * Hook to detect and warn about unsaved changes
 *
 * Usage:
 * ```tsx
 * const { blockNavigation, allowNavigation } = useUnsavedChanges({
 *   hasUnsavedChanges: isDirty,
 *   onNavigateAway: () => {
 *     // Show confirmation dialog
 *     setShowDialog(true);
 *   }
 * });
 *
 * // When user confirms navigation:
 * allowNavigation();
 * router.push('/somewhere');
 * ```
 */
export function useUnsavedChanges({ hasUnsavedChanges, onNavigateAway }: UseUnsavedChangesOptions) {
  const isNavigationBlocked = useRef(true);

  // Block browser navigation (back/forward/refresh)
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && isNavigationBlocked.current) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const blockNavigation = useCallback(() => {
    isNavigationBlocked.current = true;
  }, []);

  const allowNavigation = useCallback(() => {
    isNavigationBlocked.current = false;
  }, []);

  return {
    blockNavigation,
    allowNavigation,
    isBlocked: isNavigationBlocked.current
  };
}
