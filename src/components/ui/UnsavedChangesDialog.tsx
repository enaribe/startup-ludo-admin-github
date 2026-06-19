'use client';

import { AlertTriangle } from 'lucide-react';

interface UnsavedChangesDialogProps {
  open: boolean;
  onSave: () => void | Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
  saving?: boolean;
}

export default function UnsavedChangesDialog({
  open,
  onSave,
  onDiscard,
  onCancel,
  saving = false
}: UnsavedChangesDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.8)' }}>
      <div
        className="rounded-2xl w-full max-w-md p-6 flex flex-col gap-4"
        style={{ background: 'var(--color-card)', border: '1px solid var(--color-card-border)' }}
      >
        {/* Icon & Title */}
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,188,64,0.15)', border: '1px solid rgba(255,188,64,0.3)' }}
          >
            <AlertTriangle size={24} color="#FFBC40" />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', margin: 0 }}>
              Modifications non sauvegardées
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: 0 }}>
              Voulez-vous sauvegarder vos changements ?
            </p>
          </div>
        </div>

        {/* Message */}
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          Vous avez des modifications non sauvegardées. Si vous quittez maintenant, toutes vos modifications seront perdues.
        </p>

        {/* Actions */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="btn-secondary flex-1"
            style={{ fontSize: 13, opacity: saving ? 0.5 : 1 }}
          >
            Annuler
          </button>
          <button
            onClick={onDiscard}
            disabled={saving}
            style={{
              flex: 1,
              fontSize: 13,
              padding: '8px 16px',
              borderRadius: 8,
              background: 'rgba(244,67,54,0.1)',
              border: '1px solid rgba(244,67,54,0.3)',
              color: '#F44336',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              opacity: saving ? 0.5 : 1,
            }}
          >
            Quitter sans sauvegarder
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="btn-primary flex-1"
            style={{
              fontSize: 13,
              opacity: saving ? 0.7 : 1,
              cursor: saving ? 'not-allowed' : 'pointer'
            }}
          >
            {saving ? 'Sauvegarde...' : 'Sauvegarder et quitter'}
          </button>
        </div>
      </div>
    </div>
  );
}
