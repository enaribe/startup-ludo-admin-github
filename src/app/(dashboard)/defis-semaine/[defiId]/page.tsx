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
import { AlertTriangle, ArrowLeft, Download, FileJson, FileText, Plus, Sparkles, Upload, X } from 'lucide-react';
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
  importerFicheJson,
  modeleFicheJson,
  type AnomalieFiche,
} from '@/lib/defi-fiche-import';
import {
  MIX_DEFI_DEFAUT,
  type DefiScore,
  type MixDefi,
  type ChiffreDefi,
  type PisteDefi,
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
/**
 * Une liste de textes courts, éditable en place.
 *
 * Sert aux angles, cibles, missions et faits : des listes de 5 à 8 entrées
 * d'une ligne. Un champ par entrée plutôt qu'un textarea à lignes séparées —
 * le textarea semble plus simple, mais il oblige à deviner la règle (une par
 * ligne ? séparées par des virgules ?) et perd silencieusement une entrée qui
 * contient le séparateur.
 *
 * L'ordre compte : il est repris tel quel dans l'application.
 */
function ListeTexte({
  valeurs,
  onChange,
  clos,
  placeholder,
  maximum,
}: {
  valeurs: string[];
  onChange: (v: string[]) => void;
  clos: boolean;
  placeholder: string;
  maximum: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      {valeurs.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className="input-field"
            value={v}
            disabled={clos}
            placeholder={placeholder}
            onChange={(e) => onChange(valeurs.map((x, j) => (j === i ? e.target.value : x)))}
          />
          <button
            type="button"
            disabled={clos}
            onClick={() => onChange(valeurs.filter((_, j) => j !== i))}
            title="Retirer"
            style={{
              background: 'none', border: 'none', cursor: clos ? 'not-allowed' : 'pointer',
              color: 'var(--color-text-muted)', padding: 4, flexShrink: 0, opacity: clos ? 0.4 : 1,
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn-secondary"
        disabled={clos || valeurs.length >= maximum}
        style={{ alignSelf: 'flex-start', opacity: clos || valeurs.length >= maximum ? 0.5 : 1 }}
        onClick={() => onChange([...valeurs, ''])}
        title={valeurs.length >= maximum ? `${maximum} au maximum` : undefined}
      >
        <Plus size={13} style={{ display: 'inline', marginRight: 5 }} />
        Ajouter
      </button>
    </div>
  );
}

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
  /*
    QUESTIONNAIRE D'IDÉATION — des questions OUVERTES, pas des QCM.

    Le joueur ÉCRIT sa réponse, et ce sont ses mots qui nourrissent les trois
    idées d'entreprise proposées. Des choix fermés donneraient des combinaisons
    finies, donc des idées qui se répètent d'un joueur à l'autre.

    Facultatif : sans question saisie, le mobile se rabat sur ses cartes
    d'idéation génériques. Un défi publié sans questionnaire reste jouable.
  */
  /*
    ═══ IDÉATION — TROIS TOURS DE CHOIX GUIDÉS ═══

    Remplace les questions ouvertes et la liste de projets du lot précédent.

    Pourquoi guidé : des réponses libres donnaient des idées qui se
    ressemblaient d'un joueur à l'autre, parce que le modèle recevait trois
    phrases vagues. Des angles écrits POUR le thème ancrent les propositions
    dans le défi de la semaine.

    Les pistes express sont le filet : si le modèle ne répond pas (quota,
    réseau, clé absente), ce sont elles que le joueur voit. Sans elles, une
    panne d'API laisse l'écran vide.
  */
  const [angles, setAngles] = useState<string[]>([]);
  const [cibles, setCibles] = useState<string[]>([]);
  const [missions, setMissions] = useState<string[]>([]);
  const [pistes, setPistes] = useState<PisteDefi[]>([]);

  /* ─── Zone, calendrier, médias (lot 2) ─── */
  const [zoneCode, setZoneCode] = useState('');
  const [zoneNom, setZoneNom] = useState('');
  const [zoneArticle, setZoneArticle] = useState('');
  const [zoneDrapeau, setZoneDrapeau] = useState('');
  const [semaine, setSemaine] = useState<number | ''>('');
  const [fuseau, setFuseau] = useState('');
  const [resultatsAt, setResultatsAt] = useState(0);

  const [themeAvecArticle, setThemeAvecArticle] = useState('');
  const [themeAvecDe, setThemeAvecDe] = useState('');
  const [beneficiaires, setBeneficiaires] = useState('');
  const [problemePourAdia, setProblemePourAdia] = useState('');
  const [faitsPourAdia, setFaitsPourAdia] = useState<string[]>([]);

  const [chiffres, setChiffres] = useState<ChiffreDefi[]>([]);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoPoster, setVideoPoster] = useState('');
  const [videoSousTitres, setVideoSousTitres] = useState('');
  const [videoDuree, setVideoDuree] = useState<number | ''>('');
  const [videoPoids, setVideoPoids] = useState<number | ''>('');
  const [lotCourt, setLotCourt] = useState('');
  const [lotLong, setLotLong] = useState('');

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
  const [plateauCentreUrl, setPlateauCentreUrl] = useState('');
  const [enregistrement, setEnregistrement] = useState(false);
  /** Nouvelle date de clôture, pour rouvrir un défi clos trop tôt. */
  const [nouvelleFin, setNouvelleFin] = useState('');

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

  /*
    ─── Remplissage par collage d'un JSON ───

    Le texte collé reste ici tant qu'il n'est pas appliqué : on ne touche aux
    champs du formulaire qu'au clic. Coller devrait pouvoir être annulé d'un
    Cmd+Z, et un remplissage au fil de la frappe écraserait la saisie en cours
    à chaque caractère.
  */
  const [ficheCollee, setFicheCollee] = useState('');
  const [anomaliesFiche, setAnomaliesFiche] = useState<AnomalieFiche[]>([]);
  const [remplisFiche, setRemplisFiche] = useState<string[]>([]);
  const [voirCollage, setVoirCollage] = useState(false);

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
        setPlateauCentreUrl(d.plateauCentreUrl ?? '');
        setAngles(d.ideation?.angles ?? []);
        setCibles(d.ideation?.cibles ?? []);
        setMissions(d.ideation?.missions ?? []);
        setPistes(d.ideation?.pistesExpress ?? []);
        setZoneCode(d.zone?.code ?? '');
        setZoneNom(d.zone?.nom ?? '');
        setZoneArticle(d.zone?.avecArticle ?? '');
        setZoneDrapeau(d.zone?.drapeau ?? '');
        setSemaine(d.semaine ?? '');
        setFuseau(d.fuseau ?? '');
        setResultatsAt(d.resultatsAt ?? 0);
        setThemeAvecArticle(d.themeAvecArticle ?? '');
        setThemeAvecDe(d.themeAvecDe ?? '');
        setBeneficiaires(d.beneficiaires ?? '');
        setProblemePourAdia(d.problemePourAdia ?? '');
        setFaitsPourAdia(d.faitsPourAdia ?? []);
        setChiffres(d.chiffres ?? []);
        setVideoUrl(d.video?.url ?? '');
        setVideoPoster(d.video?.posterUrl ?? '');
        setVideoSousTitres(d.video?.sousTitresUrl ?? '');
        setVideoDuree(d.video?.dureeS ?? '');
        setVideoPoids(d.video?.poidsMo ?? '');
        setLotCourt(d.lot?.court ?? '');
        setLotLong(d.lot?.long ?? '');
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
  /**
   * @param finForcee Clôture à écrire à la place de celle de l'état.
   *   Nécessaire à la réouverture : `setFinAt` n'a pas encore pris effet au
   *   moment de l'appel, et on enverrait l'ancienne date — déjà passée.
   */
  /**
   * Rouvre un défi clos, avec une nouvelle date de clôture.
   *
   * ═══ RIEN N'EST REMIS À ZÉRO ═══
   *
   * Scores et idées restent en base : les joueurs reprennent exactement où
   * ils en étaient, rang compris. Le champion enregistré à la clôture reste
   * lui aussi — il sera recalculé au prochain passage à « clos », sur les
   * scores d'alors.
   *
   * L'invariant « un seul défi ouvert » est vérifié côté serveur : la route
   * refuse avec un 409 si un autre défi est déjà ouvert.
   */
  async function rouvrir() {
    if (!defi || !nouvelleFin) return;
    // 23:00 comme le champ de clôture : `resetWeeklyStats` tourne le lundi à
    // minuit UTC, et clôturer à minuit pile courrait contre elle.
    const fin = Date.parse(`${nouvelleFin}T23:00:00Z`);
    if (!Number.isFinite(fin)) {
      toast.error('Date de clôture invalide');
      return;
    }
    if (fin <= Date.now()) {
      toast.error('La nouvelle clôture doit être dans le futur');
      return;
    }
    setFinAt(fin);
    await sauver('ouvert', fin);
    setNouvelleFin('');
  }

  async function sauver(statut?: StatutDefi, finForcee?: number) {
    if (!defi) return;
    if (!titre.trim()) {
      toast.error('Le thème est requis');
      return;
    }
    const finEffective = finForcee ?? finAt;
    if (finEffective <= debutAt) {
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
        finAt: finEffective,
        // Toujours transmis depuis CET écran, qui connaît le champ : `''`
        // retire donc l'image, et c'est le comportement attendu du bouton
        // « Retirer » du champ d'upload.
        bannerUrl,
        plateauCentreUrl,
        // Transmis depuis CET écran, qui connaît le champ : un tableau vide
        // efface donc les questions, ce qui est le comportement attendu du
        // bouton de suppression de la dernière ligne.
        // Les objets composés ne sont transmis que s'ils portent quelque
        // chose : écrire `{ code: '', nom: '' }` créerait une zone vide que le
        // mobile prendrait pour une zone réelle.
        ...(zoneCode.trim()
          ? {
              zone: {
                code: zoneCode.trim().toUpperCase(),
                nom: zoneNom.trim(),
                avecArticle: zoneArticle.trim(),
                ...(zoneDrapeau.trim() ? { drapeau: zoneDrapeau.trim() } : {}),
              },
            }
          : {}),
        ...(semaine !== '' ? { semaine: Number(semaine) } : {}),
        ...(fuseau.trim() ? { fuseau: fuseau.trim() } : {}),
        ...(resultatsAt > 0 ? { resultatsAt } : {}),
        themeAvecArticle: themeAvecArticle.trim(),
        themeAvecDe: themeAvecDe.trim(),
        beneficiaires: beneficiaires.trim(),
        problemePourAdia: problemePourAdia.trim(),
        faitsPourAdia: faitsPourAdia.map((x) => x.trim()).filter(Boolean),
        chiffres,
        ...(videoUrl.trim()
          ? {
              video: {
                url: videoUrl.trim(),
                ...(videoPoster.trim() ? { posterUrl: videoPoster.trim() } : {}),
                ...(videoSousTitres.trim() ? { sousTitresUrl: videoSousTitres.trim() } : {}),
                ...(videoDuree !== '' ? { dureeS: Number(videoDuree) } : {}),
                ...(videoPoids !== '' ? { poidsMo: Number(videoPoids) } : {}),
              },
            }
          : { video: null }),
        ideation: { angles, cibles, missions, pistesExpress: pistes },
        ...(lotCourt.trim()
          ? { lot: { court: lotCourt.trim(), ...(lotLong.trim() ? { long: lotLong.trim() } : {}) } }
          : { lot: null }),
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
  /**
   * Pose le JSON collé dans les champs du formulaire.
   *
   * ═══ RIEN N'EST ÉCRIT EN BASE ═══
   *
   * Cette fonction ne fait que des `setX` : les champs se remplissent comme
   * sous les doigts, le bouton d'enregistrement s'allume, et l'auteur relit
   * avant de valider. Écrire directement ferait partir en production un
   * collage que personne n'a relu.
   *
   * ═══ UNE CLÉ ABSENTE NE VIDE RIEN ═══
   *
   * Chaque champ n'est touché que si le JSON le porte. C'est ce qui rend un
   * collage partiel utilisable : coller la seule idéation ne doit pas effacer
   * le thème et les chiffres déjà saisis.
   */
  function appliquerFiche() {
    const r = importerFicheJson(ficheCollee);
    setAnomaliesFiche(r.anomalies);
    setRemplisFiche(r.remplis);

    if (!r.fiche) {
      toast.error('Rien n’a pu être importé');
      return;
    }
    const f = r.fiche;

    if (f.titre !== undefined) setTitre(f.titre);
    if (f.description !== undefined) setDescription(f.description);

    if (f.zone !== undefined) {
      setZoneCode(f.zone.code);
      setZoneNom(f.zone.nom);
      setZoneArticle(f.zone.avecArticle);
      if (f.zone.drapeau !== undefined) setZoneDrapeau(f.zone.drapeau);
    }
    if (f.semaine !== undefined) setSemaine(f.semaine);
    if (f.fuseau !== undefined) setFuseau(f.fuseau);

    if (f.themeAvecArticle !== undefined) setThemeAvecArticle(f.themeAvecArticle);
    if (f.themeAvecDe !== undefined) setThemeAvecDe(f.themeAvecDe);
    if (f.beneficiaires !== undefined) setBeneficiaires(f.beneficiaires);
    if (f.problemePourAdia !== undefined) setProblemePourAdia(f.problemePourAdia);
    if (f.faitsPourAdia !== undefined) setFaitsPourAdia(f.faitsPourAdia);

    if (f.chiffres !== undefined) setChiffres(f.chiffres);

    /*
      Les trois listes d'idéation sont remplacées INDÉPENDAMMENT.

      L'importeur rend toujours les trois (le type les exige), mais une liste
      vide signifie « non fournie » et ne doit pas écraser celle déjà saisie.
      Sans ce test, coller les seuls angles effacerait les cibles.
    */
    if (f.ideation !== undefined) {
      if (f.ideation.angles.length > 0) setAngles(f.ideation.angles);
      if (f.ideation.cibles.length > 0) setCibles(f.ideation.cibles);
      if (f.ideation.missions.length > 0) setMissions(f.ideation.missions);
      if (f.ideation.pistesExpress?.length) setPistes(f.ideation.pistesExpress);
    }

    if (f.video !== undefined) {
      setVideoUrl(f.video.url);
      if (f.video.posterUrl !== undefined) setVideoPoster(f.video.posterUrl);
      if (f.video.sousTitresUrl !== undefined) setVideoSousTitres(f.video.sousTitresUrl);
      if (f.video.dureeS !== undefined) setVideoDuree(f.video.dureeS);
      if (f.video.poidsMo !== undefined) setVideoPoids(f.video.poidsMo);
    }
    if (f.lot !== undefined) {
      setLotCourt(f.lot.court);
      if (f.lot.long !== undefined) setLotLong(f.lot.long);
    }

    const bloquantes = r.anomalies.filter((a) => a.bloquant).length;
    if (bloquantes === 0 && r.anomalies.length === 0) {
      toast.success(`${r.remplis.length} champ(s) remplis — relisez, puis enregistrez`);
    } else {
      toast.success(`${r.remplis.length} champ(s) remplis, ${r.anomalies.length} à vérifier`);
    }
  }

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
  /*
    ⚠️ TOUT CHAMP ÉDITABLE DOIT FIGURER ICI.

    DÉFAUT CORRIGÉ : le questionnaire et les projets n'y étaient pas. Un admin
    qui ajoutait des questions voyait le bouton « Enregistrer » rester inerte,
    et perdait son travail en quittant la page — sans message, sans trace.

    La comparaison des listes passe par JSON : elles sont courtes (4 entrées au
    plus) et leurs champs sont des chaînes, donc l'ordre des clés est stable.
  */
  const memeListe = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

  /*
    Les listes d'idéation encore vides, nommées pour l'avertissement.

    On lit l'état du formulaire et non `defi.ideation` : l'ouverture
    enregistre le brouillon avant d'ouvrir, donc des listes saisies mais pas
    encore sauvegardées doivent compter comme remplies.
  */
  const listesManquantes = [
    angles.length === 0 ? 'angles d’attaque' : null,
    cibles.length === 0 ? 'cibles' : null,
    missions.length === 0 ? 'missions' : null,
  ].filter((v): v is string => v !== null);
  const themeModifie =
    titre !== defi.titre ||
    description !== defi.description ||
    debutAt !== defi.debutAt ||
    finAt !== defi.finAt ||
    bannerUrl !== (defi.bannerUrl ?? '') ||
    plateauCentreUrl !== (defi.plateauCentreUrl ?? '') ||
    !memeListe(angles, defi.ideation?.angles ?? []) ||
    !memeListe(cibles, defi.ideation?.cibles ?? []) ||
    !memeListe(missions, defi.ideation?.missions ?? []) ||
    !memeListe(pistes, defi.ideation?.pistesExpress ?? []) ||
    !memeListe(chiffres, defi.chiffres ?? []) ||
    !memeListe(faitsPourAdia, defi.faitsPourAdia ?? []) ||
    zoneCode !== (defi.zone?.code ?? '') ||
    zoneNom !== (defi.zone?.nom ?? '') ||
    zoneArticle !== (defi.zone?.avecArticle ?? '') ||
    zoneDrapeau !== (defi.zone?.drapeau ?? '') ||
    semaine !== (defi.semaine ?? '') ||
    fuseau !== (defi.fuseau ?? '') ||
    resultatsAt !== (defi.resultatsAt ?? 0) ||
    themeAvecArticle !== (defi.themeAvecArticle ?? '') ||
    themeAvecDe !== (defi.themeAvecDe ?? '') ||
    beneficiaires !== (defi.beneficiaires ?? '') ||
    problemePourAdia !== (defi.problemePourAdia ?? '') ||
    videoUrl !== (defi.video?.url ?? '') ||
    videoPoster !== (defi.video?.posterUrl ?? '') ||
    videoSousTitres !== (defi.video?.sousTitresUrl ?? '') ||
    videoDuree !== (defi.video?.dureeS ?? '') ||
    videoPoids !== (defi.video?.poidsMo ?? '') ||
    lotCourt !== (defi.lot?.court ?? '') ||
    lotLong !== (defi.lot?.long ?? '');
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

      {/*
        ═══ REMPLIR TOUTE LA FICHE EN COLLANT UN JSON ═══

        Replié par défaut, et placé AVANT la première section : c'est un
        raccourci vers le formulaire entier, pas une étape de plus. Déplié au
        même niveau que les sections, il ferait croire qu'il faut y passer.

        Il ne couvre pas les cartes — elles ont leur propre import, section 7,
        avec un validateur qui refuse tout plutôt qu'importer à moitié.
      */}
      {!clos ? (
        <details
          className="glass-card p-5 mb-3"
          open={voirCollage}
          onToggle={(e) => setVoirCollage((e.target as HTMLDetailsElement).open)}
        >
          <summary
            style={{
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <FileJson size={15} />
            Remplir la fiche depuis un JSON
            <span style={{ fontWeight: 500, color: 'var(--color-text-muted)', fontSize: 12 }}>
              — tout sauf les cartes
            </span>
          </summary>

          <div style={{ marginTop: 14 }}>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginBottom: 10, lineHeight: 1.55 }}>
              Collez un JSON : les champs se remplissent, vous relisez, puis
              vous enregistrez. Une clé absente laisse son champ inchangé, donc
              un JSON partiel ne fait rien perdre.
            </p>

            <textarea
              className="input-field"
              rows={8}
              value={ficheCollee}
              placeholder='{ "titre": "Entreprendre face aux inondations", "zone": { … } }'
              onChange={(e) => setFicheCollee(e.target.value)}
              style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, resize: 'vertical' }}
            />

            <div className="flex items-center gap-3" style={{ marginTop: 10 }}>
              <button
                className="btn-primary"
                disabled={!ficheCollee.trim()}
                style={{ opacity: ficheCollee.trim() ? 1 : 0.5 }}
                onClick={appliquerFiche}
              >
                Remplir les champs
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  setFicheCollee(modeleFicheJson());
                  setAnomaliesFiche([]);
                  setRemplisFiche([]);
                }}
              >
                Charger un exemple
              </button>
              {ficheCollee ? (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setFicheCollee('');
                    setAnomaliesFiche([]);
                    setRemplisFiche([]);
                  }}
                >
                  Effacer
                </button>
              ) : null}
            </div>

            {/* ─── Ce qui a été rempli ─── */}
            {remplisFiche.length > 0 ? (
              <p style={{ fontSize: 12.5, color: '#2EA043', marginTop: 12, lineHeight: 1.5 }}>
                Rempli : {remplisFiche.join(' · ')}. Relisez les sections
                ci-dessous, puis enregistrez.
              </p>
            ) : null}

            {/*
              ─── Ce qui a été écarté ───

              Chaque anomalie porte son chemin dans le JSON. Un message sans
              position obligerait l'auteur à relire tout son fichier pour
              trouver la ligne en cause.
            */}
            {anomaliesFiche.length > 0 ? (
              <ul style={{ marginTop: 12, paddingLeft: 0, listStyle: 'none' }}>
                {anomaliesFiche.map((a, i) => (
                  <li
                    key={`${a.ou}_${i}`}
                    style={{
                      fontSize: 12.5,
                      color: a.bloquant ? '#D1242F' : '#B87A0C',
                      lineHeight: 1.5,
                      marginBottom: 4,
                    }}
                  >
                    <strong>{a.ou}</strong> — {a.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}

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

          <ImageUploadField
            label="Image du centre du plateau"
            value={plateauCentreUrl}
            onChange={setPlateauCentreUrl}
            storagePath={`weeklyChallenges/${defi.id}/plateau-centre`}
            aspectRatio="square"
            disabled={clos}
          />
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: -8 }}>
            Optionnelle : sans image, le centre du plateau garde le logo
            Startup Ludo. Elle est CARRÉE et vue à travers un carré d’environ
            150 px — un logo et deux mots, jamais une photographie. Elle porte
            son propre fond : elle remplit la zone, bords compris.
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

      {/* ═══ 2. La zone et le calendrier ═══ */}
      <section className="glass-card p-5 mb-3">
        <TitreSection
          numero={2}
          titre="La zone et le calendrier"
          aide="Un défi appartient à un pays. Le classement et les dates en dépendent."
          fait={!!zoneCode && !!fuseau}
        />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">Code pays</label>
            <input
              className="input-field"
              value={zoneCode}
              disabled={clos}
              placeholder="SN"
              maxLength={2}
              onChange={(e) => setZoneCode(e.target.value.toUpperCase())}
            />
          </div>
          <div>
            <label className="label">Nom du pays</label>
            <input
              className="input-field"
              value={zoneNom}
              disabled={clos}
              placeholder="Sénégal"
              onChange={(e) => setZoneNom(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            {/*
              « au Sénégal », pas « Sénégal ». L'app écrit « 1 240 joueurs au
              Sénégal » : sans la forme avec article, il faudrait une règle de
              grammaire par pays dans le code (au Sénégal, en Côte d'Ivoire,
              au Mali, aux Comores…).
            */}
            <label className="label">Avec article</label>
            <input
              className="input-field"
              value={zoneArticle}
              disabled={clos}
              placeholder="le Sénégal"
              onChange={(e) => setZoneArticle(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Drapeau</label>
            <input
              className="input-field"
              value={zoneDrapeau}
              disabled={clos}
              placeholder="🇸🇳"
              maxLength={8}
              onChange={(e) => setZoneDrapeau(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Semaine</label>
            <input
              type="number"
              className="input-field"
              value={semaine}
              disabled={clos}
              placeholder="43"
              min={1}
              max={53}
              onChange={(e) => setSemaine(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <div>
            {/*
              Le fuseau n'est pas décoratif : J-n, le plafond de parties par
              jour et l'heure de clôture se calculent dedans. Sans lui, un
              joueur de Dakar et un serveur en UTC ne sont pas le même jour.
            */}
            <label className="label">Fuseau horaire</label>
            <input
              className="input-field"
              value={fuseau}
              disabled={clos}
              placeholder="Africa/Dakar"
              onChange={(e) => setFuseau(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* ═══ 3. Les mots du thème ═══ */}
      <section className="glass-card p-5 mb-3">
        <TitreSection
          numero={3}
          titre="Les mots du thème"
          aide="Les déclinaisons servent à composer les phrases de l’app sans les réécrire."
          fait={!!themeAvecArticle && !!beneficiaires}
        />

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="label">Avec article</label>
            <input
              className="input-field"
              value={themeAvecArticle}
              disabled={clos}
              placeholder="les inondations"
              onChange={(e) => setThemeAvecArticle(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Forme « à »</label>
            <input
              className="input-field"
              value={themeAvecDe}
              disabled={clos}
              placeholder="aux inondations"
              onChange={(e) => setThemeAvecDe(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="label">Bénéficiaires</label>
          <input
            className="input-field"
            value={beneficiaires}
            disabled={clos}
            placeholder="les quartiers inondés"
            onChange={(e) => setBeneficiaires(e.target.value)}
          />
        </div>

        {/*
          ═══ CE QU'ADIA A LE DROIT DE SAVOIR ═══

          Ces deux champs ne sont jamais montrés au joueur : ils sont donnés au
          modèle. Le contexte lui permet de parler du problème avec justesse ;
          la liste de faits borne ce qu'elle peut CITER.

          Laisser la liste vide est un choix valable — Adia ne citera alors
          aucun chiffre. C'est préférable à un chiffre inventé dans une
          application utilisée en classe.
        */}
        <div className="mb-3">
          <label className="label">Contexte pour Adia</label>
          <textarea
            className="input-field"
            rows={3}
            value={problemePourAdia}
            disabled={clos}
            placeholder="Pendant l’hivernage, de fortes pluies inondent des quartiers de Dakar et de sa banlieue…"
            onChange={(e) => setProblemePourAdia(e.target.value)}
          />
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Jamais affiché au joueur. Sert à Adia pour parler du problème avec justesse.
          </p>
        </div>

        <div>
          <label className="label">Faits vérifiés qu’Adia peut citer</label>
          <ListeTexte
            valeurs={faitsPourAdia}
            onChange={setFaitsPourAdia}
            clos={clos}
            placeholder="Un fait, avec sa source"
            maximum={8}
          />
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Vide : Adia ne cite aucun chiffre. Mieux qu’un chiffre inventé.
          </p>
        </div>
      </section>

      {/* ═══ 4. Pourquoi ça compte ═══ */}
      <section className="glass-card p-5 mb-3">
        <TitreSection
          numero={4}
          titre="Pourquoi ça compte"
          aide="Les trois chiffres d’impact de l’écran de présentation. Chacun avec sa source."
          fait={chiffres.length > 0 && chiffres.every((c) => c.source.trim())}
        />

        {/*
          LA SOURCE EST EXIGÉE, PAS SUGGÉRÉE.

          Un chiffre sans source n'est pas affiché dans l'app. C'est volontaire :
          ces chiffres parlent de familles sinistrées et de paludisme, devant
          des élèves. Un champ facultatif aurait laissé passer des valeurs
          d'exemple jusqu'en production — elles sont d'ailleurs marquées
          « A_SOURCER » dans le fichier de configuration fourni.
        */}
        <div className="flex flex-col gap-3">
          {chiffres.map((c, i) => (
            <div
              key={i}
              style={{
                border: '1.5px solid var(--color-card-border)',
                borderRadius: 12,
                padding: 14,
                background: '#FFFFFF',
              }}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)' }}>
                  Chiffre {i + 1}
                </span>
                <button
                  type="button"
                  disabled={clos}
                  onClick={() => setChiffres(chiffres.filter((_, j) => j !== i))}
                  title="Retirer"
                  style={{
                    background: 'none', border: 'none', cursor: clos ? 'not-allowed' : 'pointer',
                    color: 'var(--color-text-muted)', padding: 2, opacity: clos ? 0.4 : 1,
                  }}
                >
                  <X size={15} />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="input-field"
                  value={c.valeur}
                  disabled={clos}
                  placeholder="40 000"
                  onChange={(e) =>
                    setChiffres(chiffres.map((x, j) => (j === i ? { ...x, valeur: e.target.value } : x)))
                  }
                />
                <input
                  className="input-field col-span-2"
                  value={c.libelle}
                  disabled={clos}
                  placeholder="ménages touchés"
                  onChange={(e) =>
                    setChiffres(chiffres.map((x, j) => (j === i ? { ...x, libelle: e.target.value } : x)))
                  }
                />
              </div>
              <input
                className="input-field"
                style={{ marginTop: 8, fontSize: 12.5 }}
                value={c.source}
                disabled={clos}
                placeholder="Source — obligatoire, sinon le chiffre n’est pas affiché"
                onChange={(e) =>
                  setChiffres(chiffres.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))
                }
              />
              {!c.source.trim() ? (
                <span style={{ fontSize: 12, color: '#B87A0C', display: 'block', marginTop: 5 }}>
                  Sans source, ce chiffre ne sera pas affiché dans l’application.
                </span>
              ) : null}
            </div>
          ))}

          <button
            type="button"
            className="btn-secondary"
            disabled={clos || chiffres.length >= 3}
            style={{ alignSelf: 'flex-start', opacity: clos || chiffres.length >= 3 ? 0.5 : 1 }}
            onClick={() => setChiffres([...chiffres, { valeur: '', libelle: '', source: '' }])}
            title={chiffres.length >= 3 ? 'Trois chiffres au maximum' : undefined}
          >
            <Plus size={14} style={{ display: 'inline', marginRight: 6 }} />
            Ajouter un chiffre
          </button>
        </div>
      </section>

      {/* ═══ 5. L'idéation ═══ */}
      <section className="glass-card p-5 mb-3">
        <TitreSection
          numero={5}
          titre="L’idéation"
          aide="Les choix proposés au joueur pour construire son idée, et les pistes de secours."
          fait={angles.length > 0 && cibles.length > 0 && missions.length > 0}
        />

        <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', marginBottom: 14, lineHeight: 1.55 }}>
          Trois tours : par où attaquer le problème, qui aider, quoi changer
          pour eux. Écrivez-les pour CE thème — c’est ce qui ancre les idées
          générées dans le défi de la semaine.
        </p>

        <div className="mb-4">
          <label className="label">Angles d’attaque</label>
          <ListeTexte valeurs={angles} onChange={setAngles} clos={clos} placeholder="Prévenir" maximum={6} />
        </div>
        <div className="mb-4">
          <label className="label">Cibles</label>
          <ListeTexte valeurs={cibles} onChange={setCibles} clos={clos} placeholder="Ménages" maximum={6} />
        </div>
        <div className="mb-4">
          <label className="label">Missions</label>
          <ListeTexte
            valeurs={missions}
            onChange={setMissions}
            clos={clos}
            placeholder="Protéger la santé"
            maximum={6}
          />
        </div>

        {/*
          LES PISTES DE SECOURS NE SONT PAS UN LUXE.

          Elles s'affichent quand le modèle ne répond pas : quota dépassé,
          réseau coupé, clé absente. Sans elles, une panne d'API laisse le
          joueur devant une liste vide au milieu de son parcours — et il n'a
          aucun moyen de comprendre pourquoi.
        */}
        <div>
          <label className="label">Pistes de secours</label>
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Affichées si Adia ne répond pas. Trois suffisent.
          </p>
          <div className="flex flex-col gap-3">
            {pistes.map((p, i) => (
              <div
                key={p.id}
                style={{
                  border: '1.5px solid var(--color-card-border)',
                  borderRadius: 12,
                  padding: 14,
                  background: '#FFFFFF',
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)' }}>
                    Piste {i + 1}
                  </span>
                  <button
                    type="button"
                    disabled={clos}
                    onClick={() => setPistes(pistes.filter((_, j) => j !== i))}
                    title="Retirer"
                    style={{
                      background: 'none', border: 'none', cursor: clos ? 'not-allowed' : 'pointer',
                      color: 'var(--color-text-muted)', padding: 2, opacity: clos ? 0.4 : 1,
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>
                <input
                  className="input-field"
                  value={p.nom}
                  disabled={clos}
                  placeholder="Kit Puits Propre"
                  onChange={(e) => setPistes(pistes.map((x, j) => (j === i ? { ...x, nom: e.target.value } : x)))}
                />
                <textarea
                  className="input-field"
                  style={{ marginTop: 8, fontSize: 12.5 }}
                  rows={2}
                  value={p.description}
                  disabled={clos}
                  placeholder="Désinfection des puits après les crues."
                  onChange={(e) =>
                    setPistes(pistes.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
                  }
                />
                <input
                  className="input-field"
                  style={{ marginTop: 8, fontSize: 12.5 }}
                  value={p.pourQui}
                  disabled={clos}
                  placeholder="Ménages des quartiers inondés"
                  onChange={(e) =>
                    setPistes(pistes.map((x, j) => (j === i ? { ...x, pourQui: e.target.value } : x)))
                  }
                />
                {/* Comment l'entreprise gagne de l'argent. Affiché sur la carte
                    du joueur, sous la cible : « pour qui » et « qui paie » sont
                    les deux questions qu'on se pose devant une idée. */}
                <input
                  className="input-field"
                  style={{ marginTop: 8, fontSize: 12.5 }}
                  value={p.revenu ?? ''}
                  disabled={clos}
                  placeholder="Service à la demande"
                  onChange={(e) =>
                    setPistes(pistes.map((x, j) => (j === i ? { ...x, revenu: e.target.value } : x)))
                  }
                />
              </div>
            ))}
            <button
              type="button"
              className="btn-secondary"
              disabled={clos || pistes.length >= 5}
              style={{ alignSelf: 'flex-start', opacity: clos || pistes.length >= 5 ? 0.5 : 1 }}
              onClick={() =>
                setPistes([...pistes, { id: `p_${Date.now()}`, nom: '', description: '', pourQui: '' }])
              }
            >
              <Plus size={14} style={{ display: 'inline', marginRight: 6 }} />
              Ajouter une piste
            </button>
          </div>
        </div>
      </section>

      {/* ═══ 6. Vidéo et lot ═══ */}
      <section className="glass-card p-5 mb-3">
        <TitreSection
          numero={6}
          titre="Vidéo et récompense"
          aide="La vidéo de 30 s et le lot du podium. Les deux sont facultatifs."
          fait={!!videoUrl || !!lotCourt}
        />

        <div className="mb-4">
          <label className="label">Vidéo (URL)</label>
          <input
            className="input-field"
            value={videoUrl}
            disabled={clos}
            placeholder="https://…/defi-inondations_30s.mp4"
            onChange={(e) => setVideoUrl(e.target.value)}
          />
          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Sans URL, le bloc vidéo n’est pas affiché. Le parcours n’est jamais
            bloqué par la vidéo.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label">Image d’attente</label>
            <input
              className="input-field"
              value={videoPoster}
              disabled={clos}
              placeholder="https://…/poster.jpg"
              onChange={(e) => setVideoPoster(e.target.value)}
            />
          </div>
          <div>
            {/* La vidéo doit se comprendre sans le son : beaucoup de joueurs
                la regardent en classe ou dans un lieu public. */}
            <label className="label">Sous-titres (VTT)</label>
            <input
              className="input-field"
              value={videoSousTitres}
              disabled={clos}
              placeholder="https://…/sous-titres-fr.vtt"
              onChange={(e) => setVideoSousTitres(e.target.value)}
            />
          </div>
        </div>

        {/* La durée et le poids sont ANNONCÉS au joueur avant qu'il lance la
            vidéo : sur un forfait compté, 2 Mo qui partent sans prévenir sont
            une dépense qu'il n'a pas demandée. */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="label">Durée (secondes)</label>
            <input
              type="number"
              className="input-field"
              value={videoDuree}
              disabled={clos}
              placeholder="30"
              onChange={(e) => setVideoDuree(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <div>
            <label className="label">Poids (Mo)</label>
            <input
              type="number"
              className="input-field"
              value={videoPoids}
              disabled={clos}
              placeholder="2"
              onChange={(e) => setVideoPoids(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Lot — version courte</label>
            <input
              className="input-field"
              value={lotCourt}
              disabled={clos}
              placeholder="lot + accompagnement CONCREE"
              onChange={(e) => setLotCourt(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Lot — version longue</label>
            <input
              className="input-field"
              value={lotLong}
              disabled={clos}
              placeholder="Kit de démarrage + 3 mois d’accompagnement"
              onChange={(e) => setLotLong(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* ═══ 7. Le contenu ═══ */}
      <section className="glass-card p-5 mb-3">
        <TitreSection
          numero={7}
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

      {/* ═══ 8. Ouvrir, puis clôturer ═══ */}
      <section className="glass-card p-5 mb-3">
        <TitreSection
          numero={5}
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

            {/*
              ═══ ROUVRIR AVEC UNE NOUVELLE DATE ═══

              Un défi clos trop tôt — clôture manuelle par erreur, ou date de
              fin mal saisie — n'avait aucun recours : tous les champs sont
              verrouillés dès que le statut passe à « clos ».

              La réouverture repose le statut à « ouvert » et repousse la
              clôture. Les scores et les idées ne sont pas touchés : les
              joueurs reprennent où ils en étaient, avec leur rang.

              Le champion enregistré reste en base. Il sera recalculé à la
              prochaine clôture, sur les scores d'alors.
            */}
            <div
              style={{
                marginTop: 16,
                paddingTop: 16,
                borderTop: '1px solid var(--color-card-border)',
              }}
            >
              <label className="label">Rouvrir jusqu’au (UTC)</label>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  className="input-field"
                  style={{ flex: 1 }}
                  value={nouvelleFin}
                  onChange={(e) => setNouvelleFin(e.target.value)}
                />
                <button
                  className="btn-secondary"
                  disabled={!nouvelleFin || enregistrement}
                  style={{ opacity: !nouvelleFin || enregistrement ? 0.5 : 1 }}
                  onClick={() => void rouvrir()}
                >
                  Rouvrir le défi
                </button>
              </div>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-muted)',
                  marginTop: 8,
                  lineHeight: 1.5,
                }}
              >
                Les scores et les idées des joueurs sont conservés. Un seul défi
                peut être ouvert à la fois : clôturez l’autre d’abord.
              </p>
            </div>
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
            ) : listesManquantes.length > 0 ? (
              /*
                L'IDÉATION INCOMPLÈTE BLOQUE L'OUVERTURE.

                Une liste vide ne laisse pas l'écran vide côté joueur :
                l'application retombe sur une liste GÉNÉRIQUE écrite en dur.
                Le défi s'ouvre donc sans erreur visible, et les joueurs
                construisent leur idée sur des choix qui n'ont rien à voir
                avec le thème — sans que personne ne s'en aperçoive.

                C'est précisément pour cela que l'avertissement bloque au lieu
                de prévenir : un oubli silencieux ne se corrige jamais.
              */
              <p style={{ fontSize: 12.5, color: '#B9791A' }}>
                Complétez l’idéation ({listesManquantes.join(', ')}) : sans
                ces listes, les joueurs construisent leur idée sur des choix
                génériques, sans rapport avec le thème.
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
