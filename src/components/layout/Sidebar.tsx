'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  BookOpen,
  Lightbulb,
  FolderKanban,
  Award,
  TrendingUp,
  LogOut,
  Gamepad2,
  Building2,
  Rocket,
  Users,
  ClipboardList,
  UserCheck,
  UserCircle,
  Layers3,
  Sparkles,
  BarChart3,
  MessageSquare,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  /** Réservé au super admin (masqué pour un admin de programme). */
  superAdminOnly?: boolean;
  /** Réservé à l'admin de programme (masqué pour le super admin). */
  programAdminOnly?: boolean;
}

interface NavSection {
  title: string;
  /** Toute la section est réservée au super admin. */
  superAdminOnly?: boolean;
  /** Toute la section est réservée à l'admin de programme (masquée au super admin). */
  programAdminOnly?: boolean;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: 'General',
    items: [
      { label: 'Tableau de bord', href: '/', icon: <LayoutDashboard size={18} /> },
    ],
  },
  // ===== SUPER ADMIN : gestion globale Startup Ludo =====
  {
    title: 'Catalogue',
    superAdminOnly: true,
    items: [
      { label: 'Partenaires', href: '/partners', icon: <Building2 size={18} /> },
      { label: 'Programmes', href: '/programs', icon: <Rocket size={18} /> },
      { label: 'Admins', href: '/admins', icon: <Users size={18} /> },
    ],
  },
  {
    title: 'Contenu du Jeu',
    superAdminOnly: true,
    items: [
      // Les quiz et duels se gèrent directement dans chaque édition : les entrées
      // dédiées /quiz et /duels (pages-redirections vides) ont été retirées.
      { label: 'Editions', href: '/editions', icon: <BookOpen size={18} /> },
      { label: 'Ideation', href: '/ideation', icon: <Lightbulb size={18} /> },
      { label: 'Projets par Defaut', href: '/default-projects', icon: <FolderKanban size={18} /> },
    ],
  },
  // ===== ADMIN DE PROGRAMME : gestion de SON parcours =====
  // Ces outils concernent UN programme : ils sont masqués au super admin dans la
  // sidebar (programAdminOnly). Le super admin y accède en « support » depuis une
  // page programme / via le sélecteur de programme, pas depuis son menu principal.
  {
    title: 'Pilotage du parcours',
    programAdminOnly: true,
    items: [
      { label: 'Configuration', href: '/programs', icon: <Rocket size={18} /> },
      { label: 'Personas', href: '/personas', icon: <UserCircle size={18} /> },
      { label: 'Studio de contenu', href: '/studio', icon: <Sparkles size={18} /> },
      { label: 'Formulaire de fin', href: '/end-form', icon: <ClipboardList size={18} /> },
      { label: 'Leads & candidats', href: '/leads', icon: <UserCheck size={18} /> },
      { label: 'Analytics', href: '/analytics', icon: <BarChart3 size={18} /> },
    ],
  },
  {
    title: 'Organisation',
    programAdminOnly: true,
    items: [
      { label: 'Communications', href: '/communications', icon: <MessageSquare size={18} /> },
      // Équipe & rôles + Paramètres org. : masqués tant qu'ils ne persistent rien
      // (stubs non branchés à Firestore). À réactiver une fois la sauvegarde en place.
    ],
  },
  // Section « Challenges (legacy) » retirée : ancien modèle remplacé par les
  // PartnerPrograms. Les routes /challenges restent accessibles par URL si besoin.
  {
    title: 'Progression',
    superAdminOnly: true,
    items: [
      { label: 'Achievements', href: '/achievements', icon: <Award size={18} /> },
      { label: 'Rangs & XP', href: '/progression', icon: <TrendingUp size={18} /> },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { admin, logout, isSuperAdmin } = useAuth();

  // Filtrage par rôle :
  //  - superAdminOnly : visible seulement par le super admin
  //  - programAdminOnly : visible seulement par l'admin de programme
  const sections = NAV_SECTIONS
    .filter((section) => isSuperAdmin || !section.superAdminOnly)
    .filter((section) => !isSuperAdmin || !section.programAdminOnly)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.superAdminOnly && !isSuperAdmin) return false;
        if (item.programAdminOnly && isSuperAdmin) return false;
        return true;
      }),
    }))
    .filter((section) => section.items.length > 0);

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
            Plateforme
          </h1>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: -2 }}>Programme</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {sections.map((section) => (
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

      {/* Crédits IA (plan) */}
      <div className="mx-3 mb-2 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-2 mb-2">
          <Layers3 size={15} color="#9B8CFF" />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#FFFFFF' }}>Plan Umbrella</span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)' }}>
          <div style={{ width: '14.5%', height: '100%', borderRadius: 3, background: '#9B8CFF' }} />
        </div>
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>145 / 1000 crédits IA</p>
      </div>

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
