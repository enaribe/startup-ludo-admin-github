'use client';

/**
 * Mode Classe — FICHE ÉLÈVE, vue ANNUELLE (lot 7).
 *
 * ═══ CE QUE CET ÉCRAN DIT, ET CE QU'IL NE DIT PAS ═══
 *
 * Il dit : ce que l'élève a joué sur l'année, les notions qu'on peut chiffrer
 * (seuil de 3 questions CUMULÉES, pas par séance), et l'historique séance par
 * séance.
 *
 * Il ne dit PAS de niveau N1–N4. La règle qui associerait un niveau à un taux
 * cumulé n'est pas tranchée ; l'inventer sur un écran montré à une direction
 * serait pire que de ne rien afficher. Rien n'est prévu pour l'accueillir : le
 * jour où la règle existera, elle viendra avec son propre travail.
 *
 * ═══ LA DIFFÉRENCE AVEC LE RAPPORT DE SÉANCE ═══
 *
 * Même présentation, même seuil, même code couleur — mais l'agrégat porte sur
 * l'ANNÉE. Une notion vue une fois dans trois séances totalise 3 réponses ici
 * alors qu'elle était « trop peu évaluée » dans chacun des trois rapports. Le
 * calcul est le MÊME code (`agregerCompteurs`, partagé avec `agregerNotions`) :
 * deux implémentations du seuil finiraient par diverger.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Award,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  UserX,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth-context';
import { getClass, getEstablishment, getLearners } from '@/lib/school-service';
import {
  SEUIL_QUESTIONS_NOTION,
  agregerCompteurs,
  cumulDepuisLearner,
  type NiveauNotion,
  type NotionAgregee,
} from '@/lib/class-report-service';
import { getHistoriqueEleve, type LigneHistoriqueEleve } from '@/lib/class-cumul-service';
import {
  examinerEligibilite,
  genererCertificats,
  nomFichierCertificat,
  telechargerPdf,
} from '@/lib/certificate-service';
import { formatDate } from '@/lib/utils';
import type { Learner, SchoolClass } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';

export default function FicheElevePage() {
  const params = useParams();
  const classId = String(params?.classId ?? '');
  const learnerId = String(params?.learnerId ?? '');
  const {
    isSuperAdmin,
    isEstablishmentAdmin,
    isTeacher,
    scopedEstablishmentId,
    scopedClassIds,
    loading: authLoading,
  } = useAuth();

  const [classe, setClasse] = useState<SchoolClass | null>(null);
  const [eleve, setEleve] = useState<Learner | null>(null);
  const [nomEtablissement, setNomEtablissement] = useState('');
  const [historique, setHistorique] = useState<LigneHistoriqueEleve[]>([]);
  const [chargement, setChargement] = useState(true);
  const [chargementHistorique, setChargementHistorique] = useState(true);
  const [refuse, setRefuse] = useState(false);
  const [introuvable, setIntrouvable] = useState(false);
  const [certificatEnCours, setCertificatEnCours] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const data = await getClass(classId);
      if (!data) {
        setIntrouvable(true);
        return;
      }
      // Même contrôle de périmètre que la fiche de classe : ne pas monter un
      // écran hors périmètre, même si la vraie borne reste les règles Firestore.
      const autorise =
        isSuperAdmin ||
        (isTeacher && scopedClassIds.includes(classId)) ||
        (isEstablishmentAdmin && data.establishmentId === scopedEstablishmentId);
      if (!autorise) {
        setRefuse(true);
        return;
      }
      setClasse(data);

      const eleves = await getLearners(classId);
      const trouve = eleves.find((e) => e.id === learnerId) ?? null;
      if (!trouve) {
        setIntrouvable(true);
        return;
      }
      setEleve(trouve);

      // Le nom de l'établissement n'est utile qu'au certificat : son échec ne
      // doit pas empêcher la fiche de s'afficher (un enseignant peut lire son
      // établissement, mais mieux vaut ne pas en dépendre pour l'écran entier).
      void getEstablishment(data.establishmentId)
        .then((etab) => setNomEtablissement(etab?.name ?? ''))
        .catch(() => setNomEtablissement(''));
    } catch (error) {
      console.error('Chargement de la fiche élève :', error);
      toast.error('Erreur lors du chargement de la fiche élève');
    } finally {
      setChargement(false);
    }
  }, [classId, learnerId, isSuperAdmin, isTeacher, isEstablishmentAdmin, scopedClassIds, scopedEstablishmentId]);

  useEffect(() => {
    if (!authLoading) void charger();
  }, [authLoading, charger]);

  /**
   * Historique des séances — chargé APRÈS la fiche, et sans la bloquer.
   *
   * Il lit la sous-collection `participants` de chaque séance terminée de la
   * classe (Firestore ne sait pas filtrer « les séances où cet élève a un
   * document » sans `collectionGroup`, que les règles n'ouvrent pas). L'identité
   * et les notions annuelles s'affichent donc immédiatement, l'historique arrive
   * ensuite.
   */
  useEffect(() => {
    if (!eleve || !classId) return;
    let annule = false;
    setChargementHistorique(true);
    void getHistoriqueEleve(classId, eleve.id, eleve.countedSessionIds ?? [])
      .then((lignes) => {
        if (!annule) setHistorique(lignes);
      })
      .catch((error: unknown) => {
        console.error('Historique de l’élève :', error);
        if (!annule) toast.error('Impossible de charger l’historique des séances.');
      })
      .finally(() => {
        if (!annule) setChargementHistorique(false);
      });
    return () => {
      annule = true;
    };
  }, [classId, eleve]);

  const cumul = useMemo(() => (eleve ? cumulDepuisLearner(eleve) : null), [eleve]);
  const notions = useMemo(
    () => (cumul ? agregerCompteurs(cumul.masteryByCategory) : null),
    [cumul]
  );
  const eligibilite = useMemo(() => (eleve ? examinerEligibilite(eleve) : null), [eleve]);

  /** Génère et télécharge le certificat nominatif de CET élève. */
  const telechargerCertificat = async () => {
    if (!eleve || !eligibilite?.eligible || !classe) return;
    setCertificatEnCours(true);
    try {
      const octets = await genererCertificats([eligibilite], {
        nomEtablissement: nomEtablissement || 'votre établissement',
        nomClasse: classe.name ?? 'Classe',
        // Bornes de la période : la première et la dernière séance jouée par
        // l'élève. Plus honnête qu'une « année scolaire » supposée, que rien
        // dans les données ne permet d'affirmer.
        debutPeriode: historique.length > 0 ? historique[historique.length - 1].date : null,
        finPeriode: cumul?.lastPlayedAt ?? null,
      });
      telechargerPdf(octets, nomFichierCertificat(`${eleve.firstName}-${eleve.lastName}`));
      toast.success('Certificat téléchargé');
    } catch (error) {
      console.error('Génération du certificat :', error);
      toast.error(error instanceof Error ? error.message : 'Impossible de générer le certificat');
    } finally {
      setCertificatEnCours(false);
    }
  };

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (refuse) {
    return (
      <EmptyState
        icon={<Users size={48} />}
        title="Élève hors de votre périmètre"
        description="Cette classe ne vous est pas affectée."
        action={
          <Link href="/classes" className="btn-primary" style={{ textDecoration: 'none' }}>
            Retour aux classes
          </Link>
        }
      />
    );
  }

  if (introuvable || !eleve || !classe || !cumul || !notions || !eligibilite) {
    return (
      <EmptyState
        icon={<UserX size={48} />}
        title="Élève introuvable"
        description="Cet élève ne figure plus dans cette classe."
        action={
          <Link href={`/classes/${classId}`} className="btn-primary" style={{ textDecoration: 'none' }}>
            Retour à la classe
          </Link>
        }
      />
    );
  }

  const retire = eleve.isActive === false;
  const nonComptabilisees = historique.filter((l) => !l.comptabilisee).length;

  return (
    <div className="flex flex-col gap-4" style={{ maxWidth: 980 }}>
      <Link
        href={`/classes/${classId}`}
        className="flex items-center gap-1.5"
        style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none', width: 'fit-content' }}
      >
        <ArrowLeft size={14} /> Retour à {classe.name || 'la classe'}
      </Link>

      {/* ═══ IDENTITÉ ═══ */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {`${eleve.firstName ?? ''} ${eleve.lastName ?? ''}`.trim() || 'Élève sans nom'}
          </h1>
          <p
            className="flex items-center gap-2 flex-wrap"
            style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 5 }}
          >
            <span>{classe.name}</span>
            {eleve.externalId?.trim() && <span>· n° {eleve.externalId.trim()}</span>}
            {retire ? (
              <span className="badge">Retiré de la classe</span>
            ) : eleve.linkedUid ? (
              <span className="badge badge-success flex items-center gap-1">
                <CheckCircle2 size={11} /> Compte lié
              </span>
            ) : (
              <span className="badge badge-info flex items-center gap-1">
                <Clock size={11} /> Compte non lié
              </span>
            )}
          </p>
        </div>

        <button
          className="btn-primary flex items-center gap-2"
          onClick={telechargerCertificat}
          disabled={!eligibilite.eligible || certificatEnCours}
          style={{ flexShrink: 0, opacity: eligibilite.eligible ? 1 : 0.5 }}
          title={eligibilite.raison ?? 'Certificat nominatif au format PDF'}
        >
          <Download size={16} />
          {certificatEnCours ? 'Génération…' : 'Télécharger le certificat'}
        </button>
      </div>

      {/* ═══ INDICATEURS ANNUELS ═══ */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Indicateur
          icone={<CalendarDays size={16} />}
          libelle="Séances jouées"
          valeur={String(cumul.totalSessions)}
          detail={cumul.totalSessions > 0 ? 'comptabilisées sur l’année' : 'aucune séance terminée'}
        />
        <Indicateur
          icone={<Activity size={16} />}
          libelle="Dernière activité"
          valeur={cumul.lastPlayedAt ? formatDate(cumul.lastPlayedAt) : '—'}
          detail={cumul.lastPlayedAt ? 'dernière séance jouée' : 'jamais joué'}
        />
        <Indicateur
          icone={<Award size={16} />}
          libelle="Questions répondues"
          valeur={String(notions.totalReponses)}
          detail="toutes notions confondues"
        />
        <Indicateur
          icone={<Award size={16} />}
          libelle="Notions certifiables"
          valeur={String(notions.notions.length)}
          detail={`au moins ${SEUIL_QUESTIONS_NOTION} questions`}
        />
      </section>

      {/* Signalement d'une clôture manquée : c'est la seule façon pour le prof
          de savoir que « Recalculer les cumuls » a quelque chose à rattraper. */}
      {nonComptabilisees > 0 && (
        <div
          className="flex items-start gap-3 p-4"
          style={{ background: 'var(--color-warning-light)', borderRadius: 10 }}
        >
          <AlertCircle size={18} style={{ color: 'var(--color-warning)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            {nonComptabilisees} séance{nonComptabilisees > 1 ? 's' : ''} de cet élève{' '}
            {nonComptabilisees > 1 ? 'ne sont pas comptabilisées' : 'n’est pas comptabilisée'} dans
            son bilan annuel — la clôture a probablement échoué. Utilisez{' '}
            <Link href={`/classes/${classId}`} style={{ color: 'var(--color-primary)' }}>
              « Recalculer les cumuls »
            </Link>{' '}
            sur la fiche de la classe pour les intégrer.
          </p>
        </div>
      )}

      {/* ═══ NOTIONS MAÎTRISÉES SUR L'ANNÉE ═══ */}
      <section className="glass-card p-5">
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Notions maîtrisées sur l’année
        </h2>

        {notions.notions.length > 0 ? (
          <>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 16px' }}>
              Cumulées sur toutes les séances, de la moins maîtrisée à la mieux acquise.
            </p>
            <div className="flex flex-col gap-3">
              {notions.notions.map((notion) => (
                <BarreNotion key={notion.category} notion={notion} />
              ))}
            </div>
            <Legende />
          </>
        ) : (
          <div
            className="flex items-start gap-3 p-4"
            style={{ background: 'var(--color-surface-variant)', borderRadius: 10, marginTop: 12 }}
          >
            <AlertCircle size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              {eligibilite.raison ??
                'Aucune notion n’est encore mesurable pour cet élève.'}{' '}
              Ce n’est pas un résultat nul, c’est une absence de mesure.
            </p>
          </div>
        )}

        {notions.sousEchantillonnees.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-card-border)' }}>
            <h3 style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
              Notions trop peu évaluées
            </h3>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 10px', lineHeight: 1.6 }}>
              Moins de {SEUIL_QUESTIONS_NOTION} questions posées sur l’année : le taux ne serait pas
              significatif, il n’est donc ni affiché ici ni porté sur le certificat.
            </p>
            <ul className="flex flex-wrap gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {notions.sousEchantillonnees.map((notion) => (
                <li key={notion.category} className="badge" style={{ fontWeight: 400 }}>
                  {notion.libelle}
                  <span style={{ color: 'var(--color-text-muted)', marginLeft: 6 }}>
                    {notion.total} question{notion.total > 1 ? 's' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ═══ HISTORIQUE DES SÉANCES ═══ */}
      <section className="glass-card">
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-card-border)' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Séances jouées
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 8 }}>
              {chargementHistorique ? 'chargement…' : `${historique.length} séance${historique.length > 1 ? 's' : ''}`}
            </span>
          </h2>
        </div>

        {chargementHistorique ? (
          <div className="flex items-center justify-center py-10">
            <LoadingSpinner />
          </div>
        ) : historique.length === 0 ? (
          <p className="px-5 py-8" style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>
            Cet élève n’a participé à aucune séance terminée.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-card-border)' }}>
                  <Th>Séance</Th>
                  <Th>Date</Th>
                  <Th style={{ textAlign: 'right' }}>Score</Th>
                  <Th style={{ textAlign: 'right' }}>Réponses</Th>
                  <Th style={{ textAlign: 'right' }}>Réussite</Th>
                  <Th style={{ textAlign: 'right' }}>Bilan annuel</Th>
                </tr>
              </thead>
              <tbody>
                {historique.map((ligne, index) => (
                  <tr
                    key={ligne.sessionId}
                    style={{
                      borderBottom:
                        index < historique.length - 1 ? '1px solid var(--color-card-border)' : 'none',
                    }}
                  >
                    <Td>
                      <Link
                        href={`/seances/${ligne.sessionId}`}
                        style={{ color: 'var(--color-text-primary)', fontWeight: 500, textDecoration: 'none' }}
                      >
                        {ligne.titre}
                      </Link>
                    </Td>
                    <Td>{ligne.date ? formatDate(ligne.date) : '—'}</Td>
                    <TdNum>{ligne.score}</TdNum>
                    <TdNum>{ligne.nbReponses > 0 ? `${ligne.nbCorrectes}/${ligne.nbReponses}` : '—'}</TdNum>
                    <TdNum>
                      {/* Jamais « 0 % » pour un élève sans réponse : il n'a rien
                          raté, il n'a rien été interrogé. */}
                      {ligne.taux === null ? (
                        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                      ) : (
                        <span style={{ color: couleurNiveau(niveauDe(ligne.taux)), fontWeight: 600 }}>
                          {ligne.taux} %
                        </span>
                      )}
                    </TdNum>
                    <TdNum>
                      {ligne.comptabilisee ? (
                        <span className="badge badge-success">Comptabilisée</span>
                      ) : (
                        /* Pas de `.badge-warning` dans la feuille de styles : on
                           compose avec les variables existantes plutôt que
                           d'ajouter une classe globale pour un seul usage. */
                        <span
                          className="badge"
                          style={{
                            background: 'var(--color-warning-light)',
                            color: 'var(--color-warning)',
                          }}
                        >
                          À recalculer
                        </span>
                      )}
                    </TdNum>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Éligibilité au certificat — expliquée, jamais silencieuse. */}
      {!eligibilite.eligible && (
        <div
          className="flex items-start gap-3 p-4 glass-card"
          style={{ borderLeft: '3px solid var(--color-text-muted)' }}
        >
          <AlertCircle size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--color-text-primary)' }}>Certificat indisponible.</strong>{' '}
            {eligibilite.raison} Un certificat n’atteste que de notions mesurées : en émettre un sans
            aucune notion chiffrable reviendrait à remettre un papier vide à une famille.
          </p>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS — mêmes formes que le rapport de séance, volontairement
// ═══════════════════════════════════════════════════════════════════════════

/** Carte d'indicateur du bandeau supérieur. */
function Indicateur({
  icone,
  libelle,
  valeur,
  detail,
}: {
  icone: React.ReactNode;
  libelle: string;
  valeur: string;
  detail: string;
}) {
  return (
    <div className="glass-card p-4">
      <p
        className="flex items-center gap-1.5"
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          color: 'var(--color-text-muted)',
        }}
      >
        <span style={{ color: 'var(--color-primary)' }}>{icone}</span>
        {libelle}
      </p>
      <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 6 }}>
        {valeur}
      </p>
      <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{detail}</p>
    </div>
  );
}

/** Barre horizontale d'une notion chiffrée — même rendu que le rapport. */
function BarreNotion({ notion }: { notion: NotionAgregee }) {
  const couleur = couleurNiveau(notion.niveau);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: 5 }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
          {notion.libelle}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)', flexShrink: 0 }}>
          <strong style={{ color: couleur, fontSize: 13.5 }}>{notion.taux} %</strong>
          {' · '}
          {notion.correct}/{notion.total} question{notion.total > 1 ? 's' : ''}
        </span>
      </div>
      <div
        style={{ height: 8, borderRadius: 999, background: 'var(--color-surface-variant)', overflow: 'hidden' }}
        role="img"
        aria-label={`${notion.libelle} : ${notion.taux} % de réussite sur ${notion.total} questions`}
      >
        <div style={{ width: `${notion.taux}%`, height: '100%', borderRadius: 999, background: couleur }} />
      </div>
    </div>
  );
}

/** Légende du code couleur. */
function Legende() {
  const entrees: { couleur: string; texte: string }[] = [
    { couleur: 'var(--color-success)', texte: 'Acquis (≥ 70 %)' },
    { couleur: 'var(--color-warning)', texte: 'À consolider (40–69 %)' },
    { couleur: 'var(--color-error)', texte: 'À retravailler (< 40 %)' },
  ];
  return (
    <div className="flex flex-wrap gap-4" style={{ marginTop: 16 }}>
      {entrees.map((e) => (
        <span
          key={e.texte}
          className="flex items-center gap-1.5"
          style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 2, background: e.couleur }} />
          {e.texte}
        </span>
      ))}
    </div>
  );
}

/** En-tête de colonne. */
function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      className="text-left px-4 py-3"
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        color: 'var(--color-text-muted)',
        ...style,
      }}
    >
      {children}
    </th>
  );
}

/** Cellule de texte. */
function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-3" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
      {children}
    </td>
  );
}

/** Cellule numérique, alignée à droite. */
function TdNum({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="px-4 py-3"
      style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'right', whiteSpace: 'nowrap' }}
    >
      {children}
    </td>
  );
}

/** Couleur associée à un verdict pédagogique. */
function couleurNiveau(niveau: NiveauNotion): string {
  if (niveau === 'reussi') return 'var(--color-success)';
  if (niveau === 'a-consolider') return 'var(--color-warning)';
  return 'var(--color-error)';
}

/** Verdict d'un taux INDIVIDUEL de séance (colonne « Réussite » du tableau). */
function niveauDe(taux: number): NiveauNotion {
  if (taux >= 70) return 'reussi';
  if (taux >= 40) return 'a-consolider';
  return 'a-retravailler';
}
