/**
 * Envoi d'e-mails transactionnels via SENDER (plan inscription, §4).
 *
 * MODULE SERVEUR UNIQUEMENT (routes API). Deux règles absolues :
 *   1. JAMAIS BLOQUANT — une activation de compte, une décision de modération
 *      ou une clôture de facturation réussit même si l'e-mail échoue. L'échec
 *      est loggé, l'appelant n'attend pas de promesse critique.
 *   2. SANS CLÉ, SANS BRUIT — tant que `SENDER_API_KEY` n'est pas posée en
 *      variable d'environnement, chaque envoi est un no-op loggé : tout le
 *      circuit d'inscription fonctionne, les e-mails s'activeront en posant
 *      la clé, sans redéploiement de code.
 *
 * Variables d'environnement :
 *   SENDER_API_KEY   clé API Sender (Bearer)
 *   SENDER_FROM      expéditeur vérifié (défaut : no-reply@concree.com)
 *   SENDER_API_URL   endpoint transactionnel (défaut : API v2 Sender)
 */

const API_URL = process.env.SENDER_API_URL || 'https://api.sender.net/v2/email/send';
const FROM = process.env.SENDER_FROM || 'no-reply@concree.com';

export interface EmailTransactionnel {
  to: string;
  subject: string;
  /** Corps HTML simple — les gabarits vivent dans `gabaritEmail()`. */
  html: string;
}

/** Envoie (fire-and-forget côté appelant : `void envoyerEmail(...)`). */
export async function envoyerEmail(email: EmailTransactionnel): Promise<boolean> {
  const cle = process.env.SENDER_API_KEY;
  if (!cle) {
    console.log(`[email] SENDER_API_KEY absente — e-mail non envoyé à ${email.to} : ${email.subject}`);
    return false;
  }
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cle}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        from: FROM,
        to: email.to,
        subject: email.subject,
        html: email.html,
      }),
    });
    if (!res.ok) {
      console.error(`[email] Sender a répondu ${res.status} pour ${email.to}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[email] Envoi impossible :', error);
    return false;
  }
}

/** Gabarit commun : bandeau navy, contenu, pied CONCREE. */
export function gabaritEmail(titre: string, corps: string): string {
  return `<!doctype html><html><body style="margin:0;background:#F6F4EF;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#0F1C2E;border-radius:12px 12px 0 0;padding:18px 22px">
      <span style="color:#F5A623;font-weight:bold;font-size:13px;letter-spacing:1px">STARTUP LUDO · CONCREE</span>
    </div>
    <div style="background:#FFFFFF;border-radius:0 0 12px 12px;padding:22px">
      <h1 style="font-size:18px;color:#0F1C2E;margin:0 0 12px">${titre}</h1>
      <div style="font-size:14px;color:#3D4C61;line-height:1.6">${corps}</div>
    </div>
    <p style="font-size:11px;color:#8A94A6;text-align:center;margin-top:14px">
      CONCREE · Dakar — cet e-mail est envoyé automatiquement, merci de ne pas y répondre.
    </p>
  </div></body></html>`;
}
