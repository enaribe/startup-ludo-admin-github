'use client';

/**
 * Défis de la semaine — création, ouverture, clôture.
 *
 * Un thème entrepreneurial par semaine. Les parties jouées sur le défi
 * alimentent `defiScores`, d'où sort le champion à la clôture.
 *
 * ═══ CE QUE CET ÉCRAN NE PERMET PAS, VOLONTAIREMENT ═══
 *
 * - **Désigner un champion à la main.** Il est calculé par la clôture, depuis le
 *   classement. Le choisir viderait le classement de son sens.
 * - **Rouvrir un défi clos.** Son champion est figé et a été annoncé aux
 *   joueurs ; le serveur renvoie 409.
 * - **Supprimer un défi.** On le repasse en brouillon, comme le reste du dépôt
 *   désactive au lieu de détruire.
 * - **Ouvrir deux défis à la fois.** Le serveur refuse (409) : le mobile lit le
 *   défi en cours avec `limit(1)` et en prendrait un au hasard.
 */

import { useCallback, useEffect, useState } from 'react';
import { Trophy, Plus, Pencil, Lock, Users, Sparkles, Layers } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  cloturerDefi,
  enregistrerContenuDefi,
  enregistrerDefi,
  genererContenuDefi,
  getClassementDefi,
  getDefis,
  prochaineSemaine,
  type SaisieDefi,
} from '@/lib/weekly-challenge-service';
import { getEditions } from '@/lib/firestore-service';
import type { ClassSessionContent, EditionData } from '@/types';
import type { DefiScore, StatutDefi, WeeklyChallenge } from '@/types/weeklyChallenge';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import toast from 'react-hot-toast';

/** Libellé et couleur par statut — le patron `CATEGORIES` d'`achievements`. */
const STATUTS: Array<{ id: StatutDefi; label: string; fond: string; texte: string }> = [
  { id: 'brouillon', label: 'Brouillon', fond: 'rgba(15,28,46,0.06)', texte: 'var(--color-text-muted)' },
  { id: 'ouvert', label: 'En cours', fond: 'rgba(46,160,67,0.12)', texte: '#2EA043' },
  { id: 'clos', label: 'Clos', fond: 'rgba(245,166,35,0.14)', texte: '#B9791A' },
];

const styleStatut = (s: StatutDefi) => STATUTS.find((x) => x.id === s) ?? STATUTS[0];

/**
 * Nombre de cartes du contenu d'un défi, toutes listes confondues.
 *
 * Zéro signifie « pas ouvrable » : la route `/api/defi/enregistrer` refuse de
 * passer un défi sans cartes en `ouvert`, parce qu'il tirerait alors celles de
 * l'édition et redonnerait une partie libre déguisée en épreuve thématique.
 */
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

/** `<input type="date">` ne parle que `AAAA-MM-JJ`, en UTC ici pour coller aux crons. */
const versValeurDate = (ms: number): string =>
  Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : '';

/**
 * Libellé lisible d'une carte, quel que soit son type.
 *
 * Les cinq types n'ont pas le même champ porteur : `question` pour un quiz,
 * `title` ou `description` pour les événements. On prend le premier non vide
 * plutôt que d'écrire cinq branches — cette modale sert à relire, pas à éditer.
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

export default function PageDefisSemaine() {
  const { isSuperAdmin, loading: authLoading } = useAuth();

  const [defis, setDefis] = useState<WeeklyChallenge[]>([]);
  const [chargement, setChargement] = useState(true);
  const [edite, setEdite] = useState<SaisieDefi | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [aCloturer, setACloturer] = useState<WeeklyChallenge | null>(null);
  const [cloture, setCloture] = useState(false);
  const [classement, setClassement] = useState<{ defi: WeeklyChallenge; scores: DefiScore[] } | null>(null);
  const [editions, setEditions] = useState<EditionData[]>([]);
  /** Défi dont on génère/relit le contenu, et le contenu en cours de relecture. */
  const [contenuDe, setContenuDe] = useState<WeeklyChallenge | null>(null);
  const [contenu, setContenu] = useState<ClassSessionContent | null>(null);
  const [generation, setGeneration] = useState(false);

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
    // Les éditions alimentent le sélecteur : le contenu du défi est ancré sur
    // une édition, elle ne peut pas être laissée au hasard.
    void getEditions()
      .then(setEditions)
      .catch(() => toast.error('Éditions indisponibles'));
  }, [authLoading, isSuperAdmin, charger]);

  function ouvrirNouveau() {
    const { debutAt, finAt } = prochaineSemaine();
    setNouveau(true);
    setEdite({
      titre: '',
      description: '',
      statut: 'brouillon',
      // Première édition par défaut : un champ vide ferait échouer
      // l'enregistrement, et l'admin devrait deviner pourquoi.
      editionId: editions[0]?.id ?? '',
      debutAt,
      finAt,
    });
  }

  function ouvrirEdition(d: WeeklyChallenge) {
    setNouveau(false);
    setEdite({
      id: d.id,
      titre: d.titre,
      description: d.description,
      statut: d.statut,
      editionId: d.editionId,
      debutAt: d.debutAt,
      finAt: d.finAt,
    });
  }

  async function enregistrer() {
    if (!edite) return;
    if (!edite.titre.trim()) {
      toast.error('Le thème est requis');
      return;
    }
    if (edite.finAt <= edite.debutAt) {
      toast.error('La clôture doit suivre l’ouverture');
      return;
    }
    setEnregistrement(true);
    try {
      const { cree } = await enregistrerDefi(edite);
      toast.success(cree ? 'Défi créé' : 'Défi modifié');
      setEdite(null);
      // Rechargement complet plutôt qu'une mise à jour optimiste : le serveur
      // dérive l'id de la semaine, et le défi peut en changer de place dans la
      // liste triée. Deviner l'état final ici le ferait diverger.
      await charger();
    } catch (error) {
      // Le message du serveur porte l'information utile — notamment le 409 qui
      // NOMME le défi déjà ouvert. Le remplacer par un texte générique
      // obligerait l'admin à deviner lequel clôturer.
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible', {
        duration: 6000,
      });
    } finally {
      setEnregistrement(false);
    }
  }

  async function confirmerCloture() {
    if (!aCloturer) return;
    setCloture(true);
    try {
      const { champion, participants } = await cloturerDefi(aCloturer.id);
      toast.success(
        champion
          ? `Défi clos — champion : ${champion.displayName} (${champion.xp} XP, ${participants} participants)`
          : 'Défi clos — aucun participant',
        { duration: 6000 }
      );
      setACloturer(null);
      await charger();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Clôture impossible', { duration: 6000 });
    } finally {
      setCloture(false);
    }
  }

  /**
   * Génère le contenu depuis le thème, puis l'ouvre en relecture.
   *
   * Le contenu N'EST PAS enregistré automatiquement : la génération IA produit
   * des cartes plausibles mais parfois hors sujet ou fausses, et rien ne le
   * détecte côté machine. La relecture est le garde-fou, donc le bouton
   * « Enregistrer » est un geste séparé.
   */
  async function generer(defi: WeeklyChallenge) {
    if (!defi.titre.trim()) {
      toast.error('Donnez d’abord un thème au défi');
      return;
    }
    setContenuDe(defi);
    setContenu(null);
    setGeneration(true);
    try {
      const genere = await genererContenuDefi({
        id: defi.id,
        titre: defi.titre,
        description: defi.description,
        editionId: defi.editionId,
      });
      setContenu(genere);
      toast.success('Contenu généré — relisez avant d’enregistrer');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Génération impossible', {
        duration: 6000,
      });
      setContenuDe(null);
    } finally {
      setGeneration(false);
    }
  }

  /** Ouvre le contenu DÉJÀ enregistré, pour le consulter. */
  function voirContenu(defi: WeeklyChallenge) {
    setContenuDe(defi);
    setContenu((defi.contenu as ClassSessionContent | null) ?? null);
  }

  async function enregistrerContenu() {
    if (!contenuDe || !contenu) return;
    try {
      await enregistrerContenuDefi(contenuDe.id, contenu);
      toast.success('Contenu enregistré');
      setContenuDe(null);
      setContenu(null);
      await charger();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Enregistrement impossible', {
        duration: 6000,
      });
    }
  }

  async function voirClassement(defi: WeeklyChallenge) {
    try {
      setClassement({ defi, scores: await getClassementDefi(defi.id) });
    } catch {
      toast.error('Classement indisponible');
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
        <button className="btn-primary" onClick={ouvrirNouveau}>
          <Plus size={14} style={{ display: 'inline', marginRight: 6 }} />
          Nouveau défi
        </button>
      </div>

      {defis.length === 0 ? (
        <EmptyState
          icon={<Trophy size={32} />}
          title="Aucun défi"
          description="Créez le premier thème hebdomadaire."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {defis.map((d) => {
            const st = styleStatut(d.statut);
            return (
              <div key={d.id} className="glass-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div style={{ minWidth: 0 }}>
                    <div className="flex items-center gap-2">
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{d.titre || '(sans thème)'}</span>
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
                    <div style={{ fontSize: 11.5, color: 'var(--color-text-muted)', marginTop: 3 }}>
                      {d.id} · {versValeurDate(d.debutAt)} → {versValeurDate(d.finAt)}
                    </div>
                    {d.description ? (
                      <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
                        {d.description}
                      </div>
                    ) : null}
                    {/* L'état du contenu est l'information la plus utile de la
                        carte : sans cartes, le défi ne peut pas être ouvert. */}
                    <div style={{ fontSize: 11.5, marginTop: 6 }}>
                      {nbCartes(d) > 0 ? (
                        <span style={{ color: '#2EA043', fontWeight: 600 }}>
                          {nbCartes(d)} cartes
                        </span>
                      ) : (
                        <span style={{ color: '#B9791A', fontWeight: 600 }}>
                          Aucun contenu — à générer avant d’ouvrir
                        </span>
                      )}
                    </div>
                    {d.champion ? (
                      <div style={{ fontSize: 12, marginTop: 8, fontWeight: 600 }}>
                        🏆 {d.champion.displayName} — {d.champion.xp} XP
                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
                          {' '}· {d.participants} participant{d.participants > 1 ? 's' : ''}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                    <button
                      onClick={() => voirClassement(d)}
                      title="Voir le classement"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                    >
                      <Users size={14} color="var(--color-text-muted)" />
                    </button>
                    {nbCartes(d) > 0 ? (
                      <button
                        onClick={() => voirContenu(d)}
                        title="Voir le contenu"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                      >
                        <Layers size={14} color="var(--color-text-muted)" />
                      </button>
                    ) : null}
                    {/* Un défi clos ne se modifie plus : son champion est annoncé. */}
                    {d.statut !== 'clos' ? (
                      <>
                        <button
                          onClick={() => generer(d)}
                          title={nbCartes(d) > 0 ? 'Régénérer le contenu' : 'Générer le contenu'}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                        >
                          <Sparkles size={14} color="#F5A623" />
                        </button>
                        <button
                          onClick={() => ouvrirEdition(d)}
                          title="Modifier"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                        >
                          <Pencil size={14} color="var(--color-text-muted)" />
                        </button>
                        {d.statut === 'ouvert' ? (
                          <button
                            onClick={() => setACloturer(d)}
                            title="Clôturer et désigner le champion"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                          >
                            <Lock size={14} color="#B9791A" />
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={!!edite}
        onClose={() => setEdite(null)}
        title={nouveau ? 'Nouveau défi' : 'Modifier le défi'}
        maxWidth="560px"
      >
        {edite && (
          <div className="flex flex-col gap-4">
            <div>
              <label className="label">Thème</label>
              <input
                className="input-field"
                value={edite.titre}
                placeholder="Trouver ses premiers clients"
                onChange={(e) => setEdite({ ...edite, titre: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input-field"
                rows={3}
                style={{ resize: 'vertical' }}
                value={edite.description}
                placeholder="Une à deux phrases : ce que le joueur doit retenir du thème."
                onChange={(e) => setEdite({ ...edite, description: e.target.value })}
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="label">Ouverture (UTC)</label>
                <input
                  type="date"
                  className="input-field"
                  value={versValeurDate(edite.debutAt)}
                  onChange={(e) =>
                    setEdite({ ...edite, debutAt: Date.parse(`${e.target.value}T00:00:00Z`) })
                  }
                />
              </div>
              <div className="flex-1">
                <label className="label">Clôture (UTC)</label>
                <input
                  type="date"
                  className="input-field"
                  value={versValeurDate(edite.finAt)}
                  onChange={(e) =>
                    // 23:00 et non 00:00 : `resetWeeklyStats` tourne le lundi à
                    // minuit UTC. Clôturer à minuit pile courrait contre elle.
                    setEdite({ ...edite, finAt: Date.parse(`${e.target.value}T23:00:00Z`) })
                  }
                />
              </div>
            </div>
            <div>
              <label className="label">Édition</label>
              <select
                className="input-field"
                value={edite.editionId}
                onChange={(e) => setEdite({ ...edite, editionId: e.target.value })}
              >
                {editions.map((ed) => (
                  <option key={ed.id} value={ed.id}>
                    {ed.name}
                  </option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>
                Imposée au joueur. Le contenu généré y est ancré — la changer
                après génération rendrait les cartes incohérentes.
              </div>
            </div>
            <div>
              <label className="label">Statut</label>
              <select
                className="input-field"
                value={edite.statut}
                onChange={(e) => setEdite({ ...edite, statut: e.target.value as StatutDefi })}
              >
                {/* « Clos » absent : la clôture désigne un champion, elle passe
                    par son propre bouton et n'est pas un changement de statut. */}
                <option value="brouillon">Brouillon — invisible du mobile</option>
                <option value="ouvert">En cours — joué et classé</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 mt-2">
              <button className="btn-secondary" onClick={() => setEdite(null)}>
                Annuler
              </button>
              <button className="btn-primary" onClick={enregistrer} disabled={enregistrement}>
                {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!aCloturer}
        onClose={() => setACloturer(null)}
        onConfirm={confirmerCloture}
        title="Clôturer ce défi ?"
        message={`Le champion sera calculé depuis le classement et figé définitivement. ${aCloturer?.titre ?? ''} ne pourra plus être rouvert ni modifié.`}
        confirmLabel="Clôturer"
        danger
        loading={cloture}
      />

      {/* Relecture du contenu — généré ou déjà enregistré. */}
      <Modal
        open={!!contenuDe}
        onClose={() => {
          setContenuDe(null);
          setContenu(null);
        }}
        title={`Contenu — ${contenuDe?.titre ?? ''}`}
        maxWidth="640px"
      >
        {generation ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Génération en cours… cela prend quelques dizaines de secondes.
          </p>
        ) : !contenu ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Aucun contenu.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              Relisez avant d’enregistrer : la génération produit des cartes
              plausibles, mais rien ne détecte une question fausse ou hors sujet.
            </div>

            {(
              [
                ['Quiz', contenu.quizzes],
                ['Duels', contenu.duels],
                ['Financements', contenu.fundings],
                ['Opportunités', contenu.opportunities],
                ['Challenges', contenu.challengeEvents],
              ] as const
            ).map(([label, liste]) => (
              <div key={label}>
                <div className="label" style={{ marginBottom: 6 }}>
                  {label} ({liste.length})
                </div>
                {liste.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>—</div>
                ) : (
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
                        {/* Les cinq types n'ont pas le même champ de libellé :
                            on prend le premier qui existe plutôt que de traiter
                            chaque type à part. */}
                        {libelleCarte(carte)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            <div className="flex justify-end gap-3 mt-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setContenuDe(null);
                  setContenu(null);
                }}
              >
                Fermer
              </button>
              {contenuDe?.statut !== 'clos' ? (
                <button className="btn-primary" onClick={enregistrerContenu}>
                  Enregistrer ce contenu
                </button>
              ) : null}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!classement}
        onClose={() => setClassement(null)}
        title={`Classement — ${classement?.defi.titre ?? ''}`}
        maxWidth="520px"
      >
        {classement && classement.scores.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
            Aucun joueur n’a encore marqué de points.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {classement?.scores.map((s, i) => (
              <div
                key={s.id}
                className="flex items-center justify-between"
                style={{ fontSize: 13, padding: '6px 0' }}
              >
                <span>
                  <strong style={{ color: 'var(--color-text-muted)', marginRight: 8 }}>
                    {i + 1}.
                  </strong>
                  {s.displayName}
                </span>
                <span style={{ fontWeight: 700 }}>
                  {s.xp} XP
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, fontSize: 11.5 }}>
                    {' '}· {s.parties} partie{s.parties > 1 ? 's' : ''}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
