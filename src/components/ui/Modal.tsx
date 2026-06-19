'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: string;
}

export default function Modal({ open, onClose, title, children, maxWidth = '560px' }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="glass-card w-full overflow-hidden"
        style={{
          maxWidth,
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#FFFFFF',
          border: '1px solid var(--color-card-border)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--color-card-border)' }}>
          <h3 style={{
            fontFamily: "'Luckiest Guy', cursive",
            fontSize: 18,
            color: 'var(--color-text-primary)',
            letterSpacing: 0.5,
          }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md transition-colors"
            style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)', border: 'none', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
