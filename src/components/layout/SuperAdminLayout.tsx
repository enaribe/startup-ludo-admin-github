'use client';

/**
 * Chrome de l'espace SUPER ADMIN (lot SA-1 du plan PLAN-ESPACE-SUPERADMIN.md).
 *
 * Même grammaire visuelle qu'`EcoleLayout` (sidebar navy, pastille SL, barre
 * supérieure avec fil d'Ariane) : le super admin administre le produit, son
 * espace doit ressembler au produit.
 *
 * NAVIGATION PAR MÉTIER, HIÉRARCHISÉE PAR FRÉQUENCE :
 *   PILOTAGE          regarder (tableau de bord, statistiques)
 *   À TRAITER         le flux entrant du jour — avec des COMPTEURS RÉELS
 *   CLIENTS & COMPTES établissements, partenaires, programmes, comptes
 *   CONTENU DU JEU    la configuration rare
 *
 * Les badges de la section « À traiter » sont MESURÉS à chaque navigation :
 * campagnes `in_review` + demandes d'inscription `pending` (hors enseignants,
 * qui relèvent de leur direction), commandes `new`, messages `new`. Un échec
 * de comptage n'affiche simplement rien — jamais un chiffre inventé, jamais
 * bloquant. L'encart « Plan Umbrella » de l'ancienne sidebar (chiffres en dur)
 * disparaît sans remplacement.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { collection, getCountFromServer, getDocs, query, where } from 'firebase/firestore';
import {
  Award,
  BarChart3,
  BookOpen,
  Building2,
  FolderKanban,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Mail,
  Rocket,
  School,
  Settings,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { firestore, COLLECTIONS } from '@/lib/firebase';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

/** Clés des compteurs de la section « À traiter ». */
type CleBadge = 'moderation' | 'commandes' | 'messages';

interface Entree {
  href: string;
  libelle: string;
  Icon: LucideIcon;
  badgeCle?: CleBadge;
}

const GROUPES: Array<{ titre: string; entrees: Entree[] }> = [
  {
    titre: 'PILOTAGE',
    entrees: [
      { href: '/', libelle: 'Tableau de bord', Icon: LayoutDashboard },
      { href: '/app-stats', libelle: 'Statistiques', Icon: BarChart3 },
    ],
  },
  {
    titre: 'À TRAITER',
    entrees: [
      { href: '/moderation', libelle: 'Modération & demandes', Icon: ShieldCheck, badgeCle: 'moderation' },
      { href: '/orders', libelle: 'Commandes du site', Icon: ShoppingCart, badgeCle: 'commandes' },
      { href: '/messages', libelle: 'Messages du site', Icon: Mail, badgeCle: 'messages' },
    ],
  },
  {
    titre: 'CLIENTS & COMPTES',
    entrees: [
      { href: '/etablissements', libelle: 'Établissements', Icon: School },
      { href: '/partners', libelle: 'Partenaires', Icon: Building2 },
      { href: '/programs', libelle: 'Programmes', Icon: Rocket },
      { href: '/users', libelle: 'Utilisateurs (joueurs)', Icon: Users },
      { href: '/admins', libelle: 'Admins & rôles', Icon: UserCog },
    ],
  },
  {
    titre: 'CONTENU DU JEU',
    entrees: [
      { href: '/editions', libelle: 'Éditions', Icon: BookOpen },
      // « Secteurs » n'est plus une entrée : /ideation porte déjà ses onglets
      // (?type=sector). Achievements et Rangs fusionneront au lot SA-3.
      { href: '/ideation', libelle: 'Idéation & secteurs', Icon: Lightbulb },
      { href: '/default-projects', libelle: 'Projets par défaut', Icon: FolderKanban },
      { href: '/progression', libelle: 'Rangs & XP', Icon: TrendingUp },
      { href: '/achievements', libelle: 'Achievements', Icon: Award },
    ],
  },
];

/** Libellé du fil d'Ariane depuis le chemin. */
function titreDepuisChemin(pathname: string): string {
  if (pathname === '/') return 'Tableau de bord';
  const table: Array<[string, string]> = [
    ['/app-stats', 'Statistiques'],
    ['/moderation', 'Modération & demandes'],
    ['/orders', 'Commandes du site'],
    ['/messages', 'Messages du site'],
    ['/etablissements', 'Établissements'],
    ['/partners', 'Partenaires'],
    ['/programs', 'Programmes'],
    ['/users', 'Utilisateurs'],
    ['/admins', 'Admins & rôles'],
    ['/editions', 'Éditions'],
    ['/ideation', 'Idéation & secteurs'],
    ['/default-projects', 'Projets par défaut'],
    ['/progression', 'Rangs & XP'],
    ['/achievements', 'Achievements'],
    ['/settings', 'Paramètres'],
  ];
  for (const [prefixe, titre] of table) {
    if (pathname.startsWith(prefixe)) return titre;
  }
  return 'Super Admin';
}

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { admin, logout } = useAuth();

  // ── Compteurs « À traiter » — mesurés, rafraîchis à chaque navigation ──
  const [files, setFiles] = useState<Record<CleBadge, number | null>>({
    moderation: null,
    commandes: null,
    messages: null,
  });

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const [campagnes, demandesSnap, commandes, messages] = await Promise.all([
          getCountFromServer(
            query(collection(firestore, COLLECTIONS.campaigns), where('status', '==', 'in_review'))
          ),
          getDocs(
            query(collection(firestore, COLLECTIONS.signupRequests), where('status', '==', 'pending'))
          ),
          getCountFromServer(
            query(collection(firestore, COLLECTIONS.preorders), where('status', '==', 'new'))
          ),
          getCountFromServer(
            query(collection(firestore, COLLECTIONS.contactMessages), where('status', '==', 'new'))
          ),
        ]);
        if (annule) return;
        // Les demandes d'enseignants relèvent de leur direction, pas de CONCREE.
        const demandes = demandesSnap.docs.filter((d) => d.data().type !== 'teacher').length;
        setFiles({
          moderation: campagnes.data().count + demandes,
          commandes: commandes.data().count,
          messages: messages.data().count,
        });
      } catch (error) {
        // Compteurs d'aide à la navigation : leur échec ne bloque rien et
        // n'affiche rien — jamais un chiffre douteux.
        console.error('Compteurs à traiter :', error);
      }
    })();
    return () => {
      annule = true;
    };
  }, [pathname]);

  // Une seule entrée active : la plus spécifique qui matche ('/' exige l'égalité).
  const hrefActif = useMemo(() => {
    const candidats = [...GROUPES.flatMap((g) => g.entrees), { href: '/settings' }]
      .filter((e) => (e.href === '/' ? pathname === '/' : pathname === e.href || pathname.startsWith(e.href + '/')))
      .sort((a, b) => b.href.length - a.href.length);
    return candidats[0]?.href ?? '';
  }, [pathname]);

  const initiales = (admin?.displayName || admin?.email || 'SA')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((m) => m[0])
    .join('')
    .toUpperCase();

  return (
    <div className="flex" style={{ minHeight: '100vh', background: '#F6F4EF' }}>
      {/* ═══ Sidebar navy ═══ */}
      <aside
        className="flex flex-col"
        style={{ width: 236, minWidth: 236, background: NAVY, color: '#FFF', padding: '20px 14px' }}
      >
        <div className="flex items-center gap-2.5 px-2 mb-7">
          <div
            className="flex items-center justify-center"
            style={{ width: 32, height: 32, borderRadius: 8, background: ORANGE, color: NAVY, fontWeight: 800, fontSize: 14 }}
          >
            SL
          </div>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: 0.4 }}>STARTUP LUDO</div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)' }}>Super Admin · CONCREE</div>
          </div>
        </div>

        <nav className="flex flex-col gap-5" style={{ flex: 1, overflowY: 'auto' }}>
          {GROUPES.map((groupe) => (
            <div key={groupe.titre}>
              <div style={{ fontSize: 10, letterSpacing: 1.2, color: 'rgba(255,255,255,0.4)', padding: '0 10px', marginBottom: 7 }}>
                {groupe.titre}
              </div>
              <div className="flex flex-col gap-1">
                {groupe.entrees.map((e) => {
                  const actif = hrefActif === e.href;
                  const compteur = e.badgeCle ? files[e.badgeCle] : null;
                  return (
                    <Link
                      key={e.href}
                      href={e.href}
                      className="flex items-center gap-2.5"
                      style={{
                        padding: '8px 10px', borderRadius: 8, fontSize: 13, textDecoration: 'none',
                        color: actif ? '#FFFFFF' : 'rgba(255,255,255,0.65)',
                        background: actif ? 'rgba(255,255,255,0.10)' : 'transparent',
                        fontWeight: actif ? 700 : 400,
                        position: 'relative',
                      }}
                    >
                      {actif && (
                        <span
                          style={{
                            position: 'absolute', left: -14, top: 7, bottom: 7, width: 3,
                            borderRadius: 2, background: ORANGE,
                          }}
                        />
                      )}
                      <e.Icon size={16} />
                      <span style={{ flex: 1 }}>{e.libelle}</span>
                      {compteur != null && compteur > 0 && (
                        <span
                          style={{
                            fontSize: 10.5, fontWeight: 800, lineHeight: 1, padding: '3px 8px',
                            borderRadius: 999, background: ORANGE, color: NAVY, flexShrink: 0,
                          }}
                        >
                          {compteur}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* ── Paramètres + compte, en pied de barre comme les autres espaces ── */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 10, marginTop: 10 }}>
          <Link
            href="/settings"
            className="flex items-center gap-2.5"
            style={{
              padding: '8px 10px', borderRadius: 8, fontSize: 13, textDecoration: 'none',
              color: hrefActif === '/settings' ? '#FFFFFF' : 'rgba(255,255,255,0.65)',
              background: hrefActif === '/settings' ? 'rgba(255,255,255,0.10)' : 'transparent',
              fontWeight: hrefActif === '/settings' ? 700 : 400,
            }}
          >
            <Settings size={16} /> Paramètres
          </Link>
          <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 12px', marginTop: 10 }}>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)' }}>Compte CONCREE</div>
            <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>
              {admin?.displayName || admin?.email || '—'}
            </div>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>Super Admin</div>
            <button
              type="button"
              onClick={() => void logout()}
              className="flex items-center gap-1.5"
              style={{ marginTop: 8, border: 'none', background: 'transparent', color: ORANGE, fontSize: 11.5, cursor: 'pointer', padding: 0 }}
            >
              <LogOut size={12} /> Se déconnecter
            </button>
          </div>
        </div>
      </aside>

      {/* ═══ Zone principale : barre supérieure + contenu ═══ */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <header
          className="flex items-center justify-between gap-3"
          style={{ padding: '14px 28px', borderBottom: '1px solid rgba(15,28,46,0.08)', background: '#FFFFFF' }}
        >
          <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            Super Admin <span style={{ margin: '0 4px' }}>/</span>
            <span style={{ color: NAVY, fontWeight: 600 }}>{titreDepuisChemin(pathname)}</span>
          </div>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-2"
              style={{ border: '1px solid rgba(15,28,46,0.12)', borderRadius: 10, padding: '5px 12px', background: '#FBF7EE' }}
            >
              <ShieldCheck size={14} color={NAVY} />
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: NAVY }}>CONCREE</div>
                <div style={{ fontSize: 9.5, color: 'var(--color-text-muted)' }}>plateforme Startup Ludo</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="flex items-center justify-center"
                style={{ width: 30, height: 30, borderRadius: 15, background: NAVY, color: '#FFF', fontSize: 11, fontWeight: 700 }}
              >
                {initiales}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>
                  {admin?.displayName || admin?.email || '—'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Super Admin</div>
              </div>
            </div>
          </div>
        </header>

        <main style={{ padding: '24px 28px' }}>{children}</main>
      </div>
    </div>
  );
}
