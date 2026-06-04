'use client';

import { Check, CloudOff, Loader2 } from 'lucide-react';
import type { SaveStatus } from '@/hooks/useAutoSave';

interface SaveStatusIndicatorProps {
  status: SaveStatus;
}

/**
 * Indicateur discret de l'etat de la sauvegarde automatique.
 * Remplace le bouton "Sauvegarder" manuel.
 */
export default function SaveStatusIndicator({ status }: SaveStatusIndicatorProps) {
  const config = {
    idle: { icon: <Check size={14} />, label: 'Enregistré', color: 'rgba(255,255,255,0.4)' },
    saving: { icon: <Loader2 size={14} className="animate-spin" />, label: 'Enregistrement…', color: '#FFBC40' },
    saved: { icon: <Check size={14} />, label: 'Enregistré', color: '#4CAF50' },
    error: { icon: <CloudOff size={14} />, label: 'Erreur de sauvegarde', color: '#F44336' },
  }[status];

  return (
    <div
      className="flex items-center gap-1.5"
      style={{ fontSize: 12, fontWeight: 600, color: config.color }}
      title={status === 'error' ? 'La derniere sauvegarde a echoue, vos changements seront retentes au prochain edit' : undefined}
    >
      {config.icon}
      <span>{config.label}</span>
    </div>
  );
}
