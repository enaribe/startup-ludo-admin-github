'use client';

/**
 * Mode Classe — Aide (lot M7, spec v2.1 écran 10).
 *
 * Trois raccourcis vers les écrans réels, une FAQ dépliable, et les contacts.
 *
 * ⚠️ LA FAQ DÉCRIT LE MODÈLE RÉEL, pas un idéal marketing. Deux points sont
 * régulièrement mal compris et corrigés ici explicitement :
 *   • l'apprenant A BESOIN d'un compte (c'est ce qui garantit qu'aucun invité
 *     n'entre dans une séance, et ce qui rend les cumuls et certificats
 *     nominatifs possibles) ;
 *   • le QR de la salle d'attente ne remplace pas le compte : il remplace la
 *     saisie du code, ce qui n'est pas la même chose.
 * Écrire « aucune installation, aucune donnée personnelle » serait faux, et se
 * retournerait contre nous devant un référent RGPD d'établissement.
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  CalendarCheck,
  ChevronDown,
  Clock,
  Mail,
  MessageCircle,
  MonitorPlay,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';
const EMAIL = 'ecoles@concree.com';

/**
 * Les trois guides — chacun MÈNE À L'ÉCRAN correspondant, jamais à un article
 * qui n'existe pas. Une carte d'aide qui ouvre une page vide est pire que pas
 * de carte du tout.
 */
const GUIDES: Array<{
  titre: string;
  texte: string;
  lien: string;
  action: string;
  Icon: LucideIcon;
}> = [
  {
    titre: 'Lancer votre première session',
    texte: 'Du choix de la séance au QR code projeté, en trois étapes et deux minutes.',
    lien: '/seances/nouvelle',
    action: 'Lancer une session →',
    Icon: Zap,
  },
  {
    titre: 'Projeter en classe',
    texte:
      'Vidéoprojecteur, télé ou partage d’écran : la salle d’attente s’affiche en plein écran, code et QR lisibles du fond de la salle.',
    lien: '/session-en-direct',
    action: 'Voir la session en direct →',
    Icon: MonitorPlay,
  },
  {
    titre: 'Lire un rapport de session',
    texte:
      'Participation, notions maîtrisées, prolongements : ce que chaque chiffre veut dire.',
    lien: '/rapports',
    action: 'Ouvrir les rapports →',
    Icon: BarChart3,
  },
];

const FAQ: Array<[string, string]> = [
  [
    'Mes apprenants ont-ils besoin d’un compte ?',
    'Oui. Chaque apprenant installe l’application Startup Ludo et crée son compte — c’est ce qui garantit que seuls vos élèves entrent dans la séance, et ce qui rend possibles les bilans annuels et les certificats nominatifs. Le QR projeté ne remplace pas le compte : il remplace la saisie du code. Un apprenant déjà rattaché scanne et joue ; un nouveau scanne, choisit son nom dans la liste de la classe, et il est rattaché pour l’année.',
  ],
  [
    'Et si la connexion est mauvaise dans ma salle ?',
    'La partie continue hors ligne : les réponses et la progression sont mises en file sur le téléphone et repartent au retour du réseau, sans rien perdre. L’écran de suivi en direct signale les téléphones qui n’ont plus donné signe de vie depuis plus d’une minute, pour que vous sachiez qui relancer.',
  ],
  [
    'Qui peut créer des classes et inviter des enseignants ?',
    'La direction (compte établissement) crée les classes, invite les enseignants et leur affecte des classes. Un membre de la direction qui enseigne aussi bascule en vue « Mes classes » pour lancer ses propres sessions.',
  ],
  [
    'Combien coûte le Mode Classe ?',
    `La licence établissement est annuelle, avec un quota de classes et d’enseignants. Écrivez à ${EMAIL} pour un devis adapté à votre effectif.`,
  ],
  [
    'Les certificats ont-ils une valeur officielle ?',
    'Ils sont nominatifs, co-signés CONCREE et votre établissement, et attestent des notions effectivement travaillées dans le jeu — une notion n’y figure qu’à partir de 3 questions posées sur l’année, pour qu’aucun taux ne repose sur un échantillon trop mince. Ils valorisent un parcours ; ils ne remplacent pas un diplôme d’État.',
  ],
  [
    'Quelles données sont conservées sur mes apprenants ?',
    'Le prénom et le nom saisis par l’établissement, la progression et les réponses de quiz par séance, et les cumuls annuels. Rien d’autre. Ces données restent dans le périmètre de votre licence et sont exportables depuis chaque fiche de classe (CSV et bilan PDF).',
  ],
];

export default function AideEcolePage() {
  const [ouverte, setOuverte] = useState<number | null>(0);

  return (
    <div style={{ maxWidth: 1440 }}>
      {/* ═══ En-tête ═══ */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: NAVY }}>Aide</h1>
          <p style={{ fontSize: 13.5, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Tout pour prendre en main le Mode Classe — sans jargon.
          </p>
        </div>
        <a
          href={`mailto:${EMAIL}?subject=${encodeURIComponent('Prendre rendez-vous — Mode Classe')}&body=${encodeURIComponent('Bonjour,\n\nJe souhaite convenir d’un rendez-vous pour prendre en main le Mode Classe.\n\nÉtablissement :\nCréneaux qui me conviennent :\n\nMerci !')}`}
          className="btn-primary flex items-center gap-2"
          style={{ textDecoration: 'none', flexShrink: 0 }}
        >
          <CalendarCheck size={16} /> Prendre rendez-vous
        </a>
      </div>

      {/* ═══ Les trois guides — chacun ouvre l'écran concerné ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        {GUIDES.map((g) => (
          <Link key={g.titre} href={g.lien} style={{ textDecoration: 'none' }}>
            <div className="glass-card p-5 flex flex-col" style={{ height: '100%' }}>
              <span
                className="flex items-center justify-center"
                style={{
                  width: 38, height: 38, borderRadius: 10, marginBottom: 14,
                  background: 'rgba(245,166,35,0.12)', color: '#B87A0C',
                }}
              >
                <g.Icon size={18} />
              </span>
              <h2 style={{ fontSize: 14.5, fontWeight: 700, color: NAVY }}>{g.titre}</h2>
              <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginTop: 6, lineHeight: 1.55 }}>
                {g.texte}
              </p>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: '#B87A0C', marginTop: 'auto', paddingTop: 14 }}>
                {g.action}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* ═══ Questions fréquentes ═══ */}
        <section className="glass-card lg:col-span-2">
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-card-border)' }}>
            <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Questions fréquentes</h2>
          </div>
          <div className="px-5">
            {FAQ.map(([q, r], i) => (
              <div
                key={q}
                style={{ borderBottom: i < FAQ.length - 1 ? '1px solid var(--color-card-border)' : 'none' }}
              >
                <button
                  type="button"
                  onClick={() => setOuverte(ouverte === i ? null : i)}
                  aria-expanded={ouverte === i}
                  className="flex items-center justify-between gap-3"
                  style={{
                    width: '100%', padding: '15px 0', border: 'none',
                    background: 'transparent', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: NAVY }}>{q}</span>
                  <ChevronDown
                    size={15}
                    color="#8A94A6"
                    style={{
                      transform: ouverte === i ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s',
                      flexShrink: 0,
                    }}
                  />
                </button>
                {ouverte === i && (
                  <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.7, paddingBottom: 16 }}>
                    {r}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ═══ Contacts et atelier ═══ */}
        <div className="flex flex-col gap-4">
          <section className="glass-card p-5">
            <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY }}>Nous joindre</h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 3, marginBottom: 14 }}>
              Équipe écoles · Dakar
            </p>

            <a href={`mailto:${EMAIL}`} style={{ textDecoration: 'none' }}>
              <LigneContact Icon={Mail} titre={EMAIL} detail="Réponse sous 1 jour ouvré" />
            </a>
            <LigneContact Icon={Clock} titre="Du lundi au vendredi" detail="9 h – 18 h GMT" />
            <LigneContact
              Icon={MessageCircle}
              titre="Groupe WhatsApp enseignants"
              detail="Entraide entre collègues, modéré par CONCREE — demandez l’invitation par e-mail"
            />
          </section>

          <section className="glass-card p-5">
            <h2 style={{ fontSize: 15.5, fontWeight: 700, color: NAVY, marginBottom: 8 }}>
              Atelier de prise en main
            </h2>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.65, marginBottom: 14 }}>
              45 minutes en visio pour votre équipe pédagogique : créer les classes, lancer une
              session témoin, lire les rapports.
            </p>
            <a
              href={`mailto:${EMAIL}?subject=${encodeURIComponent('Demande d’atelier de prise en main')}&body=${encodeURIComponent('Bonjour,\n\nNous souhaitons organiser un atelier de prise en main du Mode Classe.\n\nÉtablissement :\nNombre d’enseignants :\nCréneaux souhaités :\n\nMerci !')}`}
              className="btn-secondary flex items-center justify-center gap-2"
              style={{ textDecoration: 'none', fontSize: 13 }}
            >
              Demander un atelier
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Une ligne de contact : pastille navy, intitulé, précision. */
function LigneContact({
  Icon,
  titre,
  detail,
}: {
  Icon: LucideIcon;
  titre: string;
  detail: string;
}) {
  return (
    <div
      className="flex items-start gap-3"
      style={{
        padding: '12px 14px',
        borderRadius: 12,
        border: '1px solid var(--color-card-border)',
        marginBottom: 10,
      }}
    >
      <span
        className="flex items-center justify-center"
        style={{ width: 32, height: 32, borderRadius: 9, background: NAVY, color: ORANGE, flexShrink: 0 }}
      >
        <Icon size={15} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{titre}</div>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.5 }}>
          {detail}
        </div>
      </div>
    </div>
  );
}
