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
import { Trophy, Plus, Pencil, Lock, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import {
  cloturerDefi,
  enregistrerDefi,
  getClassementDefi,
  getDefis,
  prochaineSemaine,
  type SaisieDefi,
} from '@/lib/weekly-challenge-service';
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

/** `<input type="date">` ne parle que `AAAA-MM-JJ`, en UTC ici pour coller aux crons. */
const versValeurDate = (ms: number): string =>
  Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : '';

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

  function ouvrirNouveau() {
    const { debutAt, finAt } = prochaineSemaine();
    setNouveau(true);
    setEdite({ titre: '', description: '', statut: 'brouillon', debutAt, finAt });
  }

  function ouvrirEdition(d: WeeklyChallenge) {
    setNouveau(false);
    setEdite({
      id: d.id,
      titre: d.titre,
      description: d.description,
      statut: d.statut,
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
                    {/* Un défi clos ne se modifie plus : son champion est annoncé. */}
                    {d.statut !== 'clos' ? (
                      <>
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
