/**
 * Création et modification d'un défi de la semaine.
 *
 *  POST /api/defi/enregistrer
 *      Authorization: Bearer <idToken super admin>
 *      { id?, titre, description, statut, debutAt, finAt, bannerUrl?, zone?, semaine?, fuseau?, chiffres?, video?, ideation?, lot?… }
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
  /*
    `bannerUrl` n'est traité que s'il est PRÉSENT dans le corps.

    La requête d'écriture est un `merge` : écrire systématiquement ce champ
    ferait disparaître l'image dès qu'un appelant ne l'envoie pas — un script,
    ou un écran qui ne connaît pas encore le champ. On distingue donc « absent »
    (ne pas toucher) de `''` (retirer l'image).
  */
  /*
    ═══ CHAMPS DU CYCLE HEBDOMADAIRE (lot 2) ═══

    Tous suivent la règle de `bannerUrl` ci-dessous : la clé ABSENTE du corps
    laisse la valeur existante, une clé présente la remplace. Sans cette règle,
    un appelant qui ignore un champ effacerait le travail d'un autre.

    Les validations se font ICI et non côté écran : la route est le seul
    passage obligé, et une donnée malformée écrite en base se retrouve sur le
    téléphone des joueurs sans qu'aucun écran ne puisse la rattraper.
  */
  const litListeTextes = (cle: string): string[] | null => {
    if (!Object.prototype.hasOwnProperty.call(corps, cle)) return null;
    const brut = (corps as Record<string, unknown>)[cle];
    return (Array.isArray(brut) ? brut : [])
      .map((x) => String(x ?? '').trim())
      .filter(Boolean);
  };

  const litTexte = (cle: string): string | null => {
    if (!Object.prototype.hasOwnProperty.call(corps, cle)) return null;
    return String((corps as Record<string, unknown>)[cle] ?? '').trim();
  };

  /* La zone est le PAYS du défi, pas la région de ciblage sponsor. Son code
     est normalisé en majuscules : « sn » et « SN » doivent désigner la même
     zone, sinon deux classements coexisteraient pour un seul pays. */
  const zoneFournie = Object.prototype.hasOwnProperty.call(corps, 'zone');
  const brutZone = (corps as { zone?: unknown }).zone as Record<string, unknown> | null | undefined;
  const zone = zoneFournie
    ? brutZone && String(brutZone.code ?? '').trim()
      ? {
          code: String(brutZone.code).trim().toUpperCase(),
          nom: String(brutZone.nom ?? '').trim(),
          avecArticle: String(brutZone.avecArticle ?? '').trim(),
          ...(String(brutZone.drapeau ?? '').trim()
            ? { drapeau: String(brutZone.drapeau).trim() }
            : {}),
        }
      : null
    : null;

  /* Un chiffre SANS SOURCE est écarté. L'écran l'annonce déjà, mais c'est ici
     que la garantie tient : ces chiffres parlent de familles sinistrées devant
     des élèves, et une valeur d'exemple ne doit pas atteindre la production. */
  const chiffresFournis = Object.prototype.hasOwnProperty.call(corps, 'chiffres');
  const brutChiffres = (corps as { chiffres?: unknown }).chiffres;
  const chiffres = chiffresFournis
    ? (Array.isArray(brutChiffres) ? brutChiffres : [])
        .map((c) => ({
          valeur: String((c as { valeur?: unknown })?.valeur ?? '').trim(),
          libelle: String((c as { libelle?: unknown })?.libelle ?? '').trim(),
          source: String((c as { source?: unknown })?.source ?? '').trim(),
        }))
        .filter((c) => c.valeur && c.libelle && c.source)
    : null;

  /* `url` vide = retrait de la vidéo. Le parcours n'est jamais bloqué par
     elle : sans URL, le bloc n'est simplement pas affiché. */
  const videoFournie = Object.prototype.hasOwnProperty.call(corps, 'video');
  const brutVideo = (corps as { video?: unknown }).video as Record<string, unknown> | null | undefined;
  const video = videoFournie
    ? brutVideo && String(brutVideo.url ?? '').trim()
      ? {
          url: String(brutVideo.url).trim(),
          ...(String(brutVideo.posterUrl ?? '').trim()
            ? { posterUrl: String(brutVideo.posterUrl).trim() }
            : {}),
          ...(String(brutVideo.sousTitresUrl ?? '').trim()
            ? { sousTitresUrl: String(brutVideo.sousTitresUrl).trim() }
            : {}),
        }
      : null
    : null;

  const ideationFournie = Object.prototype.hasOwnProperty.call(corps, 'ideation');
  const brutIdeation = (corps as { ideation?: unknown }).ideation as
    | Record<string, unknown>
    | undefined;
  const listeDe = (v: unknown): string[] =>
    (Array.isArray(v) ? v : []).map((x) => String(x ?? '').trim()).filter(Boolean);
  const ideation = ideationFournie
    ? {
        angles: listeDe(brutIdeation?.angles),
        cibles: listeDe(brutIdeation?.cibles),
        missions: listeDe(brutIdeation?.missions),
        // Une piste sans nom produirait une carte muette, impossible à
        // distinguer des autres au moment de choisir.
        pistesExpress: (Array.isArray(brutIdeation?.pistesExpress)
          ? (brutIdeation.pistesExpress as unknown[])
          : []
        )
          .map((p, i) => ({
            id: String((p as { id?: unknown })?.id ?? '').trim() || `p${i + 1}`,
            nom: String((p as { nom?: unknown })?.nom ?? '').trim(),
            description: String((p as { description?: unknown })?.description ?? '').trim(),
            pourQui: String((p as { pourQui?: unknown })?.pourQui ?? '').trim(),
          }))
          .filter((p) => p.nom),
      }
    : null;

  const lotFourni = Object.prototype.hasOwnProperty.call(corps, 'lot');
  const brutLot = (corps as { lot?: unknown }).lot as Record<string, unknown> | null | undefined;
  const lot = lotFourni
    ? brutLot && String(brutLot.court ?? '').trim()
      ? {
          court: String(brutLot.court).trim(),
          ...(String(brutLot.long ?? '').trim() ? { long: String(brutLot.long).trim() } : {}),
        }
      : null
    : null;

  const semaineFournie = Object.prototype.hasOwnProperty.call(corps, 'semaine');
  const semaine = semaineFournie ? Number((corps as { semaine?: unknown }).semaine) : null;
  const resultatsFournis = Object.prototype.hasOwnProperty.call(corps, 'resultatsAt');
  const resultatsAt = resultatsFournis
    ? Number((corps as { resultatsAt?: unknown }).resultatsAt)
    : null;

  const fuseau = litTexte('fuseau');
  const themeAvecArticle = litTexte('themeAvecArticle');
  const themeAvecDe = litTexte('themeAvecDe');
  const beneficiaires = litTexte('beneficiaires');
  const problemePourAdia = litTexte('problemePourAdia');
  const faitsPourAdia = litListeTextes('faitsPourAdia');

  const banniereFournie = Object.prototype.hasOwnProperty.call(corps, 'bannerUrl');
  const bannerUrl = banniereFournie
    ? String((corps as { bannerUrl?: unknown }).bannerUrl ?? '').trim() || null
    : null;
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
    CRÉATION SUR UN ID DÉJÀ PRIS : on refuse au lieu d'écraser.

    L'id dérive de la semaine (`AAAA-Sxx`), donc deux créations pour la même
    semaine visent le même document. Sans ce test, créer un second défi
    écraserait le premier — avec son document source et son contenu — sans que
    rien ne le signale.

    Le test porte sur l'ABSENCE de `id` dans la requête : une modification
    envoie toujours l'id du défi qu'elle modifie, une création ne l'a pas.
  */
  if (!id && existant.exists) {
    return NextResponse.json(
      {
        error: `Un défi existe déjà pour cette semaine (« ${existant.data()?.titre ?? idFinal} »). Modifiez-le, ou changez la date d’ouverture.`,
        existantId: idFinal,
      },
      { status: 409 }
    );
  }

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
      ...(banniereFournie ? { bannerUrl } : {}),
      ...(zoneFournie ? { zone } : {}),
      ...(semaine !== null && Number.isFinite(semaine) ? { semaine } : {}),
      ...(fuseau !== null ? { fuseau } : {}),
      ...(resultatsAt !== null && Number.isFinite(resultatsAt) ? { resultatsAt } : {}),
      ...(themeAvecArticle !== null ? { themeAvecArticle } : {}),
      ...(themeAvecDe !== null ? { themeAvecDe } : {}),
      ...(beneficiaires !== null ? { beneficiaires } : {}),
      ...(problemePourAdia !== null ? { problemePourAdia } : {}),
      ...(faitsPourAdia !== null ? { faitsPourAdia } : {}),
      ...(chiffres !== null ? { chiffres } : {}),
      ...(videoFournie ? { video } : {}),
      ...(ideation !== null ? { ideation } : {}),
      ...(lotFourni ? { lot } : {}),
      // `champion` et `participants` ne sont JAMAIS écrits ici : ils
      // appartiennent à la clôture. Les inclure permettrait de désigner un
      // champion à la main, ce qui viderait le classement de son sens.
      ...(existant.exists
        ? {}
        : {
            champion: null,
            participants: 0,
            contenu: null,
            source: null,
            // Initialisé à la création pour que la forme du document soit la
            // même partout : le mobile tolère la clé absente, mais un document
            // complet évite d'avoir à s'en souvenir.
            bannerUrl: null,
            zone: null,
            chiffres: [],
            video: null,
            ideation: { angles: [], cibles: [], missions: [], pistesExpress: [] },
            lot: null,
            creeAt: maintenant,
          }),
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
