/**
 * Joueurs fictifs d'un défi — amorcer un classement vide.
 *
 *  POST /api/defi/joueurs-fictifs
 *      Authorization: Bearer <idToken super admin>
 *      { id, nombre?, maxXp? }
 *      → 200 { ok: true, crees, total }
 *      → 404 si le défi n'existe pas
 *      → 409 si le défi est clos
 *
 *  DELETE /api/defi/joueurs-fictifs?id=<defiId>
 *      → 200 { ok: true, supprimes }
 *
 * ═══ POURQUOI CETTE ROUTE EXISTE ═══
 *
 * Un défi qui ouvre avec trois participants n'a pas de podium, pas de
 * « autour de toi », et un rang qui ne raconte rien. Les premiers joueurs en
 * concluent que personne ne joue — ce qui devient vrai.
 *
 * ═══ CE QU'ELLE ÉCRIT, ET CE QU'ELLE N'ÉCRIT PAS ═══
 *
 * Des documents `defiScores` seulement. Aucun compte Firebase, aucune idée,
 * aucun badge : un joueur fictif ne peut pas se connecter, et personne ne
 * peut ouvrir sa fiche.
 *
 * ⚠️ ILS COMPTENT DANS LE CLASSEMENT RÉEL. Un joueur fictif peut occuper le
 * podium, et donc bloquer un lot à la clôture. Le DELETE est là pour ça :
 * les retirer avant de clore. La clôture ne les filtre pas — elle désigne le
 * premier du classement, fictif ou non.
 *
 * ═══ LA ROUTE EST RÉSERVÉE AU SUPER ADMIN ═══
 *
 * Comme la clôture. Écrire dans le classement d'autrui n'est pas une
 * opération d'édition ordinaire, même quand c'est pour l'amorcer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifierAppelant } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/firebase';
import { PREFIXE_FICTIF, genererJoueursFictifs } from '@/lib/joueurs-fictifs';

/** Plafond par appel. Au-delà, le classement devient illisible et l'écriture longue. */
const MAX_PAR_APPEL = 300;

/** Firestore limite un lot à 500 opérations : on écrit par paquets. */
const TAILLE_LOT = 400;

export async function POST(request: NextRequest) {
  const appelant = await verifierAppelant(request);
  if (!appelant) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }
  if (!appelant.isSuper) {
    return NextResponse.json({ error: 'Réservé au super administrateur.' }, { status: 403 });
  }

  let id = '';
  let nombre = 100;
  let maxXp = 600;
  try {
    const corps = (await request.json()) as { id?: unknown; nombre?: unknown; maxXp?: unknown };
    id = String(corps.id ?? '').trim();
    if (corps.nombre !== undefined) nombre = Number(corps.nombre);
    if (corps.maxXp !== undefined) maxXp = Number(corps.maxXp);
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  if (!id) {
    return NextResponse.json({ error: 'Identifiant du défi requis.' }, { status: 400 });
  }
  if (!Number.isFinite(nombre) || nombre < 1 || nombre > MAX_PAR_APPEL) {
    return NextResponse.json(
      { error: `Nombre attendu entre 1 et ${MAX_PAR_APPEL}.` },
      { status: 400 }
    );
  }
  if (!Number.isFinite(maxXp) || maxXp < 20 || maxXp > 5000) {
    return NextResponse.json({ error: 'Score maximum attendu entre 20 et 5000.' }, { status: 400 });
  }

  const db = getAdminFirestore();
  const refDefi = db.collection(COLLECTIONS.weeklyChallenges).doc(id);
  const snap = await refDefi.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Défi introuvable.' }, { status: 404 });
  }
  /*
    Un défi CLOS a son champion figé. Y ajouter des joueurs ne changerait pas
    le champion annoncé, mais ferait mentir le classement affiché au palmarès
    — et le nombre de participants inscrit dans le document.
  */
  if (snap.data()?.statut === 'clos') {
    return NextResponse.json(
      { error: 'Ce défi est clos : son classement ne doit plus bouger.' },
      { status: 409 }
    );
  }

  const joueurs = genererJoueursFictifs(nombre, { maxXp });
  const maintenant = Date.now();

  for (let debut = 0; debut < joueurs.length; debut += TAILLE_LOT) {
    const lot = db.batch();
    for (const j of joueurs.slice(debut, debut + TAILLE_LOT)) {
      /*
        Id composé `{defiId}_{userId}`, comme un vrai score : relancer
        l'opération ÉCRASE les mêmes documents au lieu d'en empiler. C'est ce
        qui rend l'appel rejouable sans créer deux populations.
      */
      lot.set(db.collection(COLLECTIONS.defiScores).doc(`${id}_${j.userId}`), {
        id: `${id}_${j.userId}`,
        defiId: id,
        userId: j.userId,
        displayName: j.displayName,
        avatarUrl: null,
        ideeNom: j.ideeNom,
        briquesPosees: j.briquesPosees,
        xp: j.xp,
        parties: j.parties,
        majAt: maintenant,
      });
    }
    await lot.commit();
  }

  const total = await db
    .collection(COLLECTIONS.defiScores)
    .where('defiId', '==', id)
    .count()
    .get();

  return NextResponse.json({ ok: true, crees: joueurs.length, total: total.data().count });
}

/**
 * Retire tous les joueurs fictifs d'un défi.
 *
 * Le filtrage se fait sur le PRÉFIXE de l'identifiant, en mémoire : Firestore
 * ne sait pas interroger « commence par » sur un champ sans index dédié, et
 * un défi ne compte de toute façon pas assez de scores pour que la lecture
 * complète pose problème.
 */
export async function DELETE(request: NextRequest) {
  const appelant = await verifierAppelant(request);
  if (!appelant) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }
  if (!appelant.isSuper) {
    return NextResponse.json({ error: 'Réservé au super administrateur.' }, { status: 403 });
  }

  const id = (request.nextUrl.searchParams.get('id') ?? '').trim();
  if (!id) {
    return NextResponse.json({ error: 'Identifiant du défi requis.' }, { status: 400 });
  }

  const db = getAdminFirestore();
  const scores = await db.collection(COLLECTIONS.defiScores).where('defiId', '==', id).get();

  const aSupprimer = scores.docs.filter((d) =>
    String(d.data().userId ?? '').startsWith(PREFIXE_FICTIF)
  );

  for (let debut = 0; debut < aSupprimer.length; debut += TAILLE_LOT) {
    const lot = db.batch();
    for (const d of aSupprimer.slice(debut, debut + TAILLE_LOT)) lot.delete(d.ref);
    await lot.commit();
  }

  return NextResponse.json({ ok: true, supprimes: aSupprimer.length });
}
