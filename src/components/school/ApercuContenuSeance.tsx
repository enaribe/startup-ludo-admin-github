'use client';

/**
 * Aperçu ÉDITABLE du contenu généré pour une séance.
 *
 * POURQUOI CET ÉCRAN EST OBLIGATOIRE, et pas un confort : l'IA se trompe sur les
 * contenus métier pointus (SPEC §4, « Réserves »). Un quiz faux projeté devant
 * une classe, c'est l'enseignant qui le porte — et l'argument de vente auprès de
 * l'établissement (« c'est VOTRE programme ») qui s'effondre. On ne lance donc
 * jamais une séance sans avoir donné à l'enseignant les moyens de relire.
 *
 * DEUX PARTIS PRIS :
 *   1. **La catégorie est un `select`, jamais un champ libre.** C'est le point
 *      qui protège le rapport du lot 6 : laisser corriger « financement » en
 *      « Financement des startups » recréerait à la main le foisonnement de
 *      catégories que la liste fermée du prompt élimine.
 *   2. **La bonne réponse se désigne par un bouton radio sur l'option**, pas par
 *      un index à saisir. Corriger un index de tête est la manière la plus sûre
 *      de rendre une question ingagnable sans s'en apercevoir.
 *
 * Les financements / opportunités / défis ne sont volontairement PAS éditables :
 * ce sont des événements de plateau sans bonne réponse, ils ne portent aucun
 * enjeu pédagogique évaluable. Ils restent affichés pour que l'enseignant sache
 * ce que ses élèves verront, et supprimables s'ils sont hors sujet.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Coins, Sparkles, Swords, Trash2, TriangleAlert } from 'lucide-react';
import { CATEGORIES_QUIZ } from '@/lib/ai-prompts';
import type { ClassSessionContent, DifficultyLevel, Quiz } from '@/types';

/** Libellés d'affichage des catégories fermées. */
const LIBELLES_CATEGORIE: Record<string, string> = {
  'business-model': 'Business model',
  financement: 'Financement',
  marketing: 'Marketing',
  legal: 'Juridique',
  management: 'Management',
  tech: 'Tech',
  pitch: 'Pitch',
  strategie: 'Stratégie',
  'aspects-techniques': 'Aspects techniques',
};

/** Difficultés proposées, dans l'ordre croissant. */
const DIFFICULTES: DifficultyLevel[] = ['facile', 'moyen', 'difficile'];

interface ApercuContenuSeanceProps {
  /** Contenu affiché et édité. */
  contenu: ClassSessionContent;
  /** Appelé à chaque modification, avec le contenu complet mis à jour. */
  onChange: (contenu: ClassSessionContent) => void;
}

export default function ApercuContenuSeance({ contenu, onChange }: ApercuContenuSeanceProps) {
  const [ouvert, setOuvert] = useState<string | null>(contenu.quizzes[0]?.id ?? null);

  const majQuiz = (index: number, patch: Partial<Quiz>) => {
    const quizzes = contenu.quizzes.map((q, i) => (i === index ? { ...q, ...patch } : q));
    onChange({ ...contenu, quizzes });
  };

  const supprimerQuiz = (index: number) => {
    onChange({ ...contenu, quizzes: contenu.quizzes.filter((_, i) => i !== index) });
  };

  const nbEvenements =
    contenu.fundings.length + contenu.opportunities.length + contenu.challengeEvents.length;

  return (
    <div className="flex flex-col gap-4">
      {/* Bandeau de responsabilité — assumé, pas décoratif. */}
      <div
        className="flex items-start gap-3 p-3"
        style={{
          borderRadius: 10,
          background: 'var(--color-warning-light, rgba(255,193,7,0.12))',
          border: '1px solid var(--color-card-border)',
        }}
      >
        <TriangleAlert size={16} style={{ color: 'var(--color-warning, #B7791F)', flexShrink: 0, marginTop: 2 }} />
        <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          <strong>Relisez avant de lancer.</strong> Le contenu est généré depuis votre cours, mais
          l’IA peut se tromper sur une notion pointue. Corrigez la question, les réponses ou la
          catégorie directement ici — c’est ce que verront vos élèves.
        </p>
      </div>

      {/* Compteurs */}
      <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
        <span className="badge badge-info">{contenu.quizzes.length} quiz</span>
        <span className="badge">{contenu.duels.length} duels</span>
        <span className="badge">{nbEvenements} événements de plateau</span>
      </div>

      {/* ===== QUIZ — le cœur : catégorie + difficulté + bonne réponse ===== */}
      {contenu.quizzes.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          Aucun quiz généré. Sans quiz, le rapport de fin de séance n’aura aucune notion à mesurer.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {contenu.quizzes.map((quiz, index) => {
            const deplie = ouvert === quiz.id;
            return (
              <div
                key={quiz.id}
                className="glass-card"
                style={{ padding: 0, overflow: 'hidden' }}
              >
                <div className="flex items-center gap-2 p-3">
                  <button
                    type="button"
                    className="flex items-center gap-2"
                    style={{ flex: 1, textAlign: 'left', cursor: 'pointer', minWidth: 0 }}
                    onClick={() => setOuvert(deplie ? null : quiz.id)}
                  >
                    {deplie ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span
                      style={{
                        fontSize: 13,
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {quiz.question || <em>Question vide</em>}
                    </span>
                  </button>
                  <span className="badge" style={{ flexShrink: 0 }}>
                    {LIBELLES_CATEGORIE[quiz.category] ?? quiz.category}
                  </span>
                  <span className="badge" style={{ flexShrink: 0 }}>
                    {quiz.difficulty ?? 'moyen'}
                  </span>
                  <button
                    type="button"
                    onClick={() => supprimerQuiz(index)}
                    title="Supprimer ce quiz"
                    style={{ cursor: 'pointer', color: 'var(--color-danger, #C53030)', flexShrink: 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {deplie && (
                  <div
                    className="flex flex-col gap-3 p-3"
                    style={{ borderTop: '1px solid var(--color-card-border)' }}
                  >
                    <label className="flex flex-col gap-1">
                      <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>Question</span>
                      <textarea
                        className="input-field"
                        rows={2}
                        value={quiz.question}
                        onChange={(e) => majQuiz(index, { question: e.target.value })}
                      />
                    </label>

                    <div className="flex flex-col gap-1">
                      <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                        Réponses — cochez la bonne
                      </span>
                      {quiz.options.map((option, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`bonne_${quiz.id}`}
                            checked={quiz.correctAnswer === oi}
                            onChange={() => majQuiz(index, { correctAnswer: oi })}
                            style={{ cursor: 'pointer', flexShrink: 0 }}
                          />
                          <input
                            className="input-field"
                            value={option}
                            onChange={(e) => {
                              const options = quiz.options.map((o, k) => (k === oi ? e.target.value : o));
                              majQuiz(index, { options });
                            }}
                          />
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
                      <label className="flex flex-col gap-1">
                        <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                          Catégorie (liste fermée)
                        </span>
                        <select
                          className="input-field"
                          style={{ width: 'auto', minWidth: 180 }}
                          value={quiz.category}
                          onChange={(e) => majQuiz(index, { category: e.target.value })}
                        >
                          {CATEGORIES_QUIZ.map((cat) => (
                            <option key={cat} value={cat}>
                              {LIBELLES_CATEGORIE[cat] ?? cat}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>Difficulté</span>
                        <select
                          className="input-field"
                          style={{ width: 'auto', minWidth: 130 }}
                          value={quiz.difficulty ?? 'moyen'}
                          onChange={(e) =>
                            majQuiz(index, { difficulty: e.target.value as DifficultyLevel })
                          }
                        >
                          {DIFFICULTES.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="flex flex-col gap-1">
                      <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
                        Explication montrée après la réponse
                      </span>
                      <textarea
                        className="input-field"
                        rows={2}
                        value={quiz.explanation ?? ''}
                        onChange={(e) => majQuiz(index, { explanation: e.target.value })}
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== DUELS — question + catégorie, les points restent la règle du jeu ===== */}
      {contenu.duels.length > 0 && (
        <details className="glass-card p-3">
          <summary className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: 13 }}>
            <Swords size={14} /> {contenu.duels.length} duels
          </summary>
          <div className="flex flex-col gap-2 mt-3">
            {contenu.duels.map((duel, index) => (
              <div key={duel.id} className="flex items-center gap-2">
                <input
                  className="input-field"
                  value={duel.question}
                  onChange={(e) => {
                    const duels = contenu.duels.map((d, i) =>
                      i === index ? { ...d, question: e.target.value } : d
                    );
                    onChange({ ...contenu, duels });
                  }}
                />
                <select
                  className="input-field"
                  style={{ width: 'auto', minWidth: 160, flexShrink: 0 }}
                  value={duel.category}
                  onChange={(e) => {
                    const duels = contenu.duels.map((d, i) =>
                      i === index ? { ...d, category: e.target.value } : d
                    );
                    onChange({ ...contenu, duels });
                  }}
                >
                  {CATEGORIES_QUIZ.map((cat) => (
                    <option key={cat} value={cat}>
                      {LIBELLES_CATEGORIE[cat] ?? cat}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    onChange({ ...contenu, duels: contenu.duels.filter((_, i) => i !== index) })
                  }
                  title="Supprimer ce duel"
                  style={{ cursor: 'pointer', color: 'var(--color-danger, #C53030)', flexShrink: 0 }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* ===== ÉVÉNEMENTS DE PLATEAU — consultation et retrait ===== */}
      {nbEvenements > 0 && (
        <details className="glass-card p-3">
          <summary className="flex items-center gap-2" style={{ cursor: 'pointer', fontSize: 13 }}>
            <Coins size={14} /> {nbEvenements} événements de plateau
          </summary>
          <div className="flex flex-col gap-3 mt-3">
            <ListeEvenements
              titre="Financements"
              items={contenu.fundings}
              onSupprimer={(i) =>
                onChange({ ...contenu, fundings: contenu.fundings.filter((_, k) => k !== i) })
              }
            />
            <ListeEvenements
              titre="Opportunités"
              items={contenu.opportunities}
              onSupprimer={(i) =>
                onChange({
                  ...contenu,
                  opportunities: contenu.opportunities.filter((_, k) => k !== i),
                })
              }
            />
            <ListeEvenements
              titre="Défis"
              items={contenu.challengeEvents}
              onSupprimer={(i) =>
                onChange({
                  ...contenu,
                  challengeEvents: contenu.challengeEvents.filter((_, k) => k !== i),
                })
              }
            />
          </div>
        </details>
      )}

      {contenu.reviewedAt && (
        <p className="flex items-center gap-2" style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
          <Sparkles size={12} /> Contenu relu et corrigé.
        </p>
      )}
    </div>
  );
}

/** Événement de plateau affiché en lecture, avec retrait possible. */
interface EvenementAffichable {
  id: string;
  title: string;
  description: string;
  tokens: number;
}

/** Liste compacte d'événements d'un même type. */
function ListeEvenements({
  titre,
  items,
  onSupprimer,
}: {
  titre: string;
  items: EvenementAffichable[];
  onSupprimer: (index: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-text-muted)' }}>
        {titre}
      </span>
      {items.map((item, i) => (
        <div key={item.id} className="flex items-center gap-2">
          <span
            style={{
              fontSize: 12.5,
              color: 'var(--color-text-secondary)',
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.title} — {item.description}
          </span>
          <span className="badge" style={{ flexShrink: 0 }}>
            {item.tokens > 0 ? `+${item.tokens}` : item.tokens} jetons
          </span>
          <button
            type="button"
            onClick={() => onSupprimer(i)}
            title={`Retirer « ${item.title} »`}
            style={{ cursor: 'pointer', color: 'var(--color-danger, #C53030)', flexShrink: 0 }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
