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
import { collection, getDocs, query, where } from 'firebase/firestore';
import { CheckCircle2, Pause, Play, ShieldCheck, StopCircle, Wrench, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth, firestore, COLLECTIONS } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import type { Campaign } from '@/types';
import ApercuCarteCampagne from '@/components/annonceur/ApercuCarteCampagne';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';

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

export default function ModerationPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const [enAttente, setEnAttente] = useState<Campaign[]>([]);
  const [actives, setActives] = useState<Campaign[]>([]);
  const [chargement, setChargement] = useState(true);
  const [actionSur, setActionSur] = useState<string | null>(null);
  const [entretienEnCours, setEntretienEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [attente, act] = await Promise.all([
        chargerParStatut(['in_review']),
        chargerParStatut(['active', 'paused']),
      ]);
      setEnAttente(attente);
      setActives(act);
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
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            Modération annonceurs
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 560 }}>
            Chaque campagne est vérifiée avant diffusion — exactitude, ton, conformité du visuel et
            du lien. Engagement : réponse sous 48 h ouvrées.
          </p>
        </div>
        <button
          className="btn-secondary flex items-center gap-2"
          style={{ fontSize: 13, opacity: entretienEnCours ? 0.6 : 1 }}
          disabled={entretienEnCours}
          onClick={() => void lancerEntretien()}
        >
          <Wrench size={14} />
          {entretienEnCours ? 'Entretien en cours…' : 'Lancer l’entretien'}
        </button>
      </div>

      {/* ═══ File d'attente ═══ */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 10 }}>
        En attente de validation ({enAttente.length})
      </h2>
      {enAttente.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck size={44} />}
          title="File vide"
          description="Aucune campagne à vérifier — les soumissions des annonceurs apparaîtront ici."
        />
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

      {/* ═══ Comptes annonceurs (lot 6) ═══ */}
      <OutilsComptes />

      {/* ═══ Actives / en pause ═══ */}
      {actives.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)', margin: '18px 0 10px' }}>
            En diffusion ({actives.length})
          </h2>
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
  const [topup, setTopup] = useState({ ownerUid: '', montant: '', canal: 'orange-money', reference: '' });
  const [facturesDues, setFacturesDues] = useState<Array<{ id: string; reference: string; ownerUid: string; totalFcfa: number }>>([]);

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

  useEffect(() => {
    void chargerDues();
  }, [chargerDues]);

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
        await chargerDues();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Action impossible.');
      } finally {
        setEnCours(false);
      }
    },
    [chargerDues]
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
          <button
            className="btn-primary"
            style={{ fontSize: 12.5, opacity: enCours ? 0.6 : 1 }}
            disabled={enCours}
            onClick={() => void appeler({ action: 'cloture' }, '')}
          >
            Clôturer le mois précédent
          </button>
        </div>
        <div>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Alimentation constatée (Orange Money, Wave, virement) — crédite le solde du compte.
          </p>
          <input className="input-field" placeholder="UID du compte annonceur" value={topup.ownerUid} onChange={(e) => setTopup({ ...topup, ownerUid: e.target.value })} style={{ marginBottom: 6 }} />
          <div className="flex gap-2" style={{ marginBottom: 6 }}>
            <input className="input-field" placeholder="Montant FCFA" type="number" value={topup.montant} onChange={(e) => setTopup({ ...topup, montant: e.target.value })} />
            <select className="input-field" value={topup.canal} onChange={(e) => setTopup({ ...topup, canal: e.target.value })} style={{ width: 'auto' }}>
              <option value="orange-money">Orange Money</option>
              <option value="wave">Wave</option>
              <option value="virement">Virement</option>
            </select>
          </div>
          <input className="input-field" placeholder="Référence du paiement" value={topup.reference} onChange={(e) => setTopup({ ...topup, reference: e.target.value })} style={{ marginBottom: 6 }} />
          <button
            className="btn-secondary"
            style={{ fontSize: 12.5 }}
            disabled={enCours || !topup.ownerUid || !Number(topup.montant)}
            onClick={() =>
              void appeler(
                { action: 'topup', ownerUid: topup.ownerUid.trim(), montant: Number(topup.montant), canal: topup.canal, reference: topup.reference.trim() },
                'Solde crédité.'
              ).then(() => setTopup({ ownerUid: '', montant: '', canal: 'orange-money', reference: '' }))
            }
          >
            Créditer le compte
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
        .filter((d) => d.type === 'sponsor' || d.type === 'partner')
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
        Annonceurs et partenaires auto-inscrits. Pour approuver : éditions (annonceur, séparées par
        des virgules — vide accepté) ou partnerId (partenaire, requis). Le champ sert de motif en
        cas de refus.
      </p>
      <div className="flex flex-col gap-2">
        {demandes.map((dm) => (
          <div key={dm.uid} className="flex items-center justify-between gap-3 flex-wrap" style={{ border: '1px solid var(--color-card-border)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {dm.orgName || dm.displayName}
                <span className="badge badge-info" style={{ marginLeft: 8 }}>{dm.type === 'sponsor' ? 'Annonceur' : 'Partenaire'}</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{dm.displayName} · {dm.email}</div>
            </div>
            <div className="flex items-center gap-2">
              <input
                className="input-field"
                placeholder={dm.type === 'sponsor' ? 'éditions (a,b) / motif' : 'partnerId / motif'}
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
