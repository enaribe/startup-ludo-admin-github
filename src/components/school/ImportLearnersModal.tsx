'use client';

/**
 * Import CSV d'une liste d'élèves — prévisualisation avant validation.
 *
 * POURQUOI une prévisualisation obligatoire : l'import est fait une fois par an
 * par un établissement client, sur un fichier bricolé dans Excel. Écrire
 * directement 35 élèves sans montrer ce qui va être créé, c'est garantir des
 * listes à corriger à la main ensuite. L'utilisateur voit donc, AVANT toute
 * écriture : les lignes retenues, les doublons (décochés d'office) et les lignes
 * ignorées avec leur motif — et il peut annuler à ce stade.
 *
 * Le parsing est fait par `@/lib/learners-csv` (maison, sans dépendance).
 */

import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileText, Upload, X } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import {
  analyserCsvEleves,
  lireFichierTexte,
  type EleveExistant,
  type ResultatAnalyseCsv,
} from '@/lib/learners-csv';
import toast from 'react-hot-toast';

interface ImportLearnersModalProps {
  /** Élèves déjà dans la classe (actifs ET retirés) — base de détection des doublons. */
  existants: EleveExistant[];
  /** Fermeture sans rien écrire. */
  onClose: () => void;
  /** Validation : reçoit les seules lignes retenues par l'utilisateur. */
  onImport: (
    eleves: Array<{ firstName: string; lastName: string; externalId: string }>
  ) => Promise<void>;
}

export default function ImportLearnersModal({
  existants,
  onClose,
  onImport,
}: ImportLearnersModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nomFichier, setNomFichier] = useState('');
  const [analyse, setAnalyse] = useState<ResultatAnalyseCsv | null>(null);
  /** Numéros de ligne décochés par l'utilisateur (ou d'office pour les doublons). */
  const [exclus, setExclus] = useState<Set<number>>(new Set());
  const [enCours, setEnCours] = useState(false);

  const choisirFichier = async (fichier: File) => {
    try {
      const contenu = await lireFichierTexte(fichier);
      const resultat = analyserCsvEleves(contenu, existants);
      setNomFichier(fichier.name);
      setAnalyse(resultat);
      // Les doublons sont décochés d'office : l'utilisateur peut les rétablir
      // au cas par cas (deux homonymes dans une même classe, ça existe).
      setExclus(
        new Set(
          resultat.lignes
            .filter((l) => l.doublonFichier || l.doublonClasse)
            .map((l) => l.numeroLigne)
        )
      );
      if (resultat.lignes.length === 0) {
        toast.error('Aucune ligne exploitable dans ce fichier');
      }
    } catch (error) {
      console.error('Lecture du CSV :', error);
      toast.error('Impossible de lire ce fichier');
    }
  };

  const retenues = useMemo(
    () => (analyse?.lignes ?? []).filter((l) => !exclus.has(l.numeroLigne)),
    [analyse, exclus]
  );

  const nbDoublons = useMemo(
    () => (analyse?.lignes ?? []).filter((l) => l.doublonFichier || l.doublonClasse).length,
    [analyse]
  );

  const basculer = (numeroLigne: number) => {
    setExclus((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(numeroLigne)) suivant.delete(numeroLigne);
      else suivant.add(numeroLigne);
      return suivant;
    });
  };

  const valider = async () => {
    if (retenues.length === 0) return;
    setEnCours(true);
    try {
      await onImport(
        retenues.map((l) => ({
          firstName: l.firstName,
          lastName: l.lastName,
          externalId: l.externalId,
        }))
      );
    } catch {
      // L'appelant a déjà signalé l'erreur (quota dépassé, réseau…). On la
      // rattrape ici uniquement pour laisser la modale OUVERTE avec son analyse
      // intacte : l'utilisateur décoche quelques lignes et retente, sans avoir à
      // recharger son fichier.
    } finally {
      setEnCours(false);
    }
  };

  /** Retour à l'étape « choix du fichier » sans rien avoir écrit. */
  const recommencer = () => {
    setAnalyse(null);
    setNomFichier('');
    setExclus(new Set());
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <Modal open onClose={onClose} title="Importer une liste d’élèves" maxWidth="640px">
      {!analyse ? (
        <div className="flex flex-col gap-4">
          <div
            className="flex flex-col items-center justify-center gap-3 p-8"
            style={{
              border: '1px dashed var(--color-border)',
              borderRadius: 12,
              background: 'var(--color-surface)',
              textAlign: 'center',
            }}
          >
            <FileText size={32} style={{ color: 'var(--color-text-muted)' }} />
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Choisissez un fichier CSV au format <code>prénom;nom;identifiant</code>
            </p>
            <button className="btn-primary flex items-center gap-2" onClick={() => inputRef.current?.click()}>
              <Upload size={16} /> Choisir un fichier
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              style={{ display: 'none' }}
              onChange={(e) => {
                const fichier = e.target.files?.[0];
                if (fichier) choisirFichier(fichier);
              }}
            />
          </div>

          <div
            className="p-4"
            style={{
              background: 'var(--color-surface)',
              borderRadius: 8,
              fontSize: 12,
              color: 'var(--color-text-secondary)',
              lineHeight: 1.7,
            }}
          >
            <strong style={{ color: 'var(--color-text-primary)' }}>Format accepté</strong>
            <ul style={{ marginTop: 6, paddingLeft: 18, listStyle: 'disc' }}>
              <li>
                Séparateur <code>;</code> ou <code>,</code> — les deux fonctionnent.
              </li>
              <li>La ligne d’en-tête est détectée automatiquement (elle est facultative).</li>
              <li>L’identifiant (3ᵉ colonne) est facultatif.</li>
              <li>Encodage UTF-8 ou Latin-1 — les accents sont préservés dans les deux cas.</li>
            </ul>
            <p style={{ marginTop: 8, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
              Fatou;Diop;2026-041
              <br />
              Moussa;Ndiaye
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Résumé */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                {nomFichier}
              </p>
              <p style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                {retenues.length} élève{retenues.length > 1 ? 's' : ''} à créer
                {nbDoublons > 0 && ` · ${nbDoublons} doublon${nbDoublons > 1 ? 's' : ''} détecté${nbDoublons > 1 ? 's' : ''}`}
                {analyse.ignorees.length > 0 &&
                  ` · ${analyse.ignorees.length} ligne${analyse.ignorees.length > 1 ? 's' : ''} ignorée${analyse.ignorees.length > 1 ? 's' : ''}`}
              </p>
            </div>
            <button className="btn-secondary" onClick={recommencer} disabled={enCours}>
              Changer de fichier
            </button>
          </div>

          {/* Prévisualisation */}
          {analyse.lignes.length > 0 && (
            <div
              style={{
                border: '1px solid var(--color-card-border)',
                borderRadius: 8,
                maxHeight: 260,
                overflowY: 'auto',
              }}
            >
              <table className="w-full" style={{ borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--color-card)', zIndex: 1 }}>
                  <tr style={{ borderBottom: '1px solid var(--color-card-border)' }}>
                    <ThPreview style={{ width: 40 }} />
                    <ThPreview>Prénom</ThPreview>
                    <ThPreview>Nom</ThPreview>
                    <ThPreview>Identifiant</ThPreview>
                    <ThPreview>Statut</ThPreview>
                  </tr>
                </thead>
                <tbody>
                  {analyse.lignes.map((ligne) => {
                    const doublon = ligne.doublonFichier || ligne.doublonClasse;
                    const inclus = !exclus.has(ligne.numeroLigne);
                    return (
                      <tr
                        key={ligne.numeroLigne}
                        style={{
                          borderBottom: '1px solid var(--color-card-border)',
                          opacity: inclus ? 1 : 0.5,
                        }}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={inclus}
                            onChange={() => basculer(ligne.numeroLigne)}
                          />
                        </td>
                        <TdPreview>{ligne.firstName}</TdPreview>
                        <TdPreview>{ligne.lastName}</TdPreview>
                        <TdPreview>{ligne.externalId || '—'}</TdPreview>
                        <td className="px-3 py-2">
                          {doublon ? (
                            <span className="badge badge-error" style={{ fontSize: 10 }}>
                              {ligne.doublonClasse ? 'Déjà dans la classe' : 'Doublon du fichier'}
                            </span>
                          ) : (
                            <span className="badge badge-success" style={{ fontSize: 10 }}>
                              À créer
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Rapport des lignes ignorées */}
          {analyse.ignorees.length > 0 && (
            <div
              className="p-3"
              style={{
                background: 'var(--color-warning-light)',
                borderRadius: 8,
                borderLeft: '3px solid var(--color-warning)',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} style={{ color: 'var(--color-warning)' }} />
                <strong style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>
                  {analyse.ignorees.length} ligne{analyse.ignorees.length > 1 ? 's' : ''} ignorée
                  {analyse.ignorees.length > 1 ? 's' : ''}
                </strong>
              </div>
              <ul
                style={{
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  maxHeight: 110,
                  overflowY: 'auto',
                  lineHeight: 1.6,
                }}
              >
                {analyse.ignorees.map((ligne) => (
                  <li key={ligne.numeroLigne}>
                    <strong>Ligne {ligne.numeroLigne}</strong> — {ligne.motif}
                    {ligne.contenu.trim() && (
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        {' '}
                        (« {ligne.contenu.slice(0, 60)} »)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analyse.lignes.length === 0 && (
            <div
              className="flex items-center gap-2 p-4"
              style={{ background: 'var(--color-surface)', borderRadius: 8 }}
            >
              <X size={16} style={{ color: 'var(--color-error)' }} />
              <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Aucune ligne exploitable. Vérifiez le format du fichier.
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button className="btn-secondary" onClick={onClose} disabled={enCours}>
              Annuler
            </button>
            <button
              className="btn-primary"
              onClick={valider}
              disabled={enCours || retenues.length === 0}
            >
              {enCours
                ? 'Import en cours…'
                : `Importer ${retenues.length} élève${retenues.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** En-tête de colonne de la prévisualisation. */
function ThPreview({
  children,
  style,
}: {
  children?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <th
      className="text-left px-3 py-2"
      style={{
        fontSize: 10,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        color: 'var(--color-text-muted)',
        ...style,
      }}
    >
      {children}
    </th>
  );
}

/** Cellule de la prévisualisation. */
function TdPreview({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2" style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
      {children}
    </td>
  );
}
