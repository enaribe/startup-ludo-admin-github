/**
 * Import de la FICHE d'un défi fournie en JSON — tout sauf les cartes.
 *
 * ═══ POURQUOI UN SECOND IMPORTEUR ═══
 *
 * `defi-json-import.ts` traite le CONTENU : les cartes jouées pendant la
 * partie. Celui-ci traite le reste du formulaire — thème, zone, calendrier,
 * mots du thème, chiffres d'impact, idéation, vidéo, lot.
 *
 * Les deux sont séparés parce que leurs enjeux n'ont rien de commun. Une carte
 * mal formée casse une partie en cours, chez le joueur, sans trace : il faut
 * donc refuser tout le fichier plutôt qu'importer à moitié. Un champ de fiche
 * mal rempli se voit à l'écran avant l'ouverture du défi, et l'auteur peut le
 * corriger à la main juste après. Ici, on remplit ce qu'on peut et on DIT ce
 * qu'on a laissé de côté.
 *
 * ═══ RIEN N'EST OBLIGATOIRE ═══
 *
 * Toutes les clés sont optionnelles, et une clé absente laisse le champ
 * INCHANGÉ. C'est ce qui permet de coller un JSON partiel — juste l'idéation,
 * juste les chiffres — sans écraser le travail déjà saisi.
 *
 * Conséquence volontaire : ce module ne sait pas vider un champ. Pour retirer
 * une valeur, on la vide dans le formulaire. Un JSON qui effacerait des champs
 * par omission rendrait tout collage partiel dangereux.
 *
 * ═══ CE QU'IL NE FAIT PAS ═══
 *
 * Il n'écrit rien en base : il rend des valeurs que la page pose dans son état
 * local, exactement comme une saisie au clavier. L'enregistrement reste au
 * bouton, et le défi n'est modifié qu'à ce moment — sinon un collage mal
 * relu partirait en production sans relecture possible.
 */
import type {
  ChiffreDefi,
  IdeationDefi,
  LotDefi,
  PisteDefi,
  VideoDefi,
  ZoneDefi,
} from '@/types/weeklyChallenge';

/** Les champs qu'un import de fiche peut renseigner. */
export interface FicheDefi {
  titre?: string;
  description?: string;
  zone?: ZoneDefi;
  semaine?: number;
  fuseau?: string;
  themeAvecArticle?: string;
  themeAvecDe?: string;
  beneficiaires?: string;
  problemePourAdia?: string;
  faitsPourAdia?: string[];
  chiffres?: ChiffreDefi[];
  ideation?: IdeationDefi;
  video?: VideoDefi;
  lot?: LotDefi;
  avisUrl?: string;
  badgeIcone?: string;
  problemesSuggeres?: string[];
}

/** Un champ écarté, et la raison — affichée telle quelle à l'auteur. */
export interface AnomalieFiche {
  /** `true` si rien n'a pu être importé du tout. */
  bloquant: boolean;
  /** Le chemin dans le JSON : « chiffres[2].source », « zone.code ». */
  ou: string;
  message: string;
}

export interface ResultatFiche {
  /** Les champs à poser dans le formulaire. `null` si le JSON est illisible. */
  fiche: FicheDefi | null;
  anomalies: AnomalieFiche[];
  /** Libellés des champs effectivement renseignés, pour le récapitulatif. */
  remplis: string[];
}

/** Trois chiffres au maximum : c'est ce que l'écran de présentation affiche. */
const MAX_CHIFFRES = 3;
/** Six entrées par liste d'idéation, comme le formulaire. */
const MAX_LISTE = 6;

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Une chaîne non vide, débarrassée de ses espaces de bord. Sinon `null`. */
function texte(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

/**
 * Un entier dans les bornes, ou `null`.
 *
 * Accepte aussi la chaîne : un JSON écrit à la main porte souvent `"43"`, et
 * refuser la semaine pour un guillemet serait une pure vexation.
 */
function entier(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i >= min && i <= max ? i : null;
}

/**
 * Une liste de chaînes non vides, dédoublonnée et plafonnée.
 *
 * Le dédoublonnage compte : deux angles identiques donneraient deux cartes
 * jumelles à l'écran de l'idéation, et le joueur chercherait la différence.
 */
function listeTextes(v: unknown, max: number): { valeurs: string[]; ignores: number } {
  if (!Array.isArray(v)) return { valeurs: [], ignores: 0 };
  const vues = new Set<string>();
  const valeurs: string[] = [];
  let ignores = 0;
  for (const e of v) {
    const t = texte(e);
    if (!t || vues.has(t.toLowerCase())) {
      ignores += 1;
      continue;
    }
    vues.add(t.toLowerCase());
    if (valeurs.length < max) valeurs.push(t);
    else ignores += 1;
  }
  return { valeurs, ignores };
}

/**
 * Lit la fiche d'un défi depuis un JSON collé.
 *
 * @param brut Le texte collé, ou l'objet déjà analysé.
 */
export function importerFicheJson(brut: unknown): ResultatFiche {
  const anomalies: AnomalieFiche[] = [];
  const remplis: string[] = [];

  let racine: unknown = brut;
  if (typeof brut === 'string') {
    const t = brut.trim();
    if (!t) {
      return {
        fiche: null,
        anomalies: [{ bloquant: true, ou: 'fichier', message: 'Le champ est vide.' }],
        remplis: [],
      };
    }
    try {
      racine = JSON.parse(t);
    } catch (err) {
      return {
        fiche: null,
        anomalies: [
          {
            bloquant: true,
            ou: 'fichier',
            message: `JSON invalide : ${err instanceof Error ? err.message : 'format illisible'}`,
          },
        ],
        remplis: [],
      };
    }
  }

  if (!estObjet(racine)) {
    return {
      fiche: null,
      anomalies: [
        {
          bloquant: true,
          ou: 'fichier',
          message: 'Le JSON doit être un objet { … }, pas une liste ni une valeur seule.',
        },
      ],
      remplis: [],
    };
  }

  /*
    `defi` ou la racine, au choix.

    Le modèle proposé enveloppe les champs dans `{ "defi": { … } }`, mais un
    auteur qui copie une portion de document arrive souvent avec les champs à
    plat. Les deux formes sont acceptées : refuser l'une pour une enveloppe
    n'apprend rien à personne.
  */
  const src = estObjet(racine.defi) ? racine.defi : racine;
  const fiche: FicheDefi = {};

  // ─── 1. Le thème ───
  const titre = texte(src.titre);
  if (titre) {
    fiche.titre = titre;
    remplis.push('thème');
  }
  const description = texte(src.description);
  if (description) {
    fiche.description = description;
    remplis.push('description');
  }

  // ─── 2. La zone ───
  if (src.zone !== undefined) {
    if (!estObjet(src.zone)) {
      anomalies.push({ bloquant: false, ou: 'zone', message: 'Attendu un objet. Ignoré.' });
    } else {
      const code = texte(src.zone.code);
      const nom = texte(src.zone.nom);
      const avecArticle = texte(src.zone.avecArticle);
      /*
        Les trois premiers champs vont ENSEMBLE.

        `ZoneDefi` les exige tous les trois, et l'app compose ses phrases avec
        « au Sénégal » autant qu'avec « Sénégal ». Importer un code sans son
        article donnerait des phrases trouées côté joueur.
      */
      if (code && nom && avecArticle) {
        fiche.zone = {
          code: code.toUpperCase(),
          nom,
          avecArticle,
          ...(texte(src.zone.drapeau) ? { drapeau: texte(src.zone.drapeau)! } : {}),
        };
        remplis.push('zone');
      } else {
        anomalies.push({
          bloquant: false,
          ou: 'zone',
          message: 'Il faut « code », « nom » et « avecArticle » ensemble. Zone ignorée.',
        });
      }
    }
  }

  // ─── 3. Le calendrier ───
  if (src.semaine !== undefined) {
    const n = entier(src.semaine, 1, 53);
    if (n === null) {
      anomalies.push({
        bloquant: false,
        ou: 'semaine',
        message: 'Attendu un numéro de semaine entre 1 et 53. Ignoré.',
      });
    } else {
      fiche.semaine = n;
      remplis.push('semaine');
    }
  }
  const fuseau = texte(src.fuseau);
  if (fuseau) {
    /*
      Le fuseau est vérifié auprès de la plateforme, pas contre une liste.

      C'est lui qui découpe les journées pour le plafond de parties
      quotidiennes (`jourDansFuseau`). Un fuseau inventé ne lèverait pas à
      l'enregistrement mais ferait échouer le calcul en partie, chez le joueur.
    */
    try {
      new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau });
      fiche.fuseau = fuseau;
      remplis.push('fuseau');
    } catch {
      anomalies.push({
        bloquant: false,
        ou: 'fuseau',
        message: `« ${fuseau} » n'est pas un fuseau reconnu (attendu : « Africa/Dakar »). Ignoré.`,
      });
    }
  }

  // ─── 4. Les mots du thème ───
  for (const [cle, libelle] of [
    ['themeAvecArticle', 'thème avec article'],
    ['themeAvecDe', 'forme « à »'],
    ['beneficiaires', 'bénéficiaires'],
    ['problemePourAdia', 'contexte pour Adia'],
  ] as const) {
    const v = texte(src[cle]);
    if (v) {
      fiche[cle] = v;
      remplis.push(libelle);
    }
  }

  if (src.faitsPourAdia !== undefined) {
    const { valeurs, ignores } = listeTextes(src.faitsPourAdia, 12);
    if (valeurs.length > 0) {
      fiche.faitsPourAdia = valeurs;
      remplis.push(`${valeurs.length} fait${valeurs.length > 1 ? 's' : ''} pour Adia`);
    }
    if (ignores > 0) {
      anomalies.push({
        bloquant: false,
        ou: 'faitsPourAdia',
        message: `${ignores} entrée(s) vide(s), en double ou au-delà de 12. Ignorée(s).`,
      });
    }
  }

  // ─── 5. Pourquoi ça compte ───
  if (src.chiffres !== undefined) {
    if (!Array.isArray(src.chiffres)) {
      anomalies.push({ bloquant: false, ou: 'chiffres', message: 'Attendu une liste. Ignoré.' });
    } else {
      const gardes: ChiffreDefi[] = [];
      src.chiffres.forEach((c, i) => {
        const ou = `chiffres[${i}]`;
        if (!estObjet(c)) {
          anomalies.push({ bloquant: false, ou, message: 'Attendu un objet. Ignoré.' });
          return;
        }
        const valeur = texte(c.valeur);
        const libelle = texte(c.libelle);
        const source = texte(c.source);
        /*
          LA SOURCE EST EXIGÉE ICI AUSSI.

          L'app n'affiche pas un chiffre sans source — c'est la règle du
          formulaire. Accepter un chiffre sans la sienne importerait une ligne
          que personne ne verra jamais, et l'auteur croirait l'avoir remplie.
        */
        if (!valeur || !libelle) {
          anomalies.push({
            bloquant: false,
            ou,
            message: 'Il faut « valeur » et « libelle ». Ignoré.',
          });
          return;
        }
        if (!source) {
          anomalies.push({
            bloquant: false,
            ou,
            message: `« ${valeur} » n'a pas de source : il ne serait pas affiché. Ignoré.`,
          });
          return;
        }
        if (gardes.length >= MAX_CHIFFRES) {
          anomalies.push({
            bloquant: false,
            ou,
            message: `Au-delà de ${MAX_CHIFFRES} chiffres, l'écran n'en affiche pas plus. Ignoré.`,
          });
          return;
        }
        gardes.push({ valeur, libelle, source });
      });
      if (gardes.length > 0) {
        fiche.chiffres = gardes;
        remplis.push(`${gardes.length} chiffre${gardes.length > 1 ? 's' : ''}`);
      }
    }
  }

  // ─── 6. L'idéation ───
  if (src.ideation !== undefined) {
    if (!estObjet(src.ideation)) {
      anomalies.push({ bloquant: false, ou: 'ideation', message: 'Attendu un objet. Ignoré.' });
    } else {
      const id = src.ideation;
      const angles = listeTextes(id.angles, MAX_LISTE);
      const cibles = listeTextes(id.cibles, MAX_LISTE);
      const missions = listeTextes(id.missions, MAX_LISTE);

      for (const [nom, r] of [
        ['angles', angles],
        ['cibles', cibles],
        ['missions', missions],
      ] as const) {
        if (r.ignores > 0) {
          anomalies.push({
            bloquant: false,
            ou: `ideation.${nom}`,
            message: `${r.ignores} entrée(s) vide(s), en double ou au-delà de ${MAX_LISTE}. Ignorée(s).`,
          });
        }
      }

      const pistes: PisteDefi[] = [];
      if (id.pistesExpress !== undefined) {
        if (!Array.isArray(id.pistesExpress)) {
          anomalies.push({
            bloquant: false,
            ou: 'ideation.pistesExpress',
            message: 'Attendu une liste. Ignoré.',
          });
        } else {
          id.pistesExpress.forEach((p, i) => {
            const ou = `ideation.pistesExpress[${i}]`;
            if (!estObjet(p)) {
              anomalies.push({ bloquant: false, ou, message: 'Attendu un objet. Ignoré.' });
              return;
            }
            const nom = texte(p.nom);
            const desc = texte(p.description);
            const pourQui = texte(p.pourQui);
            if (!nom || !desc || !pourQui) {
              anomalies.push({
                bloquant: false,
                ou,
                message: 'Il faut « nom », « description » et « pourQui ». Ignoré.',
              });
              return;
            }
            /*
              L'id est RÉÉCRIT, comme à l'import du contenu.

              Le joueur choisit une piste par son id ; deux pistes partageant
              le même en sélectionneraient une seule, au hasard. Un fichier
              écrit à la main finit toujours par dupliquer un id.
            */
            pistes.push({
              id: `piste_${i + 1}`,
              nom,
              description: desc,
              pourQui,
              ...(texte(p.revenu) ? { revenu: texte(p.revenu)! } : {}),
              ...(texte(p.interet) ? { interet: texte(p.interet)! } : {}),
            });
          });
        }
      }

      if (
        angles.valeurs.length > 0 ||
        cibles.valeurs.length > 0 ||
        missions.valeurs.length > 0 ||
        pistes.length > 0
      ) {
        /*
          Les trois listes sont écrites d'un bloc, y compris vides.

          `IdeationDefi` les déclare obligatoires : poser `angles` sans
          `cibles` donnerait un objet incomplet en base. La page ne remplace de
          toute façon que les listes réellement fournies — voir `appliquer`.
        */
        fiche.ideation = {
          angles: angles.valeurs,
          cibles: cibles.valeurs,
          missions: missions.valeurs,
          ...(pistes.length > 0 ? { pistesExpress: pistes } : {}),
        };
        const parts: string[] = [];
        if (angles.valeurs.length) parts.push(`${angles.valeurs.length} angles`);
        if (cibles.valeurs.length) parts.push(`${cibles.valeurs.length} cibles`);
        if (missions.valeurs.length) parts.push(`${missions.valeurs.length} missions`);
        if (pistes.length) parts.push(`${pistes.length} pistes`);
        remplis.push(`idéation (${parts.join(', ')})`);
      }
    }
  }

  // ─── 7. Vidéo et lot ───
  if (src.video !== undefined) {
    if (!estObjet(src.video)) {
      anomalies.push({ bloquant: false, ou: 'video', message: 'Attendu un objet. Ignoré.' });
    } else {
      const url = texte(src.video.url);
      if (!url) {
        anomalies.push({
          bloquant: false,
          ou: 'video',
          message: 'Sans « url », il n’y a pas de vidéo à lire. Ignoré.',
        });
      } else {
        const duree = entier(src.video.dureeS, 1, 3600);
        const poids = entier(src.video.poidsMo, 1, 500);
        fiche.video = {
          url,
          ...(texte(src.video.posterUrl) ? { posterUrl: texte(src.video.posterUrl)! } : {}),
          ...(texte(src.video.sousTitresUrl)
            ? { sousTitresUrl: texte(src.video.sousTitresUrl)! }
            : {}),
          ...(duree !== null ? { dureeS: duree } : {}),
          ...(poids !== null ? { poidsMo: poids } : {}),
        };
        remplis.push('vidéo');
      }
    }
  }

  if (src.lot !== undefined) {
    if (!estObjet(src.lot)) {
      anomalies.push({ bloquant: false, ou: 'lot', message: 'Attendu un objet. Ignoré.' });
    } else {
      const court = texte(src.lot.court);
      if (!court) {
        anomalies.push({
          bloquant: false,
          ou: 'lot',
          message: 'Sans « court », le lot ne s’affiche pas. Ignoré.',
        });
      } else {
        fiche.lot = {
          court,
          ...(texte(src.lot.long) ? { long: texte(src.lot.long)! } : {}),
        };
        remplis.push('lot');
      }
    }
  }

  /*
    Les thèmes proposés au formulaire d'avis : « un problème pour un prochain
    défi ? ». Six au plus — au-delà, la question devient une liste à lire
    plutôt qu'un choix à faire.
  */
  if (src.problemesSuggeres !== undefined) {
    const { valeurs, ignores } = listeTextes(src.problemesSuggeres, 6);
    if (valeurs.length > 0) {
      fiche.problemesSuggeres = valeurs;
      remplis.push(`${valeurs.length} problème(s) suggéré(s)`);
    }
    if (ignores > 0) {
      anomalies.push({
        bloquant: false,
        ou: 'problemesSuggeres',
        message: `${ignores} entrée(s) vide(s), en double ou au-delà de 6. Ignorée(s).`,
      });
    }
  }

  /*
    Le pictogramme du badge de clôture : un nom d'icône Ionicons.

    Pas de liste fermée ici — le jeu d'icônes en compte plus d'un millier, et
    la recopier vieillirait mal. Un nom inconnu ne casse rien : l'écran
    retombe sur `home`.
  */
  if (src.badgeIcone !== undefined) {
    const icone = texte(src.badgeIcone);
    if (!icone) {
      anomalies.push({
        bloquant: false,
        ou: 'badgeIcone',
        message: 'Attendu un nom d’icône Ionicons. Ignoré.',
      });
    } else {
      fiche.badgeIcone = icone;
      remplis.push('badgeIcone');
    }
  }

  /*
    Le formulaire d'avis, ouvert depuis l'écran de clôture.

    Seul `https://` est accepté : un `http://` serait bloqué par Android, et
    un schéma quelconque (`javascript:`, `file:`) n'a rien à faire dans un
    champ que l'app ouvre sans le relire.
  */
  if (src.avisUrl !== undefined) {
    const url = texte(src.avisUrl);
    if (!url || !url.startsWith('https://')) {
      anomalies.push({
        bloquant: false,
        ou: 'avisUrl',
        message: 'Attendu une URL https://. Ignorée.',
      });
    } else {
      fiche.avisUrl = url;
      remplis.push('avisUrl');
    }
  }

  /*
    Un JSON valide mais dont RIEN n'est exploitable est une erreur.

    Sans ce test, coller un objet aux clés mal nommées — `theme` au lieu de
    `titre`, une faute de frappe — rendrait « import réussi, 0 champ » et
    l'auteur chercherait longtemps.
  */
  if (remplis.length === 0) {
    anomalies.push({
      bloquant: true,
      ou: 'fichier',
      message:
        'Aucun champ reconnu. Vérifiez les noms des clés — « titre », « zone », ' +
        '« ideation », « chiffres »… — avec le modèle.',
    });
    return { fiche: null, anomalies, remplis };
  }

  return { fiche, anomalies, remplis };
}

/**
 * Le modèle, volontairement rempli d'un exemple COMPLET.
 *
 * Des champs vides n'apprennent pas le format : l'auteur ne sait pas si
 * `chiffres` prend des chaînes ou des objets, ni ce que `themeAvecDe` attend.
 * Un exemple cohérent se corrige plus vite qu'un squelette se devine.
 */
export const MODELE_FICHE_JSON = {
  titre: 'Entreprendre face aux inondations',
  description:
    'Chaque hivernage, l’eau envahit maisons, écoles et commerces. Crée une entreprise qui aide les quartiers à s’y préparer.',
  zone: { code: 'SN', nom: 'Sénégal', avecArticle: 'au Sénégal', drapeau: '🇸🇳' },
  semaine: 43,
  fuseau: 'Africa/Dakar',
  themeAvecArticle: 'les inondations',
  themeAvecDe: 'aux inondations',
  beneficiaires: 'les habitants des quartiers inondables',
  problemePourAdia:
    'Au Sénégal, l’hivernage de juillet à octobre provoque des inondations dans les quartiers périphériques de Dakar.',
  faitsPourAdia: [
    'En 2025, les inondations ont fait 20 morts et 8 336 sinistrés au Sénégal (ministère de l’Hydraulique et de l’Assainissement).',
  ],
  chiffres: [
    {
      valeur: '8 336',
      libelle: 'sinistrés en 2025',
      source: 'Ministère de l’Hydraulique et de l’Assainissement',
    },
  ],
  ideation: {
    angles: ['Prévenir avant la pluie', 'Évacuer l’eau', 'Protéger les maisons'],
    cibles: ['Familles des quartiers inondables', 'Écoles', 'Petits commerçants'],
    missions: ['Protéger la santé', 'Éviter les pertes matérielles'],
    pistesExpress: [
      {
        nom: 'Teraanga Pompe',
        description: 'Service de pompage à la demande, réservé par WhatsApp.',
        pourQui: 'Familles et commerçants des zones inondées',
        revenu: 'Service à la demande',
      },
    ],
  },
  video: { url: 'https://…/defi.mp4', dureeS: 30, poidsMo: 2 },
  lot: {
    court: 'Un kit entrepreneur CONCREE',
    long: 'Les trois premiers reçoivent un kit entrepreneur CONCREE.',
  },
} as const;

/** Le modèle en texte, prêt à coller dans le champ. */
export function modeleFicheJson(): string {
  return JSON.stringify(MODELE_FICHE_JSON, null, 2);
}
