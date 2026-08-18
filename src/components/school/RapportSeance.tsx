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

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { firestore, COLLECTIONS } from '@/lib/firebase';
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
import type { ClassSession, ClassSessionContent, ClassSessionParticipant, Learner } from '@/types';
import { genererRapportSessionPdf, telechargerPdf } from '@/lib/rapport-session-pdf';

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
  /** Contenu de la séance (questions) — sert à nommer la carte la plus manquée. */
  contenu?: ClassSessionContent | null;
}

export default function RapportSeance({
  seance,
  eleves,
  participants,
  lignes,
  nomClasse,
  contenu,
}: RapportSeanceProps) {
  const indicateurs = useMemo(
    () => calculerIndicateurs(eleves, participants, seance),
    [eleves, participants, seance]
  );
  const notions = useMemo(() => agregerNotions(participants), [participants]);

  // Nom de l'enseignant — sous-titre de l'en-tête (users/ est en lecture publique).
  const [nomProf, setNomProf] = useState('');
  useEffect(() => {
    if (!seance.teacherId) return;
    getDoc(doc(firestore, COLLECTIONS.users, seance.teacherId))
      .then((snap) => setNomProf((snap.data()?.displayName as string) ?? ''))
      .catch(() => {});
  }, [seance.teacherId]);
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

  /** Export PDF du rapport (lot M5) — la pièce de renouvellement de licence. */
  const exporterPdf = async () => {
    const octets = await genererRapportSessionPdf({
      titreSeance: seance.title || 'Séance',
      nomClasse,
      date: new Date(seance.endedAt ?? seance.startedAt ?? Date.now()).toLocaleDateString('fr-FR'),
      participation: { actifs: indicateurs.nbParticipants, effectif: indicateurs.effectifClasse },
      scoreMoyenPct: indicateurs.tauxGlobal,
      notions: [
        ...notions.notions.map((n) => ({
          libelle: n.libelle,
          tauxPct: n.total > 0 ? Math.round((n.correct / n.total) * 100) : null,
        })),
        ...notions.sousEchantillonnees.map((n) => ({ libelle: n.libelle, tauxPct: null })),
      ],
      ...(seance.prolongement?.actif
        ? {
            prolongement: {
              dateLimite: seance.prolongement.dateLimite,
              faits: 0, // instrumentation mobile à venir (lot M3 mobile)
              total: indicateurs.effectifClasse,
            },
          }
        : {}),
      apprenants: lignes
        .filter((l) => l.etat !== 'absent')
        .map((l) => ({
          nom: l.nom,
          score: l.score,
          correctes: l.nbCorrectes,
          total: l.nbReponses,
        })),
    });
    telechargerPdf(octets, `rapport-${slug(nomClasse)}-${dateFichier(seance.endedAt ?? seance.startedAt)}.pdf`);
  };

  // ── Tuiles maquette (14/08) : tout est calculé depuis les données réelles ──
  const participantsActifs = lignes.filter((l) => l.etat !== 'absent');
  const progressionMoyenne = participantsActifs.length
    ? Math.round(participantsActifs.reduce((somme, l) => somme + l.cellIndex, 0) / participantsActifs.length)
    : null;
  const cartesParJoueur = participantsActifs.length
    ? Math.round(indicateurs.cartesJouees / participantsActifs.length)
    : null;

  /**
   * « La carte qui a fait hésiter » : la question la PLUS MANQUÉE de la séance,
   * parmi celles répondues au moins 3 fois (même seuil que les notions — un
   * échec sur 1 réponse ne dit rien). Le TEMPS de réflexion n'est pas affiché :
   * le mobile ne le mesure pas encore, et on n'invente pas un chiffre.
   */
  const carteLaPlusManquee = useMemo(() => {
    const parQuiz = new Map<string, { total: number; manquees: number }>();
    for (const participant of participants) {
      for (const reponse of participant.answers ?? []) {
        if (!reponse.quizId) continue;
        const compteur = parQuiz.get(reponse.quizId) ?? { total: 0, manquees: 0 };
        compteur.total += 1;
        if (reponse.correct !== true) compteur.manquees += 1;
        parQuiz.set(reponse.quizId, compteur);
      }
    }
    let pire: { quizId: string; total: number; manquees: number } | null = null;
    for (const [quizId, compteur] of parQuiz) {
      if (compteur.total < 3 || compteur.manquees === 0) continue;
      if (!pire || compteur.manquees / compteur.total > pire.manquees / pire.total) {
        pire = { quizId, ...compteur };
      }
    }
    if (!pire) return null;
    const question = contenu?.quizzes.find((q) => q.id === pire.quizId)?.question;
    return question ? { question, total: pire.total, manquees: pire.manquees } : null;
  }, [participants, contenu]);

  const aucuneReponse = indicateurs.nbReponses === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ═══ EN-TÊTE (maquette du 17/08) ═══ */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Rapport de session
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {seance.title || 'Séance'} · {nomClasse}
            {seance.endedAt || seance.startedAt
              ? ` · ${new Date(seance.endedAt ?? seance.startedAt ?? 0).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`
              : ''}
          </p>
          {nomProf && (
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>{nomProf}</p>
          )}
        </div>
        <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
          <Link
            href={`/classes/${seance.classId}`}
            className="flex items-center gap-2"
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', border: '1px solid var(--color-card-border)', borderRadius: 10, padding: '9px 15px', background: '#FFF', textDecoration: 'none' }}
          >
            <Award size={14} /> Générer les certificats
          </Link>
          <button
            type="button"
            onClick={() => void exporterPdf()}
            className="flex items-center gap-2"
            style={{ fontSize: 13, fontWeight: 700, color: '#0F1C2E', background: '#F5A623', border: 'none', borderRadius: 10, padding: '10px 16px', cursor: 'pointer' }}
          >
            <Download size={14} /> Partager le rapport (PDF)
          </button>
        </div>
      </div>

      {/* ═══ BANDEAU D'OUVERTURE (maquette) ═══ */}
      <section
        className="flex items-center gap-4 flex-wrap"
        style={{ background: '#0F1C2E', borderRadius: 16, padding: '18px 22px' }}
      >
        <span style={{ fontSize: 34, fontWeight: 800, color: '#FFFFFF', lineHeight: 1 }}>
          {indicateurs.nbParticipants}
        </span>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, flex: 1, minWidth: 260 }}>
          <strong style={{ color: '#FFFFFF' }}>
            apprenant{indicateurs.nbParticipants > 1 ? 's ont' : ' a'} participé activement
          </strong>{' '}
          à cette séance — chacun sur son propre plateau, à son rythme.
          {indicateurs.tauxGlobal !== null && (
            <> Score moyen : <strong style={{ color: '#FFFFFF' }}>{indicateurs.tauxGlobal} %</strong>.</>
          )}{' '}
          Le rapport PDF sert de pièce pour le renouvellement de la licence de l’établissement.
        </p>
      </section>

      {/* ═══ INDICATEURS ═══ */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Indicateur
          icone={<Users size={16} />}
          libelle="Participation"
          valeur={
            indicateurs.effectifClasse > 0
              ? `${Math.round((indicateurs.nbParticipants / indicateurs.effectifClasse) * 100)} %`
              : '—'
          }
          detail={`${indicateurs.nbParticipants} apprenant${indicateurs.nbParticipants > 1 ? 's' : ''} sur ${indicateurs.effectifClasse}`}
        />
        <Indicateur
          icone={<Award size={16} />}
          libelle="Score moyen"
          valeur={indicateurs.nbParticipants > 0 ? String(indicateurs.scoreMoyen) : '—'}
          detail="Sur les quiz réellement joués"
        />
        <Indicateur
          icone={<Layers size={16} />}
          libelle="Cartes jouées"
          valeur={cartesParJoueur !== null ? `${cartesParJoueur} / joueur` : '—'}
          detail={`${indicateurs.cartesJouees} au total · quiz, opportunités, financements`}
        />
        <Indicateur
          icone={<Clock size={16} />}
          libelle="Progression moyenne"
          valeur={progressionMoyenne !== null ? `${progressionMoyenne} cases` : '—'}
          detail={
            indicateurs.dureeReelleMinutes !== null
              ? `Chacun s'est arrêté où il en était · ${indicateurs.dureeReelleMinutes} min de jeu`
              : "Chacun s'est arrêté où il en était"
          }
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4">
      {/* ═══ NOTIONS MAÎTRISÉES — le cœur du rapport ═══ */}
      <section className="glass-card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap" style={{ marginBottom: 4 }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Notions rencontrées
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
              Score moyen sur les cartes de cette séance — de quoi préparer le prochain cours
            </p>
          </div>
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
        </div>

        {/* ═══ Colonne droite (maquette) : carte qui a fait hésiter,
            prolongement, certificat ═══ */}
        <div className="flex flex-col gap-4">
          {carteLaPlusManquee && (
            <section
              style={{ background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.35)', borderRadius: 14, padding: '16px 18px' }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, color: '#B87A0C', marginBottom: 8 }}>
                LA CARTE QUI A FAIT HÉSITER
              </div>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.55 }}>
                « {carteLaPlusManquee.question} »
              </p>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8, lineHeight: 1.55 }}>
                Manquée par {carteLaPlusManquee.manquees} joueur{carteLaPlusManquee.manquees > 1 ? 's' : ''} sur{' '}
                {carteLaPlusManquee.total}. À reprendre en ouverture du prochain cours.
              </p>
            </section>
          )}

          {seance.prolongement?.actif && (
            <section className="glass-card" style={{ padding: '16px 18px' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 8 }}>
                Prolongement assigné
              </h3>
              <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                Quiz à faire sur l’app
                {seance.prolongement.dateLimite
                  ? <> avant le <strong style={{ color: 'var(--color-text-primary)' }}>
                      {new Date(seance.prolongement.dateLimite).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                    </strong></>
                  : ''}.
              </p>
              <div style={{ height: 7, borderRadius: 4, background: 'var(--color-surface)', overflow: 'hidden', margin: '10px 0 5px' }}>
                <div style={{ width: '3%', height: '100%', background: '#0F1C2E', borderRadius: 4 }} />
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                <strong style={{ color: 'var(--color-text-primary)' }}>0</strong> / {indicateurs.effectifClasse}{' '}
                apprenants l’ont terminé — le comptage arrive avec la prochaine version de l’app.
              </p>
            </section>
          )}

          <section className="glass-card" style={{ padding: '16px 18px' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 2 }}>
              Certificat apprenant
            </h3>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 10 }}>
              Aperçu du certificat nominatif
            </p>
            <div style={{ background: '#0F1C2E', borderRadius: 12, padding: '16px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: '#F5A623' }}>
                CERTIFICAT STARTUP LUDO
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', margin: '6px 0 4px' }}>
                {lignes[0]?.nom ?? 'Prénom Nom'}
              </div>
              <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.7)' }}>
                {nomClasse} · co-signé CONCREE et l’établissement
              </div>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 10, lineHeight: 1.55 }}>
              Les certificats se génèrent depuis la fiche de la classe — l’éligibilité se joue sur le
              cumul annuel, pas sur une seule séance.
            </p>
          </section>
        </div>
      </div>

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
