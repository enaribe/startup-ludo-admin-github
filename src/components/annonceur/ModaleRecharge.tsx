'use client';

/**
 * Recharge du compte annonceur par PayDunya (Orange Money, Wave, carte…).
 *
 * Montants rapides + saisie libre : le cas courant tient en un clic, sans
 * enfermer celui qui veut créditer une somme précise correspondant à son budget.
 *
 * L'écran n'affiche AUCUN frais : ils sont absorbés par CONCREE, donc le
 * montant réglé est exactement le montant crédité. Annoncer « frais offerts »
 * attirerait l'attention sur une question que l'annonceur ne se pose pas.
 */

import { useState } from 'react';
import { CreditCard, ExternalLink, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth } from '@/lib/firebase';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';

/** Doit rester aligné sur `RECHARGE_MIN_FCFA` / `RECHARGE_RAPIDES_FCFA` (serveur). */
const MIN_FCFA = 10_000;
const RAPIDES = [25_000, 50_000, 100_000];

export default function ModaleRecharge({
  ouvert,
  onFermer,
  modeTest,
}: {
  ouvert: boolean;
  onFermer: () => void;
  /** Bac à sable : l'annonceur doit savoir qu'aucun argent réel ne circule. */
  modeTest: boolean;
}) {
  const [montant, setMontant] = useState<number>(RAPIDES[1]);
  const [saisie, setSaisie] = useState('');
  const [envoi, setEnvoi] = useState(false);

  if (!ouvert) return null;

  const montantRetenu = saisie.trim() ? Math.round(Number(saisie.replace(/\s/g, ''))) : montant;
  const valide = Number.isFinite(montantRetenu) && montantRetenu >= MIN_FCFA;

  async function lancerPaiement() {
    if (!valide || envoi) return;
    setEnvoi(true);
    try {
      const jeton = await auth.currentUser?.getIdToken();
      const reponse = await fetch('/api/annonceur/paiement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ kind: 'topup', montant: montantRetenu }),
      });
      const donnees = (await reponse.json()) as { urlPaiement?: string; error?: string };
      if (!reponse.ok || !donnees.urlPaiement) {
        toast.error(donnees.error ?? 'Le paiement n’a pas pu être ouvert.');
        setEnvoi(false);
        return;
      }
      // Redirection plutôt qu'un nouvel onglet : les bloqueurs de pop-up
      // avalent `window.open`, et l'annonceur croirait le bouton cassé.
      window.location.href = donnees.urlPaiement;
    } catch {
      toast.error('Connexion impossible. Réessayez dans un instant.');
      setEnvoi(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recharger le compte"
      onClick={onFermer}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(15,28,46,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 16, padding: 24, width: 'min(460px, 100%)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, color: NAVY }}>Recharger le compte</h2>
            <p style={{ fontSize: 12.5, color: '#5A6A7E', marginTop: 3 }}>
              Orange Money, Wave, Free Money ou carte bancaire.
            </p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#5A6A7E' }}>
            <X size={18} />
          </button>
        </div>

        {modeTest && (
          <p style={{ fontSize: 12, color: '#B87A0C', background: 'rgba(245,166,35,0.12)', padding: '8px 11px', borderRadius: 9, marginTop: 14 }}>
            Mode test : aucun paiement réel n’est effectué et aucun solde réel n’est crédité.
          </p>
        )}

        <div className="flex gap-2 flex-wrap" style={{ marginTop: 16 }}>
          {RAPIDES.map((valeur) => {
            const actif = !saisie.trim() && montant === valeur;
            return (
              <button
                key={valeur}
                type="button"
                onClick={() => { setMontant(valeur); setSaisie(''); }}
                style={{
                  flex: 1, minWidth: 108, padding: '11px 8px', borderRadius: 10, cursor: 'pointer',
                  fontSize: 13.5, fontWeight: 700,
                  border: `1.5px solid ${actif ? ORANGE : 'rgba(15,28,46,0.14)'}`,
                  background: actif ? 'rgba(245,166,35,0.10)' : '#fff',
                  color: NAVY,
                }}
              >
                {valeur.toLocaleString('fr-FR')} F
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 12 }}>
          <label className="label" htmlFor="montant-libre">Ou un autre montant</label>
          <input
            id="montant-libre"
            className="input-field"
            inputMode="numeric"
            placeholder={`Minimum ${MIN_FCFA.toLocaleString('fr-FR')} FCFA`}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value.replace(/[^\d\s]/g, ''))}
          />
          {saisie.trim() && !valide && (
            <p style={{ fontSize: 11.5, color: '#C0392B', marginTop: 4 }}>
              Le montant minimum est de {MIN_FCFA.toLocaleString('fr-FR')} FCFA.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void lancerPaiement()}
          disabled={!valide || envoi}
          className="flex items-center justify-center gap-2"
          style={{
            width: '100%', marginTop: 18, padding: '12px 16px', borderRadius: 11, border: 'none',
            background: valide && !envoi ? ORANGE : 'rgba(15,28,46,0.12)',
            color: valide && !envoi ? NAVY : '#8A97A6',
            fontWeight: 800, fontSize: 14, cursor: valide && !envoi ? 'pointer' : 'not-allowed',
          }}
        >
          {envoi ? (
            'Ouverture du paiement…'
          ) : (
            <>
              <CreditCard size={15} /> Payer {valide ? montantRetenu.toLocaleString('fr-FR') : '—'} FCFA
              <ExternalLink size={13} />
            </>
          )}
        </button>

        <p style={{ fontSize: 11, color: '#8A97A6', marginTop: 10, textAlign: 'center' }}>
          Vous allez être redirigé vers PayDunya pour régler en toute sécurité.
        </p>
      </div>
    </div>
  );
}
