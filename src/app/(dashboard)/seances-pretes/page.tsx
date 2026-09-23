'use client';

/**
 * Séances prêtes à l'emploi — administration CONCREE.
 *
 * Ces séances étaient CODÉES EN DUR dans le wizard, et ne portaient qu'un
 * titre et une durée : l'enseignant qui choisissait « Le business plan »
 * obtenait une séance VIDE, qui tirait les cartes ordinaires de l'édition.
 *
 * Cet écran les fait vivre en base et, surtout, leur donne un contenu réel :
 * la génération a lieu ICI, une fois, et le résultat est stocké avec la
 * séance. L'enseignant le reçoit tel quel.
 *
 * POURQUOI PAS GÉNÉRER AU LANCEMENT : ce serait un appel modèle par séance,
 * plusieurs secondes devant une classe qui attend, et un contenu différent à
 * chaque fois pour une séance annoncée comme « prête ». Le sens même du mot
 * s'y perdrait.
 */

import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { useAuth } from '@/lib/auth-context';
import { getEditions } from '@/lib/firestore-service';
import {
  getReadySessions,
  resumeContenu,
  saveReadySession,
  supprimerReadySession,
  type ReadySession,
} from '@/lib/ready-session-service';
import { genererContenuSeance, mixPourDuree } from '@/lib/class-session-generation';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { EditionData } from '@/types';

const DIFFICULTES = ['Débutant', 'Intermédiaire', 'Avancé'] as const;

export default function SeancesPretesPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const [seances, setSeances] = useState<ReadySession[]>([]);
  const [editions, setEditions] = useState<EditionData[]>([]);
  const [chargement, setChargement] = useState(true);
  /** Séance en cours de génération — une seule à la fois, le modèle est lent. */
  const [generationSur, setGenerationSur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const [liste, eds] = await Promise.all([getReadySessions(), getEditions()]);
      setSeances(liste);
      setEditions(eds);
    } catch (error) {
      console.error('Séances prêtes :', error);
      toast.error('Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !isSuperAdmin) return;
    void charger();
  }, [authLoading, isSuperAdmin, charger]);

  const ajouter = async () => {
    const id = `rs_${Date.now().toString(36)}`;
    await saveReadySession(id, {
      titre: 'Nouvelle séance',
      duree: 30,
      difficulte: 'Débutant',
      editionId: editions[0]?.id ?? '',
      note: '',
      consignes: '',
      ordre: seances.length,
      active: false, // jamais proposée avant d'avoir un contenu
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await charger();
  };

  /**
   * Génère le contenu de jeu et le stocke sur la séance.
   *
   * `genererContenuSeance` attend un `sessionId` pour retrouver un éventuel
   * cours déposé. Il n'y en a pas ici : on passe l'id de la séance prête, la
   * lecture échoue proprement et la génération part des seules consignes.
   */
  const generer = async (s: ReadySession) => {
    if (!s.editionId) {
      toast.error('Choisissez d’abord une édition.');
      return;
    }
    setGenerationSur(s.id);
    try {
      const contenu = await genererContenuSeance(
        s.id,
        s.consignes?.trim() ||
          `Séance « ${s.titre} » de ${s.duree} minutes, niveau ${s.difficulte}.`,
        mixPourDuree(s.duree),
        // `ContexteGeneration` ne porte pas l'édition : elle sert au JEU, pas
        // au prompt. Le niveau passe par `schoolLevel`, qui l'ancre mieux
        // qu'un identifiant d'édition.
        { sessionTitle: s.titre, durationMinutes: s.duree, schoolLevel: s.difficulte }
      );
      await saveReadySession(s.id, { contenu });
      toast.success(`Contenu généré : ${resumeContenu(contenu)}`);
      await charger();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Génération impossible.');
    } finally {
      setGenerationSur(null);
    }
  };

  const supprimer = async (s: ReadySession) => {
    if (!window.confirm(`Supprimer « ${s.titre} » ?\n\nCette action est irréversible.`)) return;
    await supprimerReadySession(s.id);
    toast.success('Séance supprimée.');
    await charger();
  };

  /** Écriture optimiste : le champ répond tout de suite, la base suit. */
  const majChamp = (id: string, patch: Partial<ReadySession>) => {
    setSeances((liste) => liste.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    void saveReadySession(id, patch).catch(() => toast.error('Enregistrement impossible.'));
  };

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
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Séances prêtes à l’emploi
          </h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 3, maxWidth: 620 }}>
            Proposées à l’enseignant au moment de lancer une session. Une séance n’est visible
            qu’une fois son contenu généré — sans lui, elle enverrait la classe sur une partie
            ordinaire.
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2" onClick={() => void ajouter()}>
          <Plus size={16} /> Nouvelle séance
        </button>
      </div>

      {seances.length === 0 ? (
        <p
          style={{
            fontSize: 13, color: 'var(--color-text-muted)', background: 'var(--color-surface)',
            borderRadius: 12, padding: '18px 20px',
          }}
        >
          Aucune séance prête. Créez-en une, renseignez ses consignes, puis générez son contenu.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {seances.map((s) => (
            <section key={s.id} className="glass-card p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div style={{ flex: 1, minWidth: 260 }}>
                  <input
                    className="input-field"
                    value={s.titre}
                    onChange={(e) => majChamp(s.id, { titre: e.target.value })}
                    style={{ fontWeight: 700 }}
                  />
                  <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 8 }}>
                    <select
                      className="input-field"
                      value={s.editionId}
                      onChange={(e) => majChamp(s.id, { editionId: e.target.value })}
                      style={{ width: 'auto' }}
                    >
                      <option value="">— édition —</option>
                      {editions.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name || e.id}
                        </option>
                      ))}
                    </select>
                    <select
                      className="input-field"
                      value={s.difficulte}
                      onChange={(e) =>
                        majChamp(s.id, { difficulte: e.target.value as ReadySession['difficulte'] })
                      }
                      style={{ width: 'auto' }}
                    >
                      {DIFFICULTES.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input-field"
                      type="number"
                      min={20}
                      max={45}
                      value={s.duree}
                      onChange={(e) => majChamp(s.id, { duree: Number(e.target.value) })}
                      style={{ width: 90 }}
                      title="Durée conseillée, en minutes"
                    />
                    <input
                      className="input-field"
                      value={s.note ?? ''}
                      onChange={(e) => majChamp(s.id, { note: e.target.value })}
                      placeholder="Note — ex. idéale en première séance"
                      style={{ flex: 1, minWidth: 200 }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  {/* Une séance sans contenu ne peut pas être publiée : l'interrupteur
                      est éteint tant que la génération n'a pas eu lieu. */}
                  <button
                    type="button"
                    onClick={() => majChamp(s.id, { active: !s.active })}
                    disabled={!s.contenu}
                    title={
                      s.contenu
                        ? 'Visible ou non par les enseignants'
                        : 'Générez d’abord le contenu'
                    }
                    style={{
                      fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8,
                      border: '1px solid var(--color-card-border)',
                      background: s.active ? 'rgba(46,160,67,0.12)' : '#FFFFFF',
                      color: s.active ? '#2EA043' : 'var(--color-text-muted)',
                      cursor: s.contenu ? 'pointer' : 'not-allowed',
                      opacity: s.contenu ? 1 : 0.5,
                    }}
                  >
                    {s.active ? 'Visible' : 'Masquée'}
                  </button>
                  <button
                    className="btn-secondary flex items-center gap-1.5"
                    style={{ fontSize: 12 }}
                    disabled={generationSur === s.id}
                    onClick={() => void generer(s)}
                  >
                    {generationSur === s.id ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" /> Génération…
                      </>
                    ) : (
                      <>
                        <Sparkles size={13} /> {s.contenu ? 'Régénérer' : 'Générer le contenu'}
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void supprimer(s)}
                    title="Supprimer cette séance"
                    style={{
                      fontSize: 12, color: '#C0392B', background: '#FFFFFF',
                      border: '1px solid rgba(192,57,43,0.25)', borderRadius: 8, padding: '6px 9px',
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              <textarea
                className="input-field"
                value={s.consignes ?? ''}
                onChange={(e) => majChamp(s.id, { consignes: e.target.value })}
                placeholder="Consignes de génération — ce que la séance doit faire travailler, le vocabulaire à employer, les exemples à privilégier."
                rows={2}
                style={{ marginTop: 10, fontSize: 12.5 }}
              />

              <p
                style={{
                  fontSize: 11.5, marginTop: 8,
                  color: s.contenu ? '#2EA043' : '#B87A0C',
                }}
              >
                {s.contenu
                  ? `Contenu : ${resumeContenu(s.contenu)}`
                  : 'Aucun contenu — la séance ne sera pas proposée aux enseignants.'}
              </p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
