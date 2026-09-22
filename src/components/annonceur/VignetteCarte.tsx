/**
 * VignetteCarte — miniature d'une mise en visibilité, en tête de ligne.
 *
 * POURQUOI UN COMPOSANT À PART plutôt que `ApercuCarteCampagne` réduit : ce
 * dernier fait 260 px, porte un flip recto/verso et un bouton. Dans une
 * cellule de tableau, on veut un repère visuel de 34 px — l'annonceur doit
 * reconnaître sa campagne d'un coup d'œil, pas la consulter.
 *
 * Le rendu imite la carte de jeu sans la reproduire : bandeau coloré du type,
 * corps clair, et la photo de l'habillage quand il y en a une. Une vignette
 * trop fidèle laisserait croire qu'on peut y lire le contenu.
 */
const BANDEAU: Record<string, string> = {
  // Mêmes couleurs que l'aperçu détaillé : la vignette doit préparer à ce
  // qu'on verra en ouvrant la ligne, pas surprendre.
  financement: '#1F91D0',
  funding: '#1F91D0',
  opportunite: '#4CAF50',
  opportunity: '#4CAF50',
  evenement: '#4CAF50',
  edition: '#F5A623',
};

export default function VignetteCarte({
  format,
  kind,
  photoUrl,
}: {
  format: 'carte' | 'edition';
  /** Type de carte — décide la couleur du bandeau. Ignoré pour une édition. */
  kind?: string;
  /** Visuel de l'habillage (format édition) : la vignette le montre en fond. */
  photoUrl?: string | null;
}) {
  const couleur = format === 'edition' ? BANDEAU.edition : BANDEAU[kind ?? ''] ?? '#4CAF50';

  return (
    <div
      aria-hidden
      style={{
        width: 34,
        height: 44,
        borderRadius: 5,
        overflow: 'hidden',
        flexShrink: 0,
        border: '1px solid rgba(15,28,46,0.12)',
        background: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div style={{ height: 11, background: couleur, flexShrink: 0 }} />
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          style={{ width: '100%', flex: 1, objectFit: 'cover', display: 'block' }}
        />
      ) : (
        // Trois traits pour suggérer le texte : un aplat gris se lirait comme
        // une image manquante.
        <div
          style={{
            flex: 1,
            background: '#EEF1F6',
            padding: '5px 4px',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
        >
          <span style={{ height: 2.5, borderRadius: 2, background: 'rgba(15,28,46,0.18)' }} />
          <span style={{ height: 2.5, borderRadius: 2, background: 'rgba(15,28,46,0.18)' }} />
          <span style={{ height: 2.5, borderRadius: 2, background: 'rgba(15,28,46,0.10)', width: '65%' }} />
        </div>
      )}
    </div>
  );
}
