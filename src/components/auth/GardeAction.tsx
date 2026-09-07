'use client';

/**
 * Neutralisation des actions d'un compte EN ATTENTE d'activation.
 *
 * Le compte peut parcourir son espace ; il ne doit rien pouvoir déclencher.
 * Cette barrière-ci est la plus visible mais la MOINS solide des trois — elle
 * évite la mauvaise surprise, pas la fraude. Les deux autres, elles, ne se
 * contournent pas : les routes API refusent en 403 (`exigerCompteActif`) et les
 * règles Firestore refusent faute de claim.
 */

import type { ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';

const MESSAGE = 'Votre compte n’est pas encore activé — action indisponible.';

/**
 * Enveloppe un bouton (ou tout élément cliquable) pour l'éteindre quand le
 * compte est en attente : plus de clic, plus de focus clavier, curseur barré
 * et infobulle expliquant pourquoi.
 *
 * On garde l'élément VISIBLE plutôt que de le masquer : voir l'action grisée
 * apprend à l'utilisateur ce qu'il pourra faire une fois activé.
 */
export default function GardeAction({
  children,
  raison = MESSAGE,
}: {
  children: ReactNode;
  raison?: string;
}) {
  const { enAttente } = useAuth();
  if (!enAttente) return <>{children}</>;

  return (
    <span
      title={raison}
      aria-disabled="true"
      // `inert` retire l'arbre du clavier et du pointeur : un simple
      // `pointer-events: none` laisserait le bouton atteignable au Tab.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...({ inert: '' } as any)}
      style={{ display: 'contents', cursor: 'not-allowed' }}
    >
      <span style={{ display: 'contents', opacity: 0.45 }}>{children}</span>
    </span>
  );
}

/** Même garde, en valeur booléenne, pour les `disabled` déjà présents. */
export function useActionBloquee(): { bloquee: boolean; raison: string } {
  const { enAttente } = useAuth();
  return { bloquee: enAttente, raison: MESSAGE };
}
