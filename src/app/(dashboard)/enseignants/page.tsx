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
      {/* En-tête */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>Enseignants</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 640 }}>
            Créez les comptes de vos enseignants et affectez-leur des classes. Un enseignant ne voit
            que les classes qui lui sont affectées.
          </p>
        </div>
        <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
          <span className={quota.atteint ? 'badge badge-error' : 'badge badge-info'}>{quota.libelle}</span>
          <span className={licence.expiree ? 'badge badge-error' : licence.alerte ? 'badge badge-primary' : 'badge'}>
            {licence.libelle}
          </span>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => { reinitialiserFormulaire(); setCreation(true); }}
            disabled={!!blocageCreation}
            title={blocageCreation ?? undefined}
          >
            <Plus size={16} /> Créer un compte
          </button>
        </div>
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

      {/* Rappel du choix produit : aucun e-mail n'est envoyé. */}
      <div
        className="glass-card p-4 mb-4 flex items-start gap-3"
        style={{ borderLeft: '3px solid var(--color-info)' }}
      >
        <Mail size={16} style={{ color: 'var(--color-info)', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          <strong>Aucun e-mail n’est envoyé.</strong> Après la création d’un compte, les identifiants
          s’affichent une seule fois : c’est à votre établissement de les transmettre à l’enseignant,
          par le canal de son choix. Il devra changer ce mot de passe à sa première connexion.
        </p>
      </div>

      {/* Liste */}
      {enseignants.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={48} />}
          title="Aucun enseignant"
          description="Créez le premier compte enseignant, puis affectez-lui une ou plusieurs classes."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {enseignants.map((compte) => {
            const affectees = compte.teachingClassIds ?? [];
            return (
              <div key={compte.uid} className="glass-card p-5">
                <div className="flex items-start justify-between mb-3 gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: 'rgba(255,188,64,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <GraduationCap size={18} color="#FFBC40" />
                    </div>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {compte.displayName || compte.email}
                      </h3>
                      <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{compte.email}</p>
                    </div>
                  </div>
                  <span
                    className={compte.mustChangePassword ? 'badge badge-primary' : 'badge badge-success'}
                    style={{ flexShrink: 0 }}
                  >
                    {compte.mustChangePassword ? 'Doit changer son mot de passe' : 'Actif'}
                  </span>
                </div>

                <div
                  className="flex items-start gap-1.5 mb-4"
                  style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}
                >
                  <Users size={13} color="#FFB347" style={{ marginTop: 2, flexShrink: 0 }} />
                  <span>
                    {affectees.length === 0
                      ? 'Aucune classe affectée'
                      : affectees.map(nomClasse).join(', ')}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => ouvrirEdition(compte)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{
                      background: 'rgba(33,150,243,0.08)', color: 'var(--color-info)',
                      border: 'none', cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    <Pencil size={13} /> Modifier les classes
                  </button>
                  <button
                    onClick={() => setRevocation(compte)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{
                      background: 'rgba(244,67,54,0.08)', color: '#F44336',
                      border: 'none', cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    <Trash2 size={13} /> Révoquer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
