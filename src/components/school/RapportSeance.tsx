'use client';

/**
 * Rapport pédagogique d'une séance terminée (lot 6).
 *
 * ⚠️ CE DOCUMENT EST MONTRÉ À UNE DIRECTION D'ÉTABLISSEMENT. Deux exigences en
 * découlent, qui priment sur l'esthétique :
 *
 *   1. AUCUN CHIFFRE INDÉFENDABLE. Une notion n'affiche un pourcentage que si
 *      au moins 3 questions ont été posées (cf. `agregerNotions`). Les autres
 *      sont citées sobrement, sans taux — les afficher à « 0 % » sur une seule
 *      question laisserait croire à un échec des élèves là où il n'y a qu'une
 *      absence de mesure.
 *   2. UN VIDE EXPLICITE. Sans réponse remontée, l'écran le DIT au lieu
 *      d'afficher une grille de zéros qui se lirait comme une catastrophe
 *      pédagogique.
 *
 * Toute la statistique vient de fonctions pures testées (`class-report-service`) :
 * ce composant ne calcule rien, il met en forme.
 */

import { useMemo } from 'react';
import { AlertCircle, Award, Clock, Download, Layers, Lightbulb, Users } from 'lucide-react';
import {
  SEUIL_QUESTIONS_NOTION,
  agregerNotions,
  calculerIndicateurs,
  construireCsvRapport,
  suggestionSeanceSuivante,
  type LigneSuivi,
  type NiveauNotion,
  type NotionAgregee,
} from '@/lib/class-report-service';
import type { ClassSession, ClassSessionParticipant, Learner } from '@/types';

interface RapportSeanceProps {
  /** Séance terminée, pour ses horodatages et son titre. */
  seance: ClassSession;
  /** Élèves de la classe — dénominateur de la participation. */
  eleves: Learner[];
  /** Documents de participation lus une fois (`getParticipants`). */
  participants: ClassSessionParticipant[];
  /** Lignes croisées et triées, partagées avec le suivi. */
  lignes: LigneSuivi[];
  /** Nom de la classe, pour le nom du fichier exporté. */
  nomClasse: string;
}

export default function RapportSeance({
  seance,
  eleves,
  participants,
  lignes,
  nomClasse,
}: RapportSeanceProps) {
  const indicateurs = useMemo(
    () => calculerIndicateurs(eleves, participants, seance),
    [eleves, participants, seance]
  );
  const notions = useMemo(() => agregerNotions(participants), [participants]);
  const suggestion = useMemo(() => suggestionSeanceSuivante(notions), [notions]);

  /** Export CSV du détail par élève — patron maison, sans dépendance. */
  const exporterCsv = () => {
    const csv = construireCsvRapport(lignes);
    // Le BOM UTF-8 est indispensable : sans lui, Excel sous Windows affiche
    // « Diop » en « Diop » et le fichier remis à l'établissement paraît corrompu.
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport-${slug(nomClasse)}-${dateFichier(seance.endedAt ?? seance.startedAt)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const aucuneReponse = indicateurs.nbReponses === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ═══ INDICATEURS ═══ */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Indicateur
          icone={<Users size={16} />}
          libelle="Participation"
          valeur={`${indicateurs.nbParticipants} / ${indicateurs.effectifClasse}`}
          detail={`élève${indicateurs.effectifClasse > 1 ? 's' : ''} de la classe`}
        />
        <Indicateur
          icone={<Award size={16} />}
          libelle="Score moyen"
          valeur={indicateurs.nbParticipants > 0 ? String(indicateurs.scoreMoyen) : '—'}
          detail="sur les élèves ayant joué"
        />
        <Indicateur
          icone={<Clock size={16} />}
          libelle="Durée réelle"
          valeur={
            indicateurs.dureeReelleMinutes !== null ? `${indicateurs.dureeReelleMinutes} min` : '—'
          }
          detail={`${seance.durationMinutes} min prévues`}
        />
        <Indicateur
          icone={<Layers size={16} />}
          libelle="Cartes jouées"
          valeur={String(indicateurs.cartesJouees)}
          detail={
            indicateurs.nbReponses > 0
              ? `${indicateurs.nbReponses} réponse${indicateurs.nbReponses > 1 ? 's' : ''} au quiz`
              : 'aucune réponse au quiz'
          }
        />
      </section>

      {/* ═══ NOTIONS MAÎTRISÉES — le cœur du rapport ═══ */}
      <section className="glass-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap" style={{ marginBottom: 4 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Notions maîtrisées
          </h2>
          {indicateurs.tauxGlobal !== null && (
            <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              Réussite globale{' '}
              <strong style={{ color: 'var(--color-text-primary)' }}>{indicateurs.tauxGlobal} %</strong>{' '}
              sur {indicateurs.nbReponses} réponse{indicateurs.nbReponses > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {aucuneReponse ? (
          /*
            ÉTAT VIDE HONNÊTE. La cause la plus fréquente n'est pas un échec des
            élèves mais une séance trop courte, ou des quiz non atteints sur le
            plateau. On l'écrit, plutôt que d'afficher des barres à zéro.
          */
          <div
            className="flex items-start gap-3 p-4"
            style={{ background: 'var(--color-surface-variant)', borderRadius: 10, marginTop: 12 }}
          >
            <AlertCircle size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>
                Aucune réponse de quiz n’a été enregistrée pendant cette séance.
              </strong>
              <br />
              Les notions maîtrisées ne peuvent donc pas être mesurées — ce n’est pas un résultat
              nul, c’est une absence de mesure.{' '}
              {indicateurs.nbParticipants === 0
                ? 'Aucun élève ne s’est connecté à la séance.'
                : `${indicateurs.nbParticipants} élève${indicateurs.nbParticipants > 1 ? 's se sont connectés' : ' s’est connecté'} mais ${indicateurs.nbParticipants > 1 ? 'n’ont' : 'n’a'} atteint aucune case quiz, probablement faute de temps.`}
            </p>
          </div>
        ) : (
          <>
            {notions.notions.length > 0 ? (
              <>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 16px' }}>
                  Classées de la moins maîtrisée à la mieux acquise.
                </p>
                <div className="flex flex-col gap-3">
                  {notions.notions.map((notion) => (
                    <BarreNotion key={notion.category} notion={notion} />
                  ))}
                </div>
                <Legende />
              </>
            ) : (
              /* Des réponses existent, mais aucune notion n'atteint le seuil. */
              <div
                className="flex items-start gap-3 p-4"
                style={{ background: 'var(--color-surface-variant)', borderRadius: 10, marginTop: 12 }}
              >
                <AlertCircle size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                  {indicateurs.nbReponses} réponse{indicateurs.nbReponses > 1 ? 's ont' : ' a'} été
                  enregistrée{indicateurs.nbReponses > 1 ? 's' : ''}, mais aucune notion n’atteint{' '}
                  {SEUIL_QUESTIONS_NOTION} questions — le minimum pour qu’un taux de réussite ait un
                  sens. Une séance plus longue donnera un rapport chiffré.
                </p>
              </div>
            )}

            {/* Notions trop peu évaluées — citées, jamais chiffrées. */}
            {notions.sousEchantillonnees.length > 0 && (
              <div
                style={{
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: '1px solid var(--color-card-border)',
                }}
              >
                <h3 style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Notions trop peu évaluées
                </h3>
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '4px 0 10px', lineHeight: 1.6 }}>
                  Moins de {SEUIL_QUESTIONS_NOTION} questions posées : le taux de réussite ne serait
                  pas significatif, il n’est donc pas affiché.
                </p>
                <ul className="flex flex-wrap gap-2" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {notions.sousEchantillonnees.map((notion) => (
                    <li key={notion.category} className="badge" style={{ fontWeight: 400 }}>
                      {notion.libelle}
                      <span style={{ color: 'var(--color-text-muted)', marginLeft: 6 }}>
                        {notion.total} question{notion.total > 1 ? 's' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* ═══ SUGGESTION POUR LA SÉANCE SUIVANTE ═══ */}
      {suggestion && (
        <section
          className="glass-card p-4 flex items-start gap-3"
          style={{ borderLeft: '3px solid var(--color-primary)' }}
        >
          <Lightbulb size={18} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Séance suivante
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 3, lineHeight: 1.6 }}>
              {suggestion}
            </p>
          </div>
        </section>
      )}

      {/* ═══ DÉTAIL PAR ÉLÈVE ═══ */}
      <section className="glass-card">
        <div
          className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap"
          style={{ borderBottom: '1px solid var(--color-card-border)' }}
        >
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            Détail par élève
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 8 }}>
              {lignes.length} élève{lignes.length > 1 ? 's' : ''}
            </span>
          </h2>
          <button
            className="btn-secondary flex items-center gap-2"
            style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={exporterCsv}
            disabled={lignes.length === 0}
          >
            <Download size={14} /> Exporter en CSV
          </button>
        </div>

        {lignes.length === 0 ? (
          <p className="px-5 py-8" style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>
            Aucun élève dans cette classe.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-card-border)' }}>
                  <Th>Élève</Th>
                  <Th>État</Th>
                  <Th style={{ textAlign: 'right' }}>Score</Th>
                  <Th style={{ textAlign: 'right' }}>Progression</Th>
                  <Th style={{ textAlign: 'right' }}>Réussite</Th>
                  <Th style={{ textAlign: 'right' }}>Réponses</Th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((ligne, index) => {
                  const absent = ligne.etat === 'absent';
                  const taux =
                    ligne.nbReponses > 0
                      ? Math.round((ligne.nbCorrectes / ligne.nbReponses) * 100)
                      : null;
                  return (
                    <tr
                      key={ligne.learnerId}
                      style={{
                        borderBottom:
                          index < lignes.length - 1 ? '1px solid var(--color-card-border)' : 'none',
                        opacity: absent ? 0.6 : 1,
                      }}
                    >
                      <Td>
                        <strong style={{ color: 'var(--color-text-primary)' }}>{ligne.nom}</strong>
                      </Td>
                      <Td>
                        {absent ? (
                          <span className="badge">Pas connecté</span>
                        ) : ligne.etat === 'termine' ? (
                          <span className="badge badge-success">Terminé</span>
                        ) : (
                          <span className="badge badge-info">Partie non terminée</span>
                        )}
                      </Td>
                      <TdNum>{absent ? '—' : ligne.score}</TdNum>
                      <TdNum>{absent ? '—' : `case ${ligne.cellIndex}`}</TdNum>
                      <TdNum>
                        {/* Jamais « 0 % » pour un élève sans réponse : il n'a rien raté,
                            il n'a rien été interrogé. */}
                        {taux === null ? (
                          <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                        ) : (
                          <span style={{ color: couleurNiveau(niveauDe(taux)), fontWeight: 600 }}>
                            {taux} %
                          </span>
                        )}
                      </TdNum>
                      <TdNum>{ligne.nbReponses > 0 ? ligne.nbReponses : '—'}</TdNum>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SOUS-COMPOSANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Carte d'indicateur du bandeau supérieur. */
function Indicateur({
  icone,
  libelle,
  valeur,
  detail,
}: {
  icone: React.ReactNode;
  libelle: string;
  valeur: string;
  detail: string;
}) {
  return (
    <div className="glass-card p-4">
      <p
        className="flex items-center gap-1.5"
        style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--color-text-muted)' }}
      >
        <span style={{ color: 'var(--color-primary)' }}>{icone}</span>
        {libelle}
      </p>
      <p style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', marginTop: 6 }}>
        {valeur}
      </p>
      <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>{detail}</p>
    </div>
  );
}

/** Barre horizontale d'une notion chiffrée. */
function BarreNotion({ notion }: { notion: NotionAgregee }) {
  const couleur = couleurNiveau(notion.niveau);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3" style={{ marginBottom: 5 }}>
        <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
          {notion.libelle}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)', flexShrink: 0 }}>
          <strong style={{ color: couleur, fontSize: 13.5 }}>{notion.taux} %</strong>
          {' · '}
          {notion.correct}/{notion.total} question{notion.total > 1 ? 's' : ''}
        </span>
      </div>
      <div
        style={{ height: 8, borderRadius: 999, background: 'var(--color-surface-variant)', overflow: 'hidden' }}
        role="img"
        aria-label={`${notion.libelle} : ${notion.taux} % de réussite sur ${notion.total} questions`}
      >
        <div style={{ width: `${notion.taux}%`, height: '100%', borderRadius: 999, background: couleur }} />
      </div>
    </div>
  );
}

/** Légende du code couleur. */
function Legende() {
  const entrees: { couleur: string; texte: string }[] = [
    { couleur: 'var(--color-success)', texte: 'Acquis (≥ 70 %)' },
    { couleur: 'var(--color-warning)', texte: 'À consolider (40–69 %)' },
    { couleur: 'var(--color-error)', texte: 'À retravailler (< 40 %)' },
  ];
  return (
    <div className="flex flex-wrap gap-4" style={{ marginTop: 16 }}>
      {entrees.map((e) => (
        <span
          key={e.texte}
          className="flex items-center gap-1.5"
          style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}
        >
          <span style={{ width: 9, height: 9, borderRadius: 2, background: e.couleur }} />
          {e.texte}
        </span>
      ))}
    </div>
  );
}

/** En-tête de colonne du tableau. */
function Th({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      className="text-left px-4 py-3"
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        color: 'var(--color-text-muted)',
        ...style,
      }}
    >
      {children}
    </th>
  );
}

/** Cellule de texte. */
function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-4 py-3" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
      {children}
    </td>
  );
}

/** Cellule numérique, alignée à droite. */
function TdNum({ children }: { children: React.ReactNode }) {
  return (
    <td
      className="px-4 py-3"
      style={{ fontSize: 13, color: 'var(--color-text-secondary)', textAlign: 'right', whiteSpace: 'nowrap' }}
    >
      {children}
    </td>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS DE PRÉSENTATION
// ═══════════════════════════════════════════════════════════════════════════

/** Couleur associée à un verdict pédagogique. */
function couleurNiveau(niveau: NiveauNotion): string {
  if (niveau === 'reussi') return 'var(--color-success)';
  if (niveau === 'a-consolider') return 'var(--color-warning)';
  return 'var(--color-error)';
}

/**
 * Verdict d'un taux INDIVIDUEL.
 *
 * Réimplémenté ici plutôt qu'importé de `niveauDeTaux` — ce serait le même
 * calcul, mais appliqué à un objet différent : les seuils d'une notion de
 * classe et ceux d'un élève pourraient légitimement diverger un jour, et la
 * fonction pure ne doit pas se retrouver contrainte par le tableau.
 */
function niveauDe(taux: number): NiveauNotion {
  if (taux >= 70) return 'reussi';
  if (taux >= 40) return 'a-consolider';
  return 'a-retravailler';
}

/** Fragment de nom de fichier, sans accent ni espace. */
function slug(valeur: string): string {
  return (
    valeur
      .normalize('NFD')
      // Signes diacritiques combinants, détachés par la normalisation NFD.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'seance'
  );
}

/** Date au format `AAAA-MM-JJ` pour le nom du fichier exporté. */
function dateFichier(ms?: number): string {
  const d = ms ? new Date(ms) : new Date();
  return d.toISOString().slice(0, 10);
}
