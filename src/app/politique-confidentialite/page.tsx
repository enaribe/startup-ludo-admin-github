import type { Metadata } from 'next';
import Link from 'next/link';
import { Gamepad2, ArrowLeft } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Politique de confidentialité – Startup Ludo',
  description: 'Comment Startup Ludo collecte, utilise et protège vos données.',
};

const contentStyles = {
  section: 'mb-8',
  h2: 'text-lg font-semibold text-[#FFBC40] mb-3 mt-6 border-b border-white/10 pb-2',
  h3: 'text-base font-semibold text-white/90 mb-2 mt-4',
  p: 'text-sm text-white/80 leading-relaxed mb-3',
  ul: 'list-disc pl-5 space-y-1 text-sm text-white/80 mb-3',
  li: 'leading-relaxed',
  tableWrap: 'overflow-x-auto my-4 rounded-lg border border-white/10',
  table: 'w-full text-sm border-collapse',
  th: 'text-left py-2 px-3 bg-white/5 text-[#FFBC40] font-medium border-b border-white/10',
  td: 'py-2 px-3 border-b border-white/5 text-white/80',
  link: 'text-[#FFBC40] hover:underline',
  intro: 'text-sm text-white/70 leading-relaxed mb-6',
  lastUpdate: 'text-xs text-white/50 mb-4',
  footer: 'text-xs text-white/40 mt-8 pt-4 border-t border-white/10',
};

export default function PolitiqueConfidentialitePage() {
  return (
    <div
      className="min-h-screen"
      style={{
        background: 'linear-gradient(135deg, #0a1e33 0%, #0C243E 40%, #194F8A 100%)',
      }}
    >
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0C243E]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Link
            href="/login"
            className="flex items-center gap-2 text-sm text-white/70 transition hover:text-[#FFBC40]"
          >
            <ArrowLeft size={18} />
            Retour
          </Link>
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{
                background: 'rgba(255, 188, 64, 0.15)',
                border: '1px solid rgba(255, 188, 64, 0.2)',
              }}
            >
              <Gamepad2 size={20} color="#FFBC40" />
            </div>
            <span
              className="font-semibold"
              style={{ fontFamily: "'Luckiest Guy', cursive", color: '#FFBC40', letterSpacing: 0.5 }}
            >
              Startup Ludo
            </span>
          </div>
          <div className="w-16" /> {/* spacer for centering */}
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-4 py-8 pb-16">
        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <h1
            className="mb-2 text-2xl font-bold text-white"
            style={{ fontFamily: "'Luckiest Guy', cursive", color: '#FFBC40', letterSpacing: 0.5 }}
          >
            Politique de confidentialité
          </h1>
          <p className={contentStyles.lastUpdate}>Dernière mise à jour : février 2026</p>

          <p className={contentStyles.intro}>
            Startup Ludo (« l&apos;application », « nous ») est un jeu de plateau mobile éducatif sur
            l&apos;entrepreneuriat. Cette politique décrit comment nous collectons, utilisons et protégeons
            vos données lorsque vous utilisez l&apos;application Startup Ludo sur iOS et Android.
          </p>
          <p className={contentStyles.intro}>
            En utilisant l&apos;application, vous acceptez cette politique. Si vous n&apos;êtes pas
            d&apos;accord, veuillez ne pas utiliser l&apos;application.
          </p>

          <section className={contentStyles.section}>
            <h2 className={contentStyles.h2}>1. Responsable du traitement</h2>
            <p className={contentStyles.p}>
              Les données sont traitées dans le cadre de l&apos;application Startup Ludo. Pour toute
              question sur vos données personnelles, vous pouvez nous contacter (voir section « Nous
              contacter » en fin de document).
            </p>
          </section>

          <section className={contentStyles.section}>
            <h2 className={contentStyles.h2}>2. Données que nous collectons</h2>

            <h3 className={contentStyles.h3}>2.1 Données liées à votre compte</h3>
            <p className={contentStyles.p}>
              Lors de l&apos;inscription ou de la connexion, nous pouvons collecter :
            </p>
            <ul className={contentStyles.ul}>
              <li className={contentStyles.li}>
                <strong>Adresse e-mail</strong> (connexion par e-mail / mot de passe)
              </li>
              <li className={contentStyles.li}>
                <strong>Nom d&apos;affichage</strong> (pseudo ou nom que vous choisissez)
              </li>
              <li className={contentStyles.li}>
                <strong>Photo de profil</strong> (si vous utilisez Google ou Apple pour vous connecter)
              </li>
              <li className={contentStyles.li}>
                <strong>Identifiant de compte</strong> (généré par notre prestataire
                d&apos;authentification)
              </li>
            </ul>
            <p className={contentStyles.p}>
              Vous pouvez aussi jouer en <strong>mode invité</strong> sans créer de compte ; dans ce
              cas, aucune donnée de compte n&apos;est enregistrée de manière durable.
            </p>

            <h3 className={contentStyles.h3}>2.2 Données de profil et de jeu</h3>
            <p className={contentStyles.p}>Une fois connecté, nous enregistrons notamment :</p>
            <ul className={contentStyles.ul}>
              <li className={contentStyles.li}>
                <strong>Profil utilisateur</strong> : nom d&apos;affichage, photo, préférences (sons,
                vibrations, langue)
              </li>
              <li className={contentStyles.li}>
                <strong>Statistiques de jeu</strong> : XP, niveau, rang, parties jouées / gagnées,
                jetons gagnés
              </li>
              <li className={contentStyles.li}>
                <strong>Projets / startups</strong> : idées et projets que vous créez dans
                l&apos;application (nom, description, secteur, etc.)
              </li>
              <li className={contentStyles.li}>
                <strong>Historique de progression</strong> : avancement dans les parties et dans les
                programmes (challenges)
              </li>
            </ul>

            <h3 className={contentStyles.h3}>2.3 Données liées aux programmes (challenges)</h3>
            <p className={contentStyles.p}>
              Si vous vous inscrivez à un programme d&apos;accompagnement (challenge), nous pouvons
              enregistrer :
            </p>
            <ul className={contentStyles.ul}>
              <li className={contentStyles.li}>
                <strong>Formulaire d&apos;inscription</strong> : nom, prénom, âge, région, numéro de
                téléphone (si vous le renseignez), statut entrepreneur ou futur porteur de projet,
                souhaits de contact
              </li>
              <li className={contentStyles.li}>
                <strong>Progression</strong> : niveaux et sous-niveaux réalisés, XP par niveau,
                livrables complétés (choix de secteur, pitch, business plan, etc.)
              </li>
            </ul>

            <h3 className={contentStyles.h3}>2.4 Données liées au jeu en ligne (multijoueur)</h3>
            <p className={contentStyles.p}>Pour les parties en ligne (salles, matchmaking) :</p>
            <ul className={contentStyles.ul}>
              <li className={contentStyles.li}>
                <strong>Présence</strong> : statut en ligne / hors ligne, dernière connexion, salle de
                jeu actuelle
              </li>
              <li className={contentStyles.li}>
                <strong>Données de partie</strong> : identifiant de la salle, joueurs (identifiant, nom
                d&apos;affichage, couleur, statut prêt), état du jeu (positions, jetons, tour en cours),
                messages / réactions dans le chat de la partie
              </li>
            </ul>
            <p className={contentStyles.p}>
              Ces données sont utilisées pour faire fonctionner le jeu en temps réel et sont conservées
              le temps de la partie (et éventuellement pour l&apos;historique des scores / classements).
            </p>

            <h3 className={contentStyles.h3}>2.5 Données techniques</h3>
            <p className={contentStyles.p}>L&apos;application peut utiliser :</p>
            <ul className={contentStyles.ul}>
              <li className={contentStyles.li}>
                <strong>Données techniques</strong> : type d&apos;appareil, système d&apos;exploitation,
                langue de l&apos;appareil, pour assurer le bon fonctionnement et la compatibilité
              </li>
              <li className={contentStyles.li}>
                <strong>Stockage local</strong> : préférences (sons, vibrations, langue) et données de
                session stockées sur votre appareil (y compris via des mécanismes sécurisés type « Secure
                Store »)
              </li>
            </ul>
            <p className={contentStyles.p}>
              Nous ne mettons pas en place de suivi publicitaire ou de profilage commercial via des
              cookies ou traceurs tiers dans l&apos;application.
            </p>
          </section>

          <section className={contentStyles.section}>
            <h2 className={contentStyles.h2}>3. Bases légales et finalités</h2>
            <p className={contentStyles.p}>Nous traitons vos données pour :</p>
            <div className={contentStyles.tableWrap}>
              <table className={contentStyles.table}>
                <thead>
                  <tr>
                    <th className={contentStyles.th}>Finalité</th>
                    <th className={contentStyles.th}>Base légale / justification</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={contentStyles.td}>Création et gestion du compte</td>
                    <td className={contentStyles.td}>Exécution du contrat (utilisation de l&apos;app)</td>
                  </tr>
                  <tr>
                    <td className={contentStyles.td}>Sauvegarde de la progression</td>
                    <td className={contentStyles.td}>Exécution du contrat</td>
                  </tr>
                  <tr>
                    <td className={contentStyles.td}>Jeu en ligne et classements</td>
                    <td className={contentStyles.td}>Exécution du contrat, intérêt légitime</td>
                  </tr>
                  <tr>
                    <td className={contentStyles.td}>Inscription aux challenges</td>
                    <td className={contentStyles.td}>Consentement / exécution du contrat</td>
                  </tr>
                  <tr>
                    <td className={contentStyles.td}>Support et amélioration du service</td>
                    <td className={contentStyles.td}>Intérêt légitime</td>
                  </tr>
                  <tr>
                    <td className={contentStyles.td}>Respect des obligations légales</td>
                    <td className={contentStyles.td}>Obligation légale</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={contentStyles.p}>
              Lorsque la base est le <strong>consentement</strong>, vous pouvez le retirer à tout
              moment sans que la licéité des traitements effectués avant ce retrait soit remise en cause.
            </p>
          </section>

          <section className={contentStyles.section}>
            <h2 className={contentStyles.h2}>4. Services tiers et hébergement</h2>
            <p className={contentStyles.p}>
              Nous nous appuyons sur les services suivants, qui peuvent traiter des données pour notre
              compte :
            </p>
            <ul className={contentStyles.ul}>
              <li className={contentStyles.li}>
                <strong>Firebase (Google)</strong> : authentification, base de données (Firestore et
                Realtime Database), hébergement des données de compte, profils, parties et classements.
                Politique de confidentialité Google :{' '}
                <a
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={contentStyles.link}
                >
                  https://policies.google.com/privacy
                </a>
              </li>
              <li className={contentStyles.li}>
                <strong>Connexion avec Google</strong> : pour vous connecter avec votre compte Google
                (e-mail, nom, photo selon votre paramétrage Google).
              </li>
              <li className={contentStyles.li}>
                <strong>Connexion avec Apple</strong> : sur iOS, pour vous connecter avec Apple
                (e-mail, nom selon les options Apple). Politique de confidentialité Apple :{' '}
                <a
                  href="https://www.apple.com/legal/privacy/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={contentStyles.link}
                >
                  https://www.apple.com/legal/privacy/
                </a>
              </li>
            </ul>
            <p className={contentStyles.p}>
              Les données sont hébergées dans des datacenters sécurisés (régions utilisées par Firebase /
              Google). Nous ne vendons pas vos données personnelles à des tiers.
            </p>
          </section>

          <section className={contentStyles.section}>
            <h2 className={contentStyles.h2}>5. Durée de conservation</h2>
            <ul className={contentStyles.ul}>
              <li className={contentStyles.li}>
                <strong>Compte actif</strong> : les données du compte et de progression sont conservées
                tant que votre compte existe.
              </li>
              <li className={contentStyles.li}>
                <strong>Après suppression du compte</strong> : nous supprimons ou anonymisons les données
                personnelles dans les délais techniques et légaux applicables (sous réserve des
                obligations de conservation légale).
              </li>
              <li className={contentStyles.li}>
                <strong>Données de parties en ligne</strong> : conservées le temps nécessaire au
                fonctionnement du jeu et, le cas échéant, pour les classements ou l&apos;historique, puis
                supprimées ou anonymisées selon notre politique interne.
              </li>
              <li className={contentStyles.li}>
                <strong>Données des challenges</strong> : conservées pour la durée du programme et le
                temps nécessaire aux obligations légales ou contractuelles (ex. rapport, certificat).
              </li>
            </ul>
            <p className={contentStyles.p}>
              Vous pouvez demander la suppression de votre compte et de vos données à tout moment (voir
              section « Vos droits »).
            </p>
          </section>

          <section className={contentStyles.section}>
            <h2 className={contentStyles.h2}>6. Vos droits</h2>
            <p className={contentStyles.p}>
              Vous disposez des droits suivants sur vos données personnelles :
            </p>
            <ul className={contentStyles.ul}>
              <li className={contentStyles.li}>
                <strong>Droit d&apos;accès</strong> : obtenir une copie des données que nous détenons sur
                vous.
              </li>
              <li className={contentStyles.li}>
                <strong>Droit de rectification</strong> : faire corriger des données inexactes ou
                incomplètes.
              </li>
              <li className={contentStyles.li}>
                <strong>Droit à l&apos;effacement</strong> : demander la suppression de vos données et de
                votre compte (sous réserve des exceptions légales).
              </li>
              <li className={contentStyles.li}>
                <strong>Droit à la limitation du traitement</strong> : demander que le traitement soit
                limité dans certains cas.
              </li>
              <li className={contentStyles.li}>
                <strong>Droit à la portabilité</strong> : recevoir vos données dans un format structuré
                et lisible par machine, lorsque c&apos;est applicable.
              </li>
              <li className={contentStyles.li}>
                <strong>Droit d&apos;opposition</strong> : vous opposer à un traitement fondé sur
                l&apos;intérêt légitime.
              </li>
              <li className={contentStyles.li}>
                <strong>Droit de retirer votre consentement</strong> : lorsque le traitement est fondé
                sur le consentement.
              </li>
            </ul>
            <p className={contentStyles.p}>
              Pour exercer ces droits, contactez-nous (voir « Nous contacter »). Vous pouvez aussi
              introduire une réclamation auprès de la CNIL (France) ou de l&apos;autorité de contrôle de
              votre pays.
            </p>
          </section>

          <section className={contentStyles.section}>
            <h2 className={contentStyles.h2}>7. Sécurité</h2>
            <p className={contentStyles.p}>
              Nous mettons en œuvre des mesures techniques et organisationnelles adaptées pour protéger
              vos données (authentification sécurisée, accès restreint, utilisation de services reconnus
              comme Firebase). Aucune transmission sur Internet n&apos;est totalement infaillible ; nous
              nous efforçons de limiter les risques.
            </p>
          </section>

          <section className={contentStyles.section}>
            <h2 className={contentStyles.h2}>8. Mineurs</h2>
            <p className={contentStyles.p}>
              L&apos;application peut être utilisée par des mineurs dans le cadre d&apos;un usage familial
              ou éducatif. Si vous avez moins de 15 ans (ou l&apos;âge du consentement numérique dans
              votre pays), nous vous encourageons à utiliser l&apos;application avec l&apos;accord d&apos;un
              parent ou tuteur. Les formulaires des challenges (notamment nom, prénom, âge, téléphone) ne
              doivent être renseignés par des mineurs qu&apos;avec l&apos;autorisation des responsables
              légaux.
            </p>
          </section>

          <section className={contentStyles.section}>
            <h2 className={contentStyles.h2}>9. Modifications de la politique</h2>
            <p className={contentStyles.p}>
              Nous pouvons mettre à jour cette politique de confidentialité. La date de dernière mise à
              jour est indiquée en tête du document. En cas de changement important, nous vous en
              informerons via l&apos;application ou par e-mail si vous nous en avez communiqué un. Nous
              vous invitons à consulter régulièrement cette politique.
            </p>
          </section>

          <section className={contentStyles.section}>
            <h2 className={contentStyles.h2}>10. Nous contacter</h2>
            <p className={contentStyles.p}>
              Pour toute question sur cette politique ou pour exercer vos droits sur vos données
              personnelles :
            </p>
            <ul className={contentStyles.ul}>
              <li className={contentStyles.li}>
                <strong>Dans l&apos;application</strong> : écran Paramètres → À propos / Aide (si un lien ou
                une adresse de contact y figure).
              </li>
              <li className={contentStyles.li}>
                <strong>Par e-mail</strong> :{' '}
                <a href="mailto:contact@concree.com" className={contentStyles.link}>
                  contact@concree.com
                </a>
              </li>
            </ul>
            <p className={contentStyles.p}>
              Si vous souhaitez <strong>supprimer votre compte</strong>, indiquez-le clairement dans
              votre message ; nous traiterons votre demande dans les délais applicables.
            </p>
          </section>

          <p className={contentStyles.footer}>
            Startup Ludo – Politique de confidentialité – Version 1.0 – Février 2026
          </p>
        </div>
      </main>
    </div>
  );
}
