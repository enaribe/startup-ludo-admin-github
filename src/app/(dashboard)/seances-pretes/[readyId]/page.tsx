'use client';

/**
 * Préparation d'UNE séance prête à l'emploi.
 *
 * Trois temps, dans cet ordre : on décrit la séance, on règle ce qu'elle doit
 * contenir, on génère — puis on RELIT et on corrige.
 *
 * POURQUOI LA RELECTURE N'EST PAS OPTIONNELLE : ces séances sont diffusées à
 * tous les établissements. Un quiz faux ici est projeté devant chaque classe
 * qui la choisit, et c'est l'enseignant qui le porte devant ses élèves. Le
 * premier jet de cet écran générait sans rien montrer — on ne pouvait que
 * croire le résultat sur parole.
 *
 * La composition (combien de quiz, de duels…) est réglée AVANT : une séance de
 * 30 minutes en lycée n'a pas les mêmes besoins qu'un atelier d'une heure en
 * école de commerce, et régénérer pour corriger une quantité coûte un appel
 * modèle complet.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { useAuth } from '@/lib/auth-context';
import { getEditions } from '@/lib/firestore-service';
import {
  getReadySession,
  resumeContenu,
  saveReadySession,
  supprimerReadySession,
  type ReadySession,
} from '@/lib/ready-session-service';
import {
  genererContenuSeance,
  genererContenuSupplementaire,
  mixPourDuree,
  type MixSeance,
} from '@/lib/class-session-generation';
import ApercuContenuSeance from '@/components/school/ApercuContenuSeance';
import AjoutContenuSeance from '@/components/school/AjoutContenuSeance';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import type { ClassSessionContent, EditionData } from '@/types';

const DIFFICULTES = ['Débutant', 'Intermédiaire', 'Avancé'] as const;

/** Libellés des cinq types, dans l'ordre où ils comptent pour une séance. */
const TYPES_MIX: Array<{ cle: keyof MixSeance; libelle: string; aide: string }> = [
  { cle: 'quiz', libelle: 'Quiz', aide: 'le cœur de la séance — c’est ce qui est noté' },
  { cle: 'duel', libelle: 'Duels', aide: 'deux élèves s’affrontent sur une question' },
  { cle: 'funding', libelle: 'Financements', aide: 'jetons gagnés, respiration entre deux quiz' },
  { cle: 'opportunity', libelle: 'Opportunités', aide: 'jetons gagnés, ancrés sur le thème' },
  { cle: 'challenge', libelle: 'Défis', aide: 'jetons perdus — tension du plateau' },
];

export default function PreparerSeancePretePage() {
  const { readyId } = useParams<{ readyId: string }>();
  const router = useRouter();
  const { isSuperAdmin, loading: authLoading } = useAuth();

  const [seance, setSeance] = useState<ReadySession | null>(null);
  const [editions, setEditions] = useState<EditionData[]>([]);
  const [chargement, setChargement] = useState(true);
  const [mix, setMix] = useState<MixSeance>(mixPourDuree(30));
  const [enGeneration, setEnGeneration] = useState(false);
  const [enAjout, setEnAjout] = useState(false);

  const charger = useCallback(async () => {
    try {
      const [s, eds] = await Promise.all([getReadySession(readyId), getEditions()]);
      setSeance(s);
      setEditions(eds);
      // Le mix suit la durée enregistrée — point de départ, pas une contrainte.
      if (s) setMix(mixPourDuree(s.duree));
    } catch (error) {
      console.error('Séance prête :', error);
      toast.error('Chargement impossible.');
    } finally {
      setChargement(false);
    }
  }, [readyId]);

  useEffect(() => {
    if (authLoading || !isSuperAdmin) return;
    void charger();
  }, [authLoading, isSuperAdmin, charger]);

  /** Écriture optimiste : le champ répond tout de suite, la base suit. */
  const maj = (patch: Partial<ReadySession>) => {
    setSeance((s) => (s ? { ...s, ...patch } : s));
    void saveReadySession(readyId, patch).catch(() => toast.error('Enregistrement impossible.'));
  };

  const contexte = (s: ReadySession) => ({
    sessionTitle: s.titre,
    durationMinutes: s.duree,
    schoolLevel: s.difficulte,
  });

  const generer = async () => {
    if (!seance) return;
    if (!seance.editionId) {
      toast.error('Choisissez d’abord une édition.');
      return;
    }
    if (seance.contenu && !window.confirm('Régénérer remplace le contenu actuel. Continuer ?')) return;

    setEnGeneration(true);
    try {
      const contenu = await genererContenuSeance(
        seance.id,
        seance.consignes?.trim() ||
          `Séance « ${seance.titre} » de ${seance.duree} minutes, niveau ${seance.difficulte}.`,
        mix,
        contexte(seance)
      );
      await saveReadySession(seance.id, { contenu });
      setSeance((s) => (s ? { ...s, contenu } : s));
      toast.success(`Contenu généré : ${resumeContenu(contenu)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Génération impossible.');
    } finally {
      setEnGeneration(false);
    }
  };

  /** Complément : ajoute des cartes sans toucher à celles déjà relues. */
  const ajouter = async (m: MixSeance) => {
    if (!seance?.contenu) return;
    setEnAjout(true);
    try {
      const fusionne = await genererContenuSupplementaire(
        seance.id,
        seance.consignes?.trim() || seance.titre,
        m,
        contexte(seance),
        seance.contenu
      );
      await saveReadySession(seance.id, { contenu: fusionne });
      setSeance((s) => (s ? { ...s, contenu: fusionne } : s));
      toast.success('Contenu ajouté.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ajout impossible.');
    } finally {
      setEnAjout(false);
    }
  };

  /** Chaque correction est enregistrée : la relecture ne se perd pas. */
  const majContenu = (contenu: ClassSessionContent) => {
    setSeance((s) => (s ? { ...s, contenu } : s));
    void saveReadySession(readyId, { contenu }).catch(() =>
      toast.error('Enregistrement de la correction impossible.')
    );
  };

  const supprimer = async () => {
    if (!seance) return;
    if (!window.confirm(`Supprimer « ${seance.titre} » ?\n\nCette action est irréversible.`)) return;
    await supprimerReadySession(seance.id);
    toast.success('Séance supprimée.');
    router.push('/seances-pretes');
  };

  if (authLoading || chargement) {
    return (
      <div className="flex items-center justify-center py-24">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Réservé à l’équipe CONCREE.</p>;
  }

  if (!seance) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center' }}>
        <p style={{ fontSize: 14, fontWeight: 600 }}>Séance introuvable.</p>
        <Link href="/seances-pretes" style={{ fontSize: 13, color: '#B87A0C' }}>
          Retour au catalogue
        </Link>
      </div>
    );
  }

  const total = Object.values(mix).reduce((a, b) => a + b, 0);

  return (
    <div>
      <Link
        href="/seances-pretes"
        className="flex items-center gap-1.5 mb-4"
        style={{ fontSize: 13, color: 'var(--color-text-muted)', textDecoration: 'none', width: 'fit-content' }}
      >
        <ArrowLeft size={14} /> Séances prêtes
      </Link>

      {/* ═══ 1. La séance ═══ */}
      <section className="glass-card p-5 mb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)' }}>
              La séance
            </h1>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
              Ce que l’enseignant lit avant de choisir.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Publier exige un contenu : c'est la garantie qu'aucune séance
                vide n'est proposée. */}
            <button
              type="button"
              onClick={() => maj({ active: !seance.active })}
              disabled={!seance.contenu}
              title={seance.contenu ? 'Visible ou non par les enseignants' : 'Générez d’abord le contenu'}
              style={{
                fontSize: 12, fontWeight: 700, padding: '7px 13px', borderRadius: 8,
                border: '1px solid var(--color-card-border)',
                background: seance.active ? 'rgba(46,160,67,0.12)' : '#FFFFFF',
                color: seance.active ? '#2EA043' : 'var(--color-text-muted)',
                cursor: seance.contenu ? 'pointer' : 'not-allowed',
                opacity: seance.contenu ? 1 : 0.5,
              }}
            >
              {seance.active ? 'Visible' : 'Masquée'}
            </button>
            <button
              type="button"
              onClick={() => void supprimer()}
              title="Supprimer cette séance"
              style={{
                fontSize: 12, color: '#C0392B', background: '#FFFFFF',
                border: '1px solid rgba(192,57,43,0.25)', borderRadius: 8, padding: '7px 10px',
                cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        <label className="label">Intitulé</label>
        <input
          className="input-field"
          value={seance.titre}
          onChange={(e) => maj({ titre: e.target.value })}
          style={{ fontWeight: 700 }}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" style={{ marginTop: 12 }}>
          <div>
            <label className="label">Édition</label>
            <select
              className="input-field"
              value={seance.editionId}
              onChange={(e) => maj({ editionId: e.target.value })}
            >
              <option value="">— à choisir —</option>
              {editions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name || e.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Niveau</label>
            <select
              className="input-field"
              value={seance.difficulte}
              onChange={(e) => maj({ difficulte: e.target.value as ReadySession['difficulte'] })}
            >
              {DIFFICULTES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Durée conseillée (min)</label>
            <input
              className="input-field"
              type="number"
              min={20}
              max={60}
              value={seance.duree}
              onChange={(e) => maj({ duree: Number(e.target.value) })}
            />
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label className="label">Note affichée à l’enseignant</label>
          <input
            className="input-field"
            value={seance.note ?? ''}
            onChange={(e) => maj({ note: e.target.value })}
            placeholder="ex. idéale en première séance"
          />
        </div>
      </section>

      {/* ═══ 2. La composition ═══ */}
      <section className="glass-card p-5 mb-4">
        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)' }}>
          Ce que la séance doit contenir
        </h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2, marginBottom: 14 }}>
          Réglé avant de générer : corriger une quantité après coup demande un nouvel appel complet.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {TYPES_MIX.map(({ cle, libelle, aide }) => (
            <div key={cle}>
              <label className="label" title={aide}>
                {libelle}
              </label>
              <input
                className="input-field"
                type="number"
                min={0}
                max={20}
                value={mix[cle]}
                onChange={(e) =>
                  setMix((m) => ({ ...m, [cle]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) }))
                }
              />
              <p style={{ fontSize: 10.5, color: 'var(--color-text-muted)', marginTop: 3, lineHeight: 1.4 }}>
                {aide}
              </p>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          <label className="label">Consignes de génération</label>
          <textarea
            className="input-field"
            value={seance.consignes ?? ''}
            onChange={(e) => maj({ consignes: e.target.value })}
            placeholder="Ce que la séance doit faire travailler, le vocabulaire à employer, les exemples à privilégier. Plus c'est précis, moins il y aura à corriger ensuite."
            rows={3}
            style={{ fontSize: 12.5 }}
          />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginTop: 14 }}>
          <p style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>
            {total} carte{total > 1 ? 's' : ''} demandée{total > 1 ? 's' : ''}
            {seance.contenu && ' · régénérer remplace le contenu actuel'}
          </p>
          <button
            className="btn-primary flex items-center gap-2"
            disabled={enGeneration || enAjout}
            onClick={() => void generer()}
          >
            {enGeneration ? (
              <>
                <RefreshCw size={15} className="animate-spin" /> Génération…
              </>
            ) : (
              <>
                <Sparkles size={15} /> {seance.contenu ? 'Régénérer' : 'Générer le contenu'}
              </>
            )}
          </button>
        </div>
      </section>

      {/* ═══ 3. Relecture ═══ */}
      {seance.contenu ? (
        <>
          <section className="glass-card p-5 mb-4">
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--color-text-primary)' }}>
              Relire et corriger
            </h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
              {resumeContenu(seance.contenu)} — chaque correction est enregistrée aussitôt. Cette
              séance est diffusée à tous les établissements : une erreur ici est projetée devant
              chaque classe qui la choisit.
            </p>
          </section>
          <ApercuContenuSeance contenu={seance.contenu} onChange={majContenu} />
          <div style={{ marginTop: 16 }}>
            <AjoutContenuSeance onAjouter={ajouter} enCours={enGeneration || enAjout} />
          </div>
        </>
      ) : (
        <section
          className="glass-card p-5"
          style={{ background: 'rgba(245,166,35,0.06)', borderColor: 'rgba(245,166,35,0.3)' }}
        >
          <p style={{ fontSize: 13, color: '#B87A0C', lineHeight: 1.6 }}>
            <strong>Aucun contenu pour l’instant.</strong> Tant que la génération n’a pas eu lieu,
            cette séance ne peut pas être proposée aux enseignants — elle enverrait la classe sur
            une partie ordinaire en promettant une séance préparée.
          </p>
        </section>
      )}
    </div>
  );
}
