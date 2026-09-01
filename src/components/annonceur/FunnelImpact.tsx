'use client';

/**
 * Funnel d'impact d'une carte : Vues → Flips → Clics → Sauvegardes.
 *
 * ═══ POURQUOI UN ENTONNOIR CENTRÉ, ET NON DES BARRES ALIGNÉES ═══
 *
 * La forme EST le message : chaque marche est plus étroite que la précédente,
 * et le rétrécissement se voit avant même de lire un chiffre. Des barres
 * alignées à gauche demandaient de comparer des longueurs ; ici, la perte
 * saute aux yeux. Le libellé et la valeur vivent DANS la barre, ce qui évite
 * l'aller-retour entre une légende et une forme.
 *
 * ⚠️ LE TAUX AFFICHÉ ENTRE DEUX MARCHES EST UNE CHUTE, PAS UN PASSAGE.
 * « ↓ 23,5 % » signifie « il en reste 23,5 % de l'étape précédente », soit le
 * ratio marche / marche précédente. C'est le sens que porte la flèche vers le
 * bas — l'écrire comme un taux de passage sans la flèche laisserait croire à
 * une progression.
 *
 * Le FLIP (retournement de la carte) reste dans le funnel même si le mobile ne
 * le mesure pas encore : la marche s'affiche à zéro avec « bientôt mesuré ».
 * La retirer aujourd'hui pour la réinsérer plus tard changerait la lecture des
 * taux d'un rapport à l'autre — un annonceur qui compare deux exports doit
 * comparer la même chose.
 */

export interface EtapeFunnel {
  libelle: string;
  valeur: number;
  /** Marche pas encore mesurée par l'app mobile (flips avant le lot 4). */
  aVenir?: boolean;
}

/** Largeur de la marche la plus étroite, en % — sous ce seuil, le texte ne tient plus. */
const LARGEUR_MIN_PCT = 38;

/**
 * Sous ce nombre de vues, un entonnoir ne veut plus rien dire : chaque unité
 * pèse des dizaines de points de pourcentage, et la forme suggère une tendance
 * là où il n'y a qu'un ou deux événements. On affiche alors les chiffres bruts.
 */
const SEUIL_FUNNEL_LISIBLE = 10;

export default function FunnelImpact({ etapes }: { etapes: EtapeFunnel[] }) {
  const base = etapes[0]?.valeur ?? 0;

  // ═══ TROP PEU DE DONNÉES : LES CHIFFRES, PAS LA FORME ═══
  //
  // Un entonnoir dessiné sur 1 vue et 3 clics est illisible ET trompeur : les
  // marches s'inversent, les taux dépassent 100 %. Tant que le volume ne porte
  // pas de tendance, on montre les valeurs telles quelles et on dit pourquoi.
  if (base < SEUIL_FUNNEL_LISIBLE) {
    return (
      <div>
        <div className="flex flex-col gap-2">
          {etapes.map((etape) => (
            <div
              key={etape.libelle}
              className="flex items-center justify-between gap-3"
              style={{
                padding: '11px 14px',
                borderRadius: 10,
                background: 'var(--color-surface)',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                {etape.libelle}
                {etape.aVenir && (
                  <span style={{ fontSize: 10.5, marginLeft: 6, fontStyle: 'italic', color: 'var(--color-text-muted)' }}>
                    bientôt mesuré
                  </span>
                )}
              </span>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--color-text-primary)' }}>
                {etape.valeur.toLocaleString('fr-FR')}
              </span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 12, lineHeight: 1.55 }}>
          L’entonnoir et ses taux de passage s’afficheront à partir de{' '}
          {SEUIL_FUNNEL_LISIBLE} vues : en dessous, un pourcentage calculé sur si peu d’événements
          suggérerait une tendance qui n’existe pas.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center" style={{ width: '100%' }}>
      {etapes.map((etape, i) => {
        const precedent = i > 0 ? etapes[i - 1] : null;

        // ═══ LARGEUR : PROPORTIONNELLE, BORNÉE DES DEUX CÔTÉS ═══
        //
        // En bas : une marche à 1,8 % des vues (cas réel des sauvegardes)
        // donnerait un trait de quelques pixels, sans place pour son libellé.
        //
        // En haut : sur de PETITS VOLUMES, une étape peut dépasser la
        // précédente (3 clics enregistrés pour 1 vue, quand la vue a été
        // perdue hors ligne et pas le clic). Sans plafond, la barre débordait
        // de la carte et l'entonnoir s'élargissait au lieu de rétrécir.
        // `Math.min(1, …)` garde la forme cohérente ; le chiffre exact, lui,
        // reste affiché tel quel dans la barre — on ne masque pas l'anomalie.
        const proportion = base > 0 ? Math.min(1, etape.valeur / base) : 0;
        const largeurPct = LARGEUR_MIN_PCT + (100 - LARGEUR_MIN_PCT) * proportion;

        // Chute vs la marche précédente NON VIDE la plus proche (sinon vs vues) :
        // une étape à zéro au milieu du funnel rendrait toutes les suivantes
        // incalculables, alors que la comparaison aux vues reste parlante.
        //
        // ⚠️ PLAFONNÉE À 100 % : « ↓ 300 % de l'étape précédente » n'a aucun
        // sens — une chute ne peut pas rendre plus qu'elle n'a reçu. Au-delà de
        // 100 %, on n'affiche rien plutôt qu'un nombre faux (cf. `chuteLisible`).
        let chute: number | null = null;
        if (i > 0) {
          const referent = precedent && precedent.valeur > 0 ? precedent.valeur : base;
          chute = referent > 0 ? (etape.valeur / referent) * 100 : null;
        }
        const chuteLisible = chute !== null && chute <= 100 ? chute : null;

        return (
          <div key={etape.libelle} style={{ width: '100%' }}>
            {/* Le taux de chute, entre les deux marches qu'il relie. */}
            {i > 0 && (
              <div
                className="flex items-center justify-center gap-1.5"
                style={{ padding: '7px 0', fontSize: 11.5, color: 'var(--color-text-muted)' }}
              >
                {chuteLisible !== null ? (
                  <>
                    <span aria-hidden>↓</span>
                    {chuteLisible.toFixed(1).replace('.', ',')} % de l’étape précédente
                  </>
                ) : (
                  // Ratio > 100 % ou incalculable : sur de petits volumes, une
                  // étape peut dépasser la précédente. On le dit plutôt que
                  // d'afficher un pourcentage impossible.
                  <span style={{ fontStyle: 'italic' }}>trop peu de données pour un taux</span>
                )}
              </div>
            )}

            <div
              className="flex items-center justify-between gap-3"
              style={{
                width: `${largeurPct}%`,
                margin: '0 auto',
                padding: '14px 18px',
                borderRadius: 10,
                // Dégradé du navy vers l'orange : la dernière marche est
                // l'objectif de l'annonceur, elle porte la couleur d'accent.
                background: etape.aVenir
                  ? 'repeating-linear-gradient(45deg, #C8D0DC, #C8D0DC 6px, #DDE3EC 6px, #DDE3EC 12px)'
                  : couleurMarche(i, etapes.length),
                color: etape.aVenir ? '#5A6A70' : couleurTexte(i, etapes.length),
                transition: 'width 0.4s ease',
              }}
            >
              <span style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {etape.libelle}
                {etape.aVenir && (
                  <span style={{ fontSize: 10.5, marginLeft: 6, fontStyle: 'italic' }}>
                    bientôt mesuré
                  </span>
                )}
              </span>
              <span style={{ fontSize: 14.5, fontWeight: 800, flexShrink: 0 }}>
                {etape.valeur.toLocaleString('fr-FR')}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Navy foncé en haut, orange en bas : le dégradé accompagne la descente, et la
 * dernière marche — l'action que l'annonceur cherche — se distingue nettement.
 */
function couleurMarche(index: number, total: number): string {
  if (index === total - 1) return '#E8A93E';
  const paliers = ['#1B2C44', '#28405F', '#3B5A80', '#4E6F97'];
  return paliers[Math.min(index, paliers.length - 1)]!;
}

/** Texte clair sur les marches sombres, navy sur la marche orange. */
function couleurTexte(index: number, total: number): string {
  return index === total - 1 ? '#0F1C2E' : 'rgba(255,255,255,0.92)';
}
