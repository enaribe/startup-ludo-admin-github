'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ProgramProvider } from '@/lib/program-context';
import DashboardLayout from '@/components/layout/DashboardLayout';
import EcoleLayout from '@/components/layout/EcoleLayout';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ForcePasswordChange from '@/components/auth/ForcePasswordChange';

/**
 * Un chemin appartient-il à l'une des racines autorisées (`/x` ou `/x/...`) ?
 *
 * ⚠️ La correspondance est EXACTE ou par segment (`root + '/'`), jamais un
 * simple `startsWith(root)` — et ce détail porte une frontière de sécurité :
 * `/etablissements` (le parc, réservé au super admin) ne doit PAS être ouvert
 * par `/etablissement` (la fiche du directeur). Un `startsWith` nu les
 * confondrait et donnerait à chaque directeur la liste de tous les clients.
 */
function isWithin(pathname: string, roots: readonly string[]): boolean {
  return roots.some((root) => pathname === root || pathname.startsWith(root + '/'));
}

/**
 * Routes ouvertes à un admin d'établissement (Mode Classe).
 *
 * `/etablissement` (au singulier) est SA fiche. `/etablissements` (le parc de
 * tous les clients) n'y figure pas et ne doit jamais y figurer : c'est un écran
 * super admin, dont l'API est de toute façon fermée aux autres rôles.
 */
const ESTABLISHMENT_ROUTES = ['/tableau-de-bord', '/rapports', '/etablissement', '/classes', '/enseignants', '/seances', '/communaute', '/aide-ecole'] as const;
/** Routes ouvertes à un enseignant : ses classes et ses séances, rien d'autre. */
const TEACHER_ROUTES = ['/tableau-de-bord', '/rapports', '/classes', '/seances', '/communaute', '/aide-ecole'] as const;

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { admin, loading, isSponsor, isEstablishmentAdmin, isTeacher } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Un sponsor ne voit plus JAMAIS le chrome du dashboard : tout son espace vit
  // sous /annonceur (lots 3-7), y compris la gestion des cartes re-logée sous
  // /annonceur/cartes. Un vieux favori /sponsoring/... est redirigé vers son
  // équivalent exact — même page, nouveau toit.
  const sponsorOutOfScope = isSponsor;

  // Même principe pour les rôles scolaires : périmètre fermé, listé explicitement.
  // Toute route ajoutée plus tard hors de ces listes leur est donc refusée par
  // défaut — comme pour le sponsor, l'oubli est sûr.
  const establishmentOutOfScope = isEstablishmentAdmin && !isWithin(pathname, ESTABLISHMENT_ROUTES);
  const teacherOutOfScope = isTeacher && !isWithin(pathname, TEACHER_ROUTES);
  const outOfScope = sponsorOutOfScope || establishmentOutOfScope || teacherOutOfScope;

  useEffect(() => {
    if (loading) return;
    if (!admin) {
      router.replace('/login');
    } else if (sponsorOutOfScope) {
      // Vieux favori /sponsoring/... → même page sous le nouveau toit ;
      // toute autre route → l'accueil de l'Espace Annonceur.
      router.replace(
        pathname.startsWith('/sponsoring')
          ? `/annonceur/cartes${pathname.slice('/sponsoring'.length)}`
          : '/annonceur'
      );
    } else if (establishmentOutOfScope) {
      router.replace('/tableau-de-bord');
    } else if (teacherOutOfScope) {
      router.replace('/tableau-de-bord');
    }
  }, [admin, loading, sponsorOutOfScope, establishmentOutOfScope, teacherOutOfScope, pathname, router]);

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

  // 1re connexion (ou reset par un super-admin) : on bloque TOUT le dashboard
  // tant que le mot de passe n'a pas été changé.
  if (admin.mustChangePassword) {
    return <ForcePasswordChange />;
  }

  // Redirection en cours (sponsor ou rôle scolaire) : on ne monte pas la page
  // hors périmètre (elle déclencherait des lectures Firestore auxquelles le
  // compte n'a pas droit).
  if (outOfScope) return null;

  // Rôles scolaires : le chrome Mode Classe (lot M1, spec v2.1) — mêmes URLs,
  // autre toit. Le reste du back-office garde le chrome classique.
  if (isEstablishmentAdmin || isTeacher) {
    return (
      <ProgramProvider>
        <EcoleLayout>{children}</EcoleLayout>
      </ProgramProvider>
    );
  }

  return (
    <ProgramProvider>
      <DashboardLayout>{children}</DashboardLayout>
    </ProgramProvider>
  );
}

export default function DashboardRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>{children}</AuthGuard>
    </AuthProvider>
  );
}
