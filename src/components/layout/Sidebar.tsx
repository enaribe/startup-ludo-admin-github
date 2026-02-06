'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  BookOpen,
  Trophy,
  Lightbulb,
  FolderKanban,
  Award,
  HelpCircle,
  Swords,
  TrendingUp,
  Settings,
  LogOut,
  Gamepad2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'General',
    items: [
      { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={18} /> },
    ],
  },
  {
    title: 'Contenu du Jeu',
    items: [
      { label: 'Editions', href: '/editions', icon: <BookOpen size={18} /> },
      { label: 'Quiz', href: '/quiz', icon: <HelpCircle size={18} /> },
      { label: 'Duels', href: '/duels', icon: <Swords size={18} /> },
      { label: 'Ideation', href: '/ideation', icon: <Lightbulb size={18} /> },
      { label: 'Projets par Defaut', href: '/default-projects', icon: <FolderKanban size={18} /> },
    ],
  },
  {
    title: 'Challenges',
    items: [
      { label: 'Programmes', href: '/challenges', icon: <Trophy size={18} /> },
    ],
  },
  {
    title: 'Progression',
    items: [
      { label: 'Achievements', href: '/achievements', icon: <Award size={18} /> },
      { label: 'Rangs & XP', href: '/progression', icon: <TrendingUp size={18} /> },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { admin, logout } = useAuth();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 flex flex-col" style={{
      background: 'linear-gradient(180deg, #0a1e33 0%, #0C243E 100%)',
      borderRight: '1px solid rgba(255, 255, 255, 0.08)',
    }}>
      {/* Logo / Brand */}
      <div className="px-5 py-5 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255, 188, 64, 0.15)' }}>
          <Gamepad2 size={20} color="#FFBC40" />
        </div>
        <div>
          <h1 style={{ fontFamily: "'Luckiest Guy', cursive", fontSize: 16, color: '#FFBC40', letterSpacing: 0.5 }}>
            Startup Ludo
          </h1>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: -2 }}>Admin Dashboard</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-5">
            <p className="px-3 mb-2" style={{
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: 1.2,
              color: 'rgba(255, 255, 255, 0.35)',
            }}>
              {section.title}
            </p>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150"
                      style={{
                        background: isActive ? 'rgba(255, 188, 64, 0.12)' : 'transparent',
                        color: isActive ? '#FFBC40' : 'rgba(255, 255, 255, 0.6)',
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      <span style={{ opacity: isActive ? 1 : 0.6 }}>{item.icon}</span>
                      {item.label}
                      {item.badge && (
                        <span className="ml-auto badge badge-primary" style={{ fontSize: 10 }}>
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* User section */}
      <div className="px-4 py-4" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
        {admin && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{
              background: 'rgba(255, 188, 64, 0.15)',
              fontSize: 12,
              fontWeight: 700,
              color: '#FFBC40',
            }}>
              {admin.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate" style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                {admin.displayName}
              </p>
              <p className="truncate" style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                {admin.role === 'super_admin' ? 'Super Admin' : 'Admin'}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg transition-colors"
          style={{
            background: 'rgba(244, 67, 54, 0.08)',
            color: '#F44336',
            fontSize: 12,
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <LogOut size={14} />
          Deconnexion
        </button>
      </div>
    </aside>
  );
}
