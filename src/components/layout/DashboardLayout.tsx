'use client';

import { type ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import BandeauCompteEnAttente from '@/components/auth/BandeauCompteEnAttente';
import { useAuth } from '@/lib/auth-context';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  // Chrome des admins de programme / partenaire : un partenaire dont la demande
  // est encore `pending` atterrit ici, il doit voir le même bandeau que dans
  // les autres espaces.
  const { admin, enAttente } = useAuth();

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Sidebar />
      <div className="ml-64 flex flex-col min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <Header />
        {enAttente && (
          <BandeauCompteEnAttente orgName={admin?.orgName} demandeLe={admin?.demandeLe} />
        )}
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
