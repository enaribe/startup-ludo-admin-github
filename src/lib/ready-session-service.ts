/**
 * Séances prêtes à l'emploi — le catalogue proposé à l'enseignant.
 *
 * POURQUOI CETTE COLLECTION : les cinq séances vivaient dans une constante du
 * wizard (`SEANCES_PRETES`). Deux conséquences.
 *
 * 1. En ajouter une demandait une livraison. L'équipe pédagogique ne pouvait
 *    rien changer seule.
 * 2. Elles ne portaient qu'un TITRE et une DURÉE. Choisir « Le business plan »
 *    préremplissait deux champs et rien d'autre : la séance partait sans
 *    contenu, et tirait les cartes ordinaires de l'édition. L'enseignant
 *    croyait lancer une séance préparée.
 *
 * Le contenu est désormais GÉNÉRÉ UNE FOIS, à la création, et stocké avec la
 * séance. L'enseignant le reçoit tel quel — pas de génération à chaque
 * lancement : elle coûterait un appel modèle par séance, prendrait plusieurs
 * secondes devant une classe qui attend, et donnerait un contenu différent à
 * chaque fois pour une même séance annoncée comme « prête ».
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';

import { firestore, COLLECTIONS } from './firebase';
import type { ClassSessionContent } from '@/types';

export interface ReadySession {
  id: string;
  titre: string;
  /** Durée conseillée, en minutes. */
  duree: number;
  difficulte: 'Débutant' | 'Intermédiaire' | 'Avancé';
  /** Édition de jeu dans laquelle la séance se déroule. */
  editionId: string;
  /** Une ligne de contexte pour l'enseignant (« idéale en première séance »). */
  note?: string;
  /** Consignes ayant servi à générer le contenu — rejouables pour régénérer. */
  consignes?: string;
  /**
   * Contenu de jeu, généré une fois et figé.
   *
   * Absent tant que CONCREE ne l'a pas généré : la séance reste alors visible
   * mais signalée comme incomplète côté admin. Jamais silencieusement vide
   * pour l'enseignant.
   */
  contenu?: ClassSessionContent;
  /** Ordre d'affichage dans la liste proposée à l'enseignant. */
  ordre: number;
  /** Masquée aux enseignants sans être supprimée (retrait temporaire). */
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Toutes les séances, ordonnées — vue CONCREE. */
export async function getReadySessions(): Promise<ReadySession[]> {
  const snap = await getDocs(
    query(collection(firestore, COLLECTIONS.readySessions), orderBy('ordre', 'asc'))
  );
  return snap.docs.map((d) => ({ ...(d.data() as ReadySession), id: d.id }));
}

/**
 * Séances proposées à l'enseignant : actives ET pourvues d'un contenu.
 *
 * Le filtre sur `contenu` est le cœur du correctif — une séance annoncée
 * « prête à l'emploi » qui n'a rien à jouer est pire qu'une séance absente.
 */
export async function getReadySessionsPubliees(): Promise<ReadySession[]> {
  return (await getReadySessions()).filter((s) => s.active && !!s.contenu);
}

export async function getReadySession(id: string): Promise<ReadySession | null> {
  const snap = await getDoc(doc(firestore, COLLECTIONS.readySessions, id));
  return snap.exists() ? { ...(snap.data() as ReadySession), id: snap.id } : null;
}

export async function saveReadySession(
  id: string,
  patch: Partial<Omit<ReadySession, 'id'>>
): Promise<void> {
  await setDoc(
    doc(firestore, COLLECTIONS.readySessions, id),
    { ...patch, updatedAt: Date.now() },
    { merge: true }
  );
}

export async function supprimerReadySession(id: string): Promise<void> {
  await deleteDoc(doc(firestore, COLLECTIONS.readySessions, id));
}

/** Compte ce qu'un contenu porte réellement — affiché en face de chaque séance. */
export function resumeContenu(c?: ClassSessionContent): string {
  if (!c) return 'aucun contenu';
  const parts = [
    [c.quizzes?.length ?? 0, 'quiz'],
    [c.duels?.length ?? 0, 'duel'],
    [c.fundings?.length ?? 0, 'financement'],
    [c.opportunities?.length ?? 0, 'opportunité'],
    [c.challengeEvents?.length ?? 0, 'défi'],
  ] as const;
  const utiles = parts.filter(([n]) => n > 0);
  if (utiles.length === 0) return 'contenu vide';
  return utiles.map(([n, mot]) => `${n} ${mot}${n > 1 && mot !== 'quiz' ? 's' : ''}`).join(' · ');
}
