/**
 * Enregistrement du contenu de jeu d'un défi.
 *
 *  POST /api/defi/contenu
 *      Authorization: Bearer <idToken super admin>
 *      { id, contenu: { quizzes, duels, fundings, opportunities, challengeEvents } }
 *      → 200 { ok: true, cartes: number }
 *      → 404 si le défi n'existe pas
 *      → 409 si le défi est clos
 *
 * ═══ POURQUOI UNE ROUTE SÉPARÉE DE `/enregistrer` ═══
 *
 * Le contenu peut peser plusieurs dizaines de kilo-octets : le mêler aux champs
 * éditoriaux obligerait à le renvoyer à chaque correction de titre, et un oubli
 * côté client l'effacerait. Deux routes, deux responsabilités.
 *
 * ⚠️ UN DÉFI CLOS NE CHANGE PLUS DE CONTENU. Son champion a été désigné sur une
 * épreuve donnée ; en modifier les cartes après coup rendrait le classement
 * inexplicable.
 *
 * ═══ LA VALIDATION EST ICI, PAS SEULEMENT DANS L'ÉCRAN ═══
 *
 * Le contenu arrivait autrefois uniquement de `normaliserContenu()`, qui garantit
 * sa forme. Depuis l'import JSON, il peut venir d'un fichier écrit à la main :
 * cette route revalide donc chaque carte avec `importerContenuJson()` et refuse
 * en 422 ce qui n'est pas jouable, en NOMMANT la carte fautive.
 *
 * Revalider ce que l'écran a déjà validé n'est pas une redondance inutile : la
 * route est la dernière barrière avant Firestore, et le mobile lit ce document
 * sans le vérifier. Un `curl` ou un écran futur ne doivent pas pouvoir y écrire
 * un quiz dont `correctAnswer` sort des bornes — il serait ingagnable en partie,
 * sans message d'erreur.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { verifierAppelant } from '@/lib/api-auth';
import { COLLECTIONS } from '@/lib/firebase';
import { importerContenuJson } from '@/lib/defi-json-import';

export async function POST(request: NextRequest) {
  const appelant = await verifierAppelant(request);
  if (!appelant) {
    return NextResponse.json({ error: 'Authentification requise.' }, { status: 401 });
  }
  if (!appelant.isSuper) {
    return NextResponse.json({ error: 'Réservé au super administrateur.' }, { status: 403 });
  }

  let id = '';
  let brut: Record<string, unknown> = {};
  try {
    const corps = (await request.json()) as { id?: unknown; contenu?: unknown };
    id = String(corps.id ?? '').trim();
    brut = (corps.contenu ?? {}) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: 'Identifiant du défi requis.' }, { status: 400 });
  }

  /*
    Validation carte par carte. `importerContenuJson` ne garde que les cinq
    listes connues, réécrit les ids (des ids en doublon casseraient la
    déduplication du moteur) et refuse ce qui est injouable.

    Le seed est horodaté : ré-enregistrer ne doit pas recréer les ids du contenu
    précédent, que des parties en cours ont déjà pu voir.
  */
  const resultat = importerContenuJson(brut, `d${Date.now().toString(36)}`);

  if (!resultat.contenu) {
    const bloquantes = resultat.anomalies.filter((a) => a.bloquant);
    return NextResponse.json(
      {
        error:
          bloquantes.length === 1 && bloquantes[0]
            ? `${bloquantes[0].ou} : ${bloquantes[0].message}`
            : `${bloquantes.length} cartes invalides — rien n'a été enregistré.`,
        // La liste complète permet à l'écran d'afficher chaque carte fautive
        // avec sa position dans le fichier, plutôt qu'un échec global.
        anomalies: bloquantes,
      },
      { status: 422 }
    );
  }

  const contenu = resultat.contenu;
  const cartes =
    contenu.quizzes.length +
    contenu.duels.length +
    contenu.fundings.length +
    contenu.opportunities.length +
    contenu.challengeEvents.length;

  const db = getAdminFirestore();
  const ref = db.collection(COLLECTIONS.weeklyChallenges).doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Défi introuvable.' }, { status: 404 });
  }
  if (snap.data()?.statut === 'clos') {
    return NextResponse.json(
      { error: 'Ce défi est clos : son contenu ne peut plus changer.' },
      { status: 409 }
    );
  }

  await ref.set({ contenu, majAt: Date.now() }, { merge: true });

  return NextResponse.json({ ok: true, cartes });
}
