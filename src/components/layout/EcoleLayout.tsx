'use client';

/**
 * Mode Classe — chrome dédié des rôles scolaires (lot M1, spec v2.1).
 *
 * MÊMES URLS, AUTRE TOIT : plutôt que de re-loger tous les écrans école (et
 * réécrire leurs dizaines de liens internes), le guard du dashboard rend CE
 * layout aux rôles scolaires et le chrome classique aux autres. Zéro écran
 * touché, identité conforme aux maquettes : sidebar navy, groupes par rôle,
 * chip établissement, encart licence.
 *
 * DOUBLE RÔLE : un admin d'établissement qui enseigne (claims `classIds` non
 * vides) a le sélecteur Établissement ⇄ Mes classes. La bascule ne change QUE
 * la navigation affichée (les droits réels viennent des claims et des règles) ;
 * elle est mémorisée en localStorage pour survivre au rechargement.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Award,
  ChartColumn,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  LayoutGrid,
  LogOut,
  Play,
  School,
  Users,
  Zap,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getEstablishment } from '@/lib/school-service';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';
const CLE_VUE = 'mode-classe-vue';

type Vue = 'etablissement' | 'classes';

interface Entree {
  href: string;
  libelle: string;
  Icon: typeof Users;
  bientot?: boolean;
}

export default function EcoleLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { admin, logout, isEstablishmentAdmin, scopedEstablishmentId, scopedClassIds } = useAuth();

  // Double rôle : l'admin qui enseigne a des classes dans ses claims.
  const doubleRole = isEstablishmentAdmin && scopedClassIds.length > 0;
  const [vue, setVue] = useState<Vue>('etablissement');
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const memorisee = window.localStorage.getItem(CLE_VUE);
    if (memorisee === 'classes' && doubleRole) setVue('classes');
  }, [doubleRole]);
  const changerVue = (v: Vue) => {
    setVue(v);
    if (typeof window !== 'undefined') window.localStorage.setItem(CLE_VUE, v);
  };

  // Encart licence : la fiche établissement (lisible par les deux rôles).
  const [etabNom, setEtabNom] = useState('');
  const [licenceFin, setLicenceFin] = useState<number | null>(null);
  useEffect(() => {
    if (!scopedEstablishmentId) return;
    getEstablishment(scopedEstablishmentId)
      .then((e) => {
        if (e) {
          setEtabNom(e.name || scopedEstablishmentId);
          setLicenceFin(typeof e.licenseValidUntil === 'number' ? e.licenseValidUntil : null);
        }
      })
      .catch(() => {});
  }, [scopedEstablishmentId]);

  // Vue effective : un enseignant est toujours en vue « classes ».
  const vueEnseignant = !isEstablishmentAdmin || (doubleRole && vue === 'classes');

  const groupes = useMemo((): Array<{ titre: string; entrees: Entree[] }> => {
    if (vueEnseignant) {
      return [
        {
          titre: 'ENSEIGNER',
          entrees: [
            { href: '/tableau-de-bord', libelle: 'Tableau de bord', Icon: LayoutDashboard },
            { href: '/seances/nouvelle', libelle: 'Lancer une session', Icon: Zap },
            // Session et rapports SÉPARÉS (maquette) : le direct est une porte
            // d'entrée dédiée, les rapports une autre — plus de page fourre-tout.
            { href: '/session-en-direct', libelle: 'Session en direct', Icon: Play },
            { href: '/rapports', libelle: 'Rapports', Icon: ChartColumn },
            { href: '/classes', libelle: 'Mes classes', Icon: LayoutGrid },
          ],
        },
        { titre: 'COMPTE', entrees: entreesCompte() },
      ];
    }
    return [
      {
        titre: 'SUIVI PÉDAGOGIQUE',
        entrees: [
          { href: '/tableau-de-bord', libelle: 'Tableau de bord', Icon: LayoutDashboard },
          { href: '/etablissement', libelle: 'Mon établissement', Icon: School },
          // Pas de « Session en direct » côté direction (maquette) : le direct
          // est le geste de l'enseignant ; la direction passe par les rapports.
          { href: '/rapports', libelle: 'Rapports', Icon: ChartColumn },
        ],
      },
      {
        titre: 'ADMINISTRATION',
        entrees: [
          { href: '/classes', libelle: 'Classes', Icon: LayoutGrid },
          { href: '/enseignants', libelle: 'Enseignants', Icon: Users },
        ],
      },
      { titre: 'COMPTE', entrees: entreesCompte() },
    ];
  }, [vueEnseignant]);

  // Une seule entrée active : la plus SPÉCIFIQUE qui matche (sinon « Tableau de
  // bord » /classes et « Mes classes » /classes s'allumeraient ensemble).
  const hrefActif = useMemo(() => {
    // Le suivi d'une séance (/seances/{id}) s'ouvre depuis « Session en
    // direct » : c'est cette entrée qu'on garde allumée (hors wizard /nouvelle),
    // quand elle existe — la vue direction ne l'a pas.
    if (
      /^\/seances\/(?!nouvelle)/.test(pathname) &&
      groupes.some((g) => g.entrees.some((e) => e.href === '/session-en-direct'))
    ) {
      return '/session-en-direct';
    }
    const candidats = groupes
      .flatMap((g) => g.entrees)
      .filter((e) => !e.bientot && (pathname === e.href || pathname.startsWith(e.href + '/')))
      .sort((a, b) => b.href.length - a.href.length);
    return candidats[0]?.href ?? '';
  }, [groupes, pathname]);

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
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)' }}>Mode Classe · Établissement</div>
          </div>
        </div>

        <nav className="flex flex-col gap-5" style={{ flex: 1 }}>
          {groupes.map((groupe) => (
            <div key={groupe.titre}>
              <div style={{ fontSize: 10, letterSpacing: 1.2, color: 'rgba(255,255,255,0.4)', padding: '0 10px', marginBottom: 7 }}>
                {groupe.titre}
              </div>
              <div className="flex flex-col gap-1">
                {groupe.entrees.map((e) =>
                  e.bientot ? (
                    <div
                      key={e.libelle}
                      className="flex items-center gap-2.5"
                      style={{ padding: '8px 10px', borderRadius: 8, color: 'rgba(255,255,255,0.35)', fontSize: 13 }}
                    >
                      <e.Icon size={16} />
                      <span style={{ flex: 1 }}>{e.libelle}</span>
                      <span style={{ fontSize: 9, padding: '2px 6px', borderRadius: 8, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>
                        Bientôt
                      </span>
                    </div>
                  ) : (
                    <Link
                      key={e.libelle}
                      href={e.href}
                      className="flex items-center gap-2.5"
                      style={{
                        padding: '8px 10px', borderRadius: 8, fontSize: 13, textDecoration: 'none',
                        color: hrefActif === e.href ? '#FFFFFF' : 'rgba(255,255,255,0.65)',
                        background: hrefActif === e.href ? 'rgba(255,255,255,0.10)' : 'transparent',
                        fontWeight: hrefActif === e.href ? 700 : 400,
                      }}
                    >
                      <e.Icon size={16} />
                      {e.libelle}
                    </Link>
                  )
                )}
              </div>
            </div>
          ))}
        </nav>

        {/* Encart licence / compte */}
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 12px', marginTop: 12 }}>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)' }}>
            {isEstablishmentAdmin ? 'Licence établissement' : 'Compte enseignant'}
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, marginTop: 2 }}>
            {isEstablishmentAdmin ? etabNom || '—' : admin?.displayName || admin?.email || '—'}
          </div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', marginTop: 2, lineHeight: 1.5 }}>
            {isEstablishmentAdmin
              ? licenceFin
                ? `valable jusqu'au ${new Date(licenceFin).toLocaleDateString('fr-FR')}`
                : 'licence active'
              : `rattaché(e) à ${etabNom || '—'} · ${scopedClassIds.length} classe${scopedClassIds.length > 1 ? 's' : ''} affectée${scopedClassIds.length > 1 ? 's' : ''}`}
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="flex items-center gap-1.5"
            style={{ marginTop: 8, border: 'none', background: 'transparent', color: ORANGE, fontSize: 11.5, cursor: 'pointer', padding: 0 }}
          >
            <LogOut size={12} /> Se déconnecter
          </button>
        </div>
      </aside>

      {/* ═══ Zone principale : barre supérieure + contenu ═══ */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <header
          className="flex items-center justify-between gap-3"
          style={{ padding: '14px 28px', borderBottom: '1px solid rgba(15,28,46,0.08)', background: '#FFFFFF' }}
        >
          <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            Mode Classe <span style={{ margin: '0 4px' }}>/</span>
            <span style={{ color: NAVY, fontWeight: 600 }}>{titreDepuisChemin(pathname)}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Sélecteur Établissement ⇄ Mes classes — dans la barre supérieure,
                comme la maquette (double rôle uniquement). */}
            {doubleRole && (
              <div className="flex" style={{ borderRadius: 10, border: '1px solid rgba(15,28,46,0.12)', background: '#F1F3F7', padding: 3 }}>
                {(
                  [
                    ['etablissement', 'Établissement'],
                    ['classes', 'Mes classes'],
                  ] as const
                ).map(([v, libelle]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => changerVue(v)}
                    style={{
                      fontSize: 12, padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontWeight: vue === v ? 700 : 400,
                      background: vue === v ? '#FFFFFF' : 'transparent',
                      color: vue === v ? NAVY : '#5A6A70',
                      boxShadow: vue === v ? '0 1px 3px rgba(15,28,46,0.15)' : 'none',
                    }}
                  >
                    {libelle}
                  </button>
                ))}
              </div>
            )}
            <div
              className="flex items-center gap-2"
              style={{ border: '1px solid rgba(15,28,46,0.12)', borderRadius: 10, padding: '5px 12px', background: '#FBF7EE' }}
            >
              <School size={14} color={NAVY} />
              <div>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: NAVY }}>{etabNom || 'Établissement'}</div>
                <div style={{ fontSize: 9.5, color: 'var(--color-text-muted)' }}>compte établissement</div>
              </div>
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
                <div style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
                  {isEstablishmentAdmin ? 'Direction · Administration' : 'Enseignant(e)'}
                </div>
              </div>
            </div>
          </div>
        </header>
        <main style={{ padding: '26px 28px' }}>{children}</main>
      </div>
    </div>
  );
}

/** Entrées du groupe COMPTE — lots M6/M7, affichées « Bientôt ». */
function entreesCompte(): Entree[] {
  return [
    // Certifications : l'écran est ouvert — certificats d'apprenants mesurés
    // (lot 7) ; le parcours formateur y est affiché en feuille de route, ses
    // modules s'activeront avec leur contenu (arbitrage du 13/08).
    { href: '/certifications', libelle: 'Certifications', Icon: Award },
    { href: '/communaute', libelle: 'Communauté', Icon: GraduationCap },
    { href: '/aide-ecole', libelle: 'Aide', Icon: HelpCircle },
  ];
}

/** Libellé du fil d'Ariane depuis le chemin. */
function titreDepuisChemin(pathname: string): string {
  if (pathname.startsWith('/seances/nouvelle')) return 'Lancer une session';
  if (pathname.startsWith('/session-en-direct')) return 'Session en direct';
  if (pathname.startsWith('/rapports')) return 'Rapports de session';
  if (pathname.startsWith('/seances')) return 'Historique des séances';
  if (pathname.startsWith('/classes')) return 'Classes';
  if (pathname.startsWith('/enseignants')) return 'Enseignants';
  if (pathname.startsWith('/tableau-de-bord')) return 'Tableau de bord';
  if (pathname.startsWith('/etablissement')) return 'Mon établissement';
  if (pathname.startsWith('/certifications')) return 'Certifications';
  if (pathname.startsWith('/communaute')) return 'Communauté';
  if (pathname.startsWith('/aide-ecole')) return 'Aide';
  return 'Mode Classe';
}
