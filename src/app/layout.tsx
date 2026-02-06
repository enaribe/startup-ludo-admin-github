import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Startup Ludo - Admin',
  description: 'Dashboard d\'administration pour Startup Ludo',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Open+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#0f2d4a',
              color: '#FFFFFF',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: 13,
              fontFamily: "'Open Sans', sans-serif",
            },
            success: { iconTheme: { primary: '#4CAF50', secondary: '#FFFFFF' } },
            error: { iconTheme: { primary: '#F44336', secondary: '#FFFFFF' } },
          }}
        />
      </body>
    </html>
  );
}
