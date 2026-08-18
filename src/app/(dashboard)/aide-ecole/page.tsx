'use client';

/**
 * Mode Classe — Aide (lot M7, spec v2.1 écran 10). Statique : guides, FAQ
 * adaptée au MODÈLE RÉEL (comptes élèves + rattachement — pas de QR ni de
 * session sans compte, arbitrage D1), contacts et atelier de prise en main.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const NAVY = '#0F1C2E';

const FAQ: Array<[string, string]> = [
  ['Mes apprenants ont-ils besoin d’un compte ?', 'Oui — chaque apprenant installe l’application Startup Ludo et crée son compte. Il rejoint ensuite sa classe UNE seule fois, avec le code que vous projetez (valable quelques minutes). Après ce rattachement, vos séances apparaissent automatiquement sur son profil, sans plus jamais saisir de code.'],
  ['Et si la connexion est mauvaise dans ma salle ?', 'La partie continue hors ligne : les réponses et la progression partent au retour du réseau, sans rien perdre. Le suivi en direct signale les téléphones silencieux.'],
  ['Qui peut créer des classes et inviter des enseignants ?', 'La direction (compte établissement) crée les classes, les comptes enseignants et les affectations. Un membre de la direction qui enseigne aussi bascule en vue « Mes classes » pour lancer ses propres sessions.'],
  ['Combien coûte le Mode Classe ?', 'La licence établissement est annuelle, avec un quota de classes et d’enseignants. Contactez ecoles@concree.com pour un devis adapté à votre effectif.'],
  ['Les certificats ont-ils une valeur officielle ?', 'Ils sont nominatifs, co-signés CONCREE et votre établissement, et attestent des notions effectivement travaillées dans le jeu (au moins 3 questions par notion). Ils valorisent un parcours — ils ne remplacent pas un diplôme d’État.'],
  ['Quelles données sont conservées sur mes apprenants ?', 'Prénom et nom saisis par l’établissement, progression et réponses de quiz par séance, cumuls annuels. Le tout reste dans le périmètre de votre licence, exportable depuis les fiches de classe.'],
];

export default function AideEcolePage() {
  const [ouverte, setOuverte] = useState<number | null>(0);
  return (
    <div style={{ maxWidth: 1020 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>Aide</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, marginBottom: 20 }}>
        Tout pour prendre en main le Mode Classe — sans jargon.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="glass-card" style={{ padding: '16px 18px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Questions fréquentes</h2>
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
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div className="glass-card" style={{ padding: '16px 18px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Nous joindre</h2>
            <p style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>ecoles@concree.com</p>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginBottom: 8 }}>Réponse sous 1 jour ouvré</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Groupe WhatsApp enseignants</p>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>Entraide entre collègues, modéré par CONCREE</p>
          </div>
          <div className="glass-card" style={{ padding: '16px 18px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Atelier de prise en main</h2>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
              45 minutes en visio pour votre équipe pédagogique : créer les classes, lancer une
              session témoin, lire les rapports. Écrivez à ecoles@concree.com.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
