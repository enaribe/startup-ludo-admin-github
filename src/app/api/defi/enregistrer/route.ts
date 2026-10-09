/**
 * Création et modification d'un défi de la semaine.
 *
 *  POST /api/defi/enregistrer
 *      Authorization: Bearer <idToken super admin>
 *      { id?, titre, description, statut, debutAt, finAt }
 *      → 200 { ok: true, id }
 *      → 403 si l'appelant n'est pas super admin
 *      → 409 si l'ouverture entre en conflit avec un défi déjà ouvert
 *
 * ═══ POURQUOI UNE ROUTE SERVEUR ALORS QUE LES RÈGLES SUFFIRAIENT ═══
 *
 * La règle Firestore autorise déjà le super admin à écrire `weeklyChallenges`
 * depuis le navigateur. Cette route existe pour UN invariant que les règles ne
 * peuvent pas tenir : **un seul défi ouvert à la fois**.
 *
 * Les règles Firestore ne peuvent pas interroger une collection — elles jugent
 * un document à la fois. Or le mobile lit le défi ouvert avec `where('statut',
 * '==', 'ouvert') + limit(1)` : deux défis ouverts donneraient un affichage
 * arbitraire, et deux classements concurrents. Seul le serveur peut vérifier
 * qu'aucun autre n'est ouvert avant d'écrire.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifierAppelant } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/firebase';
import type { StatutDefi } from '@/types/weeklyChallenge';

const STATUTS: StatutDefi[] = ['brouillon', 'ouvert', 'clos'];

export async function POST(request: NextRequest) {
  const appelant = await verifierAppelant(request);
  if (!appelant) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }
  // Un défi est un contenu éditorial diffusé à TOUS les joueurs : seul le super
  // admin le écrit, comme `readySessions`.
  if (!appelant.isSuper) {
    return NextResponse.json({ error: 'Réservé au super administrateur.' }, { status: 403 });
  }

  let corps: Record<string, unknown>;
  try {
    corps = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const id = String(corps.id ?? '').trim();
  const titre = String(corps.titre ?? '').trim();
  const description = String(corps.description ?? '').trim();
  const statut = String(corps.statut ?? 'brouillon') as StatutDefi;
  const debutAt = Number(corps.debutAt);
  const finAt = Number(corps.finAt);

  if (!titre) {
    return NextResponse.json({ error: 'Le titre est requis.' }, { status: 400 });
  }
  if (!STATUTS.includes(statut)) {
    return NextResponse.json({ error: 'Statut inconnu.' }, { status: 400 });
  }
  if (!Number.isFinite(debutAt) || !Number.isFinite(finAt)) {
    return NextResponse.json({ error: 'Dates invalides.' }, { status: 400 });
  }
  if (finAt <= debutAt) {
    return NextResponse.json(
      { error: 'La clôture doit suivre l’ouverture.' },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const collectionDefis = db.collection(COLLECTIONS.weeklyChallenges);

  /*
    L'ID EST DÉRIVÉ DE LA SEMAINE (`AAAA-Sxx`), pas auto-généré.

    Deux raisons : la base reste lisible (on sait de quelle semaine parle un
    document sans ouvrir ses champs), et créer deux fois le même défi écrase au
    lieu de dupliquer. Sur une collection écrite à la main par un humain
    pressé, l'idempotence vaut mieux qu'un doublon silencieux.
  */
  const idFinal = id || idSemaineISO(debutAt);

  // ── L'INVARIANT : un seul défi ouvert ──
  if (statut === 'ouvert') {
    const ouverts = await collectionDefis.where('statut', '==', 'ouvert').get();
    const conflit = ouverts.docs.find((d) => d.id !== idFinal);
    if (conflit) {
      return NextResponse.json(
        {
          error: `Le défi « ${conflit.data()?.titre ?? conflit.id} » est déjà ouvert. Clôturez-le d’abord.`,
          conflitId: conflit.id,
        },
        { status: 409 }
      );
    }
  }

  const ref = collectionDefis.doc(idFinal);
  const existant = await ref.get();
  const maintenant = Date.now();

  /*
    ON N'OUVRE PAS UN DÉFI SANS CONTENU.

    Un défi ouvert sans cartes ferait tirer celles de l'édition : le joueur
    aurait une partie libre présentée comme une épreuve thématique, et le
    classement comparerait des parties qui n'ont rien à voir avec le thème
    annoncé. C'est exactement le défaut que le contenu du défi corrige — le
    laisser possible le réintroduirait en silence.

    Le contenu vient de `/api/defi/contenu`, pas d'ici : on vérifie donc l'état
    du document, et non le corps de cette requête.
  */
  if (statut === 'ouvert') {
    const contenu = existant.data()?.contenu as Record<string, unknown[]> | undefined;
    const cartes = contenu
      ? Object.values(contenu).reduce(
          (n, liste) => n + (Array.isArray(liste) ? liste.length : 0),
          0
        )
      : 0;
    if (cartes === 0) {
      return NextResponse.json(
        {
          error:
            'Générez et enregistrez le contenu du défi avant de l’ouvrir — sans cartes, la partie tirerait celles de l’édition.',
        },
        { status: 409 }
      );
    }
  }

  await ref.set(
    {
      titre,
      description,
      statut,
      debutAt,
      finAt,
      // `champion` et `participants` ne sont JAMAIS écrits ici : ils
      // appartiennent à la clôture. Les inclure permettrait de désigner un
      // champion à la main, ce qui viderait le classement de son sens.
      ...(existant.exists ? {} : { champion: null, participants: 0, contenu: null, source: null, creeAt: maintenant }),
      majAt: maintenant,
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, id: idFinal, cree: !existant.exists });
}

/**
 * Id de la forme `AAAA-Sxx` d'après la semaine ISO 8601 d'un instant.
 *
 * Norme ISO : la semaine 1 est celle qui contient le premier jeudi de l'année,
 * et la semaine commence le lundi. Les implémentations naïves (diviser le jour
 * de l'année par 7) se décalent d'une semaine autour du Nouvel An — un défi de
 * fin décembre se retrouverait dans l'année suivante, en écrasant le premier
 * défi de janvier.
 */
function idSemaineISO(instant: number): string {
  const d = new Date(instant);
  // On se place sur le jeudi de la semaine courante : son année EST l'année ISO.
  const jeudi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const jourSemaine = (jeudi.getUTCDay() + 6) % 7; // lundi = 0
  jeudi.setUTCDate(jeudi.getUTCDate() - jourSemaine + 3);

  const premierJeudi = new Date(Date.UTC(jeudi.getUTCFullYear(), 0, 4));
  const jourPremier = (premierJeudi.getUTCDay() + 6) % 7;
  premierJeudi.setUTCDate(premierJeudi.getUTCDate() - jourPremier + 3);

  const semaine =
    1 + Math.round((jeudi.getTime() - premierJeudi.getTime()) / (7 * 24 * 3600 * 1000));
  return `${jeudi.getUTCFullYear()}-S${String(semaine).padStart(2, '0')}`;
}
