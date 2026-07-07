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
  Settings,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  badge?: string;
  /** Couleur du badge : 'amber' (jaune, ex. leads à traiter) ou 'muted' (gris, ex. compteur). */
  badgeTone?: 'amber' | 'muted';
  /** Décoration ✨ violette à droite du label (ex. Studio de contenu). */
  decorSparkle?: boolean;
  /** Réservé au super admin. */
  superAdminOnly?: boolean;
  /** Réservé à l'admin de programme. */
  programAdminOnly?: boolean;
  /** Réservé à l'admin de partenaire. */
  partnerAdminOnly?: boolean;
}

interface NavSection {
  title: string;
  /** Toute la section est réservée au super admin. */
  superAdminOnly?: boolean;
  /** Toute la section est réservée à l'admin de programme. */
  programAdminOnly?: boolean;
  /** Toute la section est réservée à l'admin de partenaire. */
  partnerAdminOnly?: boolean;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  // ===== SUPER ADMIN : gestion globale Startup Ludo =====
  {
    title: 'General',
    superAdminOnly: true,
    items: [
      { label: 'Tableau de bord', href: '/', icon: <LayoutDashboard size={18} /> },
      { label: 'Statistiques', href: '/app-stats', icon: <BarChart3 size={18} /> },
    ],
  },
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
  {
    title: 'Progression',
    superAdminOnly: true,
    items: [
      { label: 'Achievements', href: '/achievements', icon: <Award size={18} /> },
      { label: 'Rangs & XP', href: '/progression', icon: <TrendingUp size={18} /> },
    ],
  },
  // ===== ADMIN DE PROGRAMME : gestion de SON parcours =====
  // Ces outils concernent UN programme : ils sont masqués au super admin dans la
  // sidebar (programAdminOnly). Structure et libellés calqués sur la maquette.
  {
    title: 'Pilotage',
    programAdminOnly: true,
    items: [
      { label: 'Tableau de bord', href: '/', icon: <LayoutDashboard size={18} /> },
      { label: 'Configuration', href: '/programs', icon: <Settings size={18} /> },
      { label: 'Personas', href: '/personas', icon: <UserCircle size={18} />, badge: '4', badgeTone: 'muted' },
      { label: 'Studio de contenu', href: '/studio', icon: <Sparkles size={18} />, decorSparkle: true },
      { label: 'Formulaire de fin', href: '/end-form', icon: <ClipboardList size={18} /> },
      { label: 'Leads & candidats', href: '/leads', icon: <UserCheck size={18} />, badge: '12', badgeTone: 'amber' },
      { label: 'Analytics', href: '/analytics', icon: <BarChart3 size={18} /> },
    ],
  },
  {
    title: 'Organisation',
    programAdminOnly: true,
    items: [
      { label: 'Communications', href: '/communications', icon: <MessageSquare size={18} /> },
      { label: 'Équipe & rôles', href: '/team', icon: <Users size={18} /> },
      { label: 'Paramètres org.', href: '/settings', icon: <Building2 size={18} /> },
    ],
  },
  // ===== ADMIN DE PARTENAIRE : pilotage de TOUS les programmes de son partenaire =====
  {
    title: 'Pilotage partenaire',
    partnerAdminOnly: true,
    items: [
      { label: 'Tableau de bord', href: '/', icon: <LayoutDashboard size={18} /> },
      { label: 'Mes programmes', href: '/programs', icon: <Rocket size={18} /> },
      { label: 'Studio de contenu', href: '/studio', icon: <Sparkles size={18} />, decorSparkle: true },
      { label: 'Leads & candidats', href: '/leads', icon: <UserCheck size={18} /> },
      { label: 'Analytics', href: '/analytics', icon: <BarChart3 size={18} /> },
    ],
  },
  {
    title: 'Équipe',
    partnerAdminOnly: true,
    items: [
      // Délégation : l'admin partenaire crée/révoque des admins pour SES programmes.
      { label: 'Admins programme', href: '/admins', icon: <Users size={18} /> },
      { label: 'Communications', href: '/communications', icon: <MessageSquare size={18} /> },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { admin, logout, isSuperAdmin, isPartnerAdmin, isProgramAdmin } = useAuth();

  // Filtrage par rôle : un élément flaggé *Only n'est visible que pour le rôle correspondant ;
  // un élément sans flag est visible par tous.
  const allowed = (flags: { superAdminOnly?: boolean; partnerAdminOnly?: boolean; programAdminOnly?: boolean }) => {
    if (flags.superAdminOnly) return isSuperAdmin;
    if (flags.partnerAdminOnly) return isPartnerAdmin;
    if (flags.programAdminOnly) return isProgramAdmin;
    return true;
  };

  const sections = NAV_SECTIONS
    .filter((section) => allowed(section))
    .map((section) => ({ ...section, items: section.items.filter((item) => allowed(item)) }))
    .filter((section) => section.items.length > 0);

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 flex flex-col" style={{
      background: 'linear-gradient(180deg, #0a1e33 0%, #0C243E 100%)',
      borderRight: '1px solid rgba(255, 255, 255, 0.08)',
    }}>
      {/* Logo / Brand */}
      <div className="px-5 py-5 flex items-center gap-3">
        {/* Pastille logo « START UP » sur fond blanc (cf. maquette) */}
        <div
          className="flex flex-col items-center justify-center"
          style={{ width: 56, height: 40, borderRadius: 10, background: '#FFFFFF', flexShrink: 0, lineHeight: 1 }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, color: '#0C243E', letterSpacing: 0.3 }}>START</span>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#0C243E', letterSpacing: 0.3 }}>UP</span>
        </div>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', letterSpacing: 0.2 }}>
            Plateforme
          </h1>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: -1 }}>Programme</p>
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
            <ul className="flex flex-col gap-1">
              {section.items.map((item) => {
                const isActive = item.href === '/'
                  ? pathname === '/'
                  : pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <li key={item.href} style={{ position: 'relative' }}>
                    {/* Liseré doré débordant à gauche pour l'item actif */}
                    {isActive && (
                      <span style={{
                        position: 'absolute', left: -12, top: 8, bottom: 8, width: 3,
                        borderRadius: 2, background: '#FFBC40',
                      }} />
                    )}
                    <Link
                      href={item.href}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-150"
                      style={{
                        background: isActive ? 'rgba(255, 255, 255, 0.07)' : 'transparent',
                        color: isActive ? '#FFFFFF' : 'rgba(255, 255, 255, 0.62)',
                        fontSize: 14,
                        fontWeight: isActive ? 600 : 500,
                      }}
                    >
                      <span style={{ opacity: isActive ? 1 : 0.72, display: 'flex' }}>{item.icon}</span>
                      <span>{item.label}</span>
                      {item.decorSparkle && (
                        <Sparkles size={14} style={{ color: '#9B8CFF', opacity: 0.9 }} />
                      )}
                      {item.badge && (
                        <span
                          className="ml-auto"
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            lineHeight: 1,
                            padding: '3px 9px',
                            borderRadius: 999,
                            background: item.badgeTone === 'amber' ? '#FFBC40' : 'rgba(255,255,255,0.10)',
                            color: item.badgeTone === 'amber' ? '#0C243E' : 'rgba(255,255,255,0.75)',
                          }}
                        >
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
