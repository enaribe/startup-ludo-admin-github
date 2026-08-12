/**
 * Service Mode Classe — CUMUL PAR ÉLÈVE (lot 7).
 *
 * Écrit `masteryByCategory`, `totalSessions`, `lastPlayedAt` et
 * `countedSessionIds` sur `classes/{cid}/learners/{lid}`. C'est la couche
 * Firestore ; toute l'arithmétique vit dans les fonctions PURES de
 * `class-report-service.ts` (`integrerSeance`, `fusionnerCompteurs`,
 * `agregerCompteurs`), testées sans réseau.
 *
 * ═══ POURQUOI LE BACK-OFFICE, ET PAS UNE CLOUD FUNCTION ═══
 *
 * Le projet ne déploie aucune Cloud Function, et l'enseignant est CONNECTÉ au
 * moment exact où le cumul doit être écrit — il vient de cliquer « Terminer la
 * séance ». Sa règle Firestore l'autorise déjà à écrire les élèves de sa classe
 * (`maClasse(cid)` sur `classes/{cid}/learners/{lid}`). Aucune infrastructure
 * nouvelle, aucun claim supplémentaire.
 *
 * Ce que ça coûte, et qui est traité plutôt qu'ignoré : si le réseau tombe entre
 * la clôture et l'écriture des cumuls, la séance est `ended` mais les compteurs
 * ne bougent pas. D'où le bouton « Recalculer les cumuls » (`recalculerCumuls`),
 * qui reconstruit tout depuis les séances `ended` de la classe.
 *
 * ═══ L'IDEMPOTENCE ═══
 *
 * `countedSessionIds[]` est écrit dans la MÊME écriture que les compteurs. Une
 * séance déjà présente est ignorée : cliquer deux fois « Terminer », rejouer une
 * intégration, ou lancer un recalcul par-dessus une clôture réussie ne double
 * jamais rien. Voir la JSDoc d'`integrerSeance` pour le détail de l'arbitrage.
 */

import { doc, getDocs, query, updateDoc, where, collection } from 'firebase/firestore';
import { firestore, COLLECTIONS } from './firebase';
import {
  cumulDepuisLearner,
  cumulVide,
  getParticipants,
  integrerSeance,
  type CumulEleve,
} from './class-report-service';
import type { ClassSession, ClassSessionParticipant, Learner } from '@/types';

/**
 * Bilan d'une opération de cumul — ce que l'écran affiche à l'enseignant.
 *
 * `echecs` n'est jamais tu : un cumul manqué en silence est exactement ce que
 * le bouton de recalcul existe pour rattraper, encore faut-il que le prof sache
 * qu'il doit l'utiliser.
 */
export interface BilanCumul {
  /** Élèves dont le document a effectivement été mis à jour. */
  misAJour: number;
  /** Élèves ignorés car la séance était déjà comptabilisée (idempotence). */
  dejaComptes: number;
  /** Séances relues (1 pour une clôture, N pour un recalcul). */
  seancesTraitees: number;
  /** Écritures en échec, par identifiant d'élève et message. */
  echecs: Array<{ learnerId: string; message: string }>;
}

/** Horodatage retenu pour « dernière activité » d'une séance. */
function dateSeance(seance: Pick<ClassSession, 'endedAt' | 'startedAt' | 'createdAt'>): number | null {
  return Number(seance.endedAt ?? seance.startedAt ?? seance.createdAt ?? 0) || null;
}

/**
 * Écrit un état cumulé sur le document d'un élève.
 *
 * `updateDoc` et non `setDoc(merge)` : l'élève DOIT exister. Un `merge` sur un
 * identifiant erroné créerait un document d'élève fantôme, sans prénom ni nom,
 * qui apparaîtrait dans la liste de la classe et fausserait l'effectif.
 *
 * Les quatre champs d'agrégat sont écrits ENSEMBLE, `countedSessionIds` compris :
 * c'est ce qui rend le couple « compteurs + marqueur » atomique et donc
 * l'idempotence fiable (cf. en-tête).
 */
async function ecrireCumul(classId: string, learnerId: string, cumul: CumulEleve): Promise<void> {
  await updateDoc(doc(firestore, COLLECTIONS.classLearners(classId), learnerId), {
    masteryByCategory: cumul.masteryByCategory,
    totalSessions: cumul.totalSessions,
    lastPlayedAt: cumul.lastPlayedAt,
    countedSessionIds: cumul.countedSessionIds,
    updatedAt: Date.now(),
  });
}

/**
 * Intègre UNE séance terminée dans le cumul de chaque participant.
 *
 * Appelé juste après `endSession`. **Ne lève jamais** : le bilan porte les
 * échecs, et l'appelant décide quoi en dire. Une séance doit pouvoir se terminer
 * même si l'agrégat échoue — bloquer la clôture sur un compteur laisserait des
 * élèves dans une séance `running` qu'ils continueraient de voir sur leur profil.
 *
 * SEULS LES PARTICIPANTS SONT TOUCHÉS : un élève absent ne voit ni son
 * `totalSessions` ni sa `lastPlayedAt` bouger, ce qui est la définition même
 * d'une absence. Un participant sans réponse est en revanche bien compté : il a
 * joué, seulement il n'a atteint aucune case quiz.
 *
 * @param classId      Classe de la séance.
 * @param sessionId    Séance à intégrer.
 * @param eleves       Élèves de la classe (déjà chargés par l'écran).
 * @param participants Participants (déjà lus par le rapport), relus sinon.
 * @param seance       Séance, pour son horodatage de fin.
 */
export async function integrerSeanceDansCumuls(
  classId: string,
  sessionId: string,
  eleves: Learner[],
  participants: ClassSessionParticipant[],
  seance: Pick<ClassSession, 'endedAt' | 'startedAt' | 'createdAt'>
): Promise<BilanCumul> {
  const bilan: BilanCumul = { misAJour: 0, dejaComptes: 0, seancesTraitees: 1, echecs: [] };
  if (!classId || !sessionId) return bilan;

  const joueLe = dateSeance(seance);
  const parId = new Map(eleves.map((e) => [e.id, e]));

  for (const participant of participants) {
    const learnerId = participant.learnerId;
    // Un participant sans élève correspondant (retiré de la classe depuis) n'a
    // plus de document où cumuler. Le rapport de séance, lui, l'affiche toujours
    // — les deux comportements sont cohérents : l'historique de la séance est
    // conservé, le dossier annuel d'un élève sorti de la classe ne bouge plus.
    const eleve = learnerId ? parId.get(learnerId) : undefined;
    if (!eleve) continue;

    const avant = cumulDepuisLearner(eleve);
    const apres = integrerSeance(avant, sessionId, participant.answers ?? [], joueLe);

    // `integrerSeance` renvoie l'objet d'entrée LUI-MÊME quand la séance était
    // déjà comptabilisée : la comparaison de référence évite une écriture inutile.
    if (apres === avant) {
      bilan.dejaComptes += 1;
      continue;
    }

    try {
      await ecrireCumul(classId, eleve.id, apres);
      bilan.misAJour += 1;
    } catch (error) {
      bilan.echecs.push({
        learnerId: eleve.id,
        message: error instanceof Error ? error.message : 'Écriture refusée',
      });
    }
  }

  return bilan;
}

/**
 * Reconstruit DE ZÉRO les cumuls de toute une classe, depuis ses séances
 * `ended`. C'est le filet de sécurité du lot.
 *
 * ═══ POURQUOI CE BOUTON EXISTE ═══
 *
 * Le cumul est écrit à la clôture, côté navigateur de l'enseignant. Un réseau
 * coupé au mauvais moment, un onglet fermé trop vite, et la séance est `ended`
 * sans que les compteurs aient bougé. Sans recalcul, ce cumul serait perdu
 * DÉFINITIVEMENT : les réponses vivent toujours dans `participants`, mais plus
 * rien ne viendrait jamais les relire.
 *
 * ═══ POURQUOI « DE ZÉRO » ET NON « EN COMPLÉMENT » ═══
 *
 * Repartir de `cumulVide()` rend le résultat indépendant de l'état antérieur :
 * un compteur corrompu à la main, un `countedSessionIds` incohérent ou un double
 * comptage d'une version antérieure sont effacés par la reconstruction. Comme
 * `fusionnerCompteurs` est associative, le résultat est exactement la somme des
 * intégrations séance par séance — c'est vérifié par les tests.
 *
 * COÛT : une lecture de la sous-collection `participants` par séance `ended`, et
 * une écriture par élève. Sur une année (~30 séances, ~30 élèves), c'est ~900
 * lectures et 30 écritures pour un clic délibéré et rare. Acceptable ; ce serait
 * inacceptable en automatique à chaque affichage.
 *
 * @param classId Classe à recalculer.
 * @param eleves  Élèves de la classe (retirés compris : leur dossier annuel
 *                reste juste, il ne bougera simplement plus après leur sortie).
 * @param onProgres Notifié à chaque séance relue, pour la barre d'avancement.
 */
export async function recalculerCumuls(
  classId: string,
  eleves: Learner[],
  onProgres?: (traitees: number, total: number) => void
): Promise<BilanCumul> {
  const bilan: BilanCumul = { misAJour: 0, dejaComptes: 0, seancesTraitees: 0, echecs: [] };
  if (!classId) return bilan;

  // Séances terminées de la classe, dans l'ordre chronologique. L'ordre n'a
  // aucune incidence sur les compteurs (l'addition est commutative), mais il en
  // a une sur `lastPlayedAt` si un jour la règle du maximum changeait — autant
  // que la reconstruction suive la réalité.
  const snap = await getDocs(
    query(collection(firestore, COLLECTIONS.classSessions), where('classId', '==', classId))
  );
  const seances = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ClassSession))
    .filter((s) => s.status === 'ended')
    .sort((a, b) => (dateSeance(a) ?? 0) - (dateSeance(b) ?? 0));

  // On repart de zéro pour TOUS les élèves, y compris ceux qui n'apparaîtront
  // dans aucune séance : un élève dont les compteurs auraient été écrits par
  // erreur doit revenir à zéro, sinon le recalcul ne réparerait qu'à moitié.
  const cumuls = new Map<string, CumulEleve>(eleves.map((e) => [e.id, cumulVide()]));

  for (const seance of seances) {
    let participants: ClassSessionParticipant[] = [];
    try {
      participants = await getParticipants(seance.id);
    } catch (error) {
      // Une séance illisible n'arrête pas le recalcul : les autres doivent
      // quand même être intégrées. On la signale comme un échec pour que
      // l'enseignant sache que le total est partiel.
      bilan.echecs.push({
        learnerId: `séance ${seance.id}`,
        message: error instanceof Error ? error.message : 'Séance illisible',
      });
      continue;
    }

    const joueLe = dateSeance(seance);
    for (const participant of participants) {
      const courant = participant.learnerId ? cumuls.get(participant.learnerId) : undefined;
      if (!courant) continue;
      cumuls.set(
        participant.learnerId,
        integrerSeance(courant, seance.id, participant.answers ?? [], joueLe)
      );
    }

    bilan.seancesTraitees += 1;
    onProgres?.(bilan.seancesTraitees, seances.length);
  }

  for (const eleve of eleves) {
    const calcule = cumuls.get(eleve.id);
    if (!calcule) continue;
    const actuel = cumulDepuisLearner(eleve);
    // N'écrire que ce qui change : un recalcul sur une classe déjà à jour ne
    // doit coûter aucune écriture, sinon le bouton serait dissuadé par son prix
    // au moment précis où on veut que le prof l'utilise sans hésiter.
    if (identiques(actuel, calcule)) {
      bilan.dejaComptes += 1;
      continue;
    }
    try {
      await ecrireCumul(classId, eleve.id, calcule);
      bilan.misAJour += 1;
    } catch (error) {
      bilan.echecs.push({
        learnerId: eleve.id,
        message: error instanceof Error ? error.message : 'Écriture refusée',
      });
    }
  }

  return bilan;
}

/**
 * Deux états cumulés sont-ils identiques ? Sert à éviter les écritures inutiles
 * du recalcul. Comparaison structurelle, indépendante de l'ordre des clés.
 */
function identiques(a: CumulEleve, b: CumulEleve): boolean {
  if (a.totalSessions !== b.totalSessions) return false;
  if ((a.lastPlayedAt ?? 0) !== (b.lastPlayedAt ?? 0)) return false;
  if (a.countedSessionIds.join('|') !== b.countedSessionIds.join('|')) return false;

  const clesA = Object.keys(a.masteryByCategory).sort();
  const clesB = Object.keys(b.masteryByCategory).sort();
  if (clesA.join('|') !== clesB.join('|')) return false;
  return clesA.every(
    (cle) =>
      a.masteryByCategory[cle].correct === b.masteryByCategory[cle].correct &&
      a.masteryByCategory[cle].total === b.masteryByCategory[cle].total
  );
}

/**
 * Historique des séances `ended` auxquelles UN élève a participé, avec son score
 * et son taux de réussite. Alimente la fiche élève.
 *
 * ⚠️ COÛT : une lecture de `participants` par séance terminée de la classe. La
 * participation d'un élève n'est PAS interrogeable autrement — Firestore ne sait
 * pas filtrer « les séances où le document `participants/{lid}` existe » sans
 * `collectionGroup`, que les règles n'ouvrent pas. Sur une année scolaire
 * (~30 séances), c'est ~900 documents pour l'ouverture d'une fiche élève :
 * acceptable pour un écran consulté ponctuellement, à revoir si la fiche devait
 * s'afficher en liste.
 */
export interface LigneHistoriqueEleve {
  /** Séance concernée. */
  sessionId: string;
  /** Titre de la séance, ou date à défaut. */
  titre: string;
  /** Date de la séance, en millisecondes epoch. */
  date: number | null;
  /** Score de l'élève dans cette séance. */
  score: number;
  /** Nombre de réponses de quiz. */
  nbReponses: number;
  /** Réponses correctes. */
  nbCorrectes: number;
  /** Taux de réussite en pourcentage entier, `null` sans aucune réponse. */
  taux: number | null;
  /** La séance a-t-elle été intégrée au cumul de l'élève ? */
  comptabilisee: boolean;
}

/**
 * Construit l'historique d'un élève sur toutes les séances terminées de sa classe.
 *
 * `comptabilisee` est affiché sur la fiche : c'est la seule façon pour
 * l'enseignant de repérer une clôture qui a échoué, et de savoir que le bouton
 * « Recalculer les cumuls » a quelque chose à rattraper.
 */
export async function getHistoriqueEleve(
  classId: string,
  learnerId: string,
  countedSessionIds: string[] = []
): Promise<LigneHistoriqueEleve[]> {
  if (!classId || !learnerId) return [];

  const snap = await getDocs(
    query(collection(firestore, COLLECTIONS.classSessions), where('classId', '==', classId))
  );
  const seances = snap.docs
    .map((d) => ({ id: d.id, ...d.data() } as ClassSession))
    .filter((s) => s.status === 'ended');

  const comptees = new Set(countedSessionIds);
  const lignes: LigneHistoriqueEleve[] = [];

  for (const seance of seances) {
    let participants: ClassSessionParticipant[] = [];
    try {
      participants = await getParticipants(seance.id);
    } catch {
      // Séance illisible : on l'omet plutôt que d'afficher une ligne vide qui
      // se lirait comme une absence de l'élève.
      continue;
    }
    const sien = participants.find((p) => p.learnerId === learnerId);
    if (!sien) continue;

    const reponses = sien.answers ?? [];
    const correctes = reponses.filter((r) => r.correct === true).length;
    const date = dateSeance(seance);

    lignes.push({
      sessionId: seance.id,
      titre: seance.title?.trim() || (date ? new Date(date).toLocaleDateString('fr-FR') : 'Séance'),
      date,
      score: sien.score ?? sien.progress?.tokens ?? 0,
      nbReponses: reponses.length,
      nbCorrectes: correctes,
      taux: reponses.length > 0 ? Math.round((correctes / reponses.length) * 100) : null,
      comptabilisee: comptees.has(seance.id),
    });
  }

  // Plus récente d'abord : c'est la séance dont le prof se souvient.
  return lignes.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
}
