/**
 * Clôture d'un défi de la semaine — et désignation du champion.
 *
 *  POST /api/defi/cloturer
 *      Authorization: Bearer <idToken super admin>
 *      { id }
 *      → 200 { ok: true, champion, participants }
 *      → 404 si le défi n'existe pas
 *      → 409 si le défi est déjà clos
 *
 * ═══ POURQUOI LE CHAMPION EST FIGÉ, ET NON RECALCULÉ ═══
 *
 * On écrit le champion DANS le document du défi, au lieu de relire le
 * classement à chaque affichage. Un classement recalculé après coup pourrait
 * changer d'avis : un score arrivé en retard (partie terminée hors ligne, puis
 * synchronisée), un compte supprimé, un signalement. Le joueur annoncé
 * champion le resterait alors seulement jusqu'à la prochaine lecture.
 *
 * Ce qui est annoncé est figé. C'est le même principe que `displayName`
 * dénormalisé dans `defiScores` : la photo du moment vaut mieux qu'une vérité
 * mouvante.
 *
 * ⚠️ CETTE ROUTE EST IDEMPOTENTE PAR REFUS, pas par recalcul : un deuxième
 * appel renvoie 409 plutôt que de redésigner un champion. Rejouer une clôture
 * après l'arrivée d'un score tardif changerait le champion déjà annoncé.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifierAppelant } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/firebase';

export async function POST(request: NextRequest) {
  const appelant = await verifierAppelant(request);
  if (!appelant) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }
  if (!appelant.isSuper) {
    return NextResponse.json({ error: 'Réservé au super administrateur.' }, { status: 403 });
  }

  let id = '';
  try {
    const corps = (await request.json()) as { id?: unknown };
    id = String(corps.id ?? '').trim();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: 'Identifiant du défi requis.' }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection(COLLECTIONS.weeklyChallenges).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Défi introuvable.' }, { status: 404 });
  }
  if (snap.data()?.statut === 'clos') {
    return NextResponse.json(
      { error: 'Ce défi est déjà clos — son champion est figé.' },
      { status: 409 }
    );
  }

  /*
    LE CLASSEMENT EST LU AVANT D'ÉCRIRE, et dans cet ordre de tri exact :
    `xp desc` puis `parties asc` — à XP égal, celui qui a joué MOINS de parties
    est devant. Le même tri que `getClassementDefi()` côté mobile, sinon le
    champion annoncé ne serait pas celui que le classement affiche en tête.
  */
  const scores = await db
    .collection(COLLECTIONS.defiScores)
    .where('defiId', '==', id)
    .orderBy('xp', 'desc')
    .orderBy('parties', 'asc')
    .get();

  const premier = scores.docs[0];
  const champion = premier
    ? {
        userId: String(premier.data()?.userId ?? ''),
        // Copié au moment de la clôture : le joueur peut se renommer ensuite,
        // le palmarès doit garder le nom sous lequel il a gagné.
        displayName: String(premier.data()?.displayName ?? 'Joueur'),
        xp: Number(premier.data()?.xp ?? 0),
      }
    : null;

  // Les joueurs à 0 XP ne comptent pas comme participants : le document existe
  // dès la première partie, même sans gain.
  const participants = scores.docs.filter((d) => Number(d.data()?.xp ?? 0) > 0).length;

  await ref.set(
    {
      statut: 'clos',
      champion,
      participants,
      majAt: Date.now(),
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, champion, participants });
}
