'use client';

/**
 * Espace Annonceur — layout dédié (lot 3).
 *
 * GROUPE DE ROUTES SÉPARÉ de `(dashboard)`, et c'est un choix, pas un hasard :
 * la maquette impose une identité propre (sidebar navy CONCREE, orange en
 * accent unique) qui n'a rien à voir avec le chrome du back-office — et le
 * garde du dashboard cantonne déjà les sponsors à `/sponsoring`, on ne veut
 * pas le compliquer. Ici, le garde est l'inverse : SEULS le rôle `sponsor` et
 * le super admin (support) entrent.
 *
 * Toutes les entrées sont actives depuis les lots 6-7 (Facturation, Règles de
 * contenu, Aide). Le rendu « Bientôt » reste dans le code pour la prochaine
 * entrée en préparation.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  CreditCard,
  HelpCircle,
  LogOut,
  PlusCircle,
  ShieldCheck,
  SquarePen,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { firestore, COLLECTIONS } from '@/lib/firebase';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ForcePasswordChange from '@/components/auth/ForcePasswordChange';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

function SidebarAnnonceur() {
  const pathname = usePathname();
  const { admin, logout } = useAuth();

  const items = [
    {
      section: 'DIFFUSION',
      entries: [
        { href: '/annonceur', libelle: 'Mises en visibilité', Icon: BarChart3, exactOrChild: true },
        { href: '/annonceur/nouvelle', libelle: 'Nouvelle mise en visibilité', Icon: PlusCircle, exactOrChild: true },
        { href: '/annonceur/cartes', libelle: 'Gérer mes cartes', Icon: SquarePen, exactOrChild: true },
      ],
    },
    {
      section: 'COMPTE',
      entries: [
        { href: '/annonceur/facturation', libelle: 'Facturation', Icon: CreditCard, exactOrChild: true },
        { href: '/annonceur/regles', libelle: 'Règles de contenu', Icon: ShieldCheck, exactOrChild: true },
        { href: '/annonceur/aide', libelle: 'Aide', Icon: HelpCircle, exactOrChild: true },
      ],
    },
  ];

  return (
    <aside
      className="flex flex-col"
      style={{
        width: 232,
        minWidth: 232,
        minHeight: '100vh',
        background: NAVY,
        color: '#FFFFFF',
        padding: '20px 14px',
      }}
    >
      {/* Marque */}
      <div className="flex items-center gap-2.5 px-2 mb-8">
        <div
          className="flex items-center justify-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: ORANGE,
            color: NAVY,
            fontWeight: 800,
            fontSize: 16,
          }}
        >
          C
        </div>
        <div>
          <div style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: 0.4 }}>CONCREE</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Espace Annonceur</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-6" style={{ flex: 1 }}>
        {items.map((groupe) => (
          <div key={groupe.section}>
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: 1.2,
                color: 'rgba(255,255,255,0.4)',
                padding: '0 10px',
                marginBottom: 8,
              }}
            >
              {groupe.section}
            </div>
            <div className="flex flex-col gap-1">
              {groupe.entries.map((entree) => {
                // « Mises en visibilité » (/annonceur) est le préfixe de toutes
                // les autres routes : il n'est actif que sur la liste et les
                // tableaux de bord, pas quand une entrée plus précise matche.
                const routesPrecises = ['/annonceur/nouvelle', '/annonceur/cartes', '/annonceur/facturation', '/annonceur/regles', '/annonceur/aide'];
                const actif =
                  entree.href === '/annonceur'
                    ? pathname === '/annonceur' ||
                      (pathname.startsWith('/annonceur/') &&
                        !routesPrecises.some((r) => pathname === r || pathname.startsWith(r + '/')))
                    : pathname === entree.href || pathname.startsWith(entree.href + '/');
                return (
                  <Link
                    key={entree.libelle}
                    href={entree.href}
                    className="flex items-center gap-2.5"
                    style={{
                      padding: '9px 10px',
                      borderRadius: 8,
                      fontSize: 13,
                      textDecoration: 'none',
                      color: actif ? '#FFFFFF' : 'rgba(255,255,255,0.65)',
                      background: actif ? 'rgba(255,255,255,0.10)' : 'transparent',
                      fontWeight: actif ? 700 : 400,
                    }}
                  >
                    <entree.Icon size={16} />
                    {entree.libelle}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Pied : compte + déconnexion */}
      <div
        style={{
          borderTop: '1px solid rgba(255,255,255,0.10)',
          paddingTop: 12,
          marginTop: 12,
        }}
      >
        <div style={{ fontSize: 12.5, fontWeight: 700, padding: '0 10px' }}>
          {admin?.displayName || admin?.email || 'Annonceur'}
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="flex items-center gap-2"
          style={{
            marginTop: 8,
            padding: '7px 10px',
            borderRadius: 8,
            border: 'none',
            background: 'transparent',
            color: 'rgba(255,255,255,0.55)',
            fontSize: 12.5,
            cursor: 'pointer',
          }}
        >
          <LogOut size={14} /> Se déconnecter
        </button>
      </div>
    </aside>
  );
}

function AnnonceurGuard({ children }: { children: React.ReactNode }) {
  const { admin, loading, isSponsor, isSuperAdmin } = useAuth();
  const router = useRouter();

  const autorise = isSponsor || isSuperAdmin;

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace('/login');
    } else if (!autorise) {
      // Un rôle scolaire ou un admin de programme n'a rien à faire ici : retour
      // à son espace, le garde du dashboard le routera correctement.
      router.replace('/');
    }
  }, [admin, loading, autorise, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: NAVY }}>
        <div className="flex flex-col items-center gap-4">
          <LoadingSpinner size={40} />
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Chargement...</p>
        </div>
      </div>
    );
  }

  if (!admin || !autorise) return null;
  if (admin.mustChangePassword) return <ForcePasswordChange />;

  return (
    <div className="flex" style={{ minHeight: '100vh', background: '#F6F4EF' }}>
      <SidebarAnnonceur />
      <div style={{ flex: 1, minWidth: 0 }}>
        <TopbarAnnonceur />
        <main style={{ padding: '26px 32px' }}>{children}</main>
      </div>
    </div>
  );
}

/**
 * Barre supérieure (maquette) : fil d'Ariane, chip SOLDE (lu sur le compte
 * annonceur — « — » tant que CONCREE n'a pas initialisé le compte), avatar.
 */
function TopbarAnnonceur() {
  const pathname = usePathname();
  const { admin } = useAuth();
  const [solde, setSolde] = useState<number | null>(null);

  useEffect(() => {
    if (!admin?.uid) return;
    getDoc(doc(firestore, COLLECTIONS.advertisers, admin.uid))
      .then((snap) => {
        const s = snap.data()?.balanceFcfa;
        if (typeof s === 'number') setSolde(s);
      })
      .catch(() => {});
  }, [admin?.uid]);

  const titre = pathname.startsWith('/annonceur/nouvelle')
    ? 'Nouvelle mise en visibilité'
    : pathname.startsWith('/annonceur/facturation')
      ? 'Facturation'
      : pathname.startsWith('/annonceur/regles')
        ? 'Règles de contenu'
        : pathname.startsWith('/annonceur/aide')
          ? 'Aide'
          : pathname.startsWith('/annonceur/cartes')
            ? 'Gérer mes cartes'
            : pathname.startsWith('/annonceur/') && pathname !== '/annonceur'
              ? 'Tableau de bord'
              : 'Mises en visibilité';

  return (
    <header
      className="flex items-center justify-between gap-3"
      style={{ padding: '13px 32px', borderBottom: '1px solid rgba(15,28,46,0.08)', background: '#FFFFFF' }}
    >
      <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
        Espace Annonceur <span style={{ margin: '0 4px' }}>/</span>
        <span style={{ color: NAVY, fontWeight: 600 }}>{titre}</span>
      </div>
      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-2"
          style={{ border: '1px solid rgba(15,28,46,0.12)', borderRadius: 10, padding: '6px 14px', background: '#FBF7EE', fontSize: 12.5 }}
        >
          <span style={{ color: 'var(--color-text-muted)' }}>Solde</span>
          <strong style={{ color: NAVY }}>
            {solde != null ? `${solde.toLocaleString('fr-FR')} FCFA` : '—'}
          </strong>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center"
            style={{ width: 30, height: 30, borderRadius: 15, background: NAVY, color: '#FFF', fontSize: 11, fontWeight: 700 }}
          >
            {(admin?.displayName || admin?.email || '?').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{admin?.displayName || admin?.email}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>Annonceur</div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default function AnnonceurRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AnnonceurGuard>{children}</AnnonceurGuard>
    </AuthProvider>
  );
}
