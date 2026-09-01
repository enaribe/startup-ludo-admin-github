'use client';

/**
 * Menu « ⋯ » d'actions secondaires.
 *
 * POURQUOI CE COMPOSANT : un en-tête de section qui aligne cinq boutons de même
 * poids visuel ne hiérarchise rien — le geste quotidien y côtoie l'outil de
 * dépannage annuel, et l'utilisateur doit tout lire pour trouver le sien. Le
 * patron retenu est celui des écrans denses : UNE action principale visible, le
 * reste replié ici, dans l'ordre de fréquence d'usage.
 *
 * Une action désactivée reste AFFICHÉE, grisée, avec son motif en infobulle :
 * la masquer ferait croire à une fonction absente, et l'utilisateur chercherait
 * ailleurs ce qui n'attend qu'une condition (« ajoutez d'abord des élèves »).
 */

import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';

export interface ActionMenu {
  libelle: string;
  Icon: LucideIcon;
  onClick: () => void;
  /** Grisée et non cliquable, mais toujours visible (cf. en-tête du fichier). */
  desactive?: boolean;
  /** Infobulle — indispensable sur une action désactivée, pour dire pourquoi. */
  aide?: string;
  /** Rouge : action destructrice ou irréversible. */
  danger?: boolean;
}

export default function MenuActions({
  actions,
  libelle = 'Autres actions',
}: {
  actions: ActionMenu[];
  /** Texte lu par les lecteurs d'écran, et infobulle du bouton. */
  libelle?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);

  // Fermeture au clic extérieur et à Échap — sans quoi le menu resterait ouvert
  // derrière la navigation, et se rouvrirait au retour sur la page.
  useEffect(() => {
    if (!ouvert) return;
    const auClic = (e: MouseEvent) => {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false);
    };
    const auClavier = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOuvert(false);
    };
    document.addEventListener('mousedown', auClic);
    document.addEventListener('keydown', auClavier);
    return () => {
      document.removeEventListener('mousedown', auClic);
      document.removeEventListener('keydown', auClavier);
    };
  }, [ouvert]);

  if (actions.length === 0) return null;

  return (
    <div ref={conteneur} style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn-secondary flex items-center justify-center"
        onClick={() => setOuvert((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={libelle}
        title={libelle}
        style={{ padding: '9px 11px' }}
      >
        <MoreHorizontal size={17} />
      </button>

      {ouvert && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 20,
            minWidth: 246,
            background: '#FFFFFF',
            border: '1px solid var(--color-card-border)',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(15,28,46,0.14)',
            padding: 6,
          }}
        >
          {actions.map((action) => (
            <button
              key={action.libelle}
              type="button"
              role="menuitem"
              disabled={action.desactive}
              title={action.aide}
              onClick={() => {
                if (action.desactive) return;
                setOuvert(false);
                action.onClick();
              }}
              className="flex items-center gap-2.5 w-full"
              style={{
                padding: '9px 11px',
                borderRadius: 8,
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                fontSize: 13,
                cursor: action.desactive ? 'not-allowed' : 'pointer',
                opacity: action.desactive ? 0.45 : 1,
                color: action.danger ? '#C9302C' : 'var(--color-text-primary)',
              }}
            >
              <action.Icon size={15} style={{ flexShrink: 0 }} />
              {action.libelle}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
