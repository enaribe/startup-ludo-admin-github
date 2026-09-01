'use client';

/**
 * Modération des campagnes annonceurs — CONCREE uniquement (lot 5).
 *
 * La file montre chaque campagne `in_review` avec L'APERÇU EXACT de ce que
 * verra le joueur (la carte retournable, ou l'écran sponsor) : on modère ce qui
 * sera diffusé, pas un formulaire. Valider active la diffusion (et installe
 * l'habillage d'édition, cf. route decision) ; refuser EXIGE un motif — la
 * spec promet un « retour motivé avec reformulation proposée », un refus sec
 * est un mur.
 *
 * En dessous, les campagnes ACTIVES avec pause/reprise/fin, et le bouton
 * « Lancer l'entretien » (contrôle continu : liens morts, dates limites,
 * signalements). Le SLA de 48 h est affiché par campagne : l'âge de la
 * soumission se lit d'un coup d'œil, en rouge passé le délai.
 */

import { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { CheckCircle2, CreditCard, Pause, Play, ShieldCheck, StopCircle, Wrench, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth, firestore, COLLECTIONS } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import type { Campaign } from '@/types';
import ApercuCarteCampagne from '@/components/annonceur/ApercuCarteCampagne';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';

type Decision = 'activate' | 'reject' | 'pause' | 'resume' | 'end';

/** 48 h ouvrées ≈ 2 jours calendaires — l'affichage n'a pas besoin de plus fin. */
const SLA_MS = 48 * 3600 * 1000;

async function chargerParStatut(statuts: string[]): Promise<Campaign[]> {
  const resultats: Campaign[] = [];
  for (const statut of statuts) {
    const snap = await getDocs(
      query(collection(firestore, COLLECTIONS.campaigns), where('status', '==', statut))
    );
    resultats.push(...snap.docs.map((d) => ({ ...(d.data() as Campaign), id: d.id })));
  }
  return resultats.sort((a, b) => (a.submittedAt ?? 0) - (b.submittedAt ?? 0));
}

/**
 * Les quatre vues de l'écran.
 *
 * `comptes` est séparé à dessein : clôturer un mois et créditer un solde sont
 * des opérations FINANCIÈRES, sans rapport avec la modération éditoriale.
 * Les laisser sous « À traiter » les affichait en permanence, y compris quand
 * dix campagnes attendaient — et noyait la file qui, elle, bloque quelqu'un.
 */
type Onglet = 'a_traiter' | 'en_diffusion' | 'historique' | 'comptes';

export default function ModerationPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const [onglet, setOnglet] = useState<Onglet>('a_traiter');
  const [enAttente, setEnAttente] = useState<Campaign[]>([]);
  const [actives, setActives] = useState<Campaign[]>([]);
  /**
   * Campagnes REFUSÉES ou TERMINÉES — la trace des décisions passées.
   *
   * Sans elles, une campagne refusée disparaissait définitivement de l'écran :
   * impossible de retrouver ce qui avait été refusé ni le motif écrit, alors
   * que c'est exactement ce qu'on cherche quand un annonceur rappelle pour
   * contester. Un poste de modération sans historique n'est pas défendable.
   */
  const [historique, setHistorique] = useState<Campaign[]>([]);
  const [demandesTraitees, setDemandesTraitees] = useState<
    Array<{ uid: string; type: string; nom: string; email: string; status: string; motif: string; decidedAt: number }>
  >([]);
  const [chargement, setChargement] = useState(true);
  const [actionSur, setActionSur] = useState<string | null>(null);
  const [entretienEnCours, setEntretienEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [attente, act, passe] = await Promise.all([
        chargerParStatut(['in_review']),
        chargerParStatut(['active', 'paused']),
        chargerParStatut(['rejected', 'ended']),
      ]);
      setEnAttente(attente);
      setActives(act);
      // Décision la plus RÉCENTE en tête : l'historique se consulte à rebours.
      setHistorique(
        passe.sort((a, b) => (b.review?.reviewedAt ?? 0) - (a.review?.reviewedAt ?? 0))
      );

      // Demandes d'inscription déjà tranchées — même besoin de trace.
      const snap = await getDocs(
        query(collection(firestore, COLLECTIONS.signupRequests), where('status', 'in', ['approved', 'rejected']))
      ).catch(() => null);
      setDemandesTraitees(
        snap
          ? snap.docs
              .map((d) => {
                const data = d.data();
                return {
                  uid: d.id,
                  type: (data.type as string) ?? '',
                  nom: ((data.orgName as string) || (data.displayName as string) || '') as string,
                  email: (data.email as string) ?? '',
                  status: (data.status as string) ?? '',
                  motif: (data.motif as string) ?? '',
                  decidedAt: Number(data.decidedAt ?? 0),
                };
              })
              // Les enseignants relèvent de leur direction, pas de CONCREE.
              .filter((d) => d.type !== 'teacher')
              .sort((a, b) => b.decidedAt - a.decidedAt)
          : []
      );
    } catch (error) {
      console.error('Chargement modération :', error);
      toast.error('Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isSuperAdmin) void charger();
  }, [authLoading, isSuperAdmin, charger]);

  const decider = useCallback(
    async (campaignId: string, decision: Decision, motif?: string) => {
      setActionSur(campaignId);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/annonceur/decision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ campaignId, decision, motif }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok || json.error) throw new Error(json.error || 'Décision impossible.');
        toast.success(
          decision === 'activate'
            ? 'Campagne activée — le feed du jeu est à jour.'
            : decision === 'reject'
              ? 'Refus envoyé avec son motif.'
              : 'Fait.'
        );
        await charger();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Décision impossible.');
      } finally {
        setActionSur(null);
      }
    },
    [charger]
  );

  const lancerEntretien = useCallback(async () => {
    setEntretienEnCours(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/annonceur/entretien', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        error?: string;
        verifiees?: number;
        terminees?: string[];
        enRevision?: string[];
        liensMorts?: string[];
      };
      if (!res.ok || json.error) throw new Error(json.error || 'Entretien impossible.');
      const actions =
        (json.terminees?.length ?? 0) + (json.enRevision?.length ?? 0) + (json.liensMorts?.length ?? 0);
      toast.success(
        actions === 0
          ? `${json.verifiees ?? 0} campagne(s) vérifiée(s) — rien à signaler.`
          : `${json.verifiees} vérifiée(s) : ${json.terminees?.length ?? 0} terminée(s), ${json.liensMorts?.length ?? 0} lien(s) mort(s), ${json.enRevision?.length ?? 0} en revérification.`,
        { duration: 7000 }
      );
      await charger();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Entretien impossible.');
    } finally {
      setEntretienEnCours(false);
    }
  }, [charger]);

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div style={{ maxWidth: 1080 }}>
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          {/* Le titre disait « Modération annonceurs » alors que l'écran traite
              AUSSI les inscriptions d'établissements et de partenaires : un
              super admin cherchant à valider une école n'y pensait pas. */}
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Modération &amp; demandes
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 600 }}>
            Campagnes annonceurs et demandes d’inscription : rien n’est diffusé ni activé sans
            passer par ici. Engagement : réponse sous 48 h ouvrées.
          </p>
        </div>
        {/* « Lancer l'entretien » a migré dans l'onglet « En diffusion » : il
            vérifie les liens des campagnes ACTIVES, sa place est à côté d'elles.
            Son nom ne disait pas non plus ce qu'il fait — corrigé là-bas. */}
      </div>

      {/*
        BARRE DE RÉSUMÉ — remplace l'état vide géant.
        La file est vide la plupart du temps : c'est la situation NORMALE, elle
        ne doit pas occuper un demi-écran. Ici, trois chiffres sur une ligne
        disent d'un coup d'œil s'il y a du travail.
      */}
      <div
        className="flex items-center gap-6 flex-wrap mb-5"
        style={{
          background: '#FFFFFF',
          border: '1px solid var(--color-card-border)',
          borderRadius: 12,
          padding: '12px 18px',
        }}
      >
        <ResumeChiffre
          valeur={enAttente.length}
          libelle={`campagne${enAttente.length > 1 ? 's' : ''} en attente`}
          alerte={enAttente.length > 0}
        />
        <span style={{ width: 1, height: 26, background: 'var(--color-card-border)' }} />
        <ResumeChiffre
          valeur={actives.length}
          libelle={`campagne${actives.length > 1 ? 's' : ''} en diffusion`}
        />
        <span style={{ width: 1, height: 26, background: 'var(--color-card-border)' }} />
        <ResumeChiffre
          valeur={historique.length + demandesTraitees.length}
          libelle="décisions archivées"
        />
      </div>

      {/* ═══ Onglets — où il y a du travail, d'un coup d'œil ═══ */}
      <div
        className="flex items-center gap-1 mb-5"
        style={{ background: 'rgba(15,28,46,0.05)', borderRadius: 10, padding: 3, width: 'fit-content' }}
      >
        {(
          [
            ['a_traiter', 'À traiter', enAttente.length],
            ['en_diffusion', 'En diffusion', actives.length],
            ['historique', 'Historique', historique.length + demandesTraitees.length],
            ['comptes', 'Comptes & finances', 0],
          ] as const
        ).map(([cle, libelle, compteur]) => {
          const actif = onglet === cle;
          return (
            <button
              key={cle}
              type="button"
              onClick={() => setOnglet(cle)}
              className="flex items-center gap-2"
              style={{
                fontSize: 12.5, fontWeight: actif ? 700 : 500, padding: '7px 14px', borderRadius: 8,
                border: 'none', cursor: 'pointer',
                background: actif ? '#FFFFFF' : 'transparent',
                color: actif ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                boxShadow: actif ? '0 1px 3px rgba(15,28,46,0.12)' : 'none',
              }}
            >
              {libelle}
              {compteur > 0 && (
                <span
                  style={{
                    fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
                    // Orange sur « À traiter » : c'est la seule file où quelqu'un attend.
                    background: cle === 'a_traiter' ? '#F5A623' : 'rgba(15,28,46,0.08)',
                    color: cle === 'a_traiter' ? '#0C243E' : 'var(--color-text-muted)',
                  }}
                >
                  {compteur}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {onglet === 'a_traiter' && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 10 }}>
            Campagnes en attente de validation ({enAttente.length})
          </h2>
          {enAttente.length === 0 ? (
            // État vide DISCRET : « rien à traiter » est la situation normale,
            // pas un incident à illustrer sur un demi-écran.
            <p
              className="flex items-center gap-2"
              style={{
                fontSize: 12.5,
                color: 'var(--color-text-muted)',
                background: 'var(--color-surface)',
                borderRadius: 10,
                padding: '14px 16px',
                marginBottom: 24,
              }}
            >
              <ShieldCheck size={15} style={{ color: '#2EA043', flexShrink: 0 }} />
              Rien à vérifier. Les campagnes soumises apparaîtront ici avec l’aperçu joueur et les
              boutons « Valider et diffuser » ou « Refuser ».
            </p>
          ) : (
            <div className="flex flex-col gap-4 mb-8">
              {enAttente.map((c) => (
                <CarteModeration
                  key={c.id}
                  campagne={c}
                  enCours={actionSur === c.id}
                  onDecision={decider}
                />
              ))}
            </div>
          )}

          {/* ═══ Demandes d'inscription (plan I5) ═══ */}
          <DemandesInscription />
        </>
      )}

      {/* ═══ Comptes & finances — hors de la modération éditoriale ═══ */}
      {onglet === 'comptes' && <OutilsComptes />}

      {/* ═══ Historique des décisions ═══ */}
      {onglet === 'historique' && (
        <HistoriqueDecisions campagnes={historique} demandes={demandesTraitees} />
      )}

      {/* ═══ Actives / en pause ═══ */}
      {onglet === 'en_diffusion' && (
        actives.length === 0 ? (
          <EmptyState
            icon={<Play size={44} />}
            title="Aucune campagne en diffusion"
            description="Les campagnes validées apparaîtront ici, avec la pause, la reprise et l’arrêt définitif."
          />
        ) : (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>
              En diffusion ({actives.length})
            </h2>
            {/* « Lancer l'entretien » ne disait pas ce qu'il fait. Renommé et
                déplacé ici, à côté des campagnes qu'il vérifie. */}
            <button
              className="btn-secondary flex items-center gap-2"
              style={{ fontSize: 12.5, opacity: entretienEnCours ? 0.6 : 1 }}
              disabled={entretienEnCours}
              title="Contrôle continu : détecte les liens morts et les dates limites dépassées, et met en pause les campagnes concernées."
              onClick={() => void lancerEntretien()}
            >
              <Wrench size={14} />
              {entretienEnCours ? 'Vérification…' : 'Vérifier les liens'}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {actives.map((c) => (
              <div
                key={c.id}
                className="glass-card flex items-center justify-between gap-3 flex-wrap"
                style={{ padding: '12px 16px' }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)', maxWidth: 520, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.format === 'edition'
                      ? `Édition ${c.editionSkin?.editionId} — ${c.editionSkin?.structure}`
                      : c.card?.rectoText}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {c.ownerEmail ?? c.ownerUid} · {c.status === 'paused' ? 'en pause' : 'active'}
                    {c.review?.motifRefus ? ` · ${c.review.motifRefus}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  {c.status === 'active' ? (
                    <button
                      className="btn-secondary flex items-center gap-1.5"
                      style={{ fontSize: 12 }}
                      disabled={actionSur === c.id}
                      onClick={() => void decider(c.id, 'pause')}
                    >
                      <Pause size={13} /> Pause
                    </button>
                  ) : (
                    <button
                      className="btn-secondary flex items-center gap-1.5"
                      style={{ fontSize: 12 }}
                      disabled={actionSur === c.id}
                      onClick={() => void decider(c.id, 'resume')}
                    >
                      <Play size={13} /> Reprendre
                    </button>
                  )}
                  <button
                    className="btn-secondary flex items-center gap-1.5"
                    style={{ fontSize: 12, color: 'var(--color-danger)' }}
                    disabled={actionSur === c.id}
                    onClick={() => {
                      if (window.confirm('Terminer définitivement cette campagne ?')) {
                        void decider(c.id, 'end');
                      }
                    }}
                  >
                    <StopCircle size={13} /> Terminer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
        )
      )}
    </div>
  );
}

/** En-tête de colonne de la table des comptes annonceurs. */
function ThCompte({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      className="text-left px-4 py-2.5"
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

/** Un chiffre de la barre de résumé — orange dès qu'il appelle une action. */
function ResumeChiffre({
  valeur,
  libelle,
  alerte,
}: {
  valeur: number;
  libelle: string;
  alerte?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span
        style={{
          fontSize: 20,
          fontWeight: 800,
          color: alerte ? '#B87A0C' : 'var(--color-text-primary)',
        }}
      >
        {valeur}
      </span>
      <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{libelle}</span>
    </div>
  );
}

/**
 * HISTORIQUE DES DÉCISIONS — la trace de ce qui a été refusé ou terminé.
 *
 * ═══ POURQUOI CET ÉCRAN EXISTE ═══
 *
 * Sans lui, une campagne refusée disparaissait de l'interface au moment même
 * de la décision : le motif écrit par le modérateur n'était plus consultable
 * nulle part côté CONCREE — alors que c'est exactement ce qu'on cherche quand
 * l'annonceur rappelle pour contester. Le motif partait par e-mail à
 * l'annonceur, et CONCREE n'en gardait aucune copie lisible.
 *
 * Les campagnes ET les demandes d'inscription y figurent ensemble : ce sont
 * deux décisions du même poste, et les chercher à deux endroits n'aurait servi
 * qu'à respecter une frontière technique invisible pour l'utilisateur.
 */
function HistoriqueDecisions({
  campagnes,
  demandes,
}: {
  campagnes: Campaign[];
  demandes: Array<{ uid: string; type: string; nom: string; email: string; status: string; motif: string; decidedAt: number }>;
}) {
  const dateLisible = (ms: number) =>
    ms ? new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  if (campagnes.length === 0 && demandes.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck size={44} />}
        title="Aucune décision pour l’instant"
        description="Les campagnes refusées ou terminées et les demandes d’inscription traitées s’archiveront ici, avec leur motif et leur date."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {campagnes.length > 0 && (
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 10 }}>
            Campagnes ({campagnes.length})
          </h2>
          <div className="flex flex-col gap-2">
            {campagnes.map((c) => (
              <div key={c.id} className="glass-card" style={{ padding: '12px 16px' }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {c.format === 'edition'
                        ? `Édition ${c.editionSkin?.editionId} — ${c.editionSkin?.structure}`
                        : c.card?.rectoText}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {c.ownerEmail ?? c.ownerUid} · décidé le {dateLisible(c.review?.reviewedAt ?? 0)}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 10, flexShrink: 0,
                      background: c.status === 'rejected' ? 'rgba(217,83,79,0.1)' : 'rgba(15,28,46,0.07)',
                      color: c.status === 'rejected' ? '#C9302C' : '#5A6A70',
                    }}
                  >
                    {c.status === 'rejected' ? 'Refusée' : 'Terminée'}
                  </span>
                </div>
                {/* Le motif est LA raison d'être de cet écran : jamais tronqué. */}
                {c.review?.motifRefus && (
                  <p
                    style={{
                      fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.55,
                      marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-card-border)',
                    }}
                  >
                    <strong style={{ color: 'var(--color-text-primary)' }}>Motif : </strong>
                    {c.review.motifRefus}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {demandes.length > 0 && (
        <section>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 10 }}>
            Demandes d’inscription ({demandes.length})
          </h2>
          <div className="flex flex-col gap-2">
            {demandes.map((d) => (
              <div key={d.uid} className="glass-card" style={{ padding: '12px 16px' }}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                      {d.nom || d.email}
                      <span
                        style={{
                          fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 9,
                          background: 'rgba(79,107,255,0.1)', color: '#4F6BFF', marginLeft: 8,
                        }}
                      >
                        {d.type === 'sponsor' ? 'Annonceur' : d.type === 'partner' ? 'Partenaire' : 'Établissement'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
                      {d.email} · décidé le {dateLisible(d.decidedAt)}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 10, flexShrink: 0,
                      background: d.status === 'approved' ? 'rgba(46,160,67,0.1)' : 'rgba(217,83,79,0.1)',
                      color: d.status === 'approved' ? '#2EA043' : '#C9302C',
                    }}
                  >
                    {d.status === 'approved' ? 'Activée' : 'Refusée'}
                  </span>
                </div>
                {d.motif && (
                  <p
                    style={{
                      fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.55,
                      marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-card-border)',
                    }}
                  >
                    <strong style={{ color: 'var(--color-text-primary)' }}>Motif : </strong>
                    {d.motif}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Outils de gestion des comptes annonceurs (lot 6) : clôture mensuelle,
 * alimentation déclarative (paiement constaté hors plateforme), factures à
 * marquer payées. Trois gestes d'argent, tous derrière l'API Admin SDK.
 */
function OutilsComptes() {
  const [enCours, setEnCours] = useState(false);
  const [modaleTopup, setModaleTopup] = useState(false);
  const [topup, setTopup] = useState({ ownerUid: '', montant: '', canal: 'orange-money', reference: '' });
  const [facturesDues, setFacturesDues] = useState<Array<{ id: string; reference: string; ownerUid: string; totalFcfa: number }>>([]);
  /**
   * Les comptes annonceurs, avec leur solde.
   *
   * Sans cette liste, créditer un compte exigeait de saisir un UID Firebase à
   * la main — un identifiant introuvable dans l'interface, qu'il fallait aller
   * chercher dans la console Firebase. Le geste était donc théoriquement
   * possible et pratiquement inutilisable.
   */
  const [comptes, setComptes] = useState<
    Array<{ uid: string; nom: string; email: string; soldeFcfa: number; campagnesActives: number }>
  >([]);

  const chargerDues = useCallback(async () => {
    const snap = await getDocs(
      query(collection(firestore, COLLECTIONS.invoices), where('status', '==', 'due'))
    );
    setFacturesDues(
      snap.docs.map((d) => {
        const data = d.data() as { reference: string; ownerUid: string; totalFcfa: number };
        return { id: d.id, ...data };
      })
    );
  }, []);

  const chargerComptes = useCallback(async () => {
    try {
      const [comptesSnap, campagnesSnap] = await Promise.all([
        getDocs(collection(firestore, COLLECTIONS.advertisers)),
        getDocs(query(collection(firestore, COLLECTIONS.campaigns), where('status', '==', 'active'))),
      ]);

      // Campagnes actives par propriétaire — le contexte qui dit si un solde
      // à zéro est un problème (diffusion en cours) ou non.
      const parOwner = new Map<string, number>();
      for (const d of campagnesSnap.docs) {
        const owner = (d.data() as { ownerUid?: string }).ownerUid ?? '';
        if (owner) parOwner.set(owner, (parOwner.get(owner) ?? 0) + 1);
      }

      // Le NOM lisible : jamais un UID nu. `users/{uid}` est en lecture
      // publique bornée ; la raison sociale saisie par l'annonceur prime,
      // puisque c'est celle qui figure sur ses factures.
      const lignes = await Promise.all(
        comptesSnap.docs.map(async (d) => {
          const data = d.data() as {
            balanceFcfa?: number;
            billingInfo?: { raisonSociale?: string };
          };
          const userSnap = await getDoc(doc(firestore, COLLECTIONS.users, d.id)).catch(() => null);
          const user = userSnap?.data() as { displayName?: string; email?: string } | undefined;
          return {
            uid: d.id,
            nom:
              data.billingInfo?.raisonSociale?.trim() ||
              user?.displayName?.trim() ||
              user?.email?.trim() ||
              d.id,
            email: user?.email ?? '',
            soldeFcfa: Number(data.balanceFcfa ?? 0),
            campagnesActives: parOwner.get(d.id) ?? 0,
          };
        })
      );
      setComptes(lignes.sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));
    } catch (error) {
      // Enrichissement : son échec ne doit pas empêcher la clôture ni le crédit.
      console.error('Chargement des comptes annonceurs :', error);
    }
  }, []);

  useEffect(() => {
    void chargerDues();
    void chargerComptes();
  }, [chargerDues, chargerComptes]);

  const appeler = useCallback(
    async (body: Record<string, unknown>, succes: string) => {
      setEnCours(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/annonceur/compte', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body),
        });
        const json = (await res.json()) as { error?: string; emises?: string[]; dejaClotures?: string[] };
        if (!res.ok || json.error) throw new Error(json.error || 'Action impossible.');
        toast.success(
          body.action === 'cloture'
            ? `${json.emises?.length ?? 0} facture(s) émise(s)${json.dejaClotures?.length ? `, ${json.dejaClotures.length} déjà clôturée(s)` : ''}.`
            : succes
        );
        // Les deux listes bougent après un crédit ou une clôture : le solde
        // affiché doit refléter l'écriture qui vient d'avoir lieu.
        await Promise.all([chargerDues(), chargerComptes()]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Action impossible.');
      } finally {
        setEnCours(false);
      }
    },
    [chargerDues, chargerComptes]
  );

  return (
    <div className="glass-card" style={{ padding: '16px 18px', margin: '18px 0' }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 10 }}>
        Comptes annonceurs
      </h2>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Fige la consommation du mois précédent en factures et débite les soldes. Un mois déjà
            clôturé n’est jamais recalculé.
          </p>
          {/* `btn-primary` porte la police du JEU (Luckiest Guy) : déplacée
              telle quelle sur un geste comptable, elle sonnait faux. On la
              neutralise localement plutôt que de toucher au style global,
              utilisé partout ailleurs à bon escient. */}
          <button
            className="btn-primary"
            style={{ fontSize: 12.5, fontFamily: 'inherit', fontWeight: 700, opacity: enCours ? 0.6 : 1 }}
            disabled={enCours}
            onClick={() => {
              if (window.confirm('Clôturer le mois précédent ? Les factures seront émises et les soldes débités — un mois clôturé n’est jamais recalculé.')) {
                void appeler({ action: 'cloture' }, '');
              }
            }}
          >
            Clôturer le mois précédent
          </button>
        </div>
        <div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Alimentation constatée (Orange Money, Wave, virement) — crédite le solde du compte.
          </p>
          {/*
            DERRIÈRE UNE MODALE, pas à ciel ouvert : créditer un solde touche à
            de l'argent, c'est irréversible, et ça n'arrive que quelques fois
            par mois. Un formulaire toujours affiché invite à la saisie
            accidentelle sur un écran qu'on ouvre pour tout autre chose.
          */}
          <button
            className="btn-secondary flex items-center gap-2"
            style={{ fontSize: 12.5 }}
            disabled={enCours}
            onClick={() => setModaleTopup(true)}
          >
            <CreditCard size={14} /> Créditer un compte
          </button>
        </div>
        <div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Factures en attente de règlement ({facturesDues.length}).
          </p>
          {facturesDues.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2" style={{ fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--color-card-border)' }}>
              <span>{f.reference} · {f.totalFcfa.toLocaleString('fr-FR')} F</span>
              <button
                className="btn-secondary"
                style={{ fontSize: 11.5 }}
                disabled={enCours}
                onClick={() => void appeler({ action: 'facture-payee', invoiceId: f.id }, 'Facture marquée payée.')}
              >
                Payée
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ Les comptes annonceurs ═══ */}
      <div style={{ borderTop: '1px solid var(--color-card-border)', marginTop: 18, paddingTop: 16 }}>
        <h3 style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--color-text-primary)' }}>
          Comptes ({comptes.length})
        </h3>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3, marginBottom: 12 }}>
          Un compte apparaît ici dès que l’annonceur enregistre ses informations de facturation ou
          reçoit sa première alimentation.
        </p>

        {comptes.length === 0 ? (
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
            Aucun compte annonceur pour l’instant.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(15,28,46,0.03)' }}>
                  <ThCompte>Annonceur</ThCompte>
                  <ThCompte>Campagnes actives</ThCompte>
                  <ThCompte style={{ textAlign: 'right' }}>Solde</ThCompte>
                  <ThCompte style={{ textAlign: 'right' }}>Action</ThCompte>
                </tr>
              </thead>
              <tbody>
                {comptes.map((c) => (
                  <tr key={c.uid} style={{ borderBottom: '1px solid var(--color-card-border)' }}>
                    <td className="px-4 py-3">
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {c.nom}
                      </div>
                      {c.email && (
                        <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
                          {c.email}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                      {c.campagnesActives > 0 ? c.campagnesActives : '—'}
                    </td>
                    <td
                      className="px-4 py-3"
                      style={{
                        fontSize: 13.5,
                        fontWeight: 700,
                        textAlign: 'right',
                        // Solde vide ET diffusion en cours : la campagne
                        // s'arrêtera à la prochaine clôture. C'est une alerte.
                        color: c.soldeFcfa <= 0 && c.campagnesActives > 0 ? '#C9302C' : 'var(--color-text-primary)',
                      }}
                      title={
                        c.soldeFcfa <= 0 && c.campagnesActives > 0
                          ? 'Solde épuisé alors que des campagnes diffusent : la clôture du mois laissera une facture impayée.'
                          : undefined
                      }
                    >
                      {c.soldeFcfa.toLocaleString('fr-FR')} F
                    </td>
                    <td className="px-4 py-3" style={{ textAlign: 'right' }}>
                      <button
                        className="btn-secondary flex items-center gap-1.5"
                        style={{ fontSize: 12, marginLeft: 'auto' }}
                        disabled={enCours}
                        // Préremplit l'UID : c'est tout l'intérêt de la liste,
                        // plus aucun identifiant technique à recopier.
                        onClick={() => {
                          setTopup({ ownerUid: c.uid, montant: '', canal: 'orange-money', reference: '' });
                          setModaleTopup(true);
                        }}
                      >
                        <CreditCard size={13} /> Créditer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ Crédit de solde — geste délibéré, avec récapitulatif ═══ */}
      {modaleTopup && (
        <Modal
          open
          onClose={() => setModaleTopup(false)}
          title="Créditer un compte annonceur"
          maxWidth="480px"
        >
          <div className="flex flex-col gap-3">
            <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              Le paiement a déjà été reçu hors plateforme. Ce geste ne fait que{' '}
              <strong>constater l’encaissement</strong> et créditer le solde — il est immédiat et
              ne peut pas être annulé depuis cet écran.
            </p>

            <div>
              <label className="label">UID du compte annonceur</label>
              <input
                className="input-field"
                placeholder="Identifiant Firebase du compte"
                value={topup.ownerUid}
                onChange={(e) => setTopup({ ...topup, ownerUid: e.target.value })}
              />
            </div>

            <div className="flex gap-2">
              <div style={{ flex: 1 }}>
                <label className="label">Montant (FCFA)</label>
                <input
                  className="input-field"
                  type="number"
                  placeholder="500000"
                  value={topup.montant}
                  onChange={(e) => setTopup({ ...topup, montant: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Moyen</label>
                <select
                  className="input-field"
                  value={topup.canal}
                  onChange={(e) => setTopup({ ...topup, canal: e.target.value })}
                >
                  <option value="orange-money">Orange Money</option>
                  <option value="wave">Wave</option>
                  <option value="virement">Virement</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label">Référence du paiement</label>
              <input
                className="input-field"
                placeholder="Référence de la transaction"
                value={topup.reference}
                onChange={(e) => setTopup({ ...topup, reference: e.target.value })}
              />
            </div>

            {/* Récapitulatif : une erreur de montant sur un solde ne se rattrape pas. */}
            {!!Number(topup.montant) && !!topup.ownerUid.trim() && (
              <p
                style={{
                  fontSize: 12.5,
                  color: 'var(--color-text-secondary)',
                  background: 'rgba(245,166,35,0.1)',
                  border: '1px solid rgba(245,166,35,0.3)',
                  borderRadius: 10,
                  padding: '11px 13px',
                  lineHeight: 1.55,
                }}
              >
                Vous allez créditer{' '}
                <strong style={{ color: 'var(--color-text-primary)' }}>
                  {Number(topup.montant).toLocaleString('fr-FR')} FCFA
                </strong>{' '}
                sur le compte{' '}
                {/* Le NOM quand on le connaît : relire un UID ne permet à
                    personne de vérifier qu'on crédite le bon annonceur. */}
                <strong style={{ color: 'var(--color-text-primary)' }}>
                  {comptes.find((c) => c.uid === topup.ownerUid.trim())?.nom ?? topup.ownerUid.trim()}
                </strong>
                .
              </p>
            )}

            <div className="flex items-center justify-end gap-3">
              <button className="btn-secondary" onClick={() => setModaleTopup(false)} disabled={enCours}>
                Annuler
              </button>
              <button
                className="btn-primary"
                style={{ fontFamily: 'inherit', fontWeight: 700 }}
                disabled={enCours || !topup.ownerUid.trim() || !Number(topup.montant)}
                onClick={() =>
                  void appeler(
                    {
                      action: 'topup',
                      ownerUid: topup.ownerUid.trim(),
                      montant: Number(topup.montant),
                      canal: topup.canal,
                      reference: topup.reference.trim(),
                    },
                    'Solde crédité.'
                  ).then(() => {
                    setTopup({ ownerUid: '', montant: '', canal: 'orange-money', reference: '' });
                    setModaleTopup(false);
                  })
                }
              >
                {enCours ? 'Crédit…' : 'Créditer le solde'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/**
 * Demandes d'inscription annonceur / partenaire (plan I5) — la direction
 * traite les enseignants depuis SON écran ; ici, seules les demandes qui
 * relèvent de CONCREE. L'approbation pose le périmètre (éditions, partnerId).
 */
function DemandesInscription() {
  const [demandes, setDemandes] = useState<Array<{ uid: string; type: string; displayName: string; email: string; orgName: string }>>([]);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [perimetre, setPerimetre] = useState<Record<string, string>>({});

  const charger = useCallback(async () => {
    const snap = await getDocs(
      query(collection(firestore, COLLECTIONS.signupRequests), where('status', '==', 'pending'))
    );
    setDemandes(
      snap.docs
        .map((d) => ({
          uid: d.id,
          type: (d.data().type as string) ?? '',
          displayName: (d.data().displayName as string) ?? '',
          email: (d.data().email as string) ?? '',
          orgName: (d.data().orgName as string) ?? '',
        }))
        // Les enseignants relèvent de leur direction ; tout le reste — dont les
        // ÉTABLISSEMENTS sans code de licence — relève de CONCREE, ici.
        .filter((d) => d.type === 'sponsor' || d.type === 'partner' || d.type === 'establishment')
    );
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const decider = async (dm: (typeof demandes)[number], decision: 'approve' | 'reject') => {
    setEnCours(dm.uid);
    try {
      const saisie = (perimetre[dm.uid] ?? '').trim();
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/inscription/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          uid: dm.uid,
          decision,
          motif: decision === 'reject' ? saisie || 'Demande refusée par CONCREE.' : undefined,
          editionIds: dm.type === 'sponsor' && saisie ? saisie.split(',').map((x) => x.trim()).filter(Boolean) : [],
          partnerId: dm.type === 'partner' ? saisie : undefined,
          // Établissement : identifiant souhaité (facultatif — sinon slug du nom).
          establishmentId: dm.type === 'establishment' && decision === 'approve' ? saisie : undefined,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok || json.error) throw new Error(json.error || 'Décision impossible.');
      toast.success(decision === 'approve' ? 'Compte activé.' : 'Demande refusée.');
      await charger();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Décision impossible.');
    } finally {
      setEnCours(null);
    }
  };

  if (demandes.length === 0) return null;

  return (
    <div className="glass-card" style={{ padding: '16px 18px', margin: '18px 0' }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>
        Demandes d'inscription ({demandes.length})
      </h2>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 10 }}>
        Auto-inscriptions qui relèvent de CONCREE. Pour approuver : éditions (annonceur, séparées
        par des virgules — vide accepté), partnerId (partenaire, requis) ou identifiant souhaité
        (établissement, facultatif). Approuver un établissement crée sa fiche avec des quotas
        prudents (5 enseignants · 150 élèves), à ajuster ensuite. Le champ sert de motif en cas de
        refus.
      </p>
      <div className="flex flex-col gap-2">
        {demandes.map((dm) => (
          <div key={dm.uid} className="flex items-center justify-between gap-3 flex-wrap" style={{ border: '1px solid var(--color-card-border)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {dm.orgName || dm.displayName}
                <span className="badge badge-info" style={{ marginLeft: 8 }}>
                  {dm.type === 'sponsor' ? 'Annonceur' : dm.type === 'partner' ? 'Partenaire' : 'Établissement'}
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{dm.displayName} · {dm.email}</div>
            </div>
            <div className="flex items-center gap-2">
              <input
                className="input-field"
                placeholder={
                  dm.type === 'sponsor'
                    ? 'éditions (a,b) / motif'
                    : dm.type === 'partner'
                      ? 'partnerId / motif'
                      : 'identifiant (ex. lycee-hann) / motif'
                }
                value={perimetre[dm.uid] ?? ''}
                onChange={(e) => setPerimetre((prev) => ({ ...prev, [dm.uid]: e.target.value }))}
                style={{ width: 200, fontSize: 12 }}
              />
              <button className="btn-primary" style={{ fontSize: 12 }} disabled={enCours === dm.uid} onClick={() => void decider(dm, 'approve')}>
                Activer
              </button>
              <button className="btn-secondary" style={{ fontSize: 12 }} disabled={enCours === dm.uid} onClick={() => void decider(dm, 'reject')}>
                Refuser
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Une campagne en attente : aperçu joueur + décision motivée. */
function CarteModeration({
  campagne,
  enCours,
  onDecision,
}: {
  campagne: Campaign;
  enCours: boolean;
  onDecision: (id: string, d: Decision, motif?: string) => Promise<void>;
}) {
  const [motif, setMotif] = useState('');
  const [refusOuvert, setRefusOuvert] = useState(false);

  const age = campagne.submittedAt ? Date.now() - campagne.submittedAt : 0;
  const horsSla = age > SLA_MS;
  const ageHeures = Math.round(age / 3600000);

  return (
    <div className="glass-card" style={{ padding: '16px 18px' }}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Aperçu exact */}
        <div>
          {campagne.format === 'card' && campagne.card ? (
            <ApercuCarteCampagne card={campagne.card} />
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              <strong>Écran sponsor — édition {campagne.editionSkin?.editionId}</strong>
              <br />« {campagne.editionSkin?.shortText} »
              <br />
              Mois réservés : {campagne.reservationMonths?.join(', ') || '—'}
            </div>
          )}
        </div>

        {/* Dossier */}
        <div style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
          <div><strong>Structure :</strong> {campagne.card?.structure || campagne.editionSkin?.structure || '—'}</div>
          <div><strong>Compte :</strong> {campagne.ownerEmail ?? campagne.ownerUid}</div>
          <div>
            <strong>Destination :</strong>{' '}
            {(() => {
              const url = campagne.card?.cta?.url || campagne.editionSkin?.linkUrl;
              return url ? (
                <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary)' }}>
                  {url.length > 42 ? `${url.slice(0, 39)}…` : url}
                </a>
              ) : '—';
            })()}
          </div>
          <div>
            <strong>Objectif :</strong> {campagne.viewsGoal.toLocaleString('fr-FR')} vues ·
            plafond {campagne.budgetCapFcfa.toLocaleString('fr-FR')} FCFA
          </div>
          <div>
            <strong>Grille :</strong> {campagne.pricing.perView} F/vue · {campagne.pricing.perClick} F/clic
          </div>
          <div style={{ color: horsSla ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
            <strong>Soumise il y a {ageHeures} h</strong>
            {horsSla ? ' — SLA 48 h dépassé' : ''}
          </div>
        </div>

        {/* Décision */}
        <div className="flex flex-col gap-2">
          <button
            className="btn-primary flex items-center justify-center gap-2"
            style={{ fontSize: 13, opacity: enCours ? 0.6 : 1 }}
            disabled={enCours}
            onClick={() => void onDecision(campagne.id, 'activate')}
          >
            <CheckCircle2 size={14} /> Valider et diffuser
          </button>
          {!refusOuvert ? (
            <button
              className="btn-secondary flex items-center justify-center gap-2"
              style={{ fontSize: 13 }}
              disabled={enCours}
              onClick={() => setRefusOuvert(true)}
            >
              <XCircle size={14} /> Refuser…
            </button>
          ) : (
            <>
              <textarea
                className="input-field"
                rows={3}
                placeholder="Motif précis + reformulation proposée (ex. « Ton publicitaire — proposez : Vous bénéficiez de… »)"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <button
                  className="btn-secondary"
                  style={{ fontSize: 12.5, flex: 1 }}
                  onClick={() => setRefusOuvert(false)}
                >
                  Annuler
                </button>
                <button
                  className="btn-primary"
                  style={{ fontSize: 12.5, flex: 1, opacity: motif.trim() && !enCours ? 1 : 0.5 }}
                  disabled={!motif.trim() || enCours}
                  onClick={() => void onDecision(campagne.id, 'reject', motif.trim())}
                >
                  Envoyer le refus
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
