'use client';

/**
 * Règles de contenu (écran 5 des maquettes — lot 7). Page statique : le
 * parcours de validation, ce qui est accepté/refusé, et deux exemples de
 * message rendus dans le style du panneau de carte. Le contenu vient de la
 * spec §7 — c'est le contrat de modération, il ne doit vivre qu'à un endroit.
 */

const NAVY = '#0F1C2E';

const PARCOURS = [
  { n: 1, titre: 'Vous soumettez', texte: 'Votre carte ou votre habillage d’édition part en modération dès la dernière étape du wizard.', delai: 'Immédiat' },
  { n: 2, titre: 'CONCREE vérifie', texte: 'Exactitude, ton, lisibilité dans le jeu, conformité des visuels et du lien de destination.', delai: 'Sous 48 h ouvrées' },
  { n: 3, titre: 'Validation ou retour', texte: 'En cas de refus, vous recevez le motif précis et la reformulation proposée — une seule correction suffit généralement.', delai: 'Sur votre liste' },
  { n: 4, titre: 'Mise en diffusion', texte: 'La carte entre dans le tirage aux dates prévues. Vous pouvez la mettre en pause à tout moment.', delai: 'Selon votre période' },
];

const ACCEPTE = [
  ['Un dispositif réel et ouvert', 'financement, appel à candidatures, programme ou formation effectivement accessible pendant la période de diffusion.'],
  ['Un message écrit comme un événement du jeu', '« Vous bénéficiez de… », « Vous venez d’être sélectionné pour… ».'],
  ['Des montants et critères vérifiables', 'identiques à ceux publiés sur votre site ou dans votre appel.'],
  ['Un logo officiel', 'sur fond transparent — et pour les éditions, une photo authentique prise en contexte local.'],
  ['Une destination qui fonctionne', 'page en ligne, en français, sans téléchargement forcé.'],
];

const REFUSE = [
  ['Le ton publicitaire', 'slogans, superlatifs, majuscules d’insistance, points d’exclamation en série.'],
  ['La collecte de données dans le jeu', 'aucun formulaire, numéro ou pièce d’identité demandé depuis la carte.'],
  ['Les promesses de gain', '« financement garanti », « 100 % de réussite », taux d’acceptation inventés.'],
  ['Les frais à la charge du joueur', 'dossier payant, adhésion préalable, produit à vendre.'],
  ['Le contenu politique, religieux', 'ou étranger à l’entrepreneuriat, et toute image dégradante ou non consentie.'],
  ['Le détournement des règles du jeu', 'modifier le jeton de gain, imiter un écran système, masquer le badge « Sponsorisé ».'],
];

export default function ReglesContenuPage() {
  return (
    <div style={{ maxWidth: 1200 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>Règles de contenu</h1>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 4, marginBottom: 22, maxWidth: 560 }}>
        Startup Ludo est un jeu pédagogique utilisé en formation. Vos contenus doivent enrichir
        l’expérience de jeu, jamais l’interrompre. Voici ce que vérifie l’équipe CONCREE.
      </p>

      <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Le parcours de validation</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {PARCOURS.map((e) => (
          <div key={e.n} style={{ background: '#FFF', border: '1px solid var(--color-card-border)', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ width: 22, height: 22, borderRadius: 11, background: NAVY, color: '#FFF', fontSize: 11.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>{e.n}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: NAVY }}>{e.titre}</div>
            <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.5 }}>{e.texte}</p>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#B87A0C', marginTop: 8 }}>{e.delai}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Panneau titre="✓ Ce que nous acceptons" fond="rgba(46,160,67,0.06)" bord="rgba(46,160,67,0.3)" items={ACCEPTE} />
        <Panneau titre="⚠ Ce que nous refusons" fond="rgba(220,60,60,0.05)" bord="rgba(220,60,60,0.25)" items={REFUSE} />
      </div>

      <h2 style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Le message du recto, en pratique</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Exemple ok texte="Vous bénéficiez d’une subvention d’appui de 1 500 000 FCFA du programme ETER de l’ADEPME" motif="Un événement que le joueur vient de vivre : factuel, daté, vérifiable." />
        <Exemple ok={false} texte="L’ADEPME, votre partenaire n° 1 pour réussir ! Financez votre projet dès aujourd’hui !!" motif="Ton publicitaire : slogan, superlatif, points d’exclamation — refusé au premier motif de la charte." />
      </div>

      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 18 }}>
        Contrôle en continu : liens vérifiés chaque semaine (un lien mort met la carte en pause),
        signalements joueurs (trois déclenchent une revérification), retrait automatique le
        lendemain de la date limite. Pour faire relire un message avant soumission :
        moderation@concree.com.
      </p>
    </div>
  );
}

function Panneau({ titre, fond, bord, items }: { titre: string; fond: string; bord: string; items: string[][] }) {
  return (
    <div style={{ background: fond, border: `1px solid ${bord}`, borderRadius: 14, padding: '14px 18px' }}>
      <h3 style={{ fontSize: 13.5, fontWeight: 700, color: NAVY, marginBottom: 10 }}>{titre}</h3>
      <ul style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(([gras, reste]) => (
          <li key={gras} style={{ fontSize: 12.5, color: 'var(--color-text-secondary)', lineHeight: 1.55 }}>
            <strong style={{ color: NAVY }}>{gras}</strong> — {reste}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Exemple({ ok, texte, motif }: { ok: boolean; texte: string; motif: string }) {
  return (
    <div style={{ background: '#FFF', border: '1px solid var(--color-card-border)', borderRadius: 14, padding: '14px 18px' }}>
      <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 10, background: ok ? 'rgba(46,160,67,0.12)' : 'rgba(220,60,60,0.1)', color: ok ? '#2EA043' : '#C0392B' }}>
        {ok ? 'VALIDÉ' : 'REFUSÉ'}
      </span>
      <p style={{ fontSize: 13.5, fontWeight: 600, color: NAVY, background: '#EEF2F8', borderRadius: 10, padding: '12px 14px', margin: '10px 0', textAlign: 'center' }}>
        {texte}
      </p>
      <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{motif}</p>
    </div>
  );
}
