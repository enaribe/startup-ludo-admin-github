/**
 * Défi de la semaine — service du back-office.
 *
 * ═══ POURQUOI LES LECTURES SONT CLIENT ET LES ÉCRITURES SERVEUR ═══
 *
 * Le dépôt lit le contenu de jeu directement avec le SDK Firestore client
 * (`ready-session-service.ts`, `getAchievements()`) : la règle autorise le
 * super admin, une route API n'apporterait rien. Les lectures ci-dessous
 * suivent cette convention.
 *
 * Les ÉCRITURES passent par `/api/defi/enregistrer` et `/api/defi/cloturer`,
 * pour un invariant que les règles Firestore ne peuvent pas tenir : **un seul
 * défi `ouvert` à la fois**. Une règle juge un document isolé, jamais une
 * collection — elle ne peut pas savoir qu'un autre défi est déjà ouvert. Or le
 * mobile lit le défi en cours avec `where('statut','==','ouvert') + limit(1)` :
 * deux défis ouverts donneraient un affichage arbitraire et deux classements
 * concurrents.
 *
 * `defiScores` est en LECTURE SEULE ici : c'est le mobile qui l'écrit pendant
 * les parties (cf. `COLLECTIONS.defiScores`).
 *
 * ═══ DEUX VOIES POUR LE CONTENU ═══
 *
 *   1. IMPORT D'UN JSON déjà rédigé (`lireContenuJson`) — la voie principale.
 *      Chaque carte est validée et les problèmes sont rapportés avec leur
 *      position dans le fichier, au lieu d'être écartés en silence.
 *   2. GÉNÉRATION IA depuis un document (`deposerDocumentDefi` +
 *      `genererContenuDefi`) — conservée pour partir de rien : on génère, on
 *      exporte le JSON, on le corrige, on le réimporte.
 *
 * Les deux aboutissent au même `enregistrerContenuDefi`, et la route revalide.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from 'firebase/firestore';
import { appelerExtraction, appelerGeneration } from '@/lib/ai-client';
import { normaliserContenu } from '@/lib/class-session-generation';
import {
  importerContenuJson,
  type AnomalieImport,
  type ResultatImport,
} from '@/lib/defi-json-import';
import { auth, firestore, COLLECTIONS } from './firebase';
import type { ClassSessionContent } from '@/types';
import {
  MIX_DEFI_DEFAUT,
  type DefiScore,
  type DefiSource,
  type MixDefi,
  type ChiffreDefi,
  type IdeationDefi,
  type LotDefi,
  type VideoDefi,
  type ZoneDefi,
  type WeeklyChallenge,
} from '@/types/weeklyChallenge';

/** En-têtes d'appel des routes `/api/defi/*`, avec le jeton de l'admin. */
async function enTetesAuth(): Promise<HeadersInit> {
  const token = await auth.currentUser?.getIdToken();
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

/**
 * Tous les défis, du plus récent au plus ancien.
 *
 * Tri sur `debutAt` et non sur l'id : `AAAA-Sxx` se trie correctement en texte
 * SAUF au passage d'année (`2025-S52` > `2026-S01` en comparaison de chaînes).
 */
export async function getDefis(): Promise<WeeklyChallenge[]> {
  const snap = await getDocs(
    query(collection(firestore, COLLECTIONS.weeklyChallenges), orderBy('debutAt', 'desc'))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as WeeklyChallenge);
}

/** Un défi par son id — la page de détail. */
export async function getDefi(id: string): Promise<WeeklyChallenge | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.weeklyChallenges, id));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as WeeklyChallenge) : null;
}

/** Le défi ouvert, ou `null`. Sert à prévenir avant d'en ouvrir un autre. */
export async function getDefiOuvert(): Promise<WeeklyChallenge | null> {
  const snap = await getDocs(
    query(
      collection(firestore, COLLECTIONS.weeklyChallenges),
      where('statut', '==', 'ouvert'),
      limit(1)
    )
  );
  const premier = snap.docs[0];
  return premier ? ({ id: premier.id, ...premier.data() } as WeeklyChallenge) : null;
}

/**
 * Classement d'un défi, du meilleur au moins bon.
 *
 * Tri `xp desc` puis `parties asc` — à XP égal, moins de parties passe devant.
 * ⚠️ CE TRI DOIT RESTER IDENTIQUE à `getClassementDefi()` du mobile et à la
 * route de clôture : sinon le champion figé ne serait pas celui que le
 * classement affiche en tête.
 */
export async function getClassementDefi(defiId: string, nombre = 100): Promise<DefiScore[]> {
  const snap = await getDocs(
    query(
      collection(firestore, COLLECTIONS.defiScores),
      where('defiId', '==', defiId),
      orderBy('xp', 'desc'),
      orderBy('parties', 'asc'),
      limit(nombre)
    )
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DefiScore);
}

export interface SaisieDefi {
  /** Vide à la création : le serveur dérive l'id de la semaine de `debutAt`. */
  id?: string;
  titre: string;
  description: string;
  statut: WeeklyChallenge['statut'];
  debutAt: number;
  finAt: number;
  /**
   * Image de fond de la carte d'accueil.
   *
   * ⚠️ OMETTRE la clé laisse l'image inchangée ; `''` ou `null` la retire.
   * L'écriture est un `merge` côté serveur, qui ne touche au champ que s'il est
   * présent — sinon un appelant qui l'ignore effacerait l'image.
   */
  bannerUrl?: string | null;
  /**
   * Image affichée au centre du plateau pendant une partie du défi.
   *
   * ⚠️ Même règle que `bannerUrl` : OMETTRE la clé laisse l'image inchangée,
   * une chaîne vide l'efface.
   */
  plateauCentreUrl?: string | null;
  /**
   * Questions ouvertes du questionnaire d'idéation.
   *
   * ⚠️ Même règle que `bannerUrl` : OMETTRE la clé laisse les questions
   * inchangées, un tableau vide les efface. L'écriture est un `merge`, et un
   * appelant qui ignore ce champ ne doit pas vider le travail d'un autre.
   */
  /*
    ═══ CHAMPS DU CYCLE HEBDOMADAIRE (lot 2) ═══

    Tous optionnels, et la règle d'écriture est celle de `bannerUrl` : la clé
    ABSENTE du corps laisse la valeur existante, une clé présente la remplace.
    Un appelant qui ignore un champ ne doit pas effacer le travail d'un autre.

    Les objets composés acceptent `null` pour un retrait explicite : sans lui,
    on ne pourrait jamais supprimer une vidéo une fois posée.
  */
  zone?: ZoneDefi | null;
  semaine?: number;
  fuseau?: string;
  resultatsAt?: number;
  themeAvecArticle?: string;
  themeAvecDe?: string;
  beneficiaires?: string;
  problemePourAdia?: string;
  faitsPourAdia?: string[];
  chiffres?: ChiffreDefi[];
  video?: VideoDefi | null;
  ideation?: IdeationDefi;
  lot?: LotDefi | null;
}

/**
 * Crée ou modifie un défi.
 *
 * Lève avec le message du serveur — notamment le 409 « un défi est déjà
 * ouvert », qui doit remonter tel quel à l'écran : il nomme le défi en conflit
 * et dit quoi faire.
 */
export async function enregistrerDefi(
  saisie: SaisieDefi
): Promise<{ id: string; cree: boolean }> {
  const reponse = await fetch('/api/defi/enregistrer', {
    method: 'POST',
    headers: await enTetesAuth(),
    body: JSON.stringify(saisie),
  });
  const donnees = await reponse.json();
  if (!reponse.ok) throw new Error(donnees.error || 'Enregistrement impossible');
  return { id: donnees.id, cree: !!donnees.cree };
}

/**
 * Clôture un défi et fige son champion.
 *
 * Irréversible par conception : un second appel renvoie 409. Rejouer une
 * clôture après l'arrivée d'un score tardif changerait le champion déjà
 * annoncé aux joueurs.
 */
export async function cloturerDefi(
  id: string
): Promise<{ champion: WeeklyChallenge['champion']; participants: number }> {
  const reponse = await fetch('/api/defi/cloturer', {
    method: 'POST',
    headers: await enTetesAuth(),
    body: JSON.stringify({ id }),
  });
  const donnees = await reponse.json();
  if (!reponse.ok) throw new Error(donnees.error || 'Clôture impossible');
  return { champion: donnees.champion ?? null, participants: donnees.participants ?? 0 };
}

/**
 * Bornes de la semaine prochaine : lundi 00:00 UTC → dimanche 23:00 UTC.
 *
 * ⚠️ LA CLÔTURE EST À 23:00, PAS À MINUIT. `resetWeeklyStats` tourne le lundi à
 * 00:00 UTC : une clôture à minuit pile courrait contre elle. L'heure d'écart
 * laisse la désignation du champion se faire avant toute remise à zéro.
 */
export function prochaineSemaine(depuis = Date.now()): { debutAt: number; finAt: number } {
  const d = new Date(depuis);
  const jour = d.getUTCDay(); // 0 = dimanche
  // Jours jusqu'au prochain lundi ; un lundi, on vise le lundi SUIVANT (7).
  const joursJusquaLundi = ((8 - jour) % 7) || 7;
  const lundi = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + joursJusquaLundi)
  );
  const dimanche = new Date(lundi.getTime());
  dimanche.setUTCDate(dimanche.getUTCDate() + 6);
  dimanche.setUTCHours(23, 0, 0, 0);
  return { debutAt: lundi.getTime(), finAt: dimanche.getTime() };
}

/**
 * Erreur d'enregistrement portant les cartes fautives relevées par le serveur.
 *
 * Un `Error` nu perdrait la liste : l'écran ne pourrait afficher qu'un message
 * global, alors que l'auteur a besoin de savoir QUELLES cartes corriger.
 */
export class ErreurContenuInvalide extends Error {
  constructor(
    message: string,
    readonly anomalies: AnomalieImport[]
  ) {
    super(message);
    this.name = 'ErreurContenuInvalide';
  }
}

/**
 * Enregistre le contenu sur le défi, après relecture.
 *
 * La route revalide chaque carte et répond 422 avec la liste des cartes
 * fautives : on la propage telle quelle plutôt que de la résumer.
 */
export async function enregistrerContenuDefi(
  id: string,
  contenu: ClassSessionContent
): Promise<void> {
  const reponse = await fetch('/api/defi/contenu', {
    method: 'POST',
    headers: await enTetesAuth(),
    body: JSON.stringify({ id, contenu }),
  });
  const donnees = await reponse.json();
  if (!reponse.ok) {
    const message = donnees.error || 'Enregistrement du contenu impossible';
    if (Array.isArray(donnees.anomalies) && donnees.anomalies.length > 0) {
      throw new ErreurContenuInvalide(message, donnees.anomalies as AnomalieImport[]);
    }
    throw new Error(message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// IMPORT / EXPORT JSON DU CONTENU
// ═══════════════════════════════════════════════════════════════════════════

/** Taille maximale du fichier JSON accepté. */
const TAILLE_MAX_JSON = 4 * 1024 * 1024;

/**
 * Lit un fichier JSON de contenu et le valide, SANS rien enregistrer.
 *
 * Deux temps volontairement séparés : on lit et on rapporte, puis l'auteur
 * relit à l'écran et décide d'enregistrer. Un import qui écrirait directement
 * ne laisserait aucune occasion de voir les corrections automatiques — un signe
 * de jetons retourné, par exemple, qui ne se verrait jamais en partie.
 *
 * ⚠️ Le fichier n'est PAS conservé : seules les cartes validées partent en base,
 * comme pour le document source. Rien à re-télécharger depuis le back-office,
 * puisque l'export reconstruit un JSON réimportable depuis le contenu en base.
 */
export async function lireContenuJson(fichier: File): Promise<ResultatImport> {
  if (fichier.size > TAILLE_MAX_JSON) {
    throw new Error(
      `Fichier trop volumineux (${(fichier.size / 1024 / 1024).toFixed(1)} Mo, maximum 4 Mo).`
    );
  }

  const texte = await fichier.text();
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch (error) {
    /*
      Le message de `JSON.parse` donne la POSITION de l'erreur (« at position
      1423 »), ce qui est l'information la plus utile sur un fichier écrit à la
      main — virgule en trop, guillemet oublié. On le garde tel quel.
    */
    throw new Error(
      `JSON invalide : ${error instanceof Error ? error.message : 'syntaxe incorrecte'}`
    );
  }

  // Seed horodaté : réimporter ne recrée pas les ids du contenu précédent.
  return importerContenuJson(brut, `i${Date.now().toString(36)}`);
}

/**
 * Le contenu d'un défi, en JSON réimportable.
 *
 * Même forme que celle attendue à l'import — on peut donc exporter, corriger
 * dans un éditeur, et réimporter. C'est le chemin prévu pour retoucher un
 * contenu d'abord produit par l'IA.
 */
export function exporterContenuJson(defi: WeeklyChallenge): string {
  const contenu = (defi.contenu ?? {}) as Partial<ClassSessionContent>;
  return JSON.stringify(
    {
      defi: defi.id,
      titre: defi.titre,
      quizzes: contenu.quizzes ?? [],
      duels: contenu.duels ?? [],
      fundings: contenu.fundings ?? [],
      opportunities: contenu.opportunities ?? [],
      challengeEvents: contenu.challengeEvents ?? [],
    },
    null,
    2
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT SOURCE — la matière première du contenu
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Le texte extrait est découpé pour tenir sous la limite Firestore.
 *
 * Un document Firestore plafonne à 1 Mo. Un PDF de cours dépasse régulièrement
 * ce seuil une fois son texte extrait : sans découpage, l'écriture échoue et le
 * message d'erreur ne dit pas pourquoi.
 */
const TAILLE_CHUNK = 700_000;

/**
 * Dépose le document du défi : extraction du texte, puis stockage.
 *
 * ═══ LE FICHIER ORIGINAL N'EST PAS CONSERVÉ ═══
 *
 * Seul son texte sert à la génération, et il n'a pas à être re-consulté depuis
 * le back-office. Ne pas le stocker réduit la surface de données conservées —
 * même choix que `deposerCours()` pour les séances de classe.
 *
 * Un SEUL document par défi : déposer à nouveau remplace le précédent. Un défi
 * porte un sujet, pas un dossier — accumuler des documents mélangerait les
 * thèmes dans un contenu annoncé comme portant sur un seul.
 *
 * @throws Error si l'extraction échoue (format non supporté, PDF scanné, 401…).
 */
export async function deposerDocumentDefi(
  defiId: string,
  file: File
): Promise<DefiSource> {
  const res = await appelerExtraction(file);
  const extrait = await res.json();
  if (!res.ok || extrait.error) {
    throw new Error(extrait.error || 'Extraction impossible : vérifiez le format du fichier.');
  }

  const texte = String(extrait.text ?? '');
  if (!texte.trim()) {
    throw new Error('Aucun texte extrait — le document est peut-être une image ou un PDF scanné.');
  }

  const base = collection(firestore, COLLECTIONS.defiSourceDocs(defiId));

  /*
    On efface l'ancien document AVANT d'écrire le nouveau.

    Sans ça, `getTexteSourceDefi()` concaténerait les deux et générerait un
    contenu à cheval sur deux sujets. Et comme le découpage produit un nombre
    variable de chunks, un ancien document plus long laisserait des chunks
    orphelins qui seraient relus.
  */
  const ancien = await getDocs(base);
  await Promise.all(
    ancien.docs.map(async (d) => {
      const chunks = await getDocs(collection(d.ref, 'chunks'));
      await Promise.all(chunks.docs.map((c) => deleteDoc(c.ref)));
      await deleteDoc(d.ref);
    })
  );

  const chunks: string[] = [];
  for (let i = 0; i < texte.length; i += TAILLE_CHUNK) {
    chunks.push(texte.slice(i, i + TAILLE_CHUNK));
  }

  const docId = `src_${Date.now().toString(36)}`;
  const docRef = doc(base, docId);
  await setDoc(docRef, {
    name: file.name,
    charCount: texte.length,
    pages: Number(extrait.pages ?? 0),
    chunkCount: chunks.length,
    extractedAt: Date.now(),
  });
  await Promise.all(
    chunks.map((content, i) => setDoc(doc(docRef, 'chunks', String(i)), { i, content }))
  );

  const source: DefiSource = {
    nom: file.name,
    pages: Number(extrait.pages ?? 0),
    caracteres: texte.length,
    deposeAt: Date.now(),
  };

  // Les métadonnées sur le défi lui-même : le mobile et la liste du back-office
  // doivent savoir qu'un document existe sans lire la sous-collection.
  await enregistrerSourceDefi(defiId, source);
  return source;
}

/** Texte complet du document déposé, recomposé depuis ses chunks. */
export async function getTexteSourceDefi(defiId: string): Promise<string> {
  const base = collection(firestore, COLLECTIONS.defiSourceDocs(defiId));
  const docsSnap = await getDocs(base);
  const parties: string[] = [];
  for (const d of docsSnap.docs) {
    // `orderBy('i')` : les chunks doivent être recollés DANS L'ORDRE. Sans tri,
    // Firestore les rend par id lexicographique et « 10 » précède « 2 ».
    const chunksSnap = await getDocs(query(collection(d.ref, 'chunks'), orderBy('i')));
    const texte = chunksSnap.docs.map((c) => c.data().content as string).join('');
    if (texte) parties.push(texte);
  }
  return parties.join('\n\n');
}

/** Écrit les métadonnées du document sur le défi (via la route serveur). */
async function enregistrerSourceDefi(id: string, source: DefiSource | null): Promise<void> {
  const reponse = await fetch('/api/defi/source', {
    method: 'POST',
    headers: await enTetesAuth(),
    body: JSON.stringify({ id, source }),
  });
  const donnees = await reponse.json();
  if (!reponse.ok) throw new Error(donnees.error || 'Enregistrement du document impossible');
}

// ═══════════════════════════════════════════════════════════════════════════
// GÉNÉRATION DU CONTENU
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Génère le contenu de jeu depuis le DOCUMENT du défi.
 *
 * ═══ POURQUOI RÉUTILISER `class_session_content` ═══
 *
 * Ce prompt produit exactement la forme attendue — les cinq types de cartes,
 * ancrés sur un texte source. Le Mode Classe lui passe le cours de
 * l'enseignant ; on lui passe le document du défi. Ajouter un type de
 * génération dédié dupliquerait un prompt de plusieurs centaines de lignes pour
 * changer une phrase d'amorce.
 *
 * ═══ LE CONTENU EST INDÉPENDANT DES ÉDITIONS ═══
 *
 * Rien dans cet appel ne mentionne d'édition, et c'est volontaire : les cartes
 * viennent du document, pas du catalogue du jeu. L'édition ne sert qu'au
 * plateau, côté mobile (`EDITION_PLATEAU_DEFI`).
 *
 * ═══ GÉNÉRÉ UNE FOIS, PUIS RELU ═══
 *
 * Pas de régénération à chaque partie : ce serait un appel modèle par joueur,
 * un contenu différent pour un même défi annoncé — donc un classement qui
 * comparerait des épreuves différentes.
 *
 * La relecture humaine est le garde-fou. `normaliserContenu` écarte les cartes
 * malformées, mais rien ne détecte une question fausse ou hors sujet.
 */
export async function genererContenuDefi(
  defi: { id: string; titre: string; description: string },
  mix: MixDefi = MIX_DEFI_DEFAUT
): Promise<ClassSessionContent> {
  const sourceText = await getTexteSourceDefi(defi.id);
  if (!sourceText.trim()) {
    throw new Error('Déposez d’abord le document du défi : c’est lui qui fournit le contenu.');
  }

  const res = await appelerGeneration({
    type: 'class_session_content',
    prompt:
      `Défi entrepreneurial de la semaine : « ${defi.titre} ».` +
      (defi.description ? ` ${defi.description}` : '') +
      ` Toutes les cartes doivent porter sur le document fourni, dans un contexte` +
      ` de création d'entreprise en Afrique de l'Ouest.`,
    context: {
      sessionTitle: defi.titre,
      // Le document EST la matière première, à la place du cours de l'enseignant.
      sourceText,
      // Le prompt attend les clés de `MixSeance` : même forme, noms identiques.
      mix,
    },
  });

  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || 'Génération impossible.');

  // Seed horodaté : régénérer ne crée pas de collision d'ids avec le contenu
  // précédent.
  return normaliserContenu(json.data, `d${Date.now().toString(36)}`);
}
