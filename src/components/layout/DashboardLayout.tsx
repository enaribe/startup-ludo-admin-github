'use client';

import { type ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      <Sidebar />
      <div className="ml-64 flex flex-col min-h-screen" style={{ background: 'var(--color-bg)' }}>
        <Header />
        <main className="flex-1 p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
