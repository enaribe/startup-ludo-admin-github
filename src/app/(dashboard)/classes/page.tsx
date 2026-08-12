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
import { ChevronRight, GraduationCap, Plus, School, UserRound, Users } from 'lucide-react';
import { getClasses, getClassesByIds, getEstablishments, saveClass } from '@/lib/school-service';
import { generateId } from '@/lib/utils';
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
import Modal from '@/components/ui/Modal';
import toast from 'react-hot-toast';

/** Valeur du filtre de niveau : un niveau précis, ou tous. */
type FiltreNiveau = SchoolLevel | 'tous';

export default function ClassesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    isSuperAdmin,
    isEstablishmentAdmin,
    isTeacher,
    scopedEstablishmentId,
    scopedClassIds,
    loading: authLoading,
  } = useAuth();

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [etablissements, setEtablissements] = useState<Establishment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<FiltreNiveau>('tous');
  const [creation, setCreation] = useState(false);

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
    } catch (error) {
      console.error('Chargement des classes :', error);
      toast.error('Erreur lors du chargement des classes');
    } finally {
      setLoading(false);
    }
  }, [isTeacher, scopedClassIds, establishmentId]);

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

  const affichees = useMemo(
    () => (filtre === 'tous' ? classes : classes.filter((c) => c.level === filtre)),
    [classes, filtre]
  );

  const totalEleves = useMemo(
    () => classes.reduce((somme, c) => somme + (c.learnerCount ?? 0), 0),
    [classes]
  );

  /** Crée la classe puis ouvre directement son détail — la suite du geste est d'y saisir les élèves. */
  const creerClasse = async (nom: string, niveau: SchoolLevel) => {
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
      toast.success('Classe créée');
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
      {/* En-tête */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {isTeacher ? 'Mes classes' : 'Classes'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 640 }}>
            {isTeacher
              ? 'Les classes qui vous sont affectées. Ouvrez une classe pour consulter sa liste d’élèves.'
              : 'Créez vos classes, puis saisissez leurs élèves — à la main ou par import CSV. Une fois par an, environ 5 minutes par classe.'}
          </p>
        </div>
        <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
          {classes.length > 0 && (
            <>
              <span className="badge badge-info">
                {classes.length} classe{classes.length > 1 ? 's' : ''}
              </span>
              <span className="badge">
                {totalEleves} élève{totalEleves > 1 ? 's' : ''}
              </span>
            </>
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

      {/* Filtre par niveau — masqué s'il n'y a rien à filtrer */}
      {classes.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <PuceFiltre actif={filtre === 'tous'} onClick={() => setFiltre('tous')}>
            Tous les niveaux ({classes.length})
          </PuceFiltre>
          {SCHOOL_LEVELS.map((niveau) => {
            const nb = classes.filter((c) => c.level === niveau).length;
            if (nb === 0) return null;
            return (
              <PuceFiltre key={niveau} actif={filtre === niveau} onClick={() => setFiltre(niveau)}>
                {SCHOOL_LEVEL_LABELS[niveau]} ({nb})
              </PuceFiltre>
            );
          })}
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {affichees.map((classe) => (
            <CarteClasse key={classe.id} classe={classe} />
          ))}
        </div>
      )}

      {creation && establishmentId && (
        <ModaleCreation onClose={() => setCreation(false)} onCreate={creerClasse} />
      )}
    </div>
  );
}

/** Puce de filtre de niveau. */
function PuceFiltre({
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
        fontSize: 12,
        fontWeight: 600,
        padding: '6px 12px',
        borderRadius: 999,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: actif ? 'var(--color-primary)' : 'var(--color-border-light)',
        background: actif ? 'rgba(255,188,64,0.14)' : 'transparent',
        color: actif ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      {children}
    </button>
  );
}

/** Carte d'une classe : nom, niveau, effectif, enseignants affectés. */
function CarteClasse({ classe }: { classe: SchoolClass }) {
  const effectif = classe.learnerCount ?? 0;
  const nbEnseignants = classe.teacherIds?.length ?? 0;

  return (
    <Link href={`/classes/${classe.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        className="glass-card p-5 flex flex-col gap-4"
        style={{ height: '100%', transition: 'box-shadow 0.2s' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {classe.name || classe.id}
            </h3>
            <span className="badge badge-info" style={{ marginTop: 6, display: 'inline-block' }}>
              {SCHOOL_LEVEL_LABELS[classe.level] ?? classe.level}
            </span>
          </div>
          <div
            className="flex items-center justify-center"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: 'rgba(255,188,64,0.14)',
              color: 'var(--color-primary-dark)',
              flexShrink: 0,
            }}
          >
            <GraduationCap size={20} />
          </div>
        </div>

        <div className="flex items-center gap-4" style={{ marginTop: 'auto' }}>
          <Compteur
            icon={<Users size={13} />}
            valeur={effectif}
            label={`élève${effectif > 1 ? 's' : ''}`}
          />
          <Compteur
            icon={<UserRound size={13} />}
            valeur={nbEnseignants}
            label={`enseignant${nbEnseignants > 1 ? 's' : ''}`}
          />
          <ChevronRight size={16} color="var(--color-text-muted)" style={{ marginLeft: 'auto' }} />
        </div>
      </div>
    </Link>
  );
}

/** Compteur « N élèves » / « N enseignants ». */
function Compteur({
  icon,
  valeur,
  label,
}: {
  icon: React.ReactNode;
  valeur: number;
  label: string;
}) {
  return (
    <span
      className="flex items-center gap-1.5"
      style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}
    >
      <span style={{ color: 'var(--color-text-muted)', display: 'flex' }}>{icon}</span>
      <strong style={{ color: 'var(--color-text-primary)' }}>{valeur}</strong>
      {label}
    </span>
  );
}

/** Modale de création d'une classe : nom + niveau, rien de plus. */
function ModaleCreation({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (nom: string, niveau: SchoolLevel) => Promise<void>;
}) {
  const [nom, setNom] = useState('');
  const [niveau, setNiveau] = useState<SchoolLevel>('lycee');
  const [enCours, setEnCours] = useState(false);

  const valider = async () => {
    const propre = nom.trim();
    if (!propre) {
      toast.error('Le nom de la classe est obligatoire');
      return;
    }
    setEnCours(true);
    try {
      await onCreate(propre, niveau);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Créer une classe" maxWidth="440px">
      <div className="flex flex-col gap-4">
        <div>
          <label className="label">Nom de la classe</label>
          <input
            className="input-field"
            value={nom}
            autoFocus
            placeholder="Terminale S2"
            onChange={(e) => setNom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') valider();
            }}
          />
        </div>
        <div>
          <label className="label">Niveau</label>
          <select
            className="input-field"
            value={niveau}
            onChange={(e) => setNiveau(e.target.value as SchoolLevel)}
          >
            {SCHOOL_LEVELS.map((n) => (
              <option key={n} value={n}>
                {SCHOOL_LEVEL_LABELS[n]}
              </option>
            ))}
          </select>
        </div>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
          Vous saisirez les élèves juste après, à la main ou par import CSV.
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
