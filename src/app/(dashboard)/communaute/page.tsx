'use client';

/**
 * Mode Classe — Communauté (lot M7, maquette du 20/08).
 *
 * CE QUI EST RÉEL ICI :
 *   - les séances partagées, PRÉ-REMPLIES et relues par CONCREE ;
 *   - « Dupliquer dans mes séances » : ouvre le wizard PRÉREMPLI (titre,
 *     édition, durée passés dans l'URL — le wizard les lit au chargement) ;
 *   - « Proposer ma séance » : une modale qui explique la relecture et ouvre
 *     un e-mail prérempli vers ecoles@concree.com.
 *
 * CE QUI EST ANNONCÉ SANS ÊTRE SIMULÉ : les discussions et le rendez-vous du
 * mois (arbitrage du 13/08 — ils ouvrent avec de vrais utilisateurs). Les
 * encarts existent, à leur place de maquette, mais disent « bientôt » au lieu
 * d'afficher des fils et des compteurs inventés. Aucun chiffre de communauté
 * (« 240 enseignants »…) n'est affiché tant qu'il n'est pas mesuré.
 */

import { useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Mail, MessagesSquare, Plus, Upload } from 'lucide-react';
import Modal from '@/components/ui/Modal';

const NAVY = '#0F1C2E';

/**
 * Séances de terrain sélectionnées par CONCREE. `editionMot` sert au
 * préremplissage du wizard : il matche l'édition par son nom, côté wizard,
 * parmi les éditions réellement actives.
 */
const SEANCES_COMMUNAUTE = [
  {
    titre: 'Le prix juste du thiéboudienne',
    auteur: 'Lycée Blaise Diagne, Dakar',
    edition: 'Classique',
    editionMot: 'classique',
    niveau: 'Intermédiaire',
    duree: 30,
    resume: 'Coûts, marge et prix de vente à partir d’un plat que toute la classe connaît.',
  },
  {
    titre: 'Vendre en ligne sans boutique',
    auteur: 'Université Assane Seck, Ziguinchor',
    edition: 'Fintech',
    editionMot: 'fintech',
    niveau: 'Avancé',
    duree: 35,
    resume: 'Le commerce par WhatsApp et réseaux sociaux : encaisser, livrer, fidéliser.',
  },
  {
    titre: 'De la mangue au jus : la chaîne de valeur',
    auteur: 'CFP de Kaolack',
    edition: 'Agritech',
    editionMot: 'agritech',
    niveau: 'Intermédiaire',
    duree: 30,
    resume: 'Transformer un produit brut et se placer sur la chaîne de valeur.',
  },
  {
    titre: 'Mon premier budget d’étudiant entrepreneur',
    auteur: 'UCAD, Dakar',
    edition: 'Fintech',
    editionMot: 'fintech',
    niveau: 'Débutant',
    duree: 25,
    resume: 'Revenus, dépenses, épargne : poser les bases avant le premier projet.',
  },
] as const;

const EMAIL_COMMUNAUTE = 'ecoles@concree.com';

export default function CommunautePage() {
  const [proposer, setProposer] = useState(false);

  return (
    <div style={{ maxWidth: 1440 }}>
      {/* ═══ En-tête ═══ */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: NAVY }}>Communauté</h1>
          <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 4, maxWidth: 560 }}>
            Des enseignants et formateurs partagent leurs séances et leurs astuces de terrain, du
            collège à l’université — chaque séance est relue par CONCREE avant publication.
          </p>
        </div>
        <button
          className="btn-secondary flex items-center gap-2"
          onClick={() => setProposer(true)}
          style={{ fontSize: 13, flexShrink: 0 }}
        >
          <Upload size={15} /> Proposer ma séance
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* ═══ Séances partagées ═══ */}
        <div className="lg:col-span-2">
          <h2 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, marginBottom: 12 }}>
            Séances partagées récemment
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SEANCES_COMMUNAUTE.map((sc) => (
              <div key={sc.titre} className="glass-card flex flex-col" style={{ padding: '16px 18px' }}>
                <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#2E7D32', background: 'rgba(46,160,67,0.1)', borderRadius: 10, padding: '4px 11px' }}>
                    {sc.edition} · {sc.niveau}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-muted)', background: 'rgba(15,28,46,0.06)', borderRadius: 10, padding: '4px 11px' }}>
                    {sc.duree} min
                  </span>
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{sc.titre}</h3>
                <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', margin: '3px 0 8px' }}>{sc.auteur}</p>
                <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.55, marginBottom: 14 }}>
                  {sc.resume}
                </p>
                {/* Préremplissage réel : le wizard lit titre, édition et durée
                    dans l'URL et arrive prêt à lancer. */}
                <Link
                  href={`/seances/nouvelle?titre=${encodeURIComponent(sc.titre)}&edition=${encodeURIComponent(sc.editionMot)}&duree=${sc.duree}`}
                  className="flex items-center justify-center gap-2"
                  style={{
                    marginTop: 'auto', textDecoration: 'none', fontSize: 12.5, fontWeight: 600,
                    color: NAVY, border: '1.5px solid var(--color-card-border)', borderRadius: 10,
                    padding: '10px 14px',
                  }}
                >
                  <Plus size={14} /> Dupliquer dans mes séances
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ Colonne droite — annoncé, jamais simulé ═══ */}
        <div className="flex flex-col gap-4">
          <section className="glass-card p-5">
            <div className="flex items-center justify-between gap-3" style={{ marginBottom: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>Discussions récentes</h2>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 10, background: 'rgba(245,166,35,0.12)', color: '#B87A0C', flexShrink: 0 }}>
                Bientôt
              </span>
            </div>
            <div className="flex items-start gap-3">
              <MessagesSquare size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                Les fils de discussion entre enseignants ouvrent avec la communauté. En attendant,
                posez vos questions de terrain à{' '}
                <a href={`mailto:${EMAIL_COMMUNAUTE}`} style={{ color: '#B87A0C', fontWeight: 700 }}>
                  {EMAIL_COMMUNAUTE}
                </a>{' '}
                — l’équipe CONCREE répond et fait circuler les bonnes pratiques.
              </p>
            </div>
          </section>

          <section className="glass-card p-5">
            <div className="flex items-center justify-between gap-3" style={{ marginBottom: 10 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>Le rendez-vous du mois</h2>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 10, background: 'rgba(245,166,35,0.12)', color: '#B87A0C', flexShrink: 0 }}>
                Bientôt
              </span>
            </div>
            <div className="flex items-start gap-3">
              <CalendarDays size={18} style={{ color: 'var(--color-text-muted)', flexShrink: 0, marginTop: 2 }} />
              <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                Une visio mensuelle animée par des enseignants de la communauté est en préparation.
                Elle sera annoncée ici et par e-mail — aucune inscription à prévoir pour l’instant.
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* ═══ Modale « Proposer ma séance » ═══ */}
      {proposer && (
        <Modal open onClose={() => setProposer(false)} title="Proposer ma séance à la communauté" maxWidth="520px">
          <div className="flex flex-col gap-4">
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.65 }}>
              Racontez votre séance en quelques lignes : le thème, la classe, ce qui a bien marché.
              L’équipe CONCREE la relit avec vous, la met en forme et la publie ici à votre nom —
              chaque séance partagée est <strong>relue avant publication</strong>, rien n’est mis en
              ligne automatiquement.
            </p>
            <a
              href={`mailto:${EMAIL_COMMUNAUTE}?subject=${encodeURIComponent('Proposition de séance pour la communauté Startup Ludo')}&body=${encodeURIComponent('Bonjour,\n\nJe souhaite proposer une séance à la communauté.\n\nTitre de la séance :\nClasse et niveau :\nÉdition utilisée :\nCe qui a bien marché :\n\nMerci !')}`}
              className="btn-primary flex items-center justify-center gap-2"
              style={{ textDecoration: 'none', fontSize: 13 }}
              onClick={() => setProposer(false)}
            >
              <Mail size={15} /> Écrire à {EMAIL_COMMUNAUTE}
            </a>
          </div>
        </Modal>
      )}
    </div>
  );
}
