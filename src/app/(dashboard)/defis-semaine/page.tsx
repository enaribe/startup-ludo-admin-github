'use client';

/**
 * Défis de la semaine — la liste.
 *
 * ═══ POURQUOI UNE LISTE PRESQUE VIDE ═══
 *
 * La première version faisait tout ici : dépôt du document, génération,
 * relecture, clôture, classement — douze actions en icônes muettes sur chaque
 * carte, et des réglages de génération en haut de page qui ne concernaient
 * aucun défi en particulier. On ne savait ni où on en était, ni quoi faire
 * ensuite.
 *
 * Le dépôt a déjà résolu ce problème pour les séances prêtes : la liste ne fait
 * que lister, et le travail se passe sur une page de détail, en sections
 * numérotées qui donnent l'ordre des étapes. C'est ce patron qui est repris
 * ici.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, Plus } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  enregistrerDefi,
  getDefis,
  prochaineSemaine,
} from '@/lib/weekly-challenge-service';
import type { StatutDefi, WeeklyChallenge } from '@/types/weeklyChallenge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import toast from 'react-hot-toast';

/** Libellé et couleur par statut — le patron `CATEGORIES` d'`achievements`. */
const STATUTS: Record<StatutDefi, { label: string; fond: string; texte: string }> = {
  brouillon: { label: 'Brouillon', fond: 'rgba(15,28,46,0.06)', texte: 'var(--color-text-muted)' },
  ouvert: { label: 'En cours', fond: 'rgba(46,160,67,0.12)', texte: '#2EA043' },
  clos: { label: 'Clos', fond: 'rgba(245,166,35,0.14)', texte: '#B9791A' },
};

/** `<input type="date">` ne parle que `AAAA-MM-JJ`, en UTC ici pour coller aux crons. */
const versDate = (ms: number): string =>
  Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : '';

/**
 * Id de semaine ISO (`AAAA-Sxx`) — MIROIR de `idSemaineISO()` de
 * `/api/defi/enregistrer`.
 *
 * Dupliqué, et c'est assumé : le client doit anticiper l'id que le serveur va
 * calculer pour éviter un aller-retour voué au 409. Les deux doivent rester
 * identiques — une divergence ferait proposer une semaine que le serveur
 * refuserait, ou l'inverse.
 *
 * Norme ISO : la semaine 1 contient le premier jeudi de l'année. Les
 * implémentations naïves se décalent autour du Nouvel An.
 */
function idSemaine(instant: number): string {
  const d = new Date(instant);
  const jeudi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const jourSemaine = (jeudi.getUTCDay() + 6) % 7; // lundi = 0
  jeudi.setUTCDate(jeudi.getUTCDate() - jourSemaine + 3);
  const premierJeudi = new Date(Date.UTC(jeudi.getUTCFullYear(), 0, 4));
  const jourPremier = (premierJeudi.getUTCDay() + 6) % 7;
  premierJeudi.setUTCDate(premierJeudi.getUTCDate() - jourPremier + 3);
  const semaine =
    1 + Math.round((jeudi.getTime() - premierJeudi.getTime()) / (7 * 24 * 3600 * 1000));
  return `${jeudi.getUTCFullYear()}-S${String(semaine).padStart(2, '0')}`;
}

/** Nombre de cartes du contenu, toutes listes confondues. */
function nbCartes(d: WeeklyChallenge): number {
  if (!d.contenu) return 0;
  return (
    d.contenu.quizzes.length +
    d.contenu.duels.length +
    d.contenu.fundings.length +
    d.contenu.opportunities.length +
    d.contenu.challengeEvents.length
  );
}

/**
 * L'étape où en est le défi, en une phrase.
 *
 * C'est l'information que la première version ne donnait pas : on voyait des
 * badges épars (document, cartes, statut) sans savoir quoi faire. Ici une seule
 * ligne dit l'action suivante.
 */
function etape(d: WeeklyChallenge): { texte: string; couleur: string } {
  if (d.statut === 'clos') {
    return d.champion
      ? { texte: `🏆 ${d.champion.displayName} — ${d.champion.xp} XP`, couleur: '#B9791A' }
      : { texte: 'Clos sans participant', couleur: 'var(--color-text-muted)' };
  }
  if (!d.source) return { texte: '1 — Déposer le document', couleur: '#B9791A' };
  if (nbCartes(d) === 0) return { texte: '2 — Générer le contenu', couleur: '#B9791A' };
  if (d.statut === 'brouillon') return { texte: '3 — Prêt à ouvrir', couleur: '#2EA043' };
  return { texte: `En cours · ${nbCartes(d)} cartes`, couleur: '#2EA043' };
}

export default function PageDefisSemaine() {
  const router = useRouter();
  const { isSuperAdmin, loading: authLoading } = useAuth();

  const [defis, setDefis] = useState<WeeklyChallenge[]>([]);
  const [chargement, setChargement] = useState(true);
  const [creation, setCreation] = useState(false);

  const charger = useCallback(async () => {
    try {
      setDefis(await getDefis());
    } catch {
      toast.error('Chargement des défis impossible');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    // On ne lit RIEN sans le droit : le patron de `seances-pretes`.
    if (authLoading || !isSuperAdmin) return;
    void charger();
  }, [authLoading, isSuperAdmin, charger]);

  /**
   * Crée un défi vide pour la semaine prochaine et ouvre sa page.
   *
   * Pas de modale de création : elle demanderait un titre avant de savoir de
   * quoi parle le document, et il faudrait la rouvrir pour chaque correction.
   * Le défi naît en brouillon, tout se règle sur sa page — comme
   * `seances-pretes`.
   */
  async function creer() {
    setCreation(true);
    try {
      /*
        ON VISE LA PREMIÈRE SEMAINE LIBRE, pas forcément la prochaine.

        L'id d'un défi dérive de sa semaine (`AAAA-Sxx`) : deux défis ne peuvent
        pas partager la même. Le serveur refuse d'écraser (409), donc si la
        semaine prochaine est déjà prise, on avance d'une semaine jusqu'à en
        trouver une libre — plutôt que d'afficher une erreur et de laisser
        l'utilisateur deviner qu'il doit changer la date à la main.

        Borné à 12 essais : au-delà, c'est qu'un trimestre est planifié et une
        erreur explicite vaut mieux qu'une boucle.
      */
      const prises = new Set(defis.map((d) => d.id));
      let { debutAt, finAt } = prochaineSemaine();
      for (let essai = 0; essai < 12 && prises.has(idSemaine(debutAt)); essai++) {
        ({ debutAt, finAt } = prochaineSemaine(debutAt));
      }

      const { id } = await enregistrerDefi({
        titre: 'Nouveau défi',
        description: '',
        statut: 'brouillon',
        debutAt,
        finAt,
      });
      router.push(`/defis-semaine/${id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Création impossible', {
        duration: 6000,
      });
    } finally {
      setCreation(false);
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <div style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            {defis.length} défi{defis.length > 1 ? 's' : ''}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 2 }}>
            Un seul défi peut être en cours à la fois.
          </div>
        </div>
        <button className="btn-primary" onClick={() => void creer()} disabled={creation}>
          <Plus size={14} style={{ display: 'inline', marginRight: 6 }} />
          {creation ? 'Création…' : 'Nouveau défi'}
        </button>
      </div>

      {defis.length === 0 ? (
        <EmptyState
          icon={<Trophy size={32} />}
          title="Aucun défi"
          description="Créez le premier thème hebdomadaire."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {defis.map((d) => {
            const st = STATUTS[d.statut];
            const e = etape(d);
            return (
              /*
                TOUTE LA LIGNE EST CLIQUABLE, et c'est la seule action.

                La version précédente alignait cinq icônes par carte (classement,
                contenu, dépôt, génération, édition, clôture) : il fallait
                survoler chacune pour savoir ce qu'elle faisait.
              */
              <button
                key={d.id}
                onClick={() => router.push(`/defis-semaine/${d.id}`)}
                className="glass-card p-4"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: '1px solid var(--color-card-border)',
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 14, fontWeight: 700 }}>
                        {d.titre || '(sans thème)'}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 7,
                          background: st.fond,
                          color: st.texte,
                        }}
                      >
                        {st.label}
                      </span>
                    </div>
                    <div
                      style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 3 }}
                    >
                      {d.id} · {versDate(d.debutAt)} → {versDate(d.finAt)}
                    </div>
                  </div>
                  {/* L'étape suivante, à droite : c'est ce qu'on vient chercher. */}
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: e.couleur,
                      flexShrink: 0,
                      textAlign: 'right',
                    }}
                  >
                    {e.texte}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
