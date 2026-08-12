'use client';

/**
 * Mode Classe — parc des établissements clients (super admin).
 *
 * POURQUOI CET ÉCRAN : ouvrir un compte pour une école exigeait jusqu'ici trois
 * gestes manuels, dont deux en ligne de commande (`scripts/seed-establishment.mjs`
 * puis `scripts/set-admin-claims.mjs`). Un développeur devait donc intervenir à
 * chaque vente — intenable pour un produit commercialisé. Cet écran replie tout
 * en un formulaire : l'établissement ET son compte de direction naissent
 * ensemble, en un appel à `POST /api/establishments`.
 *
 * PÉRIMÈTRE : **super admin uniquement**. La garde de `(dashboard)/layout.tsx`
 * ferme la route aux rôles scolaires et au sponsor (périmètre fermé par défaut),
 * la sidebar n'affiche l'entrée qu'au super admin, et l'API refuse tout autre
 * appelant. Trois couches, dont la seule qui compte vraiment est la dernière.
 *
 * ⚠️ AUCUNE SUPPRESSION N'EST PROPOSÉE — supprimer un établissement laisserait
 * ses classes, ses élèves et ses séances orphelins (Firestore ne cascade pas),
 * et ses comptes garderaient un claim `establishmentId` pointant dans le vide.
 * La désactivation est le geste prévu : elle bloque le lancement de séance
 * (contrôle du lot 3) sans rien détruire, et se réactive d'un clic.
 *
 * ⚠️ AUCUN E-MAIL N'EST ENVOYÉ, même parti pris qu'au lot 3 pour les enseignants :
 * les identifiants s'affichent une fois, avec un bouton « Copier », et c'est à
 * l'équipe commerciale de les transmettre.
 *
 * LECTURES : `school-service` (SDK client, donc soumis aux règles Firestore).
 * ÉCRITURES : toutes par l'API — la création exige l'Admin SDK (custom claims),
 * et la licence ne doit pas pouvoir être prolongée par un directeur depuis la
 * console (les règles lui autorisent pourtant l'`update` de sa propre fiche).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  Check,
  Copy,
  KeyRound,
  Mail,
  MapPin,
  Plus,
  Power,
  RefreshCw,
  School,
  Search,
  Users,
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import { getAllClasses, getEstablishments } from '@/lib/school-service';
import {
  SCHOOL_LEVELS,
  SCHOOL_LEVEL_LABELS,
  type Establishment,
  type SchoolClass,
  type SchoolLevel,
} from '@/types';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';

/** Un jour, en millisecondes — sert aux calculs d'échéance de licence. */
const UN_JOUR = 86_400_000;

/** Seuil (en jours) sous lequel une licence est signalée « expire bientôt ». */
const SEUIL_ALERTE_JOURS = 30;

/** Compte de direction créé, affiché une seule fois après la validation. */
interface IdentifiantsCrees {
  /** Nom de l'établissement, pour situer les identifiants dans le récapitulatif. */
  etablissement: string;
  displayName: string;
  email: string;
  password: string;
}

/** État du formulaire de création — un seul objet, pour un seul geste. */
interface FormulaireCreation {
  // Établissement
  name: string;
  id: string;
  level: SchoolLevel;
  city: string;
  country: string;
  // Licence
  licenseCode: string;
  /** Échéance au format `yyyy-mm-dd` d'un `<input type="date">`. */
  licenseValidUntil: string;
  /** Quotas saisis en texte : « 0 » et « vide » doivent rester distinguables. */
  maxTeachers: string;
  maxLearners: string;
  // Compte de direction
  adminDisplayName: string;
  adminEmail: string;
  adminPassword: string;
}

/** En-têtes d'appel à l'API : l'ID token de l'appelant borne le périmètre. */
async function enTetesAuth(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

/**
 * Transforme un nom d'établissement en identifiant de document.
 * « Institut Supérieur de Management » → `institut-superieur-de-management`.
 *
 * Les accents sont dépliés (`NFD` + suppression des diacritiques) plutôt que
 * remplacés à la main : ça couvre le français comme l'espagnol ou le portugais,
 * langues des marchés visés. Tout le reste devient un tiret, et les tirets
 * consécutifs sont réduits — un identifiant se lit aussi dans une URL.
 */
function versIdentifiant(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/**
 * Propose un code de licence à partir du nom, façon `EST-ISM-2026`.
 *
 * L'acronyme est fait des initiales des mots « significatifs » : les mots de
 * liaison (de, du, la, …) sont écartés, sinon « Institut Supérieur de
 * Management » donnerait `ISDM`. À défaut d'acronyme exploitable, on retombe sur
 * les premières lettres du nom — un code proposé reste modifiable de toute façon.
 */
function versCodeLicence(nom: string, echeance: string): string {
  const motsVides = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'd', 'l', 'a']);
  const mots = nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .filter((mot) => !motsVides.has(mot.toLowerCase()));

  const acronyme = mots.map((mot) => mot.charAt(0)).join('').slice(0, 5);
  const base = acronyme.length >= 2 ? acronyme : nom.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4);
  const annee = echeance ? echeance.slice(0, 4) : String(new Date().getFullYear());
  return base ? `EST-${base}-${annee}` : '';
}

/** Convertit une valeur de `<input type="date">` en epoch (fin de journée). */
function versTimestamp(valeur: string): number | null {
  if (!valeur) return null;
  const ms = new Date(`${valeur}T23:59:59`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Convertit un epoch en `yyyy-mm-dd`, pour un `<input type="date">`. */
function versValeurDate(ms: number | null | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** Échéance par défaut d'une nouvelle licence : dans un an, jour pour jour. */
function echeanceParDefaut(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return versValeurDate(d.getTime());
}

/** Formulaire vierge — reconstruit à chaque ouverture, jamais réutilisé tel quel. */
function formulaireVierge(): FormulaireCreation {
  const echeance = echeanceParDefaut();
  return {
    name: '',
    id: '',
    level: 'lycee',
    city: '',
    country: '',
    licenseCode: '',
    licenseValidUntil: echeance,
    maxTeachers: '10',
    maxLearners: '300',
    adminDisplayName: '',
    adminEmail: '',
    adminPassword: '',
  };
}

/** État de licence d'un établissement, tel qu'affiché dans la liste. */
interface EtatLicence {
  /** Ton du badge : reprend les classes `.badge-*` existantes. */
  ton: 'success' | 'primary' | 'error' | 'muted';
  libelle: string;
}

/**
 * Qualifie l'état de la licence : valide, expire bientôt (< 30 jours), expirée,
 * ou sans échéance. Une licence sans échéance est considérée valide — c'est la
 * convention de `/api/admins` (`verifierLicence`), qui ne bloque jamais un
 * client sur une donnée jamais saisie.
 */
function etatLicence(etablissement: Establishment): EtatLicence {
  const echeance = etablissement.licenseValidUntil ?? null;
  if (!echeance) return { ton: 'muted', libelle: 'Aucune échéance' };

  const date = new Date(echeance).toLocaleDateString('fr-FR');
  const jours = Math.ceil((echeance - Date.now()) / UN_JOUR);
  if (jours < 0) return { ton: 'error', libelle: `Expirée le ${date}` };
  if (jours <= SEUIL_ALERTE_JOURS) {
    return { ton: 'primary', libelle: `Expire dans ${jours} jour${jours > 1 ? 's' : ''}` };
  }
  return { ton: 'success', libelle: `Valide jusqu’au ${date}` };
}

/** Libellé « 3 / 10 » d'un quota, ou « 3 » quand il est illimité (0). */
function libelleQuota(utilises: number, max: number, unite: string): string {
  const illimite = !Number.isFinite(max) || max <= 0;
  const pluriel = utilises > 1 ? 's' : '';
  return illimite ? `${utilises} ${unite}${pluriel}` : `${utilises} / ${max} ${unite}s`;
}

export default function EtablissementsPage() {
  const router = useRouter();
  const { isSuperAdmin, loading: authLoading } = useAuth();

  const [etablissements, setEtablissements] = useState<Establishment[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  /** Comptes scolaires par établissement — sert au « 3 / 10 enseignants ». */
  const [comptesParEtablissement, setComptesParEtablissement] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [recherche, setRecherche] = useState('');

  // Création
  const [creation, setCreation] = useState(false);
  const [formulaire, setFormulaire] = useState<FormulaireCreation>(formulaireVierge);
  /** L'identifiant a-t-il été édité à la main ? Si oui, on cesse de le déduire du nom. */
  const [identifiantManuel, setIdentifiantManuel] = useState(false);
  /** Idem pour le code de licence. */
  const [codeManuel, setCodeManuel] = useState(false);
  const [enCreation, setEnCreation] = useState(false);
  /** Identifiants du dernier compte créé — l'unique occasion de les lire. */
  const [identifiants, setIdentifiants] = useState<IdentifiantsCrees | null>(null);

  // Renouvellement de licence
  const [renouvellement, setRenouvellement] = useState<Establishment | null>(null);
  const [nouvelleEcheance, setNouvelleEcheance] = useState('');
  const [nouveauCode, setNouveauCode] = useState('');
  const [nouveauMaxTeachers, setNouveauMaxTeachers] = useState('');
  const [nouveauMaxLearners, setNouveauMaxLearners] = useState('');
  const [enRenouvellement, setEnRenouvellement] = useState(false);

  // Activation / désactivation
  const [bascule, setBascule] = useState<Establishment | null>(null);
  const [enBascule, setEnBascule] = useState(false);

  useEffect(() => {
    if (!authLoading && !isSuperAdmin) router.replace('/');
  }, [authLoading, isSuperAdmin, router]);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      // Les trois lectures sont indépendantes : en parallèle. La liste des
      // comptes passe par `/api/admins` (l'Admin SDK est le seul à voir tous les
      // rôles) ; un échec de CETTE lecture ne doit pas vider l'écran, on se
      // contente alors de quotas d'enseignants non renseignés.
      const [liste, toutesClasses, reponseComptes] = await Promise.all([
        getEstablishments(),
        getAllClasses(),
        fetch('/api/admins', { headers: await enTetesAuth() }).catch(() => null),
      ]);

      setEtablissements(
        liste.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'fr'))
      );
      setClasses(toutesClasses);

      if (reponseComptes?.ok) {
        const donnees: { admins?: Array<{ role?: string; establishmentId?: string | null }> } =
          await reponseComptes.json();
        const compte: Record<string, number> = {};
        for (const a of donnees.admins ?? []) {
          // Tout siège scolaire est vendu : le directeur compte lui aussi, comme
          // dans `verifierLicenceEtQuota` de `/api/admins`.
          if ((a.role === 'teacher' || a.role === 'establishment_admin') && a.establishmentId) {
            compte[a.establishmentId] = (compte[a.establishmentId] ?? 0) + 1;
          }
        }
        setComptesParEtablissement(compte);
      }
    } catch (error) {
      console.error('Chargement des établissements :', error);
      toast.error('Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isSuperAdmin) charger();
  }, [authLoading, isSuperAdmin, charger]);

  /** Nombre de classes par établissement, calculé une fois pour toute la liste. */
  const classesParEtablissement = useMemo(() => {
    const compte: Record<string, number> = {};
    for (const classe of classes) {
      if (!classe.establishmentId) continue;
      compte[classe.establishmentId] = (compte[classe.establishmentId] ?? 0) + 1;
    }
    return compte;
  }, [classes]);

  /** Élèves actifs par établissement (somme des `learnerCount` dénormalisés). */
  const elevesParEtablissement = useMemo(() => {
    const compte: Record<string, number> = {};
    for (const classe of classes) {
      if (!classe.establishmentId) continue;
      compte[classe.establishmentId] =
        (compte[classe.establishmentId] ?? 0) + (classe.learnerCount ?? 0);
    }
    return compte;
  }, [classes]);

  /** Recherche par nom — et aussi par identifiant et par ville, sans surprise. */
  const listeFiltree = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    if (!terme) return etablissements;
    return etablissements.filter((e) =>
      [e.name, e.id, e.city].some((champ) => (champ ?? '').toLowerCase().includes(terme))
    );
  }, [etablissements, recherche]);

  // ===== Création =====

  /**
   * Met à jour un champ du formulaire, en propageant les déductions.
   * Le nom alimente l'identifiant ET le code de licence — jusqu'à ce que
   * l'utilisateur touche l'un ou l'autre, auquel cas sa saisie prime.
   */
  const majFormulaire = (patch: Partial<FormulaireCreation>) => {
    setFormulaire((precedent) => {
      const suivant = { ...precedent, ...patch };
      if (patch.name !== undefined) {
        if (!identifiantManuel) suivant.id = versIdentifiant(patch.name);
        if (!codeManuel) suivant.licenseCode = versCodeLicence(patch.name, suivant.licenseValidUntil);
      }
      // L'année du code suit l'échéance tant que le code n'a pas été repris à la main.
      if (patch.licenseValidUntil !== undefined && !codeManuel) {
        suivant.licenseCode = versCodeLicence(suivant.name, patch.licenseValidUntil);
      }
      return suivant;
    });
  };

  const ouvrirCreation = () => {
    setFormulaire(formulaireVierge());
    setIdentifiantManuel(false);
    setCodeManuel(false);
    setCreation(true);
  };

  /**
   * Identifiant déjà pris ? Vérifié à la volée sur la liste déjà chargée, pour
   * le dire AVANT la validation. L'API refait le contrôle côté serveur (elle
   * seule fait autorité : la liste locale peut dater de quelques minutes).
   */
  const identifiantPris = useMemo(
    () => !!formulaire.id && etablissements.some((e) => e.id === formulaire.id),
    [formulaire.id, etablissements]
  );

  const creer = async () => {
    const { name, id, city, country, adminDisplayName, adminEmail, adminPassword } = formulaire;
    if (!name.trim() || !id.trim() || !city.trim() || !country.trim()) {
      toast.error('Nom, identifiant, ville et pays sont requis.');
      return;
    }
    if (identifiantPris) {
      toast.error('Cet identifiant est déjà utilisé par un autre établissement.');
      return;
    }
    if (!adminDisplayName.trim() || !adminEmail.trim() || !adminPassword) {
      toast.error('Le compte de direction (nom, e-mail, mot de passe) est requis.');
      return;
    }
    if (adminPassword.length < 8) {
      toast.error('Le mot de passe temporaire doit faire au moins 8 caractères.');
      return;
    }

    setEnCreation(true);
    try {
      const reponse = await fetch('/api/establishments', {
        method: 'POST',
        headers: await enTetesAuth(),
        body: JSON.stringify({
          id: id.trim(),
          name: name.trim(),
          level: formulaire.level,
          city: city.trim(),
          country: country.trim(),
          licenseCode: formulaire.licenseCode.trim(),
          licenseValidUntil: versTimestamp(formulaire.licenseValidUntil),
          maxTeachers: Number(formulaire.maxTeachers) || 0,
          maxLearners: Number(formulaire.maxLearners) || 0,
          adminDisplayName: adminDisplayName.trim(),
          adminEmail: adminEmail.trim(),
          adminPassword,
        }),
      });
      const donnees = await reponse.json();
      if (!reponse.ok) throw new Error(donnees.error || 'Création impossible');

      // Les identifiants ne seront plus jamais lisibles : on les mémorise AVANT
      // de refermer et de vider le formulaire.
      setIdentifiants({
        etablissement: name.trim(),
        displayName: adminDisplayName.trim(),
        email: adminEmail.trim(),
        password: adminPassword,
      });
      setCreation(false);
      setFormulaire(formulaireVierge());
      charger();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur', { duration: 8000 });
    } finally {
      setEnCreation(false);
    }
  };

  // ===== Renouvellement de licence =====

  const ouvrirRenouvellement = (etablissement: Establishment) => {
    // Par défaut : un an après l'échéance actuelle si elle est encore devant
    // nous (on prolonge sans perdre les jours restants), sinon un an à partir
    // d'aujourd'hui (une licence expirée ne se prolonge pas dans le passé).
    const actuelle = etablissement.licenseValidUntil ?? null;
    const depart = actuelle && actuelle > Date.now() ? new Date(actuelle) : new Date();
    depart.setFullYear(depart.getFullYear() + 1);

    setNouvelleEcheance(versValeurDate(depart.getTime()));
    setNouveauCode(etablissement.licenseCode ?? '');
    setNouveauMaxTeachers(String(etablissement.maxTeachers ?? 0));
    setNouveauMaxLearners(String(etablissement.maxLearners ?? 0));
    setRenouvellement(etablissement);
  };

  const renouveler = async () => {
    if (!renouvellement) return;
    if (!nouvelleEcheance) {
      toast.error('Une nouvelle date de validité est requise.');
      return;
    }
    setEnRenouvellement(true);
    try {
      const reponse = await fetch('/api/establishments', {
        method: 'PATCH',
        headers: await enTetesAuth(),
        body: JSON.stringify({
          id: renouvellement.id,
          licenseValidUntil: versTimestamp(nouvelleEcheance),
          licenseCode: nouveauCode.trim(),
          maxTeachers: Number(nouveauMaxTeachers) || 0,
          maxLearners: Number(nouveauMaxLearners) || 0,
        }),
      });
      const donnees = await reponse.json();
      if (!reponse.ok) throw new Error(donnees.error || 'Renouvellement impossible');
      toast.success('Licence renouvelée');
      setRenouvellement(null);
      charger();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur', { duration: 6000 });
    } finally {
      setEnRenouvellement(false);
    }
  };

  // ===== Activation / désactivation =====

  const basculerActivation = async () => {
    if (!bascule) return;
    const cible = bascule.isActive === false;
    setEnBascule(true);
    try {
      const reponse = await fetch('/api/establishments', {
        method: 'PATCH',
        headers: await enTetesAuth(),
        body: JSON.stringify({ id: bascule.id, isActive: cible }),
      });
      const donnees = await reponse.json();
      if (!reponse.ok) throw new Error(donnees.error || 'Modification impossible');
      toast.success(cible ? 'Établissement réactivé' : 'Établissement désactivé');
      setBascule(null);
      charger();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur', { duration: 6000 });
    } finally {
      setEnBascule(false);
    }
  };

  if (authLoading || (isSuperAdmin && loading)) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }
  if (!isSuperAdmin) return null;

  return (
    <div>
      {/* En-tête */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Établissements
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 680 }}>
            Les écoles et universités clientes du Mode Classe. La création ouvre l’établissement
            <strong> et</strong> son compte de direction en une fois — plus aucun script à lancer.
          </p>
        </div>
        <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
          <span className="badge badge-info">
            {etablissements.length} établissement{etablissements.length > 1 ? 's' : ''}
          </span>
          <button className="btn-primary flex items-center gap-2" onClick={ouvrirCreation}>
            <Plus size={16} /> Nouvel établissement
          </button>
        </div>
      </div>

      {/* Rappel du choix produit : aucun e-mail n'est envoyé (idem lot 3). */}
      <div
        className="glass-card p-4 mb-4 flex items-start gap-3"
        style={{ borderLeft: '3px solid var(--color-info)' }}
      >
        <Mail size={16} style={{ color: 'var(--color-info)', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          <strong>Aucun e-mail n’est envoyé.</strong> Les identifiants du compte de direction
          s’affichent une seule fois après la création : copiez-les et transmettez-les vous-même au
          client. Le mot de passe est temporaire, il devra être changé à la première connexion.
        </p>
      </div>

      {/* Recherche */}
      {etablissements.length > 0 && (
        <div className="mb-4" style={{ position: 'relative', maxWidth: 380 }}>
          <Search
            size={15}
            style={{
              position: 'absolute',
              left: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            className="input-field"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher un établissement…"
            style={{ paddingLeft: 34 }}
          />
        </div>
      )}

      {/* Liste */}
      {etablissements.length === 0 ? (
        <EmptyState
          icon={<School size={48} />}
          title="Aucun établissement"
          description="Créez le premier établissement client : son compte de direction sera ouvert dans la foulée."
          action={
            <button className="btn-primary flex items-center gap-2" onClick={ouvrirCreation}>
              <Plus size={16} /> Nouvel établissement
            </button>
          }
        />
      ) : listeFiltree.length === 0 ? (
        <EmptyState
          icon={<Search size={48} />}
          title="Aucun résultat"
          description={`Aucun établissement ne correspond à « ${recherche.trim()} ».`}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {listeFiltree.map((etablissement) => (
            <CarteEtablissement
              key={etablissement.id}
              etablissement={etablissement}
              nbClasses={classesParEtablissement[etablissement.id] ?? 0}
              nbEnseignants={comptesParEtablissement[etablissement.id] ?? 0}
              nbEleves={elevesParEtablissement[etablissement.id] ?? 0}
              onOuvrir={() => router.push(`/etablissement?id=${encodeURIComponent(etablissement.id)}`)}
              onRenouveler={() => ouvrirRenouvellement(etablissement)}
              onBasculer={() => setBascule(etablissement)}
            />
          ))}
        </div>
      )}

      {/* ===== Création ===== */}
      <Modal
        open={creation}
        onClose={() => setCreation(false)}
        title="Nouvel établissement"
        maxWidth="640px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* — Établissement — */}
          <Section titre="Établissement" icone={<Building2 size={15} />}>
            <Champ label="Nom de l’établissement">
              <input
                className="input-field"
                value={formulaire.name}
                onChange={(e) => majFormulaire({ name: e.target.value })}
                placeholder="Institut Supérieur de Management"
              />
            </Champ>

            <Champ
              label="Identifiant"
              aide="Sert d’adresse au document et dans les URL. Proposé depuis le nom, modifiable une seule fois — il ne pourra plus changer après la création."
            >
              <input
                className="input-field"
                value={formulaire.id}
                onChange={(e) => {
                  setIdentifiantManuel(true);
                  setFormulaire((p) => ({ ...p, id: versIdentifiant(e.target.value) }));
                }}
                placeholder="institut-superieur-de-management"
                style={{
                  fontFamily: 'ui-monospace, monospace',
                  borderColor: identifiantPris ? 'var(--color-error)' : undefined,
                }}
              />
              {identifiantPris && (
                <p style={{ fontSize: 12, color: 'var(--color-error)', marginTop: 6 }}>
                  Cet identifiant est déjà pris par un autre établissement.
                </p>
              )}
            </Champ>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Champ label="Niveau">
                <select
                  className="input-field"
                  value={formulaire.level}
                  onChange={(e) => majFormulaire({ level: e.target.value as SchoolLevel })}
                >
                  {SCHOOL_LEVELS.map((niveau) => (
                    <option key={niveau} value={niveau}>
                      {SCHOOL_LEVEL_LABELS[niveau]}
                    </option>
                  ))}
                </select>
              </Champ>
              <Champ label="Ville">
                <input
                  className="input-field"
                  value={formulaire.city}
                  onChange={(e) => majFormulaire({ city: e.target.value })}
                  placeholder="Dakar"
                />
              </Champ>
              <Champ label="Pays">
                <input
                  className="input-field"
                  value={formulaire.country}
                  onChange={(e) => majFormulaire({ country: e.target.value })}
                  placeholder="Sénégal"
                />
              </Champ>
            </div>
          </Section>

          {/* — Licence — */}
          <Section titre="Licence" icone={<CalendarClock size={15} />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Champ label="Code de licence">
                <input
                  className="input-field"
                  value={formulaire.licenseCode}
                  onChange={(e) => {
                    setCodeManuel(true);
                    setFormulaire((p) => ({ ...p, licenseCode: e.target.value.toUpperCase() }));
                  }}
                  placeholder="EST-ISM-2026"
                  style={{ fontFamily: 'ui-monospace, monospace' }}
                />
              </Champ>
              <Champ label="Valide jusqu’au">
                <input
                  className="input-field"
                  type="date"
                  value={formulaire.licenseValidUntil}
                  onChange={(e) => majFormulaire({ licenseValidUntil: e.target.value })}
                />
              </Champ>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Champ label="Quota d’enseignants" aide="0 = illimité">
                <input
                  className="input-field"
                  type="number"
                  min={0}
                  value={formulaire.maxTeachers}
                  onChange={(e) => majFormulaire({ maxTeachers: e.target.value })}
                />
              </Champ>
              <Champ label="Quota d’élèves" aide="0 = illimité">
                <input
                  className="input-field"
                  type="number"
                  min={0}
                  value={formulaire.maxLearners}
                  onChange={(e) => majFormulaire({ maxLearners: e.target.value })}
                />
              </Champ>
            </div>
          </Section>

          {/* — Compte de direction — */}
          <Section titre="Compte de direction" icone={<KeyRound size={15} />}>
            <Champ label="Nom du responsable">
              <input
                className="input-field"
                value={formulaire.adminDisplayName}
                onChange={(e) => majFormulaire({ adminDisplayName: e.target.value })}
                placeholder="Awa Diop"
              />
            </Champ>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Champ label="E-mail">
                <input
                  className="input-field"
                  type="email"
                  value={formulaire.adminEmail}
                  onChange={(e) => majFormulaire({ adminEmail: e.target.value })}
                  placeholder="direction@ism.sn"
                />
              </Champ>
              <Champ label="Mot de passe temporaire" aide="8 caractères minimum">
                <input
                  className="input-field"
                  type="text"
                  value={formulaire.adminPassword}
                  onChange={(e) => majFormulaire({ adminPassword: e.target.value })}
                  placeholder="Mot de passe à transmettre"
                />
              </Champ>
            </div>
          </Section>

          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            L’établissement et son compte de direction sont créés ensemble. Les identifiants
            s’afficheront à l’écran — <strong>aucun e-mail ne sera envoyé</strong>. Le responsable
            pourra ensuite créer ses classes et ses comptes enseignants lui-même.
          </p>

          <button className="btn-primary" onClick={creer} disabled={enCreation || identifiantPris}>
            {enCreation ? 'Création…' : 'Créer l’établissement et son compte de direction'}
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
                <strong>{identifiants.etablissement}</strong> est créé, avec le compte de direction de{' '}
                <strong>{identifiants.displayName}</strong>. Ces identifiants ne seront{' '}
                <strong>plus jamais affichés</strong> : copiez-les maintenant et transmettez-les
                vous-même — aucun e-mail n’est envoyé.
              </p>
            </div>

            <LigneIdentifiant label="E-mail" valeur={identifiants.email} />
            <LigneIdentifiant label="Mot de passe temporaire" valeur={identifiants.password} />

            <BoutonCopier
              texte={`Accès Startup Ludo — ${identifiants.etablissement}\nResponsable : ${identifiants.displayName}\nE-mail : ${identifiants.email}\nMot de passe temporaire : ${identifiants.password}\n\nÀ changer à la première connexion.`}
              libelle="Copier les identifiants"
            />
            <button className="btn-secondary" onClick={() => setIdentifiants(null)}>
              J’ai noté les identifiants
            </button>
          </div>
        )}
      </Modal>

      {/* ===== Renouvellement de licence ===== */}
      <Modal
        open={!!renouvellement}
        onClose={() => setRenouvellement(null)}
        title={`Renouveler la licence — ${renouvellement?.name ?? ''}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Champ label="Nouvelle date de validité">
              <input
                className="input-field"
                type="date"
                value={nouvelleEcheance}
                onChange={(e) => setNouvelleEcheance(e.target.value)}
              />
            </Champ>
            <Champ label="Code de licence">
              <input
                className="input-field"
                value={nouveauCode}
                onChange={(e) => setNouveauCode(e.target.value.toUpperCase())}
                placeholder="EST-ISM-2027"
                style={{ fontFamily: 'ui-monospace, monospace' }}
              />
            </Champ>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Champ label="Quota d’enseignants" aide="0 = illimité">
              <input
                className="input-field"
                type="number"
                min={0}
                value={nouveauMaxTeachers}
                onChange={(e) => setNouveauMaxTeachers(e.target.value)}
              />
            </Champ>
            <Champ label="Quota d’élèves" aide="0 = illimité">
              <input
                className="input-field"
                type="number"
                min={0}
                value={nouveauMaxLearners}
                onChange={(e) => setNouveauMaxLearners(e.target.value)}
              />
            </Champ>
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            La nouvelle échéance est proposée un an après l’actuelle (ou un an à partir
            d’aujourd’hui si la licence a déjà expiré). Baisser un quota en dessous de ce qui est
            déjà consommé ne supprime rien : les comptes et les élèves existants restent, mais
            aucun nouveau ne pourra être ajouté tant que le seuil n’est pas repassé.
          </p>
          <button className="btn-primary" onClick={renouveler} disabled={enRenouvellement}>
            {enRenouvellement ? 'Enregistrement…' : 'Renouveler la licence'}
          </button>
        </div>
      </Modal>

      {/* ===== Désactivation / réactivation ===== */}
      <ConfirmDialog
        open={!!bascule}
        onClose={() => setBascule(null)}
        onConfirm={basculerActivation}
        title={bascule?.isActive === false ? 'Réactiver l’établissement' : 'Désactiver l’établissement'}
        message={
          bascule?.isActive === false
            ? `Réactiver « ${bascule?.name} » ? Ses enseignants pourront de nouveau lancer des séances, et son directeur créer des comptes.`
            : `Désactiver « ${bascule?.name} » ? Plus aucune séance ne pourra être lancée et aucun compte créé. Rien n’est supprimé : classes, élèves et séances sont conservés, et la réactivation est immédiate.`
        }
        confirmLabel={bascule?.isActive === false ? 'Réactiver' : 'Désactiver'}
        danger={bascule?.isActive !== false}
        loading={enBascule}
      />
    </div>
  );
}

/**
 * Carte d'un établissement dans la liste : identité, licence, quotas et actions.
 * Le clic sur le corps de la carte ouvre la fiche (`/etablissement?id=…`, lot 2) ;
 * les boutons d'action arrêtent la propagation pour ne pas naviguer au passage.
 */
function CarteEtablissement({
  etablissement,
  nbClasses,
  nbEnseignants,
  nbEleves,
  onOuvrir,
  onRenouveler,
  onBasculer,
}: {
  etablissement: Establishment;
  nbClasses: number;
  nbEnseignants: number;
  nbEleves: number;
  onOuvrir: () => void;
  onRenouveler: () => void;
  onBasculer: () => void;
}) {
  const licence = etatLicence(etablissement);
  const actif = etablissement.isActive !== false;

  return (
    <div
      className="glass-card p-5"
      role="button"
      tabIndex={0}
      onClick={onOuvrir}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOuvrir();
        }
      }}
      style={{
        cursor: 'pointer',
        // Un établissement désactivé se voit d'un coup d'œil dans la liste :
        // liseré rouge et carte estompée, sans pour autant devenir illisible.
        borderLeft: actif ? undefined : '3px solid var(--color-error)',
        opacity: actif ? 1 : 0.72,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'rgba(255,188,64,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <School size={18} color="#FFBC40" />
          </div>
          <div style={{ minWidth: 0 }}>
            <h3
              className="truncate"
              style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}
            >
              {etablissement.name || etablissement.id}
            </h3>
            <p
              className="flex items-center gap-1.5 truncate"
              style={{ fontSize: 12, color: 'var(--color-text-muted)' }}
            >
              <MapPin size={11} style={{ flexShrink: 0 }} />
              {[etablissement.city, etablissement.country].filter(Boolean).join(', ') || '—'}
              <span style={{ opacity: 0.5 }}>·</span>
              {SCHOOL_LEVEL_LABELS[etablissement.level] ?? etablissement.level}
            </p>
          </div>
        </div>
        <span className={actif ? 'badge badge-success' : 'badge badge-error'} style={{ flexShrink: 0 }}>
          {actif ? 'Actif' : 'Désactivé'}
        </span>
      </div>

      {/* Licence */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span
          className={
            licence.ton === 'error'
              ? 'badge badge-error'
              : licence.ton === 'primary'
                ? 'badge badge-primary'
                : licence.ton === 'success'
                  ? 'badge badge-success'
                  : 'badge'
          }
        >
          {licence.ton === 'error' || licence.ton === 'primary' ? (
            <AlertTriangle size={11} style={{ marginRight: 4, display: 'inline' }} />
          ) : null}
          {licence.libelle}
        </span>
        {etablissement.licenseCode && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--color-text-muted)',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {etablissement.licenseCode}
          </span>
        )}
      </div>

      {/* Quotas et volumétrie */}
      <div className="flex items-center gap-4 flex-wrap mb-4" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
        <span className="flex items-center gap-1.5">
          <Users size={13} color="#FFB347" />
          {libelleQuota(nbEnseignants, etablissement.maxTeachers, 'enseignant')}
        </span>
        <span className="flex items-center gap-1.5">
          <School size={13} color="#4A90E2" />
          {nbClasses} classe{nbClasses > 1 ? 's' : ''}
        </span>
        <span className="flex items-center gap-1.5">
          <Building2 size={13} color="#50C878" />
          {libelleQuota(nbEleves, etablissement.maxLearners, 'élève')}
        </span>
      </div>

      {/* Actions — jamais de suppression (cf. en-tête du fichier). */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRenouveler();
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{
            background: 'rgba(59,130,246,0.08)',
            color: 'var(--color-info)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          <RefreshCw size={13} /> Renouveler la licence
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onBasculer();
          }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{
            background: actif ? 'rgba(229,72,77,0.08)' : 'rgba(46,158,91,0.10)',
            color: actif ? 'var(--color-error)' : 'var(--color-success)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 12,
          }}
        >
          <Power size={13} /> {actif ? 'Désactiver' : 'Réactiver'}
        </button>
      </div>
    </div>
  );
}

/** Groupe de champs du formulaire de création, avec son titre. */
function Section({
  titre,
  icone,
  children,
}: {
  titre: string;
  icone: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        className="flex items-center gap-2"
        style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1,
          color: 'var(--color-text-muted)',
          paddingBottom: 6,
          borderBottom: '1px solid var(--color-card-border)',
        }}
      >
        <span style={{ color: 'var(--color-primary)', display: 'flex' }}>{icone}</span>
        {titre}
      </div>
      {children}
    </div>
  );
}

/** Libellé + champ (+ aide facultative), sur le modèle des écrans Mode Classe. */
function Champ({
  label,
  aide,
  children,
}: {
  label: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {aide && (
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 5, lineHeight: 1.45 }}>
          {aide}
        </p>
      )}
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
 * les identifiants ne sont plus réaffichables, on repartirait sans eux.
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
