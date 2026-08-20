'use client';

/**
 * Accueil du SUPER ADMIN — poste de contrôle (lot SA-2, PLAN-ESPACE-SUPERADMIN.md).
 *
 * Trois étages, uniquement des chiffres MESURÉS au chargement :
 *   1. À TRAITER   — les files d'attente du jour (modération, demandes,
 *                    commandes, messages), tuiles cliquables, accentuées en
 *                    orange dès qu'elles sont non vides ;
 *   2. LE PARC     — établissements actifs (avec les licences qui expirent
 *                    sous 30 jours), partenaires & programmes, joueurs
 *                    inscrits, séances Mode Classe jouées ;
 *   3. ACTIVITÉ    — derniers établissements créés, dernières demandes
 *                    d'inscription reçues.
 *
 * Un compteur qui échoue affiche « — », jamais un chiffre douteux — et
 * n'empêche pas le reste de l'écran de vivre.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  ChevronRight,
  Gamepad2,
  Mail,
  Plus,
  School,
  ShieldCheck,
  ShoppingCart,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { collection, getCountFromServer, getDocs, query, where, type Query } from 'firebase/firestore';
import { firestore, COLLECTIONS } from '@/lib/firebase';
import { getPartners, getPrograms } from '@/lib/firestore-service';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const NAVY = '#0F1C2E';

/** Compte une requête, `null` en cas d'échec — jamais un chiffre douteux. */
function compter(q: Query): Promise<number | null> {
  return getCountFromServer(q)
    .then((s) => s.data().count)
    .catch(() => null);
}

interface EtabResume {
  id: string;
  name: string;
  isActive: boolean;
  licenseValidUntil: number | null;
  createdAt: number;
}

interface DemandeResume {
  uid: string;
  type: string;
  nom: string;
  createdAt: number;
}

export default function SuperAdminHome() {
  const { admin } = useAuth();
  const [loading, setLoading] = useState(true);

  const [campagnes, setCampagnes] = useState<number | null>(null);
  const [demandes, setDemandes] = useState<DemandeResume[] | null>(null);
  const [commandes, setCommandes] = useState<number | null>(null);
  const [messages, setMessages] = useState<number | null>(null);
  const [joueurs, setJoueurs] = useState<number | null>(null);
  const [seancesJouees, setSeancesJouees] = useState<number | null>(null);
  const [etabs, setEtabs] = useState<EtabResume[]>([]);
  const [nbPartenaires, setNbPartenaires] = useState<number | null>(null);
  const [programmes, setProgrammes] = useState<{ total: number; actifs: number } | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      const [
        nbCampagnes,
        demandesSnap,
        nbCommandes,
        nbMessages,
        nbJoueurs,
        nbSeances,
        etabsSnap,
        partenaires,
        progs,
      ] = await Promise.all([
        compter(query(collection(firestore, COLLECTIONS.campaigns), where('status', '==', 'in_review'))),
        getDocs(query(collection(firestore, COLLECTIONS.signupRequests), where('status', '==', 'pending'))).catch(() => null),
        compter(query(collection(firestore, COLLECTIONS.preorders), where('status', '==', 'new'))),
        compter(query(collection(firestore, COLLECTIONS.contactMessages), where('status', '==', 'new'))),
        compter(query(collection(firestore, COLLECTIONS.userStats))),
        compter(query(collection(firestore, COLLECTIONS.classSessions), where('status', '==', 'ended'))),
        getDocs(collection(firestore, COLLECTIONS.establishments)).catch(() => null),
        getPartners().catch(() => null),
        getPrograms().catch(() => null),
      ]);
      if (annule) return;

      setCampagnes(nbCampagnes);
      setCommandes(nbCommandes);
      setMessages(nbMessages);
      setJoueurs(nbJoueurs);
      setSeancesJouees(nbSeances);
      setDemandes(
        demandesSnap
          ? demandesSnap.docs
              // Les demandes d'enseignants relèvent de leur direction, pas de CONCREE.
              .filter((d) => d.data().type !== 'teacher')
              .map((d) => ({
                uid: d.id,
                type: (d.data().type as string) ?? '',
                nom: ((d.data().orgName as string) || (d.data().displayName as string) || (d.data().email as string)) ?? '',
                createdAt: Number(d.data().createdAt ?? 0),
              }))
              .sort((a, b) => b.createdAt - a.createdAt)
          : null
      );
      setEtabs(
        etabsSnap
          ? etabsSnap.docs.map((d) => ({
              id: d.id,
              name: (d.data().name as string) || d.id,
              isActive: d.data().isActive !== false,
              licenseValidUntil: Number(d.data().licenseValidUntil ?? 0) || null,
              createdAt: Number(d.data().createdAt ?? 0),
            }))
          : []
      );
      setNbPartenaires(partenaires ? partenaires.length : null);
      setProgrammes(
        progs ? { total: progs.length, actifs: progs.filter((p) => p.isActive !== false).length } : null
      );
      setLoading(false);
    })();
    return () => {
      annule = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  const nbDemandes = demandes === null ? null : demandes.length;
  const etabsActifs = etabs.filter((e) => e.isActive);
  const dans30j = Date.now() + 30 * 86_400_000;
  const licencesProches = etabsActifs.filter(
    (e) => e.licenseValidUntil && e.licenseValidUntil > Date.now() && e.licenseValidUntil < dans30j
  ).length;
  const licencesExpirees = etabsActifs.filter(
    (e) => e.licenseValidUntil && e.licenseValidUntil < Date.now()
  ).length;
  const etabsRecents = [...etabs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const demandesRecentes = (demandes ?? []).slice(0, 5);

  const dateCourte = (ms: number) =>
    ms ? new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';

  return (
    <div style={{ maxWidth: 1440 }}>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: NAVY }}>
          Bonjour {admin?.displayName?.split(' ')[0] ?? ''} 👋
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
          Le poste de contrôle de la plateforme — files d’attente, parc et activité récente.
        </p>
      </div>

      {/* ═══ 1. À traiter ═══ */}
      <h2 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, marginBottom: 10 }}>À traiter</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <TuileFile
          Icon={ShieldCheck}
          libelle="Campagnes en modération"
          valeur={campagnes}
          href="/moderation"
        />
        <TuileFile
          Icon={UserPlus}
          libelle="Demandes d’inscription"
          valeur={nbDemandes}
          href="/moderation"
        />
        <TuileFile Icon={ShoppingCart} libelle="Commandes nouvelles" valeur={commandes} href="/orders" />
        <TuileFile Icon={Mail} libelle="Messages non lus" valeur={messages} href="/messages" />
      </div>

      {/* ═══ 2. Le parc ═══ */}
      <h2 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Le parc</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <TuileParc
          Icon={School}
          libelle="Établissements actifs"
          valeur={String(etabsActifs.length)}
          sous={
            licencesExpirees > 0
              ? `${licencesExpirees} licence${licencesExpirees > 1 ? 's' : ''} expirée${licencesExpirees > 1 ? 's' : ''}`
              : licencesProches > 0
                ? `${licencesProches} licence${licencesProches > 1 ? 's' : ''} expire${licencesProches > 1 ? 'nt' : ''} sous 30 j`
                : 'aucune échéance proche'
          }
          alerte={licencesExpirees > 0 || licencesProches > 0}
          href="/etablissements"
        />
        <TuileParc
          Icon={Building2}
          libelle="Partenaires"
          valeur={nbPartenaires != null ? String(nbPartenaires) : '—'}
          sous={
            programmes
              ? `${programmes.total} programme${programmes.total > 1 ? 's' : ''} dont ${programmes.actifs} actif${programmes.actifs > 1 ? 's' : ''}`
              : ''
          }
          href="/partners"
        />
        <TuileParc
          Icon={Users}
          libelle="Joueurs inscrits"
          valeur={joueurs != null ? joueurs.toLocaleString('fr-FR') : '—'}
          sous="comptes joueurs de l’app mobile"
          href="/users"
        />
        <TuileParc
          Icon={Gamepad2}
          libelle="Séances Mode Classe"
          valeur={seancesJouees != null ? seancesJouees.toLocaleString('fr-FR') : '—'}
          sous="séances terminées, tous établissements"
        />
      </div>

      {/* ═══ Actions rapides ═══ */}
      <div className="flex items-center gap-3 flex-wrap mb-7">
        <ActionRapide href="/etablissements" libelle="Créer un établissement" />
        <ActionRapide href="/partners/new" libelle="Créer un partenaire" />
        <ActionRapide href="/programs/new" libelle="Créer un programme" />
        <ActionRapide href="/admins" libelle="Créer un compte admin" />
      </div>

      {/* ═══ 3. Activité récente ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Derniers établissements</h2>
            <Link href="/etablissements" style={{ fontSize: 12.5, fontWeight: 700, color: '#B87A0C', textDecoration: 'none' }}>
              Tout le parc
            </Link>
          </div>
          {etabsRecents.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>Aucun établissement pour l’instant.</p>
          ) : (
            etabsRecents.map((e, i) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3"
                style={{ padding: '9px 0', borderBottom: i < etabsRecents.length - 1 ? '1px solid var(--color-card-border)' : 'none' }}
              >
                <div className="flex items-center gap-2.5" style={{ minWidth: 0 }}>
                  <span
                    className="flex items-center justify-center"
                    style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(15,28,46,0.06)', flexShrink: 0 }}
                  >
                    <School size={14} color={NAVY} />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.name}
                  </span>
                  {!e.isActive && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 9, background: 'rgba(217,83,79,0.1)', color: '#C9302C', flexShrink: 0 }}>
                      suspendu
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  {dateCourte(e.createdAt)}
                </span>
              </div>
            ))
          )}
        </section>

        <section className="glass-card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Dernières demandes d’inscription</h2>
            <Link href="/moderation" style={{ fontSize: 12.5, fontWeight: 700, color: '#B87A0C', textDecoration: 'none' }}>
              Traiter
            </Link>
          </div>
          {demandes === null ? (
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>Lecture impossible.</p>
          ) : demandesRecentes.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>Aucune demande en attente. ✓</p>
          ) : (
            demandesRecentes.map((d, i) => (
              <div
                key={d.uid}
                className="flex items-center justify-between gap-3"
                style={{ padding: '9px 0', borderBottom: i < demandesRecentes.length - 1 ? '1px solid var(--color-card-border)' : 'none' }}
              >
                <div className="flex items-center gap-2.5" style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {d.nom || 'Sans nom'}
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 9, background: 'rgba(79,107,255,0.1)', color: '#4F6BFF', flexShrink: 0 }}>
                    {d.type === 'sponsor' ? 'Annonceur' : d.type === 'partner' ? 'Partenaire' : 'Établissement'}
                  </span>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)', flexShrink: 0 }}>
                  {dateCourte(d.createdAt)}
                </span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

/** Tuile de file d'attente : cliquable, accentuée quand non vide. */
function TuileFile({
  Icon,
  libelle,
  valeur,
  href,
}: {
  Icon: LucideIcon;
  libelle: string;
  valeur: number | null;
  href: string;
}) {
  const nonVide = (valeur ?? 0) > 0;
  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
      <div
        className="glass-card p-4"
        style={{
          height: '100%',
          ...(nonVide ? { borderColor: 'rgba(245,166,35,0.5)', background: 'rgba(245,166,35,0.07)' } : {}),
        }}
      >
        <div className="flex items-center gap-2" style={{ color: nonVide ? '#B87A0C' : 'var(--color-text-muted)' }}>
          <Icon size={14} strokeWidth={2.2} />
          <span style={{ fontSize: 12.5 }}>{libelle}</span>
        </div>
        <div className="flex items-baseline gap-2" style={{ marginTop: 10 }}>
          <span style={{ fontSize: 27, fontWeight: 800, color: NAVY, lineHeight: 1 }}>
            {valeur != null ? valeur : '—'}
          </span>
          {valeur === 0 && <span style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 700 }}>✓ à jour</span>}
        </div>
        <div className="flex items-center gap-1" style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 8 }}>
          {nonVide ? 'à traiter' : 'rien en attente'} <ChevronRight size={12} />
        </div>
      </div>
    </Link>
  );
}

/** Tuile du parc : un chiffre mesuré + son contexte. */
function TuileParc({
  Icon,
  libelle,
  valeur,
  sous,
  alerte,
  href,
}: {
  Icon: LucideIcon;
  libelle: string;
  valeur: string;
  sous: string;
  alerte?: boolean;
  href?: string;
}) {
  const contenu = (
    <div className="glass-card p-4" style={{ height: '100%' }}>
      <div className="flex items-center gap-2" style={{ color: 'var(--color-text-muted)' }}>
        <Icon size={14} strokeWidth={2.2} />
        <span style={{ fontSize: 12.5 }}>{libelle}</span>
      </div>
      <div style={{ fontSize: 27, fontWeight: 800, color: NAVY, lineHeight: 1, marginTop: 10 }}>{valeur}</div>
      {sous && (
        <div style={{ fontSize: 11.5, color: alerte ? '#B87A0C' : 'var(--color-text-muted)', fontWeight: alerte ? 700 : 400, marginTop: 8, lineHeight: 1.45 }}>
          {sous}
        </div>
      )}
    </div>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
      {contenu}
    </Link>
  ) : (
    contenu
  );
}

/** Bouton d'action rapide (création). */
function ActionRapide({ href, libelle }: { href: string; libelle: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2"
      style={{
        fontSize: 12.5, fontWeight: 600, color: NAVY, textDecoration: 'none',
        border: '1px solid rgba(15,28,46,0.15)', borderRadius: 10, padding: '8px 14px', background: '#FFF',
      }}
    >
      <Plus size={13} /> {libelle}
    </Link>
  );
}
