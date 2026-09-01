'use client';

/**
 * Mode Classe — grille des classes.
 *
 * PÉRIMÈTRE, et pourquoi il diffère selon le rôle :
 *   - `establishment_admin` : toutes les classes de SON établissement, lues par
 *     requête filtrée sur `establishmentId` — exactement la forme qu'autorise la
 *     règle Firestore ;
 *   - `teacher` : UNIQUEMENT ses classes (`scopedClassIds`, image du claim
 *     `classIds`), lues document par document. Un enseignant n'a pas le droit de
 *     lister la collection `classes`, et ce n'est pas une restriction d'interface :
 *     sa règle s'exprime sur l'id du document, qu'une requête de collection ne
 *     peut pas satisfaire ;
 *   - super admin : toutes les classes d'un établissement choisi (`?etab=...`),
 *     pour le support.
 *
 * La création est réservée au directeur : un enseignant reçoit ses classes, il
 * ne s'en attribue pas.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { GraduationCap, Plus, School, UserRound } from 'lucide-react';
import { auth, firestore, COLLECTIONS } from '@/lib/firebase';
import { getClasses, getClassesByIds, getEstablishments, saveClass } from '@/lib/school-service';
import { getSessionsByEstablishment, getSessionsByTeacher } from '@/lib/class-session-service';
import { generateId } from '@/lib/utils';
import {
  SCHOOL_LEVELS,
  SCHOOL_LEVEL_LABELS,
  type ClassSession,
  type Establishment,
  type SchoolClass,
  type SchoolLevel,
} from '@/types';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';

/** Valeur du filtre de niveau : un niveau précis, ou tous. */
type FiltreNiveau = SchoolLevel | 'tous';

/** Initiales du badge de la classe (« Master 1 » → « M1 ») — même règle que la fiche. */
function initialesClasse(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return 'CL';
  const initiales = mots.slice(0, 2).map((m) => m[0]).join('').toUpperCase();
  return initiales.length >= 2 ? initiales : nom.trim().slice(0, 2).toUpperCase();
}

export default function ClassesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    admin,
    isSuperAdmin,
    isEstablishmentAdmin,
    isTeacher,
    scopedEstablishmentId,
    scopedClassIds,
    loading: authLoading,
  } = useAuth();

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [etablissements, setEtablissements] = useState<Establishment[]>([]);
  const [seances, setSeances] = useState<ClassSession[]>([]);
  const [nomsProfs, setNomsProfs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<FiltreNiveau>('tous');
  const [creation, setCreation] = useState(false);
  /** Enseignants de l'établissement, pour « Enseignant responsable » à la création. */
  const [enseignants, setEnseignants] = useState<
    Array<{ uid: string; displayName: string; teachingClassIds: string[] }>
  >([]);

  // Établissement consulté — même convention que /etablissement : claim pour un
  // rôle scolaire, paramètre d'URL pour le super admin.
  const idUrl = searchParams.get('etab');
  const establishmentId = isSuperAdmin
    ? idUrl ?? etablissements[0]?.id ?? null
    : scopedEstablishmentId;

  // Seul le directeur crée des classes.
  const peutCreer = isEstablishmentAdmin && !!establishmentId;

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      // Un enseignant lit SES classes, une par une. Les autres rôles lisent la
      // collection filtrée sur l'établissement.
      const data = isTeacher
        ? await getClassesByIds(scopedClassIds)
        : establishmentId
          ? await getClasses(establishmentId)
          : [];
      setClasses(data.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)));

      // Enrichissement des cartes (maquette) : sessions jouées par classe et
      // noms des enseignants. Décoratif — silencieux en cas d'échec.
      void (isTeacher && admin
        ? getSessionsByTeacher(admin.uid)
        : establishmentId
          ? getSessionsByEstablishment(establishmentId)
          : Promise.resolve([] as ClassSession[])
      )
        .then(setSeances)
        .catch(() => setSeances([]));

      const uids = [...new Set(data.flatMap((c) => c.teacherIds ?? []))].slice(0, 12);
      void Promise.all(
        uids.map(async (uid) => {
          const snap = await getDoc(doc(firestore, COLLECTIONS.users, uid)).catch(() => null);
          return [uid, (snap?.data()?.displayName as string) ?? ''] as const;
        })
      ).then((paires) => setNomsProfs(Object.fromEntries(paires)));
    } catch (error) {
      console.error('Chargement des classes :', error);
      toast.error('Erreur lors du chargement des classes');
    } finally {
      setLoading(false);
    }
  }, [isTeacher, scopedClassIds, establishmentId, admin]);

  // Liste des établissements : super admin uniquement (sélecteur de support).
  useEffect(() => {
    if (authLoading || !isSuperAdmin) return;
    let annule = false;
    (async () => {
      try {
        const data = await getEstablishments();
        if (annule) return;
        setEtablissements(data.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)));
      } catch (error) {
        console.error('Chargement des établissements :', error);
      }
    })();
    return () => {
      annule = true;
    };
  }, [authLoading, isSuperAdmin]);

  useEffect(() => {
    if (!authLoading) charger();
  }, [authLoading, charger]);

  // Enseignants de l'établissement (direction uniquement) : alimente le champ
  // « Enseignant responsable » de la modale de création. Facultatif — silencieux.
  useEffect(() => {
    if (authLoading || !peutCreer) return;
    let annule = false;
    (async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/admins', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          admins?: Array<{
            uid: string; role: string; displayName?: string; email?: string;
            establishmentId?: string | null; teachingClassIds?: string[] | null;
          }>;
        };
        if (annule) return;
        setEnseignants(
          (data.admins ?? [])
            .filter((a) => a.role === 'teacher' && (!establishmentId || a.establishmentId === establishmentId))
            .map((a) => ({
              uid: a.uid,
              displayName: a.displayName || a.email || a.uid,
              teachingClassIds: a.teachingClassIds ?? [],
            }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'))
        );
      } catch {
        // Le champ restera « À affecter plus tard » — jamais bloquant.
      }
    })();
    return () => {
      annule = true;
    };
  }, [authLoading, peutCreer, establishmentId]);

  const affichees = useMemo(
    () => (filtre === 'tous' ? classes : classes.filter((c) => c.level === filtre)),
    [classes, filtre]
  );

  /** Sessions jouées et dernière séance, par classe (depuis les séances chargées). */
  const infosSeances = useMemo(() => {
    const parClasse = new Map<string, { jouees: number; derniere: ClassSession | null }>();
    for (const s of seances) {
      if (s.status !== 'ended') continue;
      const courant = parClasse.get(s.classId) ?? { jouees: 0, derniere: null };
      courant.jouees += 1;
      const dateS = s.startedAt ?? s.endedAt ?? s.createdAt ?? 0;
      const dateD = courant.derniere
        ? courant.derniere.startedAt ?? courant.derniere.endedAt ?? courant.derniere.createdAt ?? 0
        : -1;
      if (dateS > dateD) courant.derniere = s;
      parClasse.set(s.classId, courant);
    }
    return parClasse;
  }, [seances]);

  const totalEleves = useMemo(
    () => classes.reduce((somme, c) => somme + (c.learnerCount ?? 0), 0),
    [classes]
  );

  /** Crée la classe puis ouvre directement son détail — la suite du geste est d'y saisir les élèves. */
  const creerClasse = async (nom: string, niveau: SchoolLevel, enseignantUid: string | null) => {
    if (!establishmentId) return;
    const classId = `class_${generateId()}`;
    try {
      await saveClass(classId, {
        establishmentId,
        name: nom,
        level: niveau,
        teacherIds: [],
        learnerCount: 0,
        createdAt: Date.now(),
      });

      // Affectation de l'enseignant responsable — PAR L'API, qui synchronise
      // claim `classIds`, `users.teachingClassIds` ET `classes.teacherIds`.
      // Un échec ici ne perd rien : la classe existe, l'affectation se refait
      // depuis l'écran Enseignants.
      if (enseignantUid) {
        const ens = enseignants.find((e) => e.uid === enseignantUid);
        try {
          const token = await auth.currentUser?.getIdToken();
          const res = await fetch('/api/admins', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              uid: enseignantUid,
              role: 'teacher',
              teachingClassIds: [...new Set([...(ens?.teachingClassIds ?? []), classId])],
            }),
          });
          if (!res.ok) throw new Error();
          toast.success(`Classe créée — affectée à ${ens?.displayName ?? 'l’enseignant'}.`);
        } catch {
          toast.error(
            'Classe créée, mais l’affectation de l’enseignant a échoué — refaites-la depuis l’écran Enseignants.',
            { duration: 7000 }
          );
        }
      } else {
        toast.success('Classe créée');
      }

      setCreation(false);
      router.push(`/classes/${classId}`);
    } catch (error) {
      console.error('Création de la classe :', error);
      toast.error('Erreur lors de la création de la classe');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      {/* En-tête — maquette : titre + « Vos N classes · M apprenants », onglets à droite */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text-primary)' }}>
            {isTeacher ? 'Mes classes' : 'Classes'}
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
            {isTeacher ? 'Vos ' : ''}
            {classes.length} classe{classes.length > 1 ? 's' : ''} · {totalEleves} apprenant
            {totalEleves > 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap" style={{ flexShrink: 0 }}>
          {classes.length > 0 && (
            <div
              className="flex items-center gap-1"
              style={{ background: 'rgba(15,28,46,0.05)', borderRadius: 10, padding: 3 }}
            >
              <Onglet actif={filtre === 'tous'} onClick={() => setFiltre('tous')}>
                Toutes
              </Onglet>
              {SCHOOL_LEVELS.map((niveau) => (
                <Onglet key={niveau} actif={filtre === niveau} onClick={() => setFiltre(niveau)}>
                  {SCHOOL_LEVEL_LABELS[niveau]}
                </Onglet>
              ))}
            </div>
          )}
          {peutCreer && (
            <button className="btn-primary flex items-center gap-2" onClick={() => setCreation(true)}>
              <Plus size={16} /> Créer une classe
            </button>
          )}
        </div>
      </div>

      {/* Sélecteur super admin */}
      {isSuperAdmin && etablissements.length > 0 && (
        <div className="glass-card p-4 mb-4 flex items-center gap-3 flex-wrap">
          <School size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Vue super admin — établissement consulté :
          </span>
          <select
            className="input-field"
            style={{ width: 'auto', minWidth: 220 }}
            value={establishmentId ?? ''}
            onChange={(e) => router.replace(`/classes?etab=${encodeURIComponent(e.target.value)}`)}
          >
            {etablissements.map((etab) => (
              <option key={etab.id} value={etab.id}>
                {etab.name || etab.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {classes.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={48} />}
          title={isTeacher ? 'Aucune classe affectée' : 'Aucune classe'}
          description={
            isTeacher
              ? 'Aucune classe ne vous est encore affectée. Demandez à la direction de votre établissement de vous en attribuer.'
              : 'Créez votre première classe, puis saisissez ses élèves à la main ou par import CSV.'
          }
          action={
            peutCreer ? (
              <button className="btn-primary flex items-center gap-2" onClick={() => setCreation(true)}>
                <Plus size={16} /> Créer une classe
              </button>
            ) : undefined
          }
        />
      ) : affichees.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={48} />}
          title="Aucune classe à ce niveau"
          description="Changez de filtre pour voir les autres classes."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {affichees.map((classe) => (
            <CarteClasse
              key={classe.id}
              classe={classe}
              infos={infosSeances.get(classe.id) ?? null}
              nomProf={nomsProfs[(classe.teacherIds ?? [])[0] ?? ''] ?? ''}
            />
          ))}
        </div>
      )}

      {creation && establishmentId && (
        <ModaleCreation
          enseignants={enseignants}
          onClose={() => setCreation(false)}
          onCreate={creerClasse}
        />
      )}
    </div>
  );
}

/** Onglet du filtre de niveau (segmenté, maquette). */
function Onglet({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12.5,
        fontWeight: actif ? 700 : 500,
        padding: '7px 14px',
        borderRadius: 8,
        cursor: 'pointer',
        border: 'none',
        background: actif ? '#FFFFFF' : 'transparent',
        color: actif ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
        boxShadow: actif ? '0 1px 3px rgba(15,28,46,0.12)' : 'none',
        transition: 'background 0.15s',
      }}
    >
      {children}
    </button>
  );
}

/**
 * Carte d'une classe (maquette) : badge initiales, pilule niveau, effectif et
 * sessions jouées, puis l'enseignant et la dernière séance — tout est mesuré,
 * rien n'est décoratif.
 */
function CarteClasse({
  classe,
  infos,
  nomProf,
}: {
  classe: SchoolClass;
  infos: { jouees: number; derniere: ClassSession | null } | null;
  nomProf: string;
}) {
  const effectif = classe.learnerCount ?? 0;
  const jouees = infos?.jouees ?? 0;
  const derniere = infos?.derniere ?? null;
  const dateDerniere = derniere
    ? derniere.startedAt ?? derniere.endedAt ?? derniere.createdAt ?? 0
    : 0;

  return (
    <Link href={`/classes/${classe.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        className="glass-card p-5 flex flex-col gap-4"
        style={{ height: '100%', transition: 'box-shadow 0.2s' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div
            className="flex items-center justify-center"
            style={{
              width: 44, height: 44, borderRadius: 12, flexShrink: 0,
              background: '#0F1C2E', color: '#F5A623',
              fontSize: 15, fontWeight: 900, letterSpacing: 0.5,
            }}
          >
            {initialesClasse(classe.name || classe.id)}
          </div>
          <span
            style={{
              fontSize: 11.5, fontWeight: 700, padding: '4px 11px', borderRadius: 9,
              background: 'rgba(79,107,255,0.1)', color: '#4F6BFF', flexShrink: 0,
            }}
          >
            {SCHOOL_LEVEL_LABELS[classe.level] ?? classe.level}
          </span>
        </div>

        <div>
          <h3
            style={{
              fontSize: 15.5,
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {classe.name || classe.id}
          </h3>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 5 }}>
            {effectif} apprenant{effectif > 1 ? 's' : ''}
            <span style={{ margin: '0 8px' }}>·</span>
            {jouees} session{jouees > 1 ? 's' : ''}
          </p>
        </div>

        <div style={{ borderTop: '1px solid var(--color-card-border)', paddingTop: 12, marginTop: 'auto' }}>
          <span
            className="flex items-center gap-1.5"
            style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}
          >
            <UserRound size={13} style={{ color: 'var(--color-text-muted)' }} />
            {nomProf || 'Aucun enseignant affecté'}
          </span>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
            {derniere
              ? `${derniere.title || 'Séance'} · ${new Date(dateDerniere).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`
              : 'Aucune séance jouée pour l’instant'}
          </p>
        </div>
      </div>
    </Link>
  );
}

/**
 * Modale de création d'une classe (maquette) : nom, niveau en boutons
 * segmentés, enseignant responsable (affecté via l'API à la création).
 *
 * PAS DE CHAMP « nombre d'apprenants » malgré la maquette : l'effectif est un
 * chiffre MESURÉ (recalculé à chaque mouvement d'élève) — un nombre saisi ici
 * serait une intention affichée comme un fait. Les apprenants se saisissent
 * juste après, à la main ou par import CSV.
 */
function ModaleCreation({
  enseignants,
  onClose,
  onCreate,
}: {
  enseignants: Array<{ uid: string; displayName: string; teachingClassIds: string[] }>;
  onClose: () => void;
  onCreate: (nom: string, niveau: SchoolLevel, enseignantUid: string | null) => Promise<void>;
}) {
  const [nom, setNom] = useState('');
  const [niveau, setNiveau] = useState<SchoolLevel>('lycee');
  const [enseignantUid, setEnseignantUid] = useState('');
  const [enCours, setEnCours] = useState(false);

  const valider = async () => {
    const propre = nom.trim();
    if (!propre) {
      toast.error('Le nom de la classe est obligatoire');
      return;
    }
    setEnCours(true);
    try {
      await onCreate(propre, niveau, enseignantUid || null);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Créer une classe" maxWidth="520px">
      <div className="flex flex-col gap-4">
        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', lineHeight: 1.55, marginTop: -6 }}>
          Collège, lycée, université ou formation professionnelle — le niveau adapte les séances
          proposées.
        </p>

        <div>
          <label className="label">Nom de la classe</label>
          <input
            className="input-field"
            value={nom}
            autoFocus
            placeholder="ex. Licence 3 — Marketing"
            onChange={(e) => setNom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') valider();
            }}
          />
        </div>

        <div>
          <label className="label">Niveau</label>
          <div className="flex items-center gap-2 flex-wrap">
            {SCHOOL_LEVELS.map((n) => {
              const actif = niveau === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNiveau(n)}
                  style={{
                    fontSize: 13, fontWeight: actif ? 700 : 500, padding: '9px 16px', borderRadius: 10,
                    cursor: 'pointer',
                    border: `1.5px solid ${actif ? 'var(--color-primary)' : 'var(--color-card-border)'}`,
                    background: actif ? 'rgba(255,188,64,0.12)' : '#FFFFFF',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {SCHOOL_LEVEL_LABELS[n]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="label">Enseignant responsable</label>
          <select
            className="input-field"
            value={enseignantUid}
            onChange={(e) => setEnseignantUid(e.target.value)}
          >
            <option value="">À affecter plus tard</option>
            {enseignants.map((e) => (
              <option key={e.uid} value={e.uid}>
                {e.displayName}
              </option>
            ))}
          </select>
          {enseignants.length === 0 && (
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 6 }}>
              Aucun enseignant pour l’instant — invitez-les depuis l’écran « Enseignants », puis
              affectez-leur la classe.
            </p>
          )}
        </div>

        <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          Vous saisirez les apprenants juste après, à la main ou par import CSV — l’effectif
          affiché sera toujours le nombre réel d’élèves inscrits.
        </p>

        <div className="flex items-center justify-end gap-3">
          <button className="btn-secondary" onClick={onClose} disabled={enCours}>
            Annuler
          </button>
          <button className="btn-primary" onClick={valider} disabled={enCours}>
            {enCours ? 'Création…' : 'Créer la classe'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
