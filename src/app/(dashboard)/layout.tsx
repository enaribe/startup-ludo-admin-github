'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import DashboardLayout from '@/components/layout/DashboardLayout';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { admin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !admin) {
      router.replace('/login');
    }
  }, [admin, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0C243E' }}>
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size={40} />
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Chargement...</p>
        </div>
      </div>
    );
  }

  if (!admin) return null;

  return <DashboardLayout>{children}</DashboardLayout>;
}

export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>{children}</AuthGuard>
    </AuthProvider>
  );
}
