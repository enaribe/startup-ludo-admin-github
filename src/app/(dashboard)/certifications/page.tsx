'use client';

/**
 * Mode Classe — Certifications (maquette du 20/08).
 *
 * Deux moitiés, deux statuts de vérité très différents :
 *
 *   CERTIFICATS DES APPRENANTS — RÉEL. L'éligibilité vient du lot 7
 *   (`examinerClasse` : au moins une notion mesurée sur ≥ 3 questions,
 *   cumulées sur l'année). La barre par classe compte les apprenants actifs
 *   éligibles AUJOURD'HUI. La génération, elle, reste sur la fiche de classe :
 *   c'est là que les non-éligibles sont nommés avec leur raison — un export
 *   global silencieux court-circuiterait ce garde-fou.
 *
 *   PARCOURS FORMATEUR — À VENIR (arbitrage du 13/08 : l'écran s'active avec
 *   le contenu des 4 modules). Les modules sont affichés comme feuille de
 *   route, TOUS « Bientôt » : aucun statut « Acquis / En cours » inventé, car
 *   rien ne mesure encore la progression d'un enseignant. L'aperçu du
 *   certificat porte le vrai nom du formateur et de l'établissement, avec la
 *   mention explicite qu'il sera émis à la validation du parcours.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Award, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth-context';
import { getClasses, getClassesByIds, getEstablishment, getLearners } from '@/lib/school-service';
import { examinerClasse } from '@/lib/certificate-service';
import { SEUIL_QUESTIONS_NOTION } from '@/lib/class-report-service';
import type { SchoolClass } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

/** Le parcours formateur annoncé — contenu en préparation (arbitrage du 13/08). */
const PARCOURS = {
  titre: 'Agent de sensibilisation et formateur en entrepreneuriat',
  modules: [
    {
      titre: '1. La pédagogie par le jeu',
      texte: 'Pourquoi le jeu fait apprendre — posture de l’animateur, rythme d’une séance.',
    },
    {
      titre: '2. Animer une session',
      texte: 'Lancer, projeter, gérer le direct et les imprévus de terrain.',
    },
    {
      titre: '3. Évaluer avec les rapports',
      texte: 'Lire l’engagement, repérer les notions faibles, préparer le cours suivant.',
    },
    {
      titre: '4. Certifier ses apprenants',
      texte: 'Générer, remettre et valoriser les certificats des apprenants.',
    },
  ],
} as const;

/** Une classe et son compte d'apprenants éligibles au certificat, mesuré. */
interface LigneClasse {
  classe: SchoolClass;
  eligibles: number;
  actifs: number;
}

export default function CertificationsPage() {
  const { admin, isTeacher, isEstablishmentAdmin, scopedClassIds, scopedEstablishmentId, loading: authLoading } =
    useAuth();

  const [lignes, setLignes] = useState<LigneClasse[] | null>(null);
  const [nomEtablissement, setNomEtablissement] = useState('');

  useEffect(() => {
    if (authLoading || !admin) return;
    let annule = false;
    (async () => {
      try {
        const classes = isTeacher
          ? await getClassesByIds(scopedClassIds)
          : scopedEstablishmentId
            ? await getClasses(scopedEstablishmentId)
            : [];

        // Une lecture de sous-collection par classe — borné au périmètre du
        // compte. C'est le prix d'un chiffre mesuré plutôt que dénormalisé.
        const resultats = await Promise.all(
          classes.map(async (classe): Promise<LigneClasse> => {
            const eleves = await getLearners(classe.id).catch(() => []);
            const actifs = eleves.filter((e) => e.isActive !== false);
            return {
              classe,
              actifs: actifs.length,
              eligibles: examinerClasse(actifs).filter((x) => x.eligible).length,
            };
          })
        );
        if (annule) return;
        setLignes(resultats.sort((a, b) => b.eligibles - a.eligibles));
      } catch (error) {
        console.error('Chargement des certifications :', error);
        if (!annule) {
          toast.error('Erreur lors du chargement des certificats');
          setLignes([]);
        }
      }
    })();

    void getEstablishment(scopedEstablishmentId ?? '')
      .then((e) => setNomEtablissement(e?.name ?? ''))
      .catch(() => {});

    return () => {
      annule = true;
    };
  }, [authLoading, admin, isTeacher, isEstablishmentAdmin, scopedClassIds, scopedEstablishmentId]);

  const maxEligibles = useMemo(
    () => Math.max(1, ...(lignes ?? []).map((l) => l.eligibles)),
    [lignes]
  );
  const totalEligibles = useMemo(
    () => (lignes ?? []).reduce((somme, l) => somme + l.eligibles, 0),
    [lignes]
  );

  if (authLoading || lignes === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1440 }}>
      {/* ═══ En-tête ═══ */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text-primary)' }}>
          Certifications
        </h1>
        <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 640 }}>
          Votre parcours certifiant, et les certificats de vos apprenants — co-signés CONCREE et
          l’établissement.
        </p>
      </div>

      {/* ═══ Parcours formateur — feuille de route, sans progression inventée ═══ */}
      <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 12 }}>
        Parcours « {PARCOURS.titre} » · {PARCOURS.modules.length} modules · 100 % en ligne
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        {PARCOURS.modules.map((module, i) => (
          <div key={module.titre} className="glass-card p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span
                className="flex items-center justify-center"
                style={{
                  width: 26, height: 26, borderRadius: 13, fontSize: 12, fontWeight: 800,
                  background: 'rgba(15,28,46,0.08)', color: 'var(--color-text-muted)', flexShrink: 0,
                }}
              >
                {i + 1}
              </span>
              <span
                style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 10, flexShrink: 0,
                  background: 'rgba(245,166,35,0.12)', color: '#B87A0C',
                }}
              >
                Bientôt
              </span>
            </div>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                {module.titre}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                {module.texte}
              </p>
            </div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 26 }}>
        Le contenu des modules est en préparation chez CONCREE : ils s’activeront ici, et votre
        progression sera suivie module par module.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* ═══ Certificats des apprenants — mesurés (lot 7) ═══ */}
        <section className="glass-card p-5">
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Certificats des apprenants
          </h2>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3, marginBottom: 16 }}>
            Apprenants éligibles aujourd’hui, par classe — au moins une notion mesurée sur ≥{' '}
            {SEUIL_QUESTIONS_NOTION} questions cumulées dans l’année.
          </p>

          {lignes.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '16px 0' }}>
              Aucune classe dans votre périmètre pour l’instant.
            </p>
          ) : totalEligibles === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: '16px 0', lineHeight: 1.6 }}>
              Aucun apprenant n’est encore éligible : l’éligibilité se construit en jouant des
              séances. Si des séances ont pourtant été jouées, lancez « Recalculer les cumuls »
              depuis la fiche de la classe.
            </p>
          ) : (
            <div className="flex flex-col" style={{ gap: 14 }}>
              {lignes.map(({ classe, eligibles, actifs }) => (
                <Link
                  key={classe.id}
                  href={`/classes/${classe.id}`}
                  className="flex items-center gap-3"
                  style={{ textDecoration: 'none' }}
                  title={`${eligibles} éligible${eligibles > 1 ? 's' : ''} sur ${actifs} apprenant${actifs > 1 ? 's' : ''} actif${actifs > 1 ? 's' : ''} — la génération se fait sur la fiche de la classe`}
                >
                  <span
                    style={{
                      fontSize: 12.5, color: 'var(--color-text-secondary)', width: 130, flexShrink: 0,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {classe.name || classe.id}
                  </span>
                  <div style={{ flex: 1, height: 7, borderRadius: 4, background: 'rgba(15,28,46,0.08)', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.max(eligibles > 0 ? 3 : 0, Math.round((eligibles / maxEligibles) * 100))}%`,
                        height: '100%', borderRadius: 4, background: '#0F1C2E',
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 13, fontWeight: 800, color: 'var(--color-text-primary)',
                      width: 34, textAlign: 'right', flexShrink: 0,
                    }}
                  >
                    {eligibles}
                  </span>
                  <ChevronRight size={14} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
                </Link>
              ))}
            </div>
          )}

          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 16, lineHeight: 1.55 }}>
            La génération du PDF se fait depuis la fiche de chaque classe (« Générer les
            certificats ») : les apprenants non éligibles y sont nommés avec la raison, jamais
            écartés en silence.
          </p>
        </section>

        {/* ═══ Aperçu du certificat formateur ═══ */}
        <section className="glass-card p-5">
          <h2 style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 14 }}>
            Aperçu du certificat formateur
          </h2>
          <div
            style={{
              background: '#0F1C2E', borderRadius: 14, padding: 10,
            }}
          >
            <div
              className="flex flex-col items-center justify-center"
              style={{
                border: '1px solid rgba(245,166,35,0.55)', borderRadius: 9,
                padding: '30px 22px', textAlign: 'center', gap: 8,
              }}
            >
              <span
                className="flex items-center gap-2"
                style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: 2, color: '#F5A623' }}
              >
                <Award size={14} /> CERTIFICATION CONCREE
              </span>
              <span style={{ fontSize: 21, fontWeight: 800, color: '#FFFFFF' }}>
                {admin?.displayName || 'Votre nom'}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
                {PARCOURS.titre}
                {nomEtablissement && (
                  <>
                    <br />
                    {nomEtablissement}
                  </>
                )}
              </span>
            </div>
          </div>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 12, lineHeight: 1.55 }}>
            Aperçu — ce certificat sera émis à votre nom à la validation des{' '}
            {PARCOURS.modules.length} modules du parcours.
          </p>
        </section>
      </div>
    </div>
  );
}
