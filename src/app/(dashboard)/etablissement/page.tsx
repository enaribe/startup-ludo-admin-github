'use client';

/**
 * Mode Classe — fiche de l'établissement.
 *
 * POURQUOI cet écran : c'est la porte d'entrée du directeur (`establishment_admin`).
 * Il y retrouve l'identité de son établissement, l'état de sa licence et ses
 * quotas — autrement dit ce qu'il a acheté et ce qu'il lui reste.
 *
 * PÉRIMÈTRE (les trois rôles qui atterrissent ici) :
 *   - `establishment_admin` : SON établissement, en écriture (autosave) ;
 *   - `teacher` : le MÊME établissement, en LECTURE SEULE — il doit pouvoir
 *     vérifier la validité de la licence avant une séance, pas la modifier ;
 *   - super admin : n'importe quel établissement, via un sélecteur.
 *
 * CHOIX DU SÉLECTEUR SUPER ADMIN : une liste déroulante alimentée par
 * `getEstablishments()`, dont la valeur est reflétée dans l'URL (`?id=...`).
 * C'est la solution la plus simple qui reste partageable : un lien vers un
 * établissement précis fonctionne, sans avoir à introduire un contexte persisté
 * façon `program-context`. Les rôles scolaires, eux, ne voient aucun sélecteur :
 * leur établissement vient du claim, l'URL est ignorée pour eux (une isolation
 * qui dépendrait d'un paramètre d'URL ne protégerait rien).
 *
 * ÉCRITURE : autosave via `useAutoSave`, comme les écrans récents. Les règles
 * Firestore restent la vraie borne : un enseignant qui forcerait un `saveEstablishment`
 * depuis la console serait refusé côté serveur, pas seulement côté interface.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Building2, CalendarClock, GraduationCap, Info, KeyRound, Lock, Users } from 'lucide-react';
import { getEstablishment, getEstablishments, saveEstablishment } from '@/lib/school-service';
import { SCHOOL_LEVELS, SCHOOL_LEVEL_LABELS, type Establishment, type SchoolLevel } from '@/types';
import { useAuth } from '@/lib/auth-context';
import { useAutoSave } from '@/hooks/useAutoSave';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import SaveStatusIndicator from '@/components/ui/SaveStatusIndicator';
import toast from 'react-hot-toast';

/** Fiche vierge — sert de base au merge du document chargé. */
const ETABLISSEMENT_VIDE: Omit<Establishment, 'id'> = {
  name: '',
  level: 'lycee',
  city: '',
  country: '',
  licenseCode: '',
  licenseValidUntil: null,
  maxTeachers: 0,
  maxLearners: 0,
  isActive: true,
};

/** Convertit un timestamp epoch en `yyyy-mm-dd` pour un `<input type="date">`. */
function versValeurDate(ms: number | null | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** Convertit la valeur d'un `<input type="date">` en timestamp epoch (fin de journée). */
function versTimestamp(valeur: string): number | null {
  if (!valeur) return null;
  const ms = new Date(`${valeur}T23:59:59`).getTime();
  return Number.isNaN(ms) ? null : ms;
}

export default function EtablissementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    isSuperAdmin,
    isTeacher,
    isEstablishmentAdmin,
    scopedEstablishmentId,
    loading: authLoading,
  } = useAuth();

  const [fiche, setFiche] = useState<Omit<Establishment, 'id'>>(ETABLISSEMENT_VIDE);
  const [liste, setListe] = useState<Establishment[]>([]);
  const [loading, setLoading] = useState(true);
  const [introuvable, setIntrouvable] = useState(false);

  // Établissement consulté : le claim pour un rôle scolaire (jamais l'URL), le
  // paramètre d'URL pour le super admin, à défaut le premier de la liste.
  const idUrl = searchParams.get('id');
  const establishmentId = isSuperAdmin ? idUrl ?? liste[0]?.id ?? null : scopedEstablishmentId;

  // Seul le directeur écrit. L'enseignant consulte, le super admin corrige.
  const lectureSeule = isTeacher;

  const persist = useCallback(
    (valeur: Omit<Establishment, 'id'>) =>
      establishmentId ? saveEstablishment(establishmentId, valeur) : Promise.resolve(),
    [establishmentId]
  );
  const { status: saveStatus } = useAutoSave({
    data: fiche,
    save: persist,
    enabled: !lectureSeule && !loading && !introuvable && !!establishmentId,
  });

  // Liste des établissements : super admin uniquement (les rôles scolaires n'ont
  // pas le droit de lister la collection, et n'en ont pas l'usage).
  useEffect(() => {
    if (authLoading || !isSuperAdmin) return;
    let annule = false;
    (async () => {
      try {
        const data = await getEstablishments();
        if (annule) return;
        setListe(data.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id)));
      } catch (error) {
        console.error('Chargement des établissements :', error);
      }
    })();
    return () => {
      annule = true;
    };
  }, [authLoading, isSuperAdmin]);

  useEffect(() => {
    if (authLoading) return;
    if (!establishmentId) {
      setLoading(false);
      return;
    }
    let annule = false;
    setLoading(true);
    setIntrouvable(false);
    (async () => {
      try {
        const data = await getEstablishment(establishmentId);
        if (annule) return;
        if (!data) {
          setIntrouvable(true);
          return;
        }
        const { id: _id, ...reste } = data;
        void _id;
        setFiche({ ...ETABLISSEMENT_VIDE, ...reste });
      } catch (error) {
        console.error('Chargement de l’établissement :', error);
        if (!annule) toast.error('Erreur de chargement de l’établissement');
      } finally {
        if (!annule) setLoading(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [authLoading, establishmentId]);

  const modifier = (patch: Partial<Omit<Establishment, 'id'>>) => {
    if (lectureSeule) return;
    setFiche((prev) => ({ ...prev, ...patch }));
  };

  // État de la licence : c'est l'information que le directeur vient chercher.
  const licence = useMemo(() => {
    const echeance = fiche.licenseValidUntil ?? null;
    if (!echeance) return { libelle: 'Aucune échéance renseignée', classe: 'badge', expiree: false };
    const restant = Math.ceil((echeance - Date.now()) / 86_400_000);
    if (restant < 0) return { libelle: 'Licence expirée', classe: 'badge badge-error', expiree: true };
    if (restant <= 30) {
      return { libelle: `Expire dans ${restant} jour${restant > 1 ? 's' : ''}`, classe: 'badge badge-primary', expiree: false };
    }
    return { libelle: 'Licence valide', classe: 'badge badge-success', expiree: false };
  }, [fiche.licenseValidUntil]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (!establishmentId) {
    return (
      <EmptyState
        icon={<Building2 size={48} />}
        title="Aucun établissement"
        description={
          isSuperAdmin
            ? 'Aucun établissement n’existe encore. Créez le document dans la collection `establishments` pour activer un client.'
            : 'Votre compte n’est rattaché à aucun établissement. Contactez l’équipe CONCREE.'
        }
      />
    );
  }

  if (introuvable) {
    return (
      <EmptyState
        icon={<Building2 size={48} />}
        title="Établissement introuvable"
        description={`Aucun établissement ne correspond à l’identifiant « ${establishmentId} ».`}
      />
    );
  }

  return (
    <div>
      {/* En-tête */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {fiche.name || 'Mon établissement'}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 640 }}>
            {lectureSeule
              ? 'Fiche de votre établissement. Seule la direction peut la modifier.'
              : 'Identité, licence et quotas de votre établissement. Les modifications sont enregistrées automatiquement.'}
          </p>
        </div>
        <div className="flex items-center gap-3" style={{ flexShrink: 0 }}>
          <span className={licence.classe}>{licence.libelle}</span>
          <span className={fiche.isActive ? 'badge badge-success' : 'badge badge-error'}>
            {fiche.isActive ? 'Actif' : 'Suspendu'}
          </span>
          {!lectureSeule && <SaveStatusIndicator status={saveStatus} />}
        </div>
      </div>

      {/* Sélecteur super admin : consulter n'importe quel établissement */}
      {isSuperAdmin && liste.length > 0 && (
        <div className="glass-card p-4 mb-4 flex items-center gap-3 flex-wrap">
          <Info size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            Vue super admin — établissement consulté :
          </span>
          <select
            className="input-field"
            style={{ width: 'auto', minWidth: 220 }}
            value={establishmentId}
            onChange={(e) => router.replace(`/etablissement?id=${encodeURIComponent(e.target.value)}`)}
          >
            {liste.map((etab) => (
              <option key={etab.id} value={etab.id}>
                {etab.name || etab.id}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Bandeau lecture seule pour l'enseignant */}
      {lectureSeule && (
        <div
          className="glass-card p-4 mb-4 flex items-start gap-3"
          style={{ borderLeft: '3px solid var(--color-info)' }}
        >
          <Lock size={16} style={{ color: 'var(--color-info)', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Vous consultez la fiche de votre établissement en lecture seule. Pour toute correction,
            adressez-vous à la direction.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Identité */}
        <section className="glass-card p-5">
          <SectionTitle icon={<Building2 size={16} />} titre="Identité" />
          <div className="flex flex-col gap-4">
            <Champ label="Nom de l’établissement">
              <input
                className="input-field"
                value={fiche.name}
                readOnly={lectureSeule}
                disabled={lectureSeule}
                placeholder="Institut Supérieur de Management"
                onChange={(e) => modifier({ name: e.target.value })}
              />
            </Champ>
            <Champ label="Niveau d’enseignement">
              <select
                className="input-field"
                value={fiche.level}
                disabled={lectureSeule}
                onChange={(e) => modifier({ level: e.target.value as SchoolLevel })}
              >
                {SCHOOL_LEVELS.map((niveau) => (
                  <option key={niveau} value={niveau}>
                    {SCHOOL_LEVEL_LABELS[niveau]}
                  </option>
                ))}
              </select>
            </Champ>
            <div className="grid grid-cols-2 gap-4">
              <Champ label="Ville">
                <input
                  className="input-field"
                  value={fiche.city}
                  readOnly={lectureSeule}
                  disabled={lectureSeule}
                  placeholder="Dakar"
                  onChange={(e) => modifier({ city: e.target.value })}
                />
              </Champ>
              <Champ label="Pays">
                <input
                  className="input-field"
                  value={fiche.country}
                  readOnly={lectureSeule}
                  disabled={lectureSeule}
                  placeholder="Sénégal"
                  onChange={(e) => modifier({ country: e.target.value })}
                />
              </Champ>
            </div>
          </div>
        </section>

        {/* Licence */}
        <section className="glass-card p-5">
          <SectionTitle icon={<KeyRound size={16} />} titre="Licence" />
          <div className="flex flex-col gap-4">
            <Champ label="Code de licence">
              <input
                className="input-field"
                value={fiche.licenseCode}
                readOnly={lectureSeule}
                disabled={lectureSeule}
                placeholder="EST-ISM-2026"
                style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: 0.5 }}
                onChange={(e) => modifier({ licenseCode: e.target.value.toUpperCase() })}
              />
            </Champ>
            <Champ label="Valide jusqu’au">
              <input
                type="date"
                className="input-field"
                value={versValeurDate(fiche.licenseValidUntil)}
                readOnly={lectureSeule}
                disabled={lectureSeule}
                onChange={(e) => modifier({ licenseValidUntil: versTimestamp(e.target.value) })}
              />
            </Champ>
            <div
              className="flex items-start gap-2 p-3"
              style={{
                background: 'var(--color-surface)',
                borderRadius: 8,
                fontSize: 12,
                color: 'var(--color-text-muted)',
                lineHeight: 1.5,
              }}
            >
              <CalendarClock size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>
                Passé cette date, le lancement de nouvelles séances sera bloqué. Les données de
                l’établissement, elles, restent conservées.
              </span>
            </div>
            {!lectureSeule && (
              <label className="flex items-center gap-2" style={{ cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={fiche.isActive}
                  onChange={(e) => modifier({ isActive: e.target.checked })}
                />
                <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  Établissement actif
                </span>
              </label>
            )}
          </div>
        </section>

        {/* Quotas */}
        <section className="glass-card p-5 lg:col-span-2">
          <SectionTitle icon={<Users size={16} />} titre="Quotas" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Champ label="Comptes enseignants">
              <input
                type="number"
                min={0}
                className="input-field"
                value={fiche.maxTeachers}
                readOnly={lectureSeule}
                disabled={lectureSeule}
                onChange={(e) => modifier({ maxTeachers: Math.max(0, Number(e.target.value) || 0) })}
              />
              <Aide>
                {fiche.maxTeachers === 0
                  ? 'Illimité — aucune limite de comptes enseignants.'
                  : `${fiche.maxTeachers} compte${fiche.maxTeachers > 1 ? 's' : ''} enseignant${fiche.maxTeachers > 1 ? 's' : ''} au maximum.`}
              </Aide>
            </Champ>
            <Champ label="Élèves">
              <input
                type="number"
                min={0}
                className="input-field"
                value={fiche.maxLearners}
                readOnly={lectureSeule}
                disabled={lectureSeule}
                onChange={(e) => modifier({ maxLearners: Math.max(0, Number(e.target.value) || 0) })}
              />
              <Aide>
                {fiche.maxLearners === 0
                  ? 'Illimité — aucune limite d’élèves, toutes classes confondues.'
                  : `${fiche.maxLearners} élèves au maximum, toutes classes confondues.`}
              </Aide>
            </Champ>
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 12 }}>
            Saisir <strong>0</strong> signifie « illimité ».
          </p>
        </section>
      </div>

      {/* Identifiant technique — utile au support */}
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 16 }}>
        <GraduationCap size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
        Identifiant technique : <code>{establishmentId}</code>
      </p>
    </div>
  );
}

/** Titre de section, avec son icône. */
function SectionTitle({ icon, titre }: { icon: React.ReactNode; titre: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span style={{ color: 'var(--color-primary)', display: 'flex' }}>{icon}</span>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>{titre}</h2>
    </div>
  );
}

/** Libellé + champ. */
function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

/** Texte d'aide sous un champ. */
function Aide({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 6 }}>{children}</p>
  );
}
