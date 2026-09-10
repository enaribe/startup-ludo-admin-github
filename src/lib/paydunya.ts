/**
 * Passerelle de paiement PAYDUNYA — agrégateur Orange Money / Wave / Free
 * Money / Wizall / cartes, en une seule intégration (lot B, § PLAN-PAIEMENTS).
 *
 * MODULE SERVEUR UNIQUEMENT. Les clés ne doivent jamais atteindre le client :
 * aucun `NEXT_PUBLIC_`, aucun import depuis un composant.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AVERTISSEMENT DE SÉCURITÉ — À LIRE AVANT DE TOUCHER À L'IPN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Le `hash` que PayDunya place dans son callback est `sha512(master_key)` :
 * une CONSTANTE, identique pour tous les webhooks de ce compte. Ce n'est PAS
 * une signature du contenu — il ne couvre ni le montant, ni le token, ni rien
 * d'autre.
 *
 * Conséquence directe : ce hash prouve seulement que l'émetteur connaît la
 * master key. Il ne prouve EN AUCUN CAS que le montant reçu est authentique.
 * Quiconque observe un seul callback peut en rejouer un autre avec le montant
 * de son choix et le même hash valide.
 *
 * C'est pourquoi `confirmerFacture()` (appel serveur → serveur, authentifié
 * par les trois clés) est OBLIGATOIRE avant tout crédit, et pourquoi le
 * montant du callback est purement indicatif. Créditer sur la foi du corps du
 * webhook reviendrait à publier un formulaire de création d'argent.
 *
 * Variables d'environnement :
 *   PAYDUNYA_MASTER_KEY    clé maître du compte
 *   PAYDUNYA_PRIVATE_KEY   clé privée (test ou live selon PAYDUNYA_MODE)
 *   PAYDUNYA_TOKEN         jeton du compte
 *   PAYDUNYA_MODE          « test » (défaut) ou « live »
 *   PAYDUNYA_STORE_NAME    nom affiché sur la page de paiement
 *   NEXT_PUBLIC_APP_URL    base des URL de retour (ex. https://admin.concree.com)
 *
 * Sans clés, le module ne no-ope PAS : contrairement à l'e-mail, un paiement
 * silencieusement ignoré laisserait un annonceur croire qu'il a payé. Toute
 * fonction lève une erreur explicite.
 */

/** Mode courant. `test` par défaut : on ne bascule en production que délibérément. */
const MODE = process.env.PAYDUNYA_MODE === 'live' ? 'live' : 'test';

/**
 * Base de l'API. Le sandbox n'est pas un sous-domaine mais un préfixe de
 * chemin — une confusion classique qui produit des 404 silencieux.
 */
const BASE =
  MODE === 'live'
    ? 'https://app.paydunya.com/api/v1'
    : 'https://app.paydunya.com/sandbox-api/v1';

/** Le mode est-il le bac à sable ? Affiché à l'écran pour éviter les faux paiements. */
export const EN_MODE_TEST = MODE === 'test';

/** Montant minimum d'une recharge, en FCFA (décision produit). */
export const RECHARGE_MIN_FCFA = 10_000;

/** Montants proposés en un clic sur l'écran de facturation. */
export const RECHARGE_RAPIDES_FCFA = [25_000, 50_000, 100_000];

/**
 * FRAIS PAYDUNYA : ABSORBÉS PAR CONCREE (décision produit).
 * L'annonceur qui règle 100 000 F voit 100 000 F crédités ; la commission est
 * une charge d'exploitation, elle n'ampute pas le solde. Aucun calcul de frais
 * n'apparaît donc dans le crédit — et c'est volontaire, pas un oubli.
 */
export const FRAIS_ABSORBES = true;

function cles(): { master: string; privee: string; token: string } {
  const master = process.env.PAYDUNYA_MASTER_KEY;
  const privee = process.env.PAYDUNYA_PRIVATE_KEY;
  const token = process.env.PAYDUNYA_TOKEN;
  if (!master || !privee || !token) {
    throw new Error(
      'PayDunya non configuré : PAYDUNYA_MASTER_KEY, PAYDUNYA_PRIVATE_KEY et PAYDUNYA_TOKEN sont requises.'
    );
  }
  return { master, privee, token };
}

/** Le module est-il utilisable ? Permet à l'UI de masquer la recharge proprement. */
export function paydunyaConfigure(): boolean {
  return Boolean(
    process.env.PAYDUNYA_MASTER_KEY &&
      process.env.PAYDUNYA_PRIVATE_KEY &&
      process.env.PAYDUNYA_TOKEN
  );
}

function entetes(): Record<string, string> {
  const { master, privee, token } = cles();
  return {
    'Content-Type': 'application/json',
    'PAYDUNYA-MASTER-KEY': master,
    'PAYDUNYA-PRIVATE-KEY': privee,
    'PAYDUNYA-TOKEN': token,
  };
}

/** Statuts renvoyés par PayDunya sur une facture. */
export type StatutPaydunya = 'completed' | 'pending' | 'cancelled' | 'failed';

/** Normalise les variantes d'orthographe rencontrées selon les endpoints. */
function normaliserStatut(brut: unknown): StatutPaydunya {
  const s = String(brut ?? '').toLowerCase();
  if (s === 'completed') return 'completed';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'failed' || s === 'fail') return 'failed';
  return 'pending';
}

export interface FactureCreee {
  /** Jeton PayDunya — sert ensuite à confirmer le paiement. */
  token: string;
  /** URL vers laquelle rediriger l'annonceur. */
  urlPaiement: string;
}

/**
 * Crée une facture de paiement et renvoie l'URL de règlement.
 *
 * `intentId` voyage dans `custom_data` : c'est lui qui, au retour du webhook,
 * rattache le paiement à l'intention enregistrée côté Firestore. On ne se fie
 * jamais au montant du callback pour retrouver l'annonceur.
 */
export async function creerFacture(params: {
  montantFcfa: number;
  description: string;
  intentId: string;
  callbackUrl: string;
  retourUrl: string;
  annulationUrl: string;
}): Promise<FactureCreee> {
  const reponse = await fetch(`${BASE}/checkout-invoice/create`, {
    method: 'POST',
    headers: entetes(),
    body: JSON.stringify({
      invoice: {
        total_amount: params.montantFcfa,
        description: params.description,
      },
      store: { name: process.env.PAYDUNYA_STORE_NAME || 'Startup Ludo — CONCREE' },
      actions: {
        callback_url: params.callbackUrl,
        return_url: params.retourUrl,
        cancel_url: params.annulationUrl,
      },
      custom_data: { intentId: params.intentId },
    }),
  });

  const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
  // `response_code` « 00 » = succès. Un HTTP 200 ne suffit pas : PayDunya
  // renvoie ses erreurs métier avec un statut HTTP correct.
  if (!reponse.ok || String(donnees.response_code) !== '00') {
    throw new Error(
      `PayDunya a refusé la création de facture : ${String(donnees.response_text ?? reponse.status)}`
    );
  }

  const token = typeof donnees.token === 'string' ? donnees.token : '';
  const urlPaiement =
    typeof donnees.response_text === 'string' && donnees.response_text.startsWith('http')
      ? donnees.response_text
      : '';
  if (!token || !urlPaiement) {
    throw new Error('Réponse PayDunya inexploitable : jeton ou URL de paiement manquant.');
  }
  return { token, urlPaiement };
}

export interface FactureConfirmee {
  statut: StatutPaydunya;
  /** Montant RÉELLEMENT encaissé, seul montant digne de confiance. */
  montantFcfa: number;
  /** `intentId` tel que transmis à la création. */
  intentId: string | null;
}

/**
 * Confirme une facture auprès de PayDunya, serveur à serveur.
 *
 * C'est LA source de vérité du paiement — le corps du webhook n'en est qu'une
 * notification. Voir l'avertissement en tête de fichier : le hash du callback
 * ne couvre pas le montant, donc seul cet appel authentifié fait foi.
 */
export async function confirmerFacture(token: string): Promise<FactureConfirmee> {
  const reponse = await fetch(`${BASE}/checkout-invoice/confirm/${encodeURIComponent(token)}`, {
    method: 'GET',
    headers: entetes(),
  });
  const donnees = (await reponse.json().catch(() => ({}))) as Record<string, unknown>;
  if (!reponse.ok || String(donnees.response_code) !== '00') {
    throw new Error(
      `Confirmation PayDunya impossible : ${String(donnees.response_text ?? reponse.status)}`
    );
  }

  const facture = (donnees.invoice ?? {}) as Record<string, unknown>;
  const custom = (facture.custom_data ?? {}) as Record<string, unknown>;
  const montantBrut = facture.total_amount;
  const montant =
    typeof montantBrut === 'number' ? montantBrut : Number.parseFloat(String(montantBrut ?? '0'));

  return {
    statut: normaliserStatut(donnees.status),
    montantFcfa: Number.isFinite(montant) ? Math.round(montant) : 0,
    intentId: typeof custom.intentId === 'string' ? custom.intentId : null,
  };
}

/**
 * Vérifie le `hash` d'un callback : `sha512(master_key)`, en comparaison à
 * temps constant pour ne pas exposer la clé par mesure de durée.
 *
 * À N'UTILISER QUE COMME PREMIER FILTRE. Un hash valide écarte le bruit et les
 * appels anonymes ; il ne valide NI le montant NI l'issue du paiement, qui ne
 * s'obtiennent que par `confirmerFacture()`.
 */
export async function hashCallbackValide(hashRecu: string): Promise<boolean> {
  if (!hashRecu) return false;
  // Clés absentes : on REFUSE, sans lever. `cles()` jetait une exception que
  // la route ne rattrapait pas, transformant un webhook non configuré en
  // HTTP 500 — PayDunya rejoue alors en boucle une requête qui ne peut pas
  // aboutir. Un refus explicite est la seule réponse honnête.
  if (!paydunyaConfigure()) {
    console.warn('[paydunya] callback reçu mais aucune clé configurée sur cette instance.');
    return false;
  }
  const { master } = cles();
  const { createHash, timingSafeEqual } = await import('node:crypto');
  const attendu = createHash('sha512').update(master).digest('hex');
  const a = Buffer.from(attendu, 'utf8');
  const b = Buffer.from(hashRecu.trim().toLowerCase(), 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
