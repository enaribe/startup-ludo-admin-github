'use client';

/**
 * Facturation de l'annonceur (écran 4 des maquettes — lot 6).
 *
 * Consommation du mois EN COURS calculée en direct depuis les buckets
 * quotidiens × la grille figée de chaque campagne (la clôture CONCREE figera
 * ces mêmes chiffres en facture) ; solde avec autonomie estimée ;
 * reçus/factures avec PDF ; historique des alimentations (déclaratives en
 * v1 : payées hors plateforme, saisies par CONCREE) ; informations de
 * facturation modifiables — le seul champ du compte que l'annonceur peut
 * toucher, les règles verrouillent tout le reste.
 */

import { useCallback, useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { CreditCard, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth, firestore, COLLECTIONS } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { getMesCampagnes } from '@/lib/campaign-service';
import { getSponsorDailyMetrics, jourLocal } from '@/lib/sponsor-metrics-service';
import { fcfa } from '@/lib/annonceur-service';
import {
  genererFacturePdf,
  telechargerRapport,
} from '@/lib/annonceur-rapport-pdf';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ModaleRecharge from '@/components/annonceur/ModaleRecharge';
import type { Advertiser, Invoice, TopUp } from '@/types';
import { autonomieEnJours } from '@/lib/sponsor-pricing';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';
/** Contact d'alimentation du compte — le crédit est constaté par CONCREE. */
const EMAIL_ANNONCEURS = 'annonceurs@concree.com';



interface LigneMois {
  titre: string;
  grille: string;
  vues: number;
  clics: number;
  montant: number;
}

export default function FacturationPage() {
  const { admin, loading: authLoading } = useAuth();
  const [lignesMois, setLignesMois] = useState<LigneMois[]>([]);
  /** Campagnes encore en diffusion — base des « plafonds actifs cumulés ». */
  const [campagnesActives, setCampagnesActives] = useState<Array<{ budgetCapFcfa?: number }>>([]);
  const [solde, setSolde] = useState<number | null>(null);
  const [billing, setBilling] = useState<Record<string, string>>({});
  const [factures, setFactures] = useState<Invoice[]>([]);
  const [topUps, setTopUps] = useState<TopUp[]>([]);
  const [chargement, setChargement] = useState(true);
  const [rechargeOuverte, setRechargeOuverte] = useState(false);
  /**
   * Bac à sable PayDunya. Lu depuis une variable PUBLIQUE : c'est un simple
   * bandeau d'information, jamais une décision de sécurité — le mode réel est
   * tranché côté serveur par `PAYDUNYA_MODE`.
   */
  const modeTest = process.env.NEXT_PUBLIC_PAYDUNYA_MODE !== 'live';

  /**
   * Retour depuis PayDunya. Le message reste PRUDENT : à cet instant le
   * webhook n'a peut-être pas encore été traité, et le solde affiché peut donc
   * être l'ancien. Annoncer « compte crédité » alors que l'écran montre le
   * solde d'avant ferait croire à une perte d'argent.
   */
  useEffect(() => {
    const etat = new URLSearchParams(window.location.search).get('paiement');
    if (!etat) return;
    if (etat === 'retour') {
      toast.success('Paiement enregistré. Votre solde est mis à jour dès sa confirmation (quelques instants).');
    } else if (etat === 'annule') {
      toast('Paiement annulé — aucun montant n’a été débité.');
    }
    // L'URL est nettoyée pour qu'un rafraîchissement ne rejoue pas le message.
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  useEffect(() => {
    if (authLoading || !admin) return;
    let annule = false;
    (async () => {
      try {
        const moisCourant = jourLocal(0).slice(0, 7);
        const [campagnes, compteSnap, facturesSnap, topUpsSnap] = await Promise.all([
          getMesCampagnes().catch(() => []),
          getDoc(doc(firestore, COLLECTIONS.advertisers, admin.uid)),
          getDocs(
            query(collection(firestore, COLLECTIONS.invoices), where('ownerUid', '==', admin.uid))
          ),
          getDocs(
            query(
              collection(firestore, COLLECTIONS.advertisers, admin.uid, 'topUps'),
              orderBy('createdAt', 'desc')
            )
          ).catch(() => null),
        ]);

        // Consommation du mois en cours, campagne par campagne.
        const lignes: LigneMois[] = [];
        // `suspended` incluse : une campagne arrêtée pour plafond ou solde a
        // consommé jusqu'à son arrêt, et cette consommation est facturée. La
        // masquer ici ferait apparaître sur la facture une ligne absente de
        // l'écran qui l'annonce.
        const diffusees = campagnes.filter((c) =>
          ['active', 'paused', 'ended', 'suspended'].includes(c.status)
        );
        // Seules les campagnes ENCORE en diffusion portent un engagement futur :
        // une campagne terminée a déjà tout consommé, son plafond ne dit plus rien.
        setCampagnesActives(campagnes.filter((c) => c.status === 'active'));
        for (const c of diffusees) {
          const jours = new Date().getDate();
          const serie = await getSponsorDailyMetrics(c.id, jours);
          let vues = 0;
          let clics = 0;
          for (const j of serie) {
            if (j.date.startsWith(moisCourant)) {
              vues += j.totals.views;
              clics += j.totals.clicks;
            }
          }
          // Une campagne à zéro consommation est masquée, SAUF si elle est en
          // pause ou suspendue : dans ces deux cas l'annonceur doit voir la
          // ligne pour comprendre pourquoi elle ne consomme rien.
          const arretee = c.status === 'paused' || c.status === 'suspended';
          if (vues === 0 && clics === 0 && !arretee) continue;
          lignes.push({
            titre: c.card?.rectoText?.slice(0, 70) || `Édition ${c.editionSkin?.editionId ?? ''}`,
            grille: `${c.pricing.perView} F/vue · ${c.pricing.perClick} F/clic${c.status === 'paused' ? ' · en pause' : c.status === 'suspended' ? ' · suspendue' : ''}`,
            vues,
            clics,
            montant: vues * c.pricing.perView + clics * c.pricing.perClick,
          });
        }

        if (annule) return;
        setLignesMois(lignes);
        const compte = compteSnap.data() as Advertiser | undefined;
        setSolde(compte?.balanceFcfa ?? 0);
        setBilling(compte?.billingInfo ?? {});
        setFactures(
          facturesSnap.docs
            .map((d) => ({ ...(d.data() as Omit<Invoice, 'id'>), id: d.id }))
            .sort((a, b) => b.period.localeCompare(a.period))
        );
        setTopUps((topUpsSnap?.docs ?? []).map((d) => d.data() as TopUp));
      } catch (error) {
        console.error('Chargement facturation :', error);
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, admin]);

  const totalMois = lignesMois.reduce((s, l) => s + l.montant, 0);
  const joursEcoules = new Date().getDate();
  const rythmeJournalier = joursEcoules > 0 ? totalMois / joursEcoules : 0;
  /**
   * Solde DISPONIBLE — calculé ici, jamais stocké.
   *
   * Le solde en base ne bouge qu'à la clôture : `balanceFcfa` reste donc
   * intact tout le mois alors que la diffusion consomme. La soustraction se
   * fait à l'affichage, à partir des buckets déjà chargés pour la ligne
   * « Engagé ce mois » — aucune écriture supplémentaire, et pas de champ
   * dérivé qui pourrait diverger de la réalité.
   */
  const soldeDisponible = solde != null ? solde - totalMois : null;

  // L'autonomie se calcule sur ce qui reste VRAIMENT : sur le solde brut, elle
  // annonçait des jours de diffusion déjà consommés.
  const autonomieJours = autonomieEnJours({
    soldeFcfa: soldeDisponible,
    consommationFcfa: totalMois,
    fenetreJours: joursEcoules,
  });

  /**
   * Projection de la consommation sur 30 jours au rythme observé.
   * `null` tant qu'aucune consommation n'a eu lieu : une prévision fondée sur
   * zéro jour de données serait une invention.
   */
  const consommationPrevue = rythmeJournalier > 0 ? Math.round(rythmeJournalier * 30) : null;

  /**
   * Somme des budgets plafonds des campagnes en cours — l'engagement maximal
   * si toutes allaient à leur terme. Zéro si aucune campagne ne porte de
   * plafond : la ligne est alors masquée plutôt qu'affichée à « 0 F », qui se
   * lirait comme « aucun budget » au lieu de « pas de plafond défini ».
   */
  const plafondsActifs = campagnesActives.reduce((somme, c) => somme + (c.budgetCapFcfa ?? 0), 0);

  /** « août 2026 » — période des lignes non encore clôturées, pour l'export. */
  const moisCourantLisible = new Date().toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  /** Premier jour du mois prochain — la date réelle de la clôture. */
  const prochaineCloture = (() => {
    const d = new Date();
    const cloture = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    return `1ᵉʳ ${cloture.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
  })();

  /**
   * Export comptable CSV — le mois en cours ligne à ligne, puis l'historique
   * des factures. Pas de PDF ici : un comptable veut un fichier qu'il ouvre
   * dans son tableur, pas une mise en page.
   *
   * Chaque cellule est encadrée de guillemets et ses guillemets internes
   * doublés : un nom de campagne contenant une virgule ne décale donc pas les
   * colonnes (même patron que l'export CSV du Mode Classe).
   */
  const exporterComptable = useCallback(() => {
    const echapper = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lignes: string[][] = [
      ['Type', 'Référence / Mise en visibilité', 'Période', 'Vues', 'Clics', 'Montant FCFA', 'Statut'],
      ...lignesMois.map((l) => [
        'Consommation en cours',
        l.titre,
        moisCourantLisible,
        String(l.vues),
        String(l.clics),
        String(l.montant),
        'non clôturé',
      ]),
      ...factures.map((f) => [
        'Facture',
        f.reference,
        f.period,
        '',
        '',
        String(f.totalFcfa),
        f.status,
      ]),
    ];

    const csv = lignes.map((r) => r.map(echapper).join(',')).join('\n');
    // BOM UTF-8 : sans lui, Excel affiche « FranÃ§ais » sur les accents.
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturation-startup-ludo-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [lignesMois, factures, moisCourantLisible]);

  const telechargerFacture = useCallback(
    async (f: Invoice) => {
      try {
        const octets = await genererFacturePdf({
          reference: f.reference,
          period: f.period,
          raisonSociale: billing.raisonSociale,
          ninea: billing.ninea,
          lines: f.lines,
          totalFcfa: f.totalFcfa,
          status: f.status,
        });
        telechargerRapport(octets, `${f.reference}.pdf`);
      } catch {
        toast.error('Export impossible.');
      }
    },
    [billing]
  );

  const enregistrerBilling = useCallback(async () => {
    if (!admin || !auth.currentUser) return;
    try {
      // `setDoc(merge)` et non `updateDoc` : le document `advertisers/{uid}`
      // n'existe pas tant que CONCREE n'a pas crédité le compte, et `updateDoc`
      // échoue sur un document absent. L'annonceur doit pouvoir renseigner sa
      // facturation AVANT de payer — c'est l'ordre naturel.
      //
      // `merge` protège le solde : si le document existe déjà, seuls les champs
      // passés ici sont réécrits.
      //
      // ⚠️ `createdAt` UNIQUEMENT à la création. Avec `merge`, l'envoyer à
      // chaque enregistrement réécrirait la date de création à chaque clic —
      // et surtout, la règle d'UPDATE n'autorise que `billingInfo` et
      // `updatedAt` : le joindre ferait échouer toutes les modifications
      // suivantes.
      const ref = doc(firestore, COLLECTIONS.advertisers, admin.uid);
      const existe = (await getDoc(ref)).exists();
      await setDoc(
        ref,
        {
          billingInfo: billing,
          updatedAt: Date.now(),
          ...(existe ? {} : { createdAt: Date.now() }),
        },
        { merge: true }
      );
      toast.success('Informations enregistrées.');
    } catch (error) {
      console.error('Enregistrement des informations de facturation :', error);
      toast.error('Enregistrement impossible. Réessayez, ou écrivez-nous si cela persiste.');
    }
  }, [admin, billing]);

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1320 }}>
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>Facturation</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 520 }}>
            Vous êtes facturé à la vue et au clic réellement livrés. Chaque mois, un reçu détaillé
            sert de pièce justificative.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap" style={{ flexShrink: 0 }}>
          <button
            type="button"
            className="btn-secondary flex items-center gap-2"
            onClick={exporterComptable}
            disabled={lignesMois.length === 0 && factures.length === 0}
            title="Toutes les lignes du mois en cours et l’historique des factures, au format CSV"
            style={{ fontSize: 13 }}
          >
            <Download size={14} /> Export comptable
          </button>
          <button
            type="button"
            onClick={() => setRechargeOuverte(true)}
            className="btn-primary flex items-center gap-2"
            style={{ fontSize: 13 }}
          >
            <CreditCard size={14} /> Recharger le compte
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* ===== Consommation du mois ===== */}
          <Carte titre="Consommation du mois en cours" sous={`1ᵉʳ → ${new Date().toLocaleDateString('fr-FR')} · campagnes du nouveau modèle`}>
            {lignesMois.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                Aucune consommation ce mois-ci.
              </p>
            ) : (
              <>
                {lignesMois.map((l, i) => (
                  <div key={i} className="flex items-center justify-between gap-3" style={{ padding: '8px 0', borderBottom: '1px solid var(--color-card-border)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 320 }}>{l.titre}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{l.grille}</div>
                    </div>
                    <div className="flex items-center gap-4" style={{ flexShrink: 0, fontSize: 12.5 }}>
                      <span>{l.vues.toLocaleString('fr-FR')} vues</span>
                      <span>{l.clics.toLocaleString('fr-FR')} clics</span>
                      <strong style={{ color: NAVY, minWidth: 90, textAlign: 'right' }}>{fcfa(l.montant)}</strong>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between" style={{ paddingTop: 10 }}>
                  <strong style={{ fontSize: 13.5, color: NAVY }}>Total à ce jour</strong>
                  <strong style={{ fontSize: 15, color: NAVY }}>{fcfa(totalMois)}</strong>
                </div>
              </>
            )}
            <p style={{ fontSize: 11.5, color: '#B87A0C', background: 'rgba(245,166,35,0.08)', borderRadius: 8, padding: '8px 12px', marginTop: 10 }}>
              Le montant n’est prélevé sur votre solde qu’à la clôture du mois. Aucune vue non
              livrée n’est facturée.
            </p>
          </Carte>

          {/* ===== Factures ===== */}
          <Carte titre="Reçus et factures" sous="Pièces justificatives téléchargeables, avec le détail par mise en visibilité.">
            {factures.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                Votre première facture apparaîtra à la clôture du mois.
              </p>
            ) : (
              factures.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-3" style={{ padding: '9px 0', borderBottom: '1px solid var(--color-card-border)' }}>
                  <div>
                    <strong style={{ fontSize: 13, color: NAVY }}>{f.reference}</strong>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)', marginLeft: 10 }}>{f.period}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span style={{ fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: f.status === 'paid' ? 'rgba(46,160,67,0.12)' : 'rgba(245,166,35,0.15)', color: f.status === 'paid' ? '#2EA043' : '#B87A0C' }}>
                      {f.status === 'paid' ? 'Payée' : 'En cours'}
                    </span>
                    <strong style={{ fontSize: 13, color: NAVY }}>{fcfa(f.totalFcfa)}</strong>
                    <button
                      type="button"
                      onClick={() => void telechargerFacture(f)}
                      className="flex items-center gap-1.5"
                      style={{ fontSize: 12, color: NAVY, border: '1px solid var(--color-card-border)', borderRadius: 8, padding: '4px 10px', background: '#FFF', cursor: 'pointer' }}
                    >
                      <Download size={12} /> PDF
                    </button>
                  </div>
                </div>
              ))
            )}
          </Carte>

          {/* ===== Alimentations ===== */}
          <Carte titre="Alimentations du compte" sous="Orange Money, Wave ou virement — constatées par CONCREE à réception.">
            {topUps.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>Aucune alimentation pour l’instant.</p>
            ) : (
              topUps.map((tu, i) => (
                <div key={i} className="flex items-center justify-between" style={{ padding: '7px 0', fontSize: 12.5, borderBottom: '1px solid var(--color-card-border)' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {new Date(tu.createdAt).toLocaleDateString('fr-FR')} · {tu.canal}
                    {tu.reference ? ` · ${tu.reference}` : ''}
                  </span>
                  <strong style={{ color: '#2EA043' }}>+{fcfa(tu.montantFcfa)}</strong>
                </div>
              ))
            )}
          </Carte>
        </div>

        {/* ===== Colonne droite : solde + infos ===== */}
        <div className="flex flex-col gap-4">
          <div style={{ background: NAVY, borderRadius: 14, padding: '18px 18px', color: '#FFF' }}>
            {/*
              * CE QUI RESTE, pas ce qui a été versé.
              *
              * Le grand chiffre montrait `balanceFcfa`, qui ne bouge qu'à la
              * clôture : l'annonceur voyait « 30 000 FCFA » immuable pendant
              * que sa diffusion consommait, et en concluait qu'elle ne coûtait
              * rien. Or « Solde » se lit « ce qu'il me reste ».
              *
              * On montre donc le disponible — solde moins l'engagé du mois,
              * calculé à l'affichage — et le versé passe en second plan. La
              * facturation ne change pas : le prélèvement reste une écriture
              * unique à la clôture.
              */}
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>Solde disponible</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>
              {soldeDisponible != null ? fcfa(soldeDisponible) : '—'}
            </div>
            {solde != null && totalMois > 0 && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
                {fcfa(solde)} versés − {fcfa(totalMois)} consommés ce mois
              </div>
            )}
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)', marginTop: 8, lineHeight: 1.5 }}>
              {autonomieJours != null
                ? <>Au rythme actuel, votre solde couvre encore <strong>environ {autonomieJours} jours</strong> de diffusion.</>
                : 'L’autonomie s’affichera dès la première consommation du mois.'}
            </div>
            {/*
              JAUGE DE CONSOMMATION PRÉVUE — projection du mois complet au
              rythme observé, rapportée au solde. Elle répond à la seule
              question qui compte pour l'annonceur : « est-ce que je tiens
              jusqu'à la clôture ? ». Elle n'apparaît que si le rythme est
              mesurable, sinon elle afficherait une prévision sortie de nulle part.
            */}
            {consommationPrevue != null && soldeDisponible != null && soldeDisponible > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.15)', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, (consommationPrevue / soldeDisponible) * 100)}%`,
                      height: '100%',
                      borderRadius: 3,
                      // Rouge au-delà du DISPONIBLE : comparer au versé
                      // repoussait l'alerte, puisque l'engagé du mois était
                      // compté deux fois — une fois dans la projection, une
                      // fois dans le solde qui ne l'avait pas encore déduit.
                      background: consommationPrevue > soldeDisponible ? '#E5644E' : ORANGE,
                    }}
                  />
                </div>
                <div className="flex justify-between" style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
                  <span>Consommation prévue · 30 j : {fcfa(consommationPrevue)}</span>
                  <span>{Math.round((consommationPrevue / soldeDisponible) * 100)} %</span>
                </div>
              </div>
            )}

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', marginTop: 12, paddingTop: 10, fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="flex justify-between"><span style={{ color: 'rgba(255,255,255,0.6)' }}>Engagé ce mois</span><strong>{fcfa(totalMois)}</strong></div>
              {/*
                * SOLDE APRÈS CLÔTURE — le lien entre les deux lignes du dessus.
                *
                * « Solde 30 000 » et « Engagé 250 » se lisaient comme deux
                * chiffres indépendants : rien ne disait que le second serait
                * retiré du premier. La consommation n'est prélevée qu'à la
                * clôture (spec §6), donc le solde ne bouge pas pendant le mois
                * — ce qui donne l'impression que la diffusion est gratuite.
                *
                * Affiché seulement s'il y a quelque chose d'engagé : sinon la
                * ligne répéterait le solde et n'apprendrait rien.
                */}
              {/* « Solde après clôture » a disparu : c'est désormais le grand
                  chiffre du haut. La répéter ici aurait fait douter qu'il
                  s'agisse du même montant. */}
              {plafondsActifs > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: 'rgba(255,255,255,0.6)' }} title="Somme des budgets plafonds de vos mises en visibilité actives — ce que vous pourriez engager au maximum si elles allaient toutes à leur terme.">
                    Plafonds actifs cumulés
                  </span>
                  <strong>{fcfa(plafondsActifs)}</strong>
                </div>
              )}
              <div className="flex justify-between"><span style={{ color: 'rgba(255,255,255,0.6)' }}>Prochaine clôture</span><strong>{prochaineCloture}</strong></div>
            </div>
            <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', marginTop: 10 }}>
              Rechargez en ligne par Orange Money, Wave, Free Money ou carte —
              le solde est crédité dès confirmation du paiement. Virement
              bancaire possible : écrivez à {EMAIL_ANNONCEURS}.
            </p>
          </div>

          <Carte titre="Informations de facturation">
            {(
              [
                ['raisonSociale', 'Raison sociale'],
                ['ninea', 'NINEA'],
                ['adresse', 'Adresse'],
                ['contactCompta', 'Contact comptabilité'],
                // Destinataire des alertes de solde bas. Sans lui, l'alerte
                // retombe sur l'e-mail du compte — mais la comptabilité n'est
                // pas toujours la personne qui s'est inscrite.
                ['email', 'E-mail de facturation'],
              ] as const
            ).map(([cle, libelle]) => (
              <div key={cle} style={{ marginBottom: 8 }}>
                <label className="label">{libelle}</label>
                <input
                  className="input-field"
                  value={billing[cle] ?? ''}
                  onChange={(e) => setBilling((prev) => ({ ...prev, [cle]: e.target.value }))}
                />
              </div>
            ))}
            <button
              type="button"
              onClick={() => void enregistrerBilling()}
              style={{ background: ORANGE, color: NAVY, fontWeight: 700, fontSize: 12.5, padding: '8px 14px', borderRadius: 10, border: 'none', cursor: 'pointer', marginTop: 4 }}
            >
              Enregistrer
            </button>
          </Carte>
        </div>
      </div>

      <ModaleRecharge
        ouvert={rechargeOuverte}
        onFermer={() => setRechargeOuverte(false)}
        modeTest={modeTest}
      />
    </div>
  );
}

function Carte({ titre, sous, children }: { titre: string; sous?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid var(--color-card-border)', borderRadius: 14, padding: '16px 18px' }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: sous ? 2 : 10 }}>{titre}</h2>
      {sous && <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 10 }}>{sous}</p>}
      {children}
    </div>
  );
}
