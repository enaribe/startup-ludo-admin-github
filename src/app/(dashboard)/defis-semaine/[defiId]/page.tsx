'use client';

/**
 * Un défi de la semaine — le parcours complet, en trois étapes.
 *
 * ═══ POURQUOI DES SECTIONS NUMÉROTÉES ═══
 *
 * Le défi se prépare dans un ORDRE : sans contenu, pas d'ouverture. La première
 * version de cet écran exposait ces actions comme cinq icônes côte à côte sur
 * une carte de liste, ce qui cachait l'ordre et obligeait à deviner quoi faire
 * ensuite.
 *
 * Les sections rendent la dépendance visible : chacune dit ce qu'elle attend,
 * et une étape non franchie désactive la suivante en expliquant pourquoi.
 * Même forme que `seances-pretes/[readyId]`.
 *
 * ═══ LE CONTENU ARRIVE PAR IMPORT JSON ═══
 *
 * L'étape 2 attend un JSON de cartes déjà rédigé. Le dépôt d'un document et la
 * génération IA sont REPLIÉS dans un `<details>` : ils ne servent qu'à produire
 * une première version quand on n'a rien, qu'on exporte ensuite en JSON pour la
 * corriger. Les présenter au même niveau que l'import ferait hésiter sur le
 * chemin à prendre, alors qu'il y en a un normal.
 *
 * Le document a donc perdu son numéro d'étape : il n'est plus obligatoire.
 *
 * ═══ UN SEUL BOUTON ÉCRIT ═══
 *
 * Les sections n'ont PAS chacune leur bouton d'enregistrement. La page en
 * portait trois, et rien ne disait lequel sauvait quoi : modifier le titre puis
 * cliquer sur celui du contenu perdait le titre en silence.
 *
 * Tout passe par la barre collée en bas, qui n'apparaît que s'il y a quelque
 * chose à écrire et qui dit QUOI part. Les autres boutons primaires ne sont pas
 * des enregistrements : « Importer un JSON » choisit un fichier, « Ouvrir »
 * publie. Toute action ajoutée ici doit garder cette distinction.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Download, FileJson, FileText, Sparkles, Upload } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  cloturerDefi,
  deposerDocumentDefi,
  enregistrerContenuDefi,
  enregistrerDefi,
  exporterContenuJson,
  genererContenuDefi,
  getClassementDefi,
  getDefi,
  lireContenuJson,
  ErreurContenuInvalide,
} from '@/lib/weekly-challenge-service';
import { modeleContenuJson, type AnomalieImport } from '@/lib/defi-json-import';
import {
  MIX_DEFI_DEFAUT,
  type DefiScore,
  type MixDefi,
  type StatutDefi,
  type WeeklyChallenge,
} from '@/types/weeklyChallenge';
import type { ClassSessionContent } from '@/types';
import ImageUploadField from '@/components/ui/ImageUploadField';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import toast from 'react-hot-toast';

const versDate = (ms: number): string =>
  Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : '';

function nbCartes(c: ClassSessionContent | null | undefined): number {
  if (!c) return 0;
  return (
    c.quizzes.length +
    c.duels.length +
    c.fundings.length +
    c.opportunities.length +
    c.challengeEvents.length
  );
}

/** En-tête de section : le numéro porte l'ordre, le sous-titre dit l'attendu. */
function TitreSection({
  numero,
  titre,
  aide,
  fait,
}: {
  numero: number;
  titre: string;
  aide: string;
  fait: boolean;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 999,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 800,
          background: fait ? 'rgba(46,160,67,0.12)' : 'var(--color-surface-variant)',
          color: fait ? '#2EA043' : 'var(--color-text-muted)',
        }}
      >
        {fait ? '✓' : numero}
      </div>
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-text-primary)' }}>
          {titre}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{aide}</p>
      </div>
    </div>
  );
}

export default function PageDefi() {
  const router = useRouter();
  const params = useParams<{ defiId: string }>();
  const defiId = params.defiId;
  const { isSuperAdmin, loading: authLoading } = useAuth();

  const [defi, setDefi] = useState<WeeklyChallenge | null>(null);
  const [chargement, setChargement] = useState(true);

  // Brouillon local des champs éditoriaux : on n'écrit qu'au clic, pour ne pas
  // envoyer une requête par frappe.
  const [titre, setTitre] = useState('');
  const [description, setDescription] = useState('');
  const [debutAt, setDebutAt] = useState(0);
  const [finAt, setFinAt] = useState(0);
  /*
    L'image reste dans le BROUILLON local, comme le titre et les dates.

    `ImageUploadField` envoie le fichier au Storage immédiatement et rend son
    URL, mais on n'écrit pas le défi pour autant : l'enregistrement se fait au
    bouton. Sinon l'image partirait en base pendant qu'un titre modifié juste
    au-dessus attendrait encore — deux comportements dans un même formulaire.
  */
  const [bannerUrl, setBannerUrl] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);

  const [depot, setDepot] = useState(false);
  const [mix, setMix] = useState<MixDefi>(MIX_DEFI_DEFAUT);
  const [generation, setGeneration] = useState(false);
  /** Contenu en attente de relecture — non encore enregistré. */
  const [brouillonContenu, setBrouillonContenu] = useState<ClassSessionContent | null>(null);
  const [importJson, setImportJson] = useState(false);
  /** Anomalies du dernier import : erreurs bloquantes ou corrections appliquées. */
  const [anomalies, setAnomalies] = useState<AnomalieImport[]>([]);
  /*
    La génération IA est REPLIÉE par défaut. Le chemin normal est l'import d'un
    JSON déjà rédigé ; la génération ne sert qu'à partir de rien, et l'exposer
    au même niveau redonnerait à l'écran l'encombrement qu'on vient d'en retirer.
  */
  const [voirGeneration, setVoirGeneration] = useState(false);

  const [scores, setScores] = useState<DefiScore[]>([]);
  const [aCloturer, setACloturer] = useState(false);
  const [cloture, setCloture] = useState(false);

  const charger = useCallback(async () => {
    try {
      const d = await getDefi(defiId);
      setDefi(d);
      if (d) {
        setTitre(d.titre);
        setDescription(d.description);
        setDebutAt(d.debutAt);
        setFinAt(d.finAt);
        setBannerUrl(d.bannerUrl ?? '');
        // Le classement n'a de sens qu'une fois le défi lancé.
        if (d.statut !== 'brouillon') setScores(await getClassementDefi(d.id));
      }
    } catch {
      toast.error('Chargement impossible');
    } finally {
      setChargement(false);
    }
  }, [defiId]);

  useEffect(() => {
    if (authLoading || !isSuperAdmin) return;
    void charger();
  }, [authLoading, isSuperAdmin, charger]);

  /**
   * Enregistre TOUT ce qui est en attente, en un seul geste.
   *
   * ═══ POURQUOI UN SEUL BOUTON ═══
   *
   * La page portait trois boutons primaires — « Enregistrer » pour le thème,
   * « Enregistrer ce contenu » pour les cartes, « Ouvrir » pour la mise en
   * ligne — et rien ne disait lequel sauvait quoi. Modifier le titre puis
   * cliquer sur celui du contenu perdait le titre, sans aucun avertissement.
   *
   * Un seul bouton, donc, qui écrit les deux. L'ouverture reste à part : ce
   * n'est pas un enregistrement mais une publication, visible immédiatement par
   * les joueurs, et elle mérite son geste propre.
   *
   * ⚠️ LE CONTENU EST ÉCRIT EN SECOND, et l'ordre compte : la route
   * `/enregistrer` refuse une ouverture sans cartes. Écrire le thème d'abord
   * garantit que le défi existe avec ses dates avant que le contenu l'y
   * rejoigne.
   *
   * @param statut Statut à forcer — `'ouvert'` depuis le bouton de mise en
   *   ligne. Sinon le statut courant est conservé.
   */
  async function sauver(statut?: StatutDefi) {
    if (!defi) return;
    if (!titre.trim()) {
      toast.error('Le thème est requis');
      return;
    }
    if (finAt <= debutAt) {
      toast.error('La clôture doit suivre l’ouverture');
      return;
    }
    setEnregistrement(true);
    try {
      /*
        ⚠️ LE CONTENU PART EN PREMIER, et l'ordre n'est pas indifférent.

        `/api/defi/enregistrer` refuse en 409 une ouverture sans cartes
        ENREGISTRÉES. Importer un JSON puis cliquer droit sur « Ouvrir »
        enverrait donc le statut `ouvert` alors que les cartes sont encore dans
        le brouillon local : refus, alors que le contenu est juste là, sous les
        yeux de l'auteur.

        Une exception ici laisse le brouillon à l'écran et le thème non
        enregistré : rien n'est perdu, et le message dit quoi corriger.
      */
      let contenuEnregistre = false;
      if (brouillonContenu) {
        await enregistrerContenuDefi(defi.id, brouillonContenu);
        contenuEnregistre = true;
      }

      await enregistrerDefi({
        id: defi.id,
        titre,
        description,
        statut: statut ?? defi.statut,
        debutAt,
        finAt,
        // Toujours transmis depuis CET écran, qui connaît le champ : `''`
        // retire donc l'image, et c'est le comportement attendu du bouton
        // « Retirer » du champ d'upload.
        bannerUrl,
      });

      if (statut === 'ouvert') {
        toast.success('Défi ouvert aux joueurs');
      } else if (contenuEnregistre) {
        toast.success(`Enregistré — ${nbCartes(brouillonContenu)} cartes`);
      } else {
        toast.success('Enregistré');
      }

      if (contenuEnregistre) {
        setBrouillonContenu(null);
        setAnomalies([]);
      }
      await charger();
    } catch (error) {
      /*
        La route de contenu REVALIDE et peut refuser en 422 ce que l'écran a
        accepté. On réaffiche alors les cartes fautives plutôt qu'un échec
        global — même traitement que l'import.
      */
      if (error instanceof ErreurContenuInvalide) {
        setAnomalies(error.anomalies);
        toast.error(error.message, { duration: 9000 });
        return;
      }
      // Le message du serveur porte l'information utile — notamment le 409 qui
      // NOMME le défi déjà ouvert, ou dit qu'il manque le contenu.
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible', {
        duration: 7000,
      });
    } finally {
      setEnregistrement(false);
    }
  }

  async function deposer(fichier: File) {
    if (!defi) return;
    setDepot(true);
    try {
      const source = await deposerDocumentDefi(defi.id, fichier);
      toast.success(`${source.nom} — ${source.caracteres.toLocaleString('fr-FR')} caractères`);
      await charger();
    } catch (error) {
      // Le message de l'extracteur distingue un format non supporté d'un PDF
      // scanné : le garder tel quel dit quoi refaire.
      toast.error(error instanceof Error ? error.message : 'Dépôt impossible', {
        duration: 8000,
      });
    } finally {
      setDepot(false);
    }
  }

  async function generer() {
    if (!defi) return;
    setGeneration(true);
    setBrouillonContenu(null);
    try {
      const genere = await genererContenuDefi(
        { id: defi.id, titre, description },
        mix
      );
      setBrouillonContenu(genere);
      toast.success(`${nbCartes(genere)} cartes générées — relisez avant d’enregistrer`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Génération impossible', {
        duration: 7000,
      });
    } finally {
      setGeneration(false);
    }
  }

  /**
   * Importe un JSON de contenu : validation, puis relecture à l'écran.
   *
   * Rien n'est enregistré ici. L'auteur doit voir les corrections automatiques
   * (un signe de jetons retourné, une catégorie ramenée) avant de valider —
   * elles ne se verraient jamais en partie.
   */
  async function importer(fichier: File) {
    setImportJson(true);
    setAnomalies([]);
    setBrouillonContenu(null);
    try {
      const resultat = await lireContenuJson(fichier);
      setAnomalies(resultat.anomalies);

      if (!resultat.contenu) {
        const nb = resultat.anomalies.filter((a) => a.bloquant).length;
        toast.error(
          `${nb} problème${nb > 1 ? 's' : ''} à corriger — rien n'a été importé.`,
          { duration: 7000 }
        );
        return;
      }

      setBrouillonContenu(resultat.contenu);
      const corrections = resultat.anomalies.filter((a) => !a.bloquant).length;
      toast.success(
        corrections > 0
          ? `${nbCartes(resultat.contenu)} cartes lues, ${corrections} correction${corrections > 1 ? 's' : ''} appliquée${corrections > 1 ? 's' : ''} — à vérifier ci-dessous`
          : `${nbCartes(resultat.contenu)} cartes lues — relisez avant d'enregistrer`,
        { duration: 6000 }
      );
    } catch (error) {
      // Le message de `JSON.parse` porte la POSITION de l'erreur de syntaxe :
      // c'est l'information la plus utile sur un fichier écrit à la main.
      toast.error(error instanceof Error ? error.message : 'Lecture impossible', {
        duration: 9000,
      });
    } finally {
      setImportJson(false);
    }
  }

  /** Déclenche le téléchargement d'un contenu texte. */
  function telecharger(contenu: string, nom: string) {
    const blob = new Blob([contenu], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nom;
    lien.click();
    // Sans révocation, le blob reste en mémoire jusqu'au rechargement de l'onglet.
    URL.revokeObjectURL(url);
  }

  /**
   * Exporte le contenu en base, au format réimportable.
   *
   * Le chemin prévu pour retoucher un contenu généré par l'IA : exporter,
   * corriger dans un éditeur, réimporter.
   */
  function exporter() {
    if (!defi) return;
    telecharger(exporterContenuJson(defi), `defi-${defi.id}.json`);
  }

  async function confirmerCloture() {
    if (!defi) return;
    setCloture(true);
    try {
      const { champion, participants } = await cloturerDefi(defi.id);
      toast.success(
        champion
          ? `Champion : ${champion.displayName} (${champion.xp} XP, ${participants} participants)`
          : 'Défi clos — aucun participant',
        { duration: 7000 }
      );
      setACloturer(false);
      await charger();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Clôture impossible', {
        duration: 7000,
      });
    } finally {
      setCloture(false);
    }
  }

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }
  if (!isSuperAdmin) {
    return (
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
        Réservé à l’équipe CONCREE.
      </p>
    );
  }
  if (!defi) {
    return (
      <div>
        <button className="btn-secondary mb-4" onClick={() => router.push('/defis-semaine')}>
          <ArrowLeft size={14} style={{ display: 'inline', marginRight: 6 }} />
          Retour
        </button>
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Défi introuvable.</p>
      </div>
    );
  }

  // Les cartes ENREGISTRÉES, pas le brouillon : c'est ce qui conditionne
  // l'ouverture côté serveur.
  const cartesEnregistrees = nbCartes(defi.contenu as ClassSessionContent | null);
  const clos = defi.statut === 'clos';

  /*
    CE QUI EST EN ATTENTE D'ÉCRITURE.

    La barre d'enregistrement n'apparaît que s'il y a vraiment quelque chose à
    sauver : une barre toujours présente devient un décor qu'on ne regarde plus,
    et on perd le signal « attention, vous avez des modifications ».

    La comparaison porte sur les valeurs, pas sur un drapeau « touché » : ouvrir
    un champ et y remettre la même chose ne doit pas réclamer un enregistrement.
    `bannerUrl` compare `''` à `defi.bannerUrl ?? ''` — en base, l'absence
    d'image peut être `null`, `''` ou la clé absente, les trois valant « pas
    d'image ».
  */
  const themeModifie =
    titre !== defi.titre ||
    description !== defi.description ||
    debutAt !== defi.debutAt ||
    finAt !== defi.finAt ||
    bannerUrl !== (defi.bannerUrl ?? '');
  const aEnregistrer = !clos && (themeModifie || brouillonContenu !== null);

  return (
    <div style={{ maxWidth: 760, paddingBottom: 8 }}>
      <div className="flex items-center justify-between mb-5">
        <button className="btn-secondary" onClick={() => router.push('/defis-semaine')}>
          <ArrowLeft size={14} style={{ display: 'inline', marginRight: 6 }} />
          Tous les défis
        </button>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{defi.id}</span>
      </div>

      {/* ═══ 1. Le thème ═══ */}
      <section className="glass-card p-5 mb-3">
        <TitreSection
          numero={1}
          titre="Le thème"
          aide="Ce que le joueur lit sur l’accueil avant de lancer le défi."
          fait={!!defi.titre && defi.titre !== 'Nouveau défi'}
        />
        <div className="flex flex-col gap-4">
          <div>
            <label className="label">Thème</label>
            <input
              className="input-field"
              value={titre}
              disabled={clos}
              placeholder="Trouver ses premiers clients"
              onChange={(e) => setTitre(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Description</label>
            <textarea
              className="input-field"
              rows={2}
              style={{ resize: 'vertical' }}
              value={description}
              disabled={clos}
              placeholder="Une à deux phrases : ce que le joueur doit retenir."
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {/*
            `storagePath` porte l'id du défi : une image par défi, et remplacer
            l'image d'un défi ne touche pas celle d'un autre.
          */}
          <ImageUploadField
            label="Image de fond de la carte d’accueil"
            value={bannerUrl}
            onChange={setBannerUrl}
            storagePath={`weeklyChallenges/${defi.id}/banner`}
            aspectRatio="banner"
            disabled={clos}
          />
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
            Optionnelle : sans image, la carte s’affiche sur un dégradé ambre.
            Le thème et la description se superposent au visuel, en blanc —
            préférez une image sans texte et plutôt sombre.
          </p>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="label">Ouverture (UTC)</label>
              <input
                type="date"
                className="input-field"
                value={versDate(debutAt)}
                disabled={clos}
                onChange={(e) => setDebutAt(Date.parse(`${e.target.value}T00:00:00Z`))}
              />
            </div>
            <div className="flex-1">
              <label className="label">Clôture (UTC)</label>
              <input
                type="date"
                className="input-field"
                value={versDate(finAt)}
                disabled={clos}
                onChange={(e) =>
                  // 23:00 et non 00:00 : `resetWeeklyStats` tourne le lundi à
                  // minuit UTC. Clôturer à minuit pile courrait contre elle.
                  setFinAt(Date.parse(`${e.target.value}T23:00:00Z`))
                }
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 2. Le contenu ═══ */}
      <section className="glass-card p-5 mb-3">
        <TitreSection
          numero={2}
          titre="Le contenu"
          aide="Les cartes jouées pendant le défi. Importez un JSON, ou générez-le depuis un document."
          fait={cartesEnregistrees > 0}
        />

        {cartesEnregistrees > 0 ? (
          <div className="flex items-center justify-between gap-3 mb-4">
            <span style={{ fontSize: 12.5, color: '#2EA043', fontWeight: 600 }}>
              {cartesEnregistrees} cartes enregistrées
            </span>
            <button className="btn-secondary" onClick={exporter}>
              <Download size={14} style={{ display: 'inline', marginRight: 6 }} />
              Exporter le JSON
            </button>
          </div>
        ) : null}

        {!clos ? (
          <>
            <label
              className="btn-primary"
              style={{
                cursor: importJson ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              <FileJson size={14} style={{ marginRight: 6 }} />
              {importJson
                ? 'Lecture…'
                : cartesEnregistrees > 0
                  ? 'Importer un autre JSON'
                  : 'Importer un JSON'}
              <input
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                disabled={importJson}
                onChange={(e) => {
                  const fichier = e.target.files?.[0];
                  // Remise à zéro : sans ça, réimporter le MÊME fichier après
                  // correction ne déclenche pas `onChange` la seconde fois —
                  // or c'est exactement le geste attendu après une erreur.
                  e.target.value = '';
                  if (fichier) void importer(fichier);
                }}
              />
            </label>

            {/* Le modèle, à côté de l'import : le format a trois subtilités
                qu'un fichier d'exemple fait comprendre mieux qu'une aide. */}
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 10 }}>
              Format attendu :{' '}
              <button
                onClick={() => telecharger(modeleContenuJson(), 'modele-defi.json')}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  color: 'var(--color-primary)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                télécharger un fichier d’exemple
              </button>{' '}
              — une carte de chaque type, à dupliquer.
            </p>

            <details
              style={{ marginTop: 14 }}
              open={voirGeneration}
              onToggle={(e) => setVoirGeneration((e.target as HTMLDetailsElement).open)}
            >
              <summary
                style={{
                  fontSize: 12.5,
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                Je n’ai pas encore de JSON — générer depuis un document
              </summary>

              <div
                style={{
                  marginTop: 14,
                  paddingLeft: 14,
                  borderLeft: '2px solid var(--color-card-border)',
                }}
              >
                <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                  Déposez un document, générez une première version, puis
                  exportez-la en JSON pour la corriger et la réimporter.
                </p>

                {/* ─ Le document source ─ */}
                {defi.source ? (
                  <div
                    className="flex items-center justify-between gap-3 mb-3"
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      background: 'var(--color-surface)',
                      fontSize: 13,
                    }}
                  >
                    <span className="flex items-center gap-2" style={{ minWidth: 0 }}>
                      <FileText size={14} color="var(--color-text-muted)" />
                      {defi.source.nom}
                    </span>
                    <span
                      style={{ fontSize: 11.5, color: 'var(--color-text-muted)', flexShrink: 0 }}
                    >
                      {defi.source.pages > 0 ? `${defi.source.pages} p · ` : ''}
                      {defi.source.caracteres.toLocaleString('fr-FR')} caractères
                    </span>
                  </div>
                ) : (
                  <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 12 }}>
                    PDF, DOCX, TXT ou MD. Un seul document par défi.
                  </p>
                )}

                <label
                  className="btn-secondary"
                  style={{
                    cursor: depot ? 'wait' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    marginBottom: 14,
                  }}
                >
                  <Upload size={14} style={{ marginRight: 6 }} />
                  {depot
                    ? 'Extraction…'
                    : defi.source
                      ? 'Remplacer le document'
                      : 'Déposer le document'}
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    style={{ display: 'none' }}
                    disabled={depot}
                    onChange={(e) => {
                      const fichier = e.target.files?.[0];
                      e.target.value = '';
                      if (fichier) void deposer(fichier);
                    }}
                  />
                </label>

                {/* ─ Les quantités, puis la génération ─ */}
                {!defi.source ? (
                  <p style={{ fontSize: 12.5, color: '#B9791A' }}>
                    Déposez d’abord le document : c’est lui qui fournit le contenu.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-3 mb-4">
                      {(
                        [
                          ['quiz', 'Quiz'],
                          ['duel', 'Duels'],
                          ['funding', 'Financements'],
                          ['opportunity', 'Opportunités'],
                          ['challenge', 'Challenges'],
                        ] as const
                      ).map(([cle, label]) => (
                        <div key={cle} style={{ width: 104 }}>
                          <label className="label" style={{ fontSize: 10.5 }}>
                            {label}
                          </label>
                          <input
                            type="number"
                            min={0}
                            max={30}
                            className="input-field"
                            value={mix[cle]}
                            onChange={(e) =>
                              setMix({
                                ...mix,
                                // Borné : le prompt tronque de toute façon, mais une
                                // valeur absurde ferait dépenser du quota pour rien.
                                [cle]: Math.max(0, Math.min(30, Number(e.target.value) || 0)),
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>
                    <button
                      className="btn-secondary"
                      onClick={() => void generer()}
                      disabled={generation}
                    >
                      <Sparkles size={14} style={{ display: 'inline', marginRight: 6 }} />
                      {generation
                        ? 'Génération… (quelques dizaines de secondes)'
                        : 'Générer une première version'}
                    </button>
                  </>
                )}
              </div>
            </details>
          </>
        ) : null}

        {/* ═══ Les anomalies du dernier import ═══ */}
        {anomalies.length > 0 ? (
          <div
            style={{
              marginTop: 18,
              padding: '12px 14px',
              borderRadius: 10,
              background: anomalies.some((a) => a.bloquant)
                ? 'rgba(248,81,73,0.08)'
                : 'rgba(185,121,26,0.08)',
              border: `1px solid ${
                anomalies.some((a) => a.bloquant)
                  ? 'rgba(248,81,73,0.25)'
                  : 'rgba(185,121,26,0.25)'
              }`,
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle
                size={14}
                color={anomalies.some((a) => a.bloquant) ? '#F85149' : '#B9791A'}
              />
              <strong style={{ fontSize: 12.5 }}>
                {anomalies.some((a) => a.bloquant)
                  ? 'À corriger dans le fichier — rien n’a été importé'
                  : 'Corrections appliquées automatiquement'}
              </strong>
            </div>
            <div className="flex flex-col gap-1">
              {/* Les bloquantes d'abord : c'est ce qui empêche l'import. */}
              {[...anomalies]
                .sort((a, b) => Number(b.bloquant) - Number(a.bloquant))
                .map((a, i) => (
                  <div key={i} style={{ fontSize: 12, lineHeight: 1.45 }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: a.bloquant ? '#F85149' : '#B9791A',
                        marginRight: 6,
                      }}
                    >
                      {a.ou}
                    </span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{a.message}</span>
                  </div>
                ))}
            </div>
          </div>
        ) : null}

        {/* La relecture, en place : pas de modale. Elle se ferme d'un clic
            hors cadre et le contenu lu serait perdu. */}
        {brouillonContenu ? (
          <div
            style={{
              marginTop: 18,
              paddingTop: 16,
              borderTop: '1px solid var(--color-card-border)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <strong style={{ fontSize: 13 }}>
                À relire — {nbCartes(brouillonContenu)} cartes
              </strong>
              {/* « Jeter » reste ici : c'est une action LOCALE sur ce brouillon,
                  pas un enregistrement. L'écriture passe par la barre du bas. */}
              <button
                className="btn-secondary"
                onClick={() => {
                  setBrouillonContenu(null);
                  setAnomalies([]);
                }}
              >
                Jeter
              </button>
            </div>
            {cartesEnregistrees > 0 ? (
              <p style={{ fontSize: 12, color: '#B9791A', marginBottom: 10 }}>
                Ce contenu REMPLACE les {cartesEnregistrees} cartes enregistrées.
              </p>
            ) : null}
            {(
              [
                ['Quiz', brouillonContenu.quizzes],
                ['Duels', brouillonContenu.duels],
                ['Financements', brouillonContenu.fundings],
                ['Opportunités', brouillonContenu.opportunities],
                ['Challenges', brouillonContenu.challengeEvents],
              ] as const
            )
              .filter(([, liste]) => liste.length > 0)
              .map(([label, liste]) => (
                <div key={label} className="mb-3">
                  <div className="label" style={{ marginBottom: 5 }}>
                    {label} ({liste.length})
                  </div>
                  <div className="flex flex-col gap-1">
                    {liste.map((carte, i) => (
                      <div
                        key={i}
                        style={{
                          fontSize: 12,
                          padding: '6px 10px',
                          borderRadius: 8,
                          background: 'var(--color-surface)',
                        }}
                      >
                        {libelleCarte(carte)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        ) : null}
      </section>

      {/* ═══ 3. Ouvrir, puis clôturer ═══ */}
      <section className="glass-card p-5 mb-3">
        <TitreSection
          numero={3}
          titre="Mise en ligne"
          aide="Un seul défi peut être en cours à la fois."
          fait={defi.statut !== 'brouillon'}
        />

        {clos ? (
          <div style={{ fontSize: 13 }}>
            {defi.champion ? (
              <>
                🏆 <strong>{defi.champion.displayName}</strong> — {defi.champion.xp} XP
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {' '}
                  · {defi.participants} participant{defi.participants > 1 ? 's' : ''}
                </span>
              </>
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>Clos sans participant.</span>
            )}
          </div>
        ) : defi.statut === 'brouillon' ? (
          <>
            {/* Le BROUILLON compte : `sauver('ouvert')` l'écrit avant
                d'ouvrir, donc un contenu relu mais pas encore enregistré
                permet bien l'ouverture. Ne tester que `cartesEnregistrees`
                bloquerait l'auteur juste après un import réussi. */}
            {cartesEnregistrees === 0 && !brouillonContenu ? (
              <p style={{ fontSize: 12.5, color: '#B9791A' }}>
                Importez d’abord le contenu : sans cartes, le défi n’a pas
                d’épreuve à faire jouer.
              </p>
            ) : (
              <button
                className="btn-primary"
                onClick={() => void sauver('ouvert')}
                disabled={enregistrement}
              >
                Ouvrir le défi aux joueurs
              </button>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              En cours. La clôture automatique tombe le dimanche à 23:00 UTC.
            </span>
            <button className="btn-secondary" onClick={() => setACloturer(true)}>
              Clôturer maintenant
            </button>
          </div>
        )}
      </section>

      {/* ═══ Le classement, quand il existe ═══ */}
      {defi.statut !== 'brouillon' ? (
        <section className="glass-card p-5">
          <h2 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>Classement</h2>
          {scores.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
              Personne n’a encore marqué de points.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {scores.map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between"
                  style={{ fontSize: 13, padding: '5px 0' }}
                >
                  <span>
                    <strong style={{ color: 'var(--color-text-muted)', marginRight: 8 }}>
                      {i + 1}.
                    </strong>
                    {s.displayName}
                  </span>
                  <span style={{ fontWeight: 700 }}>
                    {s.xp} XP
                    <span
                      style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: 11.5 }}
                    >
                      {' '}
                      · {s.parties} partie{s.parties > 1 ? 's' : ''}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/*
        ═══ LA BARRE D'ENREGISTREMENT — LE SEUL BOUTON QUI ÉCRIT ═══

        Collée en bas de la fenêtre : la page est longue, et un bouton en fin de
        document obligerait à défiler jusqu'en bas après avoir corrigé un champ
        tout en haut.

        `paddingBottom` sur le conteneur de page plus bas compense sa hauteur,
        sinon elle masquerait le classement.
      */}
      {aEnregistrer ? (
        <div
          style={{
            position: 'sticky',
            bottom: 0,
            marginTop: 16,
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(12, 36, 62, 0.92)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--color-card-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 12.5, color: 'var(--color-text-secondary)' }}>
            {/* Dire CE QUI part : sans ça, l'auteur ne sait pas si son
                contenu relu est inclus dans le même geste. */}
            {brouillonContenu && themeModifie
              ? `Thème modifié et ${nbCartes(brouillonContenu)} cartes à enregistrer`
              : brouillonContenu
                ? `${nbCartes(brouillonContenu)} cartes à enregistrer`
                : 'Modifications non enregistrées'}
          </span>
          <button
            className="btn-primary"
            onClick={() => void sauver()}
            disabled={enregistrement}
            style={{ flexShrink: 0 }}
          >
            {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={aCloturer}
        onClose={() => setACloturer(false)}
        onConfirm={() => void confirmerCloture()}
        title="Clôturer ce défi ?"
        message="Le champion sera calculé depuis le classement et figé définitivement. Le défi ne pourra plus être rouvert ni modifié."
        confirmLabel="Clôturer"
        danger
        loading={cloture}
      />
    </div>
  );
}

/**
 * Libellé lisible d'une carte, quel que soit son type.
 *
 * Les cinq types n'ont pas le même champ porteur : `question` pour un quiz,
 * `title` ou `description` pour les événements. On prend le premier non vide
 * plutôt que d'écrire cinq branches — cette liste sert à relire, pas à éditer.
 */
function libelleCarte(carte: unknown): string {
  if (!carte || typeof carte !== 'object') return '(carte vide)';
  const o = carte as Record<string, unknown>;
  for (const cle of ['question', 'title', 'titre', 'description', 'text']) {
    const v = o[cle];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '(sans libellé)';
}
