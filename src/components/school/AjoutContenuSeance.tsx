'use client';

/**
 * Mode Classe — ajout de contenu APRÈS génération.
 *
 * L'enseignant relit son contenu généré et constate qu'il en manque : trop peu
 * de quiz pour la durée, aucun duel sur la notion qui l'intéresse… Ce panneau
 * lui permet d'en générer un complément, type par type, SANS toucher à ce qui
 * existe (les cartes déjà relues — et éventuellement corrigées — ne sont jamais
 * régénérées).
 *
 * Utilisé à deux endroits : le wizard de création (`/seances/nouvelle`) et la
 * fiche d'une séance déjà créée (`/seances/[sessionId]`), tant qu'elle n'est
 * pas terminée. C'est le pendant côté back-office du tirage sans remise du
 * jeu : plus le paquet est fourni, moins les cartes reviennent en partie.
 */

import { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import type { MixSeance } from '@/lib/class-session-generation';

/** Types proposés à l'ajout, avec leur libellé enseignant. */
const TYPES_AJOUT: Array<{ cle: keyof MixSeance; libelle: string }> = [
  { cle: 'quiz', libelle: 'Quiz' },
  { cle: 'duel', libelle: 'Duels' },
  { cle: 'opportunity', libelle: 'Opportunités' },
  { cle: 'funding', libelle: 'Financements' },
  { cle: 'challenge', libelle: 'Défis' },
];

/** Mix « tout à zéro » — base d'un ajout mono-type. */
const MIX_VIDE: MixSeance = { quiz: 0, duel: 0, funding: 0, opportunity: 0, challenge: 0 };

export default function AjoutContenuSeance({
  onAjouter,
  enCours,
}: {
  /** Lance la génération du complément demandé, puis fusion + sauvegarde. */
  onAjouter: (mix: MixSeance) => void | Promise<void>;
  /** Une génération (initiale ou d'ajout) est en cours : le panneau se fige. */
  enCours: boolean;
}) {
  const [type, setType] = useState<keyof MixSeance>('quiz');
  const [quantite, setQuantite] = useState(3);

  const borner = (n: number) => Math.min(10, Math.max(1, Math.round(n) || 1));

  return (
    <div
      className="flex flex-col gap-2 p-3"
      style={{
        borderRadius: 10,
        border: '1px dashed var(--color-card-border)',
        background: 'var(--color-surface)',
      }}
    >
      <span
        className="flex items-center gap-2"
        style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}
      >
        <Plus size={14} /> Ajouter du contenu
      </span>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          className="input-field"
          type="number"
          min={1}
          max={10}
          value={quantite}
          onChange={(e) => setQuantite(borner(Number(e.target.value)))}
          style={{ width: 76 }}
          aria-label="Nombre de cartes à ajouter"
        />
        <select
          className="input-field"
          value={type}
          onChange={(e) => setType(e.target.value as keyof MixSeance)}
          style={{ width: 'auto', minWidth: 150 }}
          aria-label="Type de cartes à ajouter"
        >
          {TYPES_AJOUT.map((t) => (
            <option key={t.cle} value={t.cle}>
              {t.libelle}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn-secondary flex items-center gap-2"
          style={{ fontSize: 13, opacity: enCours ? 0.5 : 1 }}
          disabled={enCours}
          onClick={() => void onAjouter({ ...MIX_VIDE, [type]: borner(quantite) })}
        >
          <Sparkles size={14} />
          {enCours ? 'Génération en cours…' : 'Générer et ajouter'}
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
        Le complément est généré depuis le même cours, en évitant les questions déjà posées. Les
        cartes existantes — et vos corrections — ne sont pas touchées.
      </p>
    </div>
  );
}
