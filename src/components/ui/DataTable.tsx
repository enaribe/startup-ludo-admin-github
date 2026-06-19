'use client';

import { Pencil, Trash2 } from 'lucide-react';

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  keyField?: string;
  emptyMessage?: string;
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onEdit,
  onDelete,
  keyField = 'id',
  emptyMessage = 'Aucune donnee',
}: DataTableProps<T>) {
  if (data.length === 0) {
    return (
      <div className="glass-card py-12 text-center" style={{ color: 'var(--color-text-muted)', fontSize: 14 }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-card-border)' }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-left px-4 py-3"
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                    color: 'var(--color-text-muted)',
                    width: col.width,
                  }}
                >
                  {col.label}
                </th>
              ))}
              {(onEdit || onDelete) && (
                <th className="text-right px-4 py-3" style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 0.8,
                  color: 'var(--color-text-muted)',
                  width: '100px',
                }}>
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr
                key={String(item[keyField] ?? index)}
                className="transition-colors"
                style={{
                  borderBottom: index < data.length - 1 ? '1px solid var(--color-card-border)' : 'none',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-surface)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {col.render ? col.render(item) : String(item[col.key] ?? '-')}
                  </td>
                ))}
                {(onEdit || onDelete) && (
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {onEdit && (
                        <button
                          onClick={() => onEdit(item)}
                          className="p-1.5 rounded-md transition-colors"
                          style={{ background: 'rgba(255,188,64,0.1)', color: '#FFBC40', border: 'none', cursor: 'pointer' }}
                          title="Modifier"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(item)}
                          className="p-1.5 rounded-md transition-colors"
                          style={{ background: 'rgba(244,67,54,0.1)', color: '#F44336', border: 'none', cursor: 'pointer' }}
                          title="Supprimer"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
