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
import { collection, doc, getDoc, getDocs, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth, firestore, COLLECTIONS } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { getMesCampagnes } from '@/lib/campaign-service';
import { getSponsorDailyMetrics, jourLocal } from '@/lib/sponsor-metrics-service';
import { fcfa } from '@/lib/annonceur-service';
import {
  genererFacturePdf,
  telechargerRapport,
  type LigneFacturePdf,
} from '@/lib/annonceur-rapport-pdf';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

interface Facture {
  id: string;
  reference: string;
  period: string;
  lines: LigneFacturePdf[];
  totalFcfa: number;
  status: string;
}

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
  const [solde, setSolde] = useState<number | null>(null);
  const [billing, setBilling] = useState<Record<string, string>>({});
  const [factures, setFactures] = useState<Facture[]>([]);
  const [topUps, setTopUps] = useState<Array<{ montantFcfa: number; canal: string; reference: string; createdAt: number }>>([]);
  const [chargement, setChargement] = useState(true);

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
        const diffusees = campagnes.filter((c) => ['active', 'paused', 'ended'].includes(c.status));
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
          if (vues === 0 && clics === 0 && c.status !== 'paused') continue;
          lignes.push({
            titre: c.card?.rectoText?.slice(0, 70) || `Édition ${c.editionSkin?.editionId ?? ''}`,
            grille: `${c.pricing.perView} F/vue · ${c.pricing.perClick} F/clic${c.status === 'paused' ? ' · en pause' : ''}`,
            vues,
            clics,
            montant: vues * c.pricing.perView + clics * c.pricing.perClick,
          });
        }

        if (annule) return;
        setLignesMois(lignes);
        setSolde((compteSnap.data()?.balanceFcfa as number) ?? 0);
        setBilling((compteSnap.data()?.billingInfo as Record<string, string>) ?? {});
        setFactures(
          facturesSnap.docs
            .map((d) => ({ ...(d.data() as Omit<Facture, 'id'>), id: d.id }))
            .sort((a, b) => b.period.localeCompare(a.period))
        );
        setTopUps(
          (topUpsSnap?.docs ?? []).map((d) => d.data() as (typeof topUps)[number])
        );
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
  const autonomieJours =
    solde != null && rythmeJournalier > 0 ? Math.floor(solde / rythmeJournalier) : null;

  const telechargerFacture = useCallback(
    async (f: Facture) => {
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
      await updateDoc(doc(firestore, COLLECTIONS.advertisers, admin.uid), {
        billingInfo: billing,
        updatedAt: Date.now(),
      });
      toast.success('Informations enregistrées.');
    } catch {
      toast.error(
        'Enregistrement impossible — le compte n’a pas encore été initialisé par CONCREE (première alimentation).'
      );
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
    <div style={{ maxWidth: 1080 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>Facturation</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, marginBottom: 20, maxWidth: 520 }}>
        Vous êtes facturé à la vue et au clic réellement livrés. Chaque mois, un reçu détaillé sert
        de pièce justificative.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>Solde du compte</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>
              {solde != null ? fcfa(solde) : '—'}
            </div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)', marginTop: 8, lineHeight: 1.5 }}>
              {autonomieJours != null
                ? <>Au rythme actuel, votre solde couvre encore <strong>environ {autonomieJours} jours</strong> de diffusion.</>
                : 'L’autonomie s’affichera dès la première consommation du mois.'}
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', marginTop: 12, paddingTop: 10, fontSize: 11.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="flex justify-between"><span style={{ color: 'rgba(255,255,255,0.6)' }}>Engagé ce mois</span><strong>{fcfa(totalMois)}</strong></div>
              <div className="flex justify-between"><span style={{ color: 'rgba(255,255,255,0.6)' }}>Prochaine clôture</span><strong>1ᵉʳ du mois prochain</strong></div>
            </div>
            <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)', marginTop: 10 }}>
              Pour alimenter : Orange Money, Wave ou virement CBAO, puis référence à
              annonceurs@concree.com — le solde est crédité à réception.
            </p>
          </div>

          <Carte titre="Informations de facturation">
            {(
              [
                ['raisonSociale', 'Raison sociale'],
                ['ninea', 'NINEA'],
                ['adresse', 'Adresse'],
                ['contactCompta', 'Contact comptabilité'],
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
