'use client';

export default function LoadingSpinner({ size = 32, color = '#FFBC40' }: { size?: number; color?: string }) {
  return (
    <div className="flex items-center justify-center">
      <div
        style={{
          width: size,
          height: size,
          border: `3px solid rgba(255,255,255,0.1)`,
          borderTopColor: color,
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
