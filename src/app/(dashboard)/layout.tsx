'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { ProgramProvider } from '@/lib/program-context';
import DashboardLayout from '@/components/layout/DashboardLayout';
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
const ESTABLISHMENT_ROUTES = ['/etablissement', '/classes', '/enseignants', '/seances'] as const;
/** Routes ouvertes à un enseignant : ses classes et ses séances, rien d'autre. */
const TEACHER_ROUTES = ['/classes', '/seances'] as const;

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { admin, loading, isSponsor, isEstablishmentAdmin, isTeacher } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Un sponsor n'a QUE l'espace /sponsoring : toute autre route du dashboard
  // (à commencer par le tableau de bord `/`, qui charge des données auxquelles
  // il n'a pas droit) est redirigée. On garde ce contrôle au niveau du layout
  // plutôt que dans chaque page : une seule règle couvre toutes les routes,
  // présentes et futures.
  const sponsorOutOfScope = isSponsor && !pathname.startsWith('/sponsoring');

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
      router.replace('/sponsoring');
    } else if (establishmentOutOfScope) {
      router.replace('/etablissement');
    } else if (teacherOutOfScope) {
      router.replace('/classes');
    }
  }, [admin, loading, sponsorOutOfScope, establishmentOutOfScope, teacherOutOfScope, router]);

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
