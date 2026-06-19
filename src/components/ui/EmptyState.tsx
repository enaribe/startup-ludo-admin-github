'use client';

import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="mb-4" style={{ color: 'var(--color-text-muted)' }}>
        {icon || <Inbox size={48} />}
      </div>
      <h3 style={{
        fontFamily: "'Luckiest Guy', cursive",
        fontSize: 18,
        color: 'var(--color-text-secondary)',
        marginBottom: 8,
      }}>
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)', maxWidth: 320, textAlign: 'center' }}>
          {description}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
