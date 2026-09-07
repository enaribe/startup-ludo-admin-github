'use client';

/**
 * Bandeau « compte en attente d'activation ».
 *
 * Posé en haut de CHAQUE espace (établissement, enseignant, annonceur,
 * partenaire) quand `enAttente` est vrai. Il tient trois promesses :
 *
 *   1. dire clairement que le compte n'est pas actif — sans quoi l'utilisateur
 *      croirait à une panne en voyant ses écrans vides ;
 *   2. expliquer POURQUOI les écrans sont vides (aucune donnée n'existe encore,
 *      ce n'est pas un bug) ;
 *   3. dire ce qui se passe ensuite, et quand.
 *
 * Il ne se referme pas : ce n'est pas une notification, c'est l'état du compte.
 */

import { Clock } from 'lucide-react';

const NAVY = '#0F1C2E';

/** « 2 septembre 2026 » — date de dépôt, jamais inventée. */
function dateLisible(ms: number | null | undefined): string | null {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return null;
  return new Date(ms).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function BandeauCompteEnAttente({
  orgName,
  demandeLe,
  /** Délai annoncé : la direction pour un enseignant, CONCREE sinon. */
  examinePar = 'concree',
}: {
  orgName?: string | null;
  demandeLe?: number | null;
  examinePar?: 'concree' | 'direction';
}) {
  const depot = dateLisible(demandeLe);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '13px 18px',
        background: 'rgba(245,166,35,0.10)',
        borderBottom: '1px solid rgba(245,166,35,0.38)',
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          background: 'rgba(245,166,35,0.22)',
          flexShrink: 0,
        }}
      >
        <Clock size={16} color="#B87A0C" />
      </span>

      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: NAVY }}>
          Compte en attente d’activation
          {orgName ? <span style={{ fontWeight: 600 }}> · {orgName}</span> : null}
        </p>
        <p style={{ fontSize: 12.5, color: '#5A4A1A', marginTop: 3, lineHeight: 1.55 }}>
          {examinePar === 'direction'
            ? 'Votre direction doit valider votre compte et vous affecter vos classes.'
            : 'L’équipe CONCREE examine votre demande (48 h ouvrées).'}{' '}
          Vous pouvez parcourir votre espace pour le découvrir, mais les actions
          restent désactivées et vos écrans sont vides tant que le compte n’est
          pas activé.
          {depot ? ` Demande déposée le ${depot}.` : ''}
        </p>
      </div>
    </div>
  );
}
