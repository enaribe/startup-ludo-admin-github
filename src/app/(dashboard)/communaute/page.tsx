'use client';

/**
 * Mode Classe — Communauté (lot M7, VERSION MINIMALE arbitrée le 13/08) :
 * uniquement des séances partagées PRÉ-REMPLIES par CONCREE — une communauté
 * vide étant pire que pas de communauté, les discussions et le rendez-vous du
 * mois attendront de vrais utilisateurs. « Dupliquer » ouvre le wizard : la
 * séance arrive dans la bibliothèque « prête à l'emploi ».
 */

import Link from 'next/link';

const NAVY = '#0F1C2E';

const SEANCES_COMMUNAUTE = [
  { titre: 'Le prix juste du thiéboudienne', auteur: 'Lycée Blaise Diagne, Dakar', tag: 'Classique · Intermédiaire · 30 min', resume: 'Coûts, marge et prix de vente à partir d’un plat que toute la classe connaît.' },
  { titre: 'Vendre en ligne sans boutique', auteur: 'Université Assane Seck, Ziguinchor', tag: 'Fintech · Avancé · 35 min', resume: 'Le commerce par WhatsApp et réseaux sociaux : encaisser, livrer, fidéliser.' },
  { titre: 'De la mangue au jus : la chaîne de valeur', auteur: 'CFP de Kaolack', tag: 'Agritech · Intermédiaire · 30 min', resume: 'Transformer un produit brut et se placer sur la chaîne de valeur.' },
  { titre: 'Mon premier budget d’étudiant entrepreneur', auteur: 'UCAD, Dakar', tag: 'Fintech · Débutant · 25 min', resume: 'Revenus, dépenses, épargne : poser les bases avant le premier projet.' },
];

export default function CommunautePage() {
  return (
    <div style={{ maxWidth: 1020 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>Communauté</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, marginBottom: 20, maxWidth: 560 }}>
        Des séances de terrain partagées par des enseignants et sélectionnées par CONCREE — dupliquez,
        adaptez, lancez.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SEANCES_COMMUNAUTE.map((sc) => (
          <div key={sc.titre} className="glass-card" style={{ padding: '16px 18px' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#2E7D32', background: 'rgba(46,160,67,0.1)', borderRadius: 10, padding: '3px 10px' }}>
              {sc.tag}
            </span>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY, margin: '10px 0 2px' }}>{sc.titre}</h2>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 6 }}>{sc.auteur}</p>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.55, marginBottom: 12 }}>{sc.resume}</p>
            <Link
              href="/seances/nouvelle"
              className="btn-secondary"
              style={{ fontSize: 12.5, textDecoration: 'none', display: 'inline-block' }}
            >
              + Dupliquer dans mes séances
            </Link>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 16 }}>
        Vous voulez proposer votre séance à la communauté ? Écrivez à ecoles@concree.com — chaque
        séance est relue par CONCREE avant publication.
      </p>
    </div>
  );
}
