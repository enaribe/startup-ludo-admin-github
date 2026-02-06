'use client';

import { usePathname } from 'next/navigation';
import { Bell, Search } from 'lucide-react';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/editions': 'Editions',
  '/quiz': 'Quiz',
  '/duels': 'Duels',
  '/ideation': 'Cartes d\'Ideation',
  '/default-projects': 'Projets par Defaut',
  '/challenges': 'Challenges',
  '/achievements': 'Achievements',
  '/progression': 'Rangs & XP',
};

export default function Header() {
  const pathname = usePathname();

  // Find the closest matching title
  const title = Object.entries(PAGE_TITLES).reduce((best, [path, t]) => {
    if (pathname === path || (path !== '/' && pathname.startsWith(path))) return t;
    return best;
  }, 'Dashboard');

  return (
    <header className="flex items-center justify-between px-8 py-4" style={{
      borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
      background: 'rgba(12, 36, 62, 0.8)',
      backdropFilter: 'blur(12px)',
    }}>
      <h2 style={{
        fontFamily: "'Luckiest Guy', cursive",
        fontSize: 22,
        color: '#FFFFFF',
        letterSpacing: 0.5,
      }}>
        {title}
      </h2>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative">
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.3)' }} />
          <input
            type="text"
            placeholder="Rechercher..."
            className="input-field"
            style={{ paddingLeft: 34, width: 220, fontSize: 13, height: 36 }}
          />
        </div>

        {/* Notifications placeholder */}
        <button className="relative p-2 rounded-lg transition-colors" style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.5)',
        }}>
          <Bell size={16} />
        </button>
      </div>
    </header>
  );
}
