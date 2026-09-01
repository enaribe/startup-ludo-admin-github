'use client';

/**
 * Mode Classe — comptes enseignants d'un établissement.
 *
 * POURQUOI cet écran : le directeur (`establishment_admin`) crée lui-même les
 * comptes de ses enseignants et leur affecte des classes. C'est le pendant de
 * `/admins` pour le super admin, en beaucoup plus simple : un seul rôle à créer,
 * un seul périmètre à choisir (les classes), et aucune notion de programme.
 *
 * ⚠️ AUCUN E-MAIL N'EST ENVOYÉ — choix produit assumé (cf. PLAN lot 3). Introduire
 * un fournisseur d'e-mail aurait été une dépendance externe et un bloquant pour
 * une action que l'établissement fait très bien lui-même : il connaît ses
 * enseignants et les voit tous les jours. Les identifiants sont donc affichés
 * une fois, à la création, avec un bouton « Copier » — et c'est à l'établissement
 * de les transmettre. Le mot de passe est temporaire : `mustChangePassword`
 * force son changement à la première connexion (`ForcePasswordChange`).
 *
 * PÉRIMÈTRE : réservé à `establishment_admin` et au super admin. Un enseignant
 * n'y accède jamais (la garde de `(dashboard)/layout.tsx` le redirige, et la
 * sidebar ne lui montre pas l'entrée).
 *
 * ⚠️ TOUTE la synchronisation (claim `classIds`, `users/{uid}.teachingClassIds`,
 * `classes/{id}.teacherIds[]`) est faite CÔTÉ SERVEUR par `/api/admins`. Cet
 * écran ne fait qu'appeler l'API : une désynchronisation côté client laisserait
 * un enseignant avec un accès fantôme à une classe qu'on croit lui avoir retirée.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  Copy,
  GraduationCap,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  ShieldAlert,
  Trash2,
  Users,
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getClasses, getEstablishment } from '@/lib/school-service';
import type { Establishment, SchoolClass } from '@/types';
import { useAuth } from '@/lib/auth-context';
import { auth as authClient, firestore, COLLECTIONS } from '@/lib/firebase';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';

/** Compte enseignant tel que renvoyé par `GET /api/admins`. */
interface CompteEnseignant {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  establishmentId: string | null;
  /** Classes affectées — image de `users/{uid}.teachingClassIds`. */
  teachingClassIds?: string[] | null;
  /** True tant que l'enseignant n'a pas changé son mot de passe temporaire. */
  mustChangePassword?: boolean;
}

/** Identifiants à transmettre, affichés une seule fois après la création. */
interface IdentifiantsCrees {
  displayName: string;
  email: string;
  password: string;
}

/** En-têtes d'appel à `/api/admins` : l'ID token de l'appelant borne le périmètre. */
async function enTetesAuth(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

/** Nombre de jours restants avant une échéance, ou `null` si aucune n'est posée. */
function joursRestants(echeance: number | null | undefined): number | null {
  if (!echeance) return null;
  return Math.ceil((echeance - Date.now()) / 86_400_000);
}

export default function EnseignantsPage() {
  const router = useRouter();
  // ── Inscription libre (plans I3/I4) : code partageable + demandes. ──
  const [joinCode, setJoinCode] = useState<string>('');
  const [demandes, setDemandes] = useState<Array<{ uid: string; displayName: string; email: string }>>([]);
  const [decisionEnCours, setDecisionEnCours] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const {
    isSuperAdmin,
    isEstablishmentAdmin,
    scopedEstablishmentId,
    loading: authLoading,
  } = useAuth();

  // Le super admin passe (support) ; l'enseignant, jamais.
  const peutAcceder = isEstablishmentAdmin || isSuperAdmin;

  /**
   * Établissement consulté. Pour un directeur, c'est SON claim — jamais l'URL
   * (une isolation qui dépendrait d'un paramètre d'URL ne protégerait rien).
   * Le super admin, lui, n'a pas de périmètre propre : il désigne l'établissement
   * par `?id=…`, exactement comme sur `/etablissement`.
   */
  const establishmentId = isSuperAdmin
    ? searchParams.get('id')
    : scopedEstablishmentId;

  const [enseignants, setEnseignants] = useState<CompteEnseignant[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [etablissement, setEtablissement] = useState<Establishment | null>(null);
  const [loading, setLoading] = useState(true);

  // Invitation (modale : code partageable + accès à la création directe)
  const [inviter, setInviter] = useState(false);
  // Création
  const [creation, setCreation] = useState(false);
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [classesChoisies, setClassesChoisies] = useState<string[]>([]);
  const [enCreation, setEnCreation] = useState(false);
  /** Identifiants du dernier compte créé — l'unique occasion de les lire. */
  const [identifiants, setIdentifiants] = useState<IdentifiantsCrees | null>(null);

  // Modification des classes affectées
  const [cible, setCible] = useState<CompteEnseignant | null>(null);
  const [classesEdition, setClassesEdition] = useState<string[]>([]);
  const [enregistrement, setEnregistrement] = useState(false);

  // Révocation
  const [revocation, setRevocation] = useState<CompteEnseignant | null>(null);
  const [enRevocation, setEnRevocation] = useState(false);


  useEffect(() => {
    if (!authLoading && !peutAcceder) router.replace('/classes');
  }, [authLoading, peutAcceder, router]);

  const chargerInscription = useCallback(async () => {
    if (!scopedEstablishmentId) return;
    try {
      const etabSnap = await getDoc(doc(firestore, COLLECTIONS.establishments, scopedEstablishmentId));
      setJoinCode((etabSnap.data()?.teacherJoinCode as string) ?? '');
      const demandesSnap = await getDocs(
        query(
          collection(firestore, COLLECTIONS.signupRequests),
          where('establishmentId', '==', scopedEstablishmentId),
          where('status', '==', 'pending')
        )
      );
      setDemandes(
        demandesSnap.docs.map((d) => ({
          uid: d.id,
          displayName: (d.data().displayName as string) ?? '',
          email: (d.data().email as string) ?? '',
        }))
      );
    } catch {
      // Enrichissement : son échec ne bloque jamais la liste des enseignants.
    }
  }, [scopedEstablishmentId]);

  useEffect(() => {
    void chargerInscription();
  }, [chargerInscription]);

  /** (Re)génère le code partageable — l'ancien cesse aussitôt de fonctionner. */
  const regenererCode = async () => {
    if (!scopedEstablishmentId) return;
    const nouveau = `PROF-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    await updateDoc(doc(firestore, COLLECTIONS.establishments, scopedEstablishmentId), {
      teacherJoinCode: nouveau,
      updatedAt: Date.now(),
    });
    setJoinCode(nouveau);
    toast.success('Code régénéré — partagez-le à vos enseignants.');
  };

  /** Active (claims posés côté serveur) ou refuse une demande d'inscription. */
  const deciderDemande = async (uid: string, decision: 'approve' | 'reject') => {
    setDecisionEnCours(uid);
    try {
      const token = await authClient.currentUser?.getIdToken();
      const res = await fetch('/api/inscription/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          uid,
          decision,
          motif: decision === 'reject' ? 'Demande refusée par la direction.' : undefined,
          classIds: [],
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error || 'Décision impossible.');
      toast.success(decision === 'approve' ? 'Compte activé — affectez-lui ses classes.' : 'Demande refusée.');
      await chargerInscription();
      await charger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Décision impossible.');
    } finally {
      setDecisionEnCours(null);
    }
  };

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const [reponse, listeClasses, fiche] = await Promise.all([
        fetch('/api/admins', { headers: await enTetesAuth() }),
        establishmentId ? getClasses(establishmentId) : Promise.resolve([] as SchoolClass[]),
        establishmentId ? getEstablishment(establishmentId) : Promise.resolve(null),
      ]);
      if (!reponse.ok) throw new Error((await reponse.json()).error || 'Erreur');
      const donnees = await reponse.json();
      const comptes: CompteEnseignant[] = donnees.admins ?? [];
      // Le GET est déjà scopé côté serveur pour un directeur ; on refiltre ici
      // pour le super admin, qui reçoit TOUS les comptes du back-office.
      setEnseignants(
        comptes.filter(
          (c) => c.role === 'teacher' && (!establishmentId || c.establishmentId === establishmentId)
        )
      );
      setClasses(listeClasses.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'fr')));
      setEtablissement(fiche);
    } catch (error) {
      console.error('Chargement des enseignants :', error);
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    if (!authLoading && peutAcceder) charger();
  }, [authLoading, peutAcceder, charger]);

  /** Nom lisible d'une classe — on n'affiche jamais un id brut au directeur. */
  const nomClasse = useCallback(
    (id: string) => classes.find((c) => c.id === id)?.name ?? id,
    [classes]
  );

  // ===== Licence et quota, tels qu'appliqués par l'API =====
  const quota = useMemo(() => {
    const max = Number(etablissement?.maxTeachers ?? 0);
    const utilises = enseignants.length;
    const illimite = !Number.isFinite(max) || max <= 0;
    return {
      illimite,
      max,
      utilises,
      atteint: !illimite && utilises >= max,
      libelle: illimite ? `${utilises} enseignant${utilises > 1 ? 's' : ''}` : `${utilises} / ${max} enseignants`,
    };
  }, [etablissement, enseignants.length]);

  const licence = useMemo(() => {
    const echeance = etablissement?.licenseValidUntil ?? null;
    const restant = joursRestants(echeance);
    const dateLisible = echeance ? new Date(echeance).toLocaleDateString('fr-FR') : null;
    if (restant === null) {
      return { expiree: false, alerte: false, libelle: 'Aucune échéance de licence renseignée', dateLisible };
    }
    if (restant < 0) {
      return { expiree: true, alerte: true, libelle: `Licence expirée le ${dateLisible}`, dateLisible };
    }
    if (restant <= 30) {
      return {
        expiree: false,
        alerte: true,
        libelle: `Licence valable jusqu’au ${dateLisible} — expire dans ${restant} jour${restant > 1 ? 's' : ''}`,
        dateLisible,
      };
    }
    return { expiree: false, alerte: false, libelle: `Licence valable jusqu’au ${dateLisible}`, dateLisible };
  }, [etablissement]);

  // Blocage préventif de la création : l'API le refuserait de toute façon, mais
  // mieux vaut l'expliquer AVANT que le directeur ne saisisse un compte entier.
  // Le super admin, lui, n'est jamais bloqué (il dépanne un client).
  const blocageCreation = useMemo(() => {
    if (isSuperAdmin) return null;
    if (licence.expiree) {
      return `La licence de votre établissement a expiré le ${licence.dateLisible}. Contactez l’équipe CONCREE pour la renouveler.`;
    }
    if (etablissement?.isActive === false) {
      return 'Votre établissement est suspendu. Contactez l’équipe CONCREE.';
    }
    if (quota.atteint) {
      return `Quota atteint : votre licence autorise ${quota.max} compte${quota.max > 1 ? 's' : ''} enseignant${quota.max > 1 ? 's' : ''}. Révoquez un compte inutilisé pour en créer un nouveau.`;
    }
    return null;
  }, [isSuperAdmin, licence, etablissement, quota]);

  const reinitialiserFormulaire = () => {
    setNom('');
    setEmail('');
    setMotDePasse('');
    setClassesChoisies([]);
  };

  const creer = async () => {
    if (!nom.trim() || !email.trim() || !motDePasse.trim()) {
      toast.error('Nom, e-mail et mot de passe temporaire sont requis.');
      return;
    }
    if (motDePasse.trim().length < 8) {
      toast.error('Le mot de passe temporaire doit faire au moins 8 caractères.');
      return;
    }
    setEnCreation(true);
    try {
      // ⚠️ On n'envoie PAS `establishmentId` : l'API le force depuis le token du
      // directeur. L'envoyer ici laisserait croire qu'il est modifiable.
      const reponse = await fetch('/api/admins', {
        method: 'POST',
        headers: await enTetesAuth(),
        body: JSON.stringify({
          email: email.trim(),
          password: motDePasse.trim(),
          displayName: nom.trim(),
          role: 'teacher',
          teachingClassIds: classesChoisies,
          // Le super admin, lui, n'a pas de périmètre propre : il doit le désigner.
          ...(isSuperAdmin && establishmentId ? { establishmentId } : {}),
        }),
      });
      const donnees = await reponse.json();
      if (!reponse.ok) throw new Error(donnees.error || 'Création impossible');

      // Les identifiants ne seront plus jamais lisibles : on les affiche AVANT
      // de vider le formulaire.
      setIdentifiants({ displayName: nom.trim(), email: email.trim(), password: motDePasse.trim() });
      setCreation(false);
      reinitialiserFormulaire();
      charger();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur', { duration: 6000 });
    } finally {
      setEnCreation(false);
    }
  };

  const ouvrirEdition = (compte: CompteEnseignant) => {
    setCible(compte);
    setClassesEdition(compte.teachingClassIds ?? []);
  };

  const enregistrerClasses = async () => {
    if (!cible) return;
    setEnregistrement(true);
    try {
      // PATCH : l'API recalcule le claim, `teachingClassIds` ET la relation
      // inverse `classes/{id}.teacherIds[]` par différence (ajouts / retraits).
      const reponse = await fetch('/api/admins', {
        method: 'PATCH',
        headers: await enTetesAuth(),
        body: JSON.stringify({ uid: cible.uid, role: 'teacher', teachingClassIds: classesEdition }),
      });
      const donnees = await reponse.json();
      if (!reponse.ok) throw new Error(donnees.error || 'Modification impossible');
      toast.success('Classes affectées mises à jour');
      setCible(null);
      charger();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur', { duration: 6000 });
    } finally {
      setEnregistrement(false);
    }
  };

  const revoquer = async () => {
    if (!revocation) return;
    setEnRevocation(true);
    try {
      const reponse = await fetch(`/api/admins?uid=${encodeURIComponent(revocation.uid)}`, {
        method: 'DELETE',
        headers: await enTetesAuth(),
      });
      const donnees = await reponse.json();
      if (!reponse.ok) throw new Error(donnees.error || 'Révocation impossible');
      toast.success('Compte révoqué');
      setRevocation(null);
      charger();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur', { duration: 6000 });
    } finally {
      setEnRevocation(false);
    }
  };

  if (authLoading || (peutAcceder && loading)) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }
  if (!peutAcceder) return null;

  if (!establishmentId) {
    return (
      <EmptyState
        icon={<Users size={48} />}
        title="Aucun établissement"
        description={
          isSuperAdmin
            ? 'Cet écran est celui d’un directeur d’établissement. Précisez l’établissement à gérer dans l’URL (?id=…), ou passez par sa fiche.'
            : 'Votre compte n’est rattaché à aucun établissement. Contactez l’équipe CONCREE.'
        }
      />
    );
  }

  return (
    <div>
      {/* En-tête — maquette : effectif + invitations en attente, bouton Inviter */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text-primary)' }}>Enseignants</h1>
          <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
            {enseignants.length} enseignant{enseignants.length > 1 ? 's' : ''}
            {demandes.length > 0 &&
              ` · ${demandes.length} invitation${demandes.length > 1 ? 's' : ''} en attente`}
            {!quota.illimite && ` · quota ${quota.utilises} / ${quota.max}`}
          </p>
        </div>
        <button
          className="btn-primary flex items-center gap-2"
          onClick={() => setInviter(true)}
          style={{ flexShrink: 0 }}
        >
          <Mail size={16} /> Inviter un enseignant
        </button>
      </div>

      {/* Licence expirée / quota atteint : on l'explique, on ne laisse pas
          l'utilisateur découvrir le refus au moment de valider. */}
      {blocageCreation && (
        <div
          className="glass-card p-4 mb-4 flex items-start gap-3"
          style={{ borderLeft: '3px solid var(--color-error)' }}
        >
          <ShieldAlert size={16} style={{ color: 'var(--color-error)', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {blocageCreation}
          </p>
        </div>
      )}

      {/* Licence qui approche : avertissement, sans blocage. */}
      {!blocageCreation && licence.alerte && (
        <div
          className="glass-card p-4 mb-4 flex items-start gap-3"
          style={{ borderLeft: '3px solid var(--color-primary)' }}
        >
          <AlertTriangle size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {licence.libelle}. Passé cette date, la création de comptes enseignants sera bloquée.
          </p>
        </div>
      )}

      {/* ═══ Équipe pédagogique — tableau (maquette) ═══ */}
      {enseignants.length === 0 && demandes.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={48} />}
          title="Aucun enseignant"
          description="Invitez vos enseignants : par code d’inscription qu’ils saisissent eux-mêmes, ou en créant leur compte directement."
          action={
            <button className="btn-primary flex items-center gap-2" onClick={() => setInviter(true)}>
              <Mail size={16} /> Inviter un enseignant
            </button>
          }
        />
      ) : (
        <section className="glass-card">
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-card-border)' }}>
            <h2 style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Équipe pédagogique
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3 }}>
              Cliquez « Affecter » pour modifier les classes d’un enseignant.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-card-border)' }}>
                  <ThEq>Enseignant</ThEq>
                  <ThEq>Classes affectées</ThEq>
                  <ThEq>Statut</ThEq>
                  <ThEq style={{ textAlign: 'right' }}>Action</ThEq>
                </tr>
              </thead>
              <tbody>
                {enseignants.map((compte) => {
                  const affectees = compte.teachingClassIds ?? [];
                  return (
                    <tr
                      key={compte.uid}
                      onClick={() => router.push(`/enseignants/${compte.uid}`)}
                      title="Voir la fiche de l’enseignant"
                      style={{ borderBottom: '1px solid var(--color-card-border)', cursor: 'pointer' }}
                    >
                      <td className="px-5 py-3">
                        <CelluleIdentite nom={compte.displayName || compte.email} email={compte.email} />
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {affectees.length === 0 ? (
                            <PilluleClasse estVide>Aucune classe</PilluleClasse>
                          ) : (
                            affectees.map((id) => <PilluleClasse key={id}>{nomClasse(id)}</PilluleClasse>)
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {compte.mustChangePassword ? (
                          <PastilleStatut couleur="#B87A0C" fond="rgba(245,166,35,0.12)" libelle="Invité"
                            titre="Compte créé — l'enseignant n'a pas encore changé son mot de passe temporaire" />
                        ) : (
                          <PastilleStatut couleur="#2EA043" fond="rgba(46,160,67,0.1)" libelle="Actif" />
                        )}
                      </td>
                      {/* stopPropagation : les boutons d'action ne doivent pas ouvrir la fiche. */}
                      <td
                        className="px-5 py-3"
                        style={{ textAlign: 'right', whiteSpace: 'nowrap' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => ouvrirEdition(compte)}
                          className="items-center gap-1.5"
                          style={{
                            display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 12.5, fontWeight: 700, color: '#B87A0C', padding: '4px 6px',
                          }}
                        >
                          <Pencil size={13} /> Affecter
                        </button>
                        <button
                          onClick={() => setRevocation(compte)}
                          title="Révoquer ce compte"
                          style={{
                            display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--color-text-muted)', padding: '4px 6px', marginLeft: 6,
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* Demandes d'inscription en attente — même tableau, statut dédié. */}
                {demandes.map((dm, i) => (
                  <tr
                    key={dm.uid}
                    style={{ borderBottom: i < demandes.length - 1 ? '1px solid var(--color-card-border)' : 'none' }}
                  >
                    <td className="px-5 py-3">
                      <CelluleIdentite nom={dm.displayName || dm.email} email={dm.email} />
                    </td>
                    <td className="px-5 py-3">
                      <PilluleClasse estVide>Aucune classe</PilluleClasse>
                    </td>
                    <td className="px-5 py-3">
                      <PastilleStatut couleur="#B87A0C" fond="rgba(245,166,35,0.12)" libelle="En attente"
                        titre="Demande d'inscription à valider" />
                    </td>
                    <td className="px-5 py-3" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        className="btn-primary"
                        style={{ fontSize: 12, padding: '6px 12px' }}
                        disabled={decisionEnCours === dm.uid}
                        onClick={() => void deciderDemande(dm.uid, 'approve')}
                      >
                        Activer
                      </button>
                      <button
                        className="btn-secondary"
                        style={{ fontSize: 12, padding: '6px 12px', marginLeft: 8 }}
                        disabled={decisionEnCours === dm.uid}
                        onClick={() => void deciderDemande(dm.uid, 'reject')}
                      >
                        Refuser
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ===== Inviter un enseignant : code partageable OU création directe ===== */}
      <Modal open={inviter} onClose={() => setInviter(false)} title="Inviter un enseignant" maxWidth="520px">
        <div className="flex flex-col gap-4">
          <div>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              Par code d’inscription
            </h3>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
              Partagez ce code : l’enseignant crée son compte lui-même (« Créer un compte » sur la
              page de connexion) et sa demande apparaît dans le tableau, en attente de votre
              validation.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', background: 'var(--color-surface)', borderRadius: 8, padding: '8px 14px' }}>
                {joinCode || '— aucun code —'}
              </span>
              {joinCode && <BoutonCopier texte={joinCode} compact />}
              <button className="btn-secondary" style={{ fontSize: 12 }} onClick={() => void regenererCode()}>
                {joinCode ? 'Régénérer' : 'Générer'}
              </button>
            </div>
            {joinCode && (
              <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 8 }}>
                Régénérer le code invalide l’ancien immédiatement.
              </p>
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--color-card-border)', paddingTop: 14 }}>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 6 }}>
              Ou créez le compte vous-même
            </h3>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 10 }}>
              Vous saisissez nom, e-mail et mot de passe temporaire, puis transmettez les
              identifiants — aucun e-mail n’est envoyé.
            </p>
            <button
              className="btn-secondary flex items-center gap-2"
              onClick={() => {
                setInviter(false);
                reinitialiserFormulaire();
                setCreation(true);
              }}
              disabled={!!blocageCreation}
              title={blocageCreation ?? undefined}
            >
              <Plus size={15} /> Créer un compte enseignant
            </button>
          </div>
        </div>
      </Modal>

      {/* ===== Création ===== */}
      <Modal open={creation} onClose={() => setCreation(false)} title="Nouveau compte enseignant">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Champ label="Nom de l’enseignant">
            <input
              className="input-field"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Awa Diop"
            />
          </Champ>
          <Champ label="E-mail">
            <input
              className="input-field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="awa.diop@ism.sn"
            />
          </Champ>
          <Champ label="Mot de passe temporaire (min. 8 caractères)">
            <input
              className="input-field"
              type="text"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              placeholder="Mot de passe à transmettre"
            />
          </Champ>
          <Champ label={`Classes affectées${classesChoisies.length ? ` (${classesChoisies.length})` : ''}`}>
            <SelecteurClasses classes={classes} selection={classesChoisies} onChange={setClassesChoisies} />
          </Champ>

          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Les identifiants s’afficheront à l’écran après la création — aucun e-mail ne sera envoyé.
            L’enseignant devra changer ce mot de passe à sa première connexion. Les classes peuvent
            être modifiées à tout moment.
          </p>
          <button className="btn-primary" onClick={creer} disabled={enCreation}>
            {enCreation ? 'Création…' : 'Créer le compte'}
          </button>
        </div>
      </Modal>

      {/* ===== Identifiants à transmettre (affichés une seule fois) ===== */}
      <Modal
        open={!!identifiants}
        onClose={() => setIdentifiants(null)}
        title="Identifiants à transmettre"
      >
        {identifiants && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              className="flex items-start gap-3 p-3"
              style={{ background: 'var(--color-surface)', borderRadius: 8 }}
            >
              <KeyRound size={16} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                Le compte de <strong>{identifiants.displayName}</strong> est créé. Ces identifiants ne
                seront <strong>plus jamais affichés</strong> : copiez-les maintenant et transmettez-les
                à l’enseignant vous-même — aucun e-mail n’est envoyé.
              </p>
            </div>

            <LigneIdentifiant label="E-mail" valeur={identifiants.email} />
            <LigneIdentifiant label="Mot de passe temporaire" valeur={identifiants.password} />

            <BoutonCopier
              texte={`Identifiants Startup Ludo — ${identifiants.displayName}\nE-mail : ${identifiants.email}\nMot de passe temporaire : ${identifiants.password}\n\nÀ changer à la première connexion.`}
              libelle="Copier les identifiants"
            />
            <button className="btn-secondary" onClick={() => setIdentifiants(null)}>
              J’ai noté les identifiants
            </button>
          </div>
        )}
      </Modal>

      {/* ===== Modification des classes affectées ===== */}
      <Modal
        open={!!cible}
        onClose={() => setCible(null)}
        title={`Classes de ${cible?.displayName || cible?.email || ''}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Champ label={`Classes affectées${classesEdition.length ? ` (${classesEdition.length})` : ''}`}>
            <SelecteurClasses classes={classes} selection={classesEdition} onChange={setClassesEdition} />
          </Champ>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Retirer une classe en retire immédiatement l’accès à l’enseignant : il ne verra plus ni sa
            liste d’élèves ni ses séances. Une classe peut être enseignée par plusieurs enseignants —
            décocher ne retire que celui-ci.
          </p>
          <button className="btn-primary" onClick={enregistrerClasses} disabled={enregistrement}>
            {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!revocation}
        onClose={() => setRevocation(null)}
        onConfirm={revoquer}
        title="Révoquer ce compte"
        message={`Révoquer l’accès de « ${revocation?.displayName || revocation?.email} » ? Il sera retiré de toutes ses classes et ne pourra plus se connecter. Les élèves et les séances passées ne sont pas touchés.`}
        confirmLabel="Révoquer"
        danger
        loading={enRevocation}
      />

    </div>
  );
}


/** En-tête de colonne du tableau de l'équipe pédagogique. */
function ThEq({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      className="text-left px-5 py-3"
      style={{
        fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8,
        color: 'var(--color-text-muted)', ...style,
      }}
    >
      {children}
    </th>
  );
}

/** Avatar aux initiales + nom + e-mail (colonne Enseignant). */
function CelluleIdentite({ nom, email }: { nom: string; email: string }) {
  const initiales =
    nom
      .trim()
      .split(/\s+/)
      .filter((m) => m.length > 1 || /^[A-Za-zÀ-ÿ]$/.test(m))
      .slice(0, 2)
      .map((m) => m[0])
      .join('')
      .toUpperCase() || '·';
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex items-center justify-center"
        style={{
          width: 36, height: 36, borderRadius: 18, flexShrink: 0,
          background: '#0F1C2E', color: '#FFFFFF', fontSize: 12, fontWeight: 800,
        }}
      >
        {initiales}
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>{nom}</div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{email}</div>
      </div>
    </div>
  );
}

/** Pilule d'une classe affectée. */
function PilluleClasse({ children, estVide }: { children: React.ReactNode; estVide?: boolean }) {
  return (
    <span
      style={{
        fontSize: 11.5, fontWeight: estVide ? 400 : 600, padding: '4px 11px', borderRadius: 10,
        background: 'rgba(15,28,46,0.05)', border: '1px solid var(--color-card-border)',
        color: estVide ? 'var(--color-text-muted)' : 'var(--color-text-secondary)',
        fontStyle: estVide ? 'italic' : 'normal', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** Pastille de statut « ● Actif / Invité / En attente ». */
function PastilleStatut({
  couleur,
  fond,
  libelle,
  titre,
}: {
  couleur: string;
  fond: string;
  libelle: string;
  titre?: string;
}) {
  return (
    <span
      title={titre}
      className="items-center gap-1.5"
      style={{
        display: 'inline-flex', fontSize: 11.5, fontWeight: 700, padding: '4px 11px',
        borderRadius: 10, background: fond, color: couleur, whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: couleur }} />
      {libelle}
    </span>
  );
}

/** Libellé + champ, sur le modèle des autres écrans Mode Classe. */
function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

/** Une ligne « libellé + valeur copiable » du récapitulatif d'identifiants. */
function LigneIdentifiant({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          className="input-field"
          readOnly
          value={valeur}
          style={{ fontFamily: 'ui-monospace, monospace', flex: 1 }}
          onFocus={(e) => e.currentTarget.select()}
        />
        <BoutonCopier texte={valeur} compact />
      </div>
    </div>
  );
}

/**
 * Bouton « Copier » avec retour visuel.
 *
 * `navigator.clipboard` n'existe qu'en contexte sécurisé (HTTPS ou localhost) :
 * en cas d'échec on le dit, plutôt que de laisser croire que la copie a marché —
 * le directeur repartirait sans les identifiants, qui ne sont plus réaffichables.
 */
function BoutonCopier({
  texte,
  libelle,
  compact,
}: {
  texte: string;
  libelle?: string;
  compact?: boolean;
}) {
  const [copie, setCopie] = useState(false);

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(texte);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      toast.error('Copie impossible — sélectionnez le texte et copiez-le à la main.');
    }
  };

  return (
    <button
      type="button"
      onClick={copier}
      className={compact ? 'btn-secondary' : 'btn-primary flex items-center justify-center gap-2'}
      style={compact ? { padding: '8px 10px', flexShrink: 0 } : undefined}
      title="Copier"
    >
      {copie ? <Check size={15} /> : <Copy size={15} />}
      {!compact && (libelle ?? 'Copier')}
    </button>
  );
}

/**
 * Sélection multiple de classes par cases à cocher — périmètre d'un enseignant.
 * Calqué sur `ProgramMultiSelect` de `/admins`. Le nombre d'élèves est affiché
 * pour reconnaître une classe d'un coup d'œil quand deux ont un nom proche.
 */
function SelecteurClasses({
  classes,
  selection,
  onChange,
}: {
  classes: SchoolClass[];
  selection: string[];
  onChange: (ids: string[]) => void;
}) {
  const basculer = (id: string) =>
    onChange(selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]);

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto',
        border: '1px solid var(--color-card-border)', borderRadius: 10, padding: 6,
      }}
    >
      {classes.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: 8 }}>
          Aucune classe. Créez-en une depuis l’écran « Classes ».
        </p>
      )}
      {classes.map((classe) => {
        const coche = selection.includes(classe.id);
        return (
          <label
            key={classe.id}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8,
              cursor: 'pointer', fontSize: 13,
              background: coche ? 'var(--color-info-light)' : 'transparent',
              color: 'var(--color-text-primary)',
            }}
          >
            <input type="checkbox" checked={coche} onChange={() => basculer(classe.id)} />
            <span style={{ flex: 1 }}>{classe.name || classe.id}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
              {classe.learnerCount ?? 0} élève{(classe.learnerCount ?? 0) > 1 ? 's' : ''}
            </span>
          </label>
        );
      })}
    </div>
  );
}
