'use client';

/**
 * Aide de l'Espace Annonceur (écran 6 des maquettes — lot 7). Statique :
 * FAQ (spec §8), glossaire en langage de chargé de programme, contacts,
 * spécifications des visuels. L'utilisateur type n'est pas un growth marketer —
 * chaque terme du tableau de bord est traduit.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const NAVY = '#0F1C2E';

const FAQ: Array<[string, string]> = [
  ['Combien coûte une mise en visibilité ?', 'Il n’y a aucun frais fixe. Vous payez 15 FCFA par vue et 100 FCFA par clic pour une carte, 25 FCFA par vue et 150 FCFA par clic pour un écran d’édition sponsorisée. Vous fixez un plafond : la diffusion s’arrête dès qu’il est atteint, et une vue non livrée n’est jamais facturée.'],
  ['Qu’est-ce qui compte comme une « vue » ?', 'Une vue est comptée quand votre carte s’affiche réellement à un joueur pendant une partie — pas quand elle est simplement disponible dans le tirage. C’est l’application elle-même qui compte, au moment de l’affichage.'],
  ['Puis-je modifier ma carte après validation ?', 'Toute modification du contenu repasse par la vérification CONCREE (48 h ouvrées) avant de remplacer la version diffusée. Mettre en pause, en revanche, est immédiat.'],
  ['Pourquoi ne puis-je pas choisir le jeton de gain ?', 'Le jeton (+2 opportunité, +4 financement) appartient à l’équilibre pédagogique du jeu : s’il variait selon l’annonceur, les joueurs chasseraient les cartes les plus payantes et le jeu perdrait sa valeur de formation — donc votre visibilité aussi.'],
  ['Deux structures peuvent-elles sponsoriser la même édition ?', 'Jamais sur la même période : la réservation se fait mois par mois, au calendrier, et un mois pris est verrouillé par le serveur. C’est cette exclusivité que vous achetez.'],
  ['Comment justifier la dépense auprès d’un bailleur ?', 'Exportez le rapport d’impact PDF de la mise en visibilité (personnes uniques touchées, vues, clics, répartition) et joignez la facture mensuelle FAC — les deux portent les mêmes chiffres, comptés à la vue réelle.'],
  ['Les joueurs voient-ils que c’est sponsorisé ?', 'Oui, toujours : badge « Sponsorisé », mention « En partenariat avec », « Sponsorisé par » au verso des cartes. Cette transparence est permanente et protège autant le joueur que votre crédibilité.'],
];

const GLOSSAIRE: Array<[string, string]> = [
  ['Vue', 'un affichage réel de votre carte à un joueur, en partie.'],
  ['Personne touchée', 'un joueur différent — le chiffre à citer dans un rapport de programme.'],
  ['Flip', 'le joueur a retourné la carte pour lire les détails : le meilleur signal d’intérêt réel.'],
  ['CTR', 'la part des vues qui aboutissent à un clic sur votre bouton.'],
  ['Sauvegarde', 'le joueur a gardé votre opportunité pour la retrouver après la partie.'],
  ['Plafond', 'le budget maximal que vous acceptez d’engager — la diffusion s’arrête d’elle-même.'],
];

export default function AidePage() {
  const [ouverte, setOuverte] = useState<number | null>(0);

  return (
    <div style={{ maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>Aide</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, marginBottom: 22, maxWidth: 520 }}>
        Tout ce qu’il faut pour lancer, comprendre et justifier votre mise en visibilité — sans
        jargon.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Carte titre="Questions fréquentes">
            {FAQ.map(([q, r], i) => (
              <div key={q} style={{ borderBottom: i < FAQ.length - 1 ? '1px solid var(--color-card-border)' : 'none' }}>
                <button
                  type="button"
                  onClick={() => setOuverte(ouverte === i ? null : i)}
                  className="flex items-center justify-between gap-3"
                  style={{ width: '100%', padding: '11px 0', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: NAVY }}>{q}</span>
                  <ChevronDown size={15} style={{ transform: ouverte === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} color="#8A94A6" />
                </button>
                {ouverte === i && (
                  <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.65, paddingBottom: 12 }}>{r}</p>
                )}
              </div>
            ))}
          </Carte>

          <div style={{ marginTop: 16 }}>
            <Carte titre="Glossaire — en langage de chargé de programme">
              {GLOSSAIRE.map(([terme, def]) => (
                <p key={terme} style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                  <strong style={{ color: NAVY }}>{terme}</strong> : {def}
                </p>
              ))}
            </Carte>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <Carte titre="Nous joindre">
            <Contact valeur="annonceurs@concree.com" detail="Réponse sous 1 jour ouvré" />
            <Contact valeur="moderation@concree.com" detail="Relecture d’un message avant soumission" />
          </Carte>
          <Carte titre="Spécifications des visuels">
            {(
              [
                ['Logo', 'PNG ou SVG, fond transparent, 400 × 400 px minimum'],
                ['Photo d’édition', 'Verticale 4:5, 1080 × 1350 px minimum, zone basse dégagée'],
                ['Message recto', '120 caractères maximum, 2 à 3 lignes'],
                ['Libellé du bouton', '34 caractères maximum'],
              ] as const
            ).map(([libelle, spec]) => (
              <p key={libelle} style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
                <strong style={{ color: NAVY }}>{libelle}</strong> — {spec}
              </p>
            ))}
          </Carte>
        </div>
      </div>
    </div>
  );
}

function Carte({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#FFF', border: '1px solid var(--color-card-border)', borderRadius: 14, padding: '16px 18px' }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 8 }}>{titre}</h2>
      {children}
    </div>
  );
}

function Contact({ valeur, detail }: { valeur: string; detail: string }) {
  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{valeur}</div>
      <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>{detail}</div>
    </div>
  );
}
