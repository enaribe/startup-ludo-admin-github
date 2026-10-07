/**
 * Interrupteurs de fonctionnalités du back-office.
 *
 * ⚠️ CES DRAPEAUX ONT UN JUMEAU CÔTÉ MOBILE (`startup-ludo/src/config/features.ts`).
 * Les deux doivent être changés ENSEMBLE : c'est le mobile qui décide ce qui
 * s'affiche en jeu, l'admin ne fait qu'en tenir compte pour ne pas promettre
 * autre chose à l'annonceur.
 */

/**
 * CIBLAGE_SPONSOR_ACTIF — filtrage des cartes promues par secteur et région.
 *
 * ═══ EN PAUSE DEPUIS LE 06/10/2026 ═══
 *
 * Le ciblage fonctionne, mais il suppose une base de joueurs assez large pour
 * que chaque segment reste atteignable. Ce n'est pas encore le cas : une
 * campagne ciblée sur un secteur ne touchait presque personne, et l'annonceur
 * en concluait que le produit ne marche pas (retour du point de test).
 *
 * À `false`, le back-office garde les champs de ciblage — les valeurs saisies
 * sont conservées et s'appliqueront à la réactivation — mais il le DIT à
 * l'annonceur et cesse de rétrécir l'estimation d'audience en conséquence.
 *
 * Le filtrage réel est côté jeu : `CIBLAGE_SPONSOR_ACTIF` du mobile.
 */
export const CIBLAGE_SPONSOR_ACTIF = false;
