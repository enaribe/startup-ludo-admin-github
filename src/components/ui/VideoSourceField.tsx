'use client';

/**
 * Source de la vidéo d'un défi : un lien, ou un fichier téléversé.
 *
 * ═══ POURQUOI LES DEUX ═══
 *
 * Le champ était une simple URL. Il fallait donc héberger la vidéo ailleurs
 * avant de pouvoir remplir le défi — ce qui marche quand la vidéo vient d'un
 * partenaire avec son propre hébergement, et bloque quand on a juste un
 * fichier sur son bureau.
 *
 * L'inverse serait aussi faux : imposer le téléversement obligerait à
 * recopier dans Storage une vidéo déjà en ligne, et à la payer deux fois.
 *
 * ═══ LES DEUX MODES ÉCRIVENT LA MÊME CHOSE ═══
 *
 * Une URL. Le mobile ne sait pas d'où elle vient, et n'a pas à le savoir :
 * `VideoDefi.url` reste une chaîne, et rien ne change côté app.
 *
 * Le mode affiché au chargement se DÉDUIT de l'URL : une adresse Storage
 * ouvre l'onglet « Fichier », toute autre ouvre « Lien ». Stocker le mode en
 * base aurait ajouté un champ qui ne sert qu'à l'écran d'édition, et qui
 * mentirait le jour où quelqu'un colle une URL à la main.
 */

import { useRef, useState } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Upload, X, Film, Link as LinkIcon } from 'lucide-react';
import { storage } from '@/lib/firebase';

/** Plafond de taille, en octets. Doublé dans `storage.rules` — voir là-bas. */
const MAX_OCTETS = 50 * 1024 * 1024;

/**
 * L'URL vient-elle de notre Storage ?
 *
 * Sert à rouvrir l'écran sur le bon onglet. Le test porte sur l'hôte Firebase
 * et non sur un préfixe de chemin : les URL de téléchargement sont signées et
 * leur chemin est encodé, un test de chemin serait fragile.
 */
function estFichierTeleverse(url: string): boolean {
  return url.includes('firebasestorage.googleapis.com') || url.includes('.firebasestorage.app');
}

export default function VideoSourceField({
  value,
  onChange,
  storagePath,
  disabled = false,
}: {
  value: string;
  onChange: (url: string) => void;
  /** Chemin de dépôt, sans extension : elle est ajoutée d'après le fichier. */
  storagePath: string;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'lien' | 'fichier'>(
    value && estFichierTeleverse(value) ? 'fichier' : 'lien'
  );
  const [envoi, setEnvoi] = useState(false);
  const [progres, setProgres] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);

  const choisirFichier = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const fichier = e.target.files?.[0];
    if (!fichier) return;

    if (!fichier.type.startsWith('video/')) {
      setErreur('Fichier non supporté. Choisissez une vidéo (MP4, WebM, MOV).');
      return;
    }
    if (fichier.size > MAX_OCTETS) {
      setErreur(
        `Vidéo trop lourde (${Math.round(fichier.size / 1024 / 1024)} Mo, maximum 50 Mo). ` +
          'Compressez-la, ou hébergez-la ailleurs et collez son lien.'
      );
      return;
    }

    setErreur(null);
    setEnvoi(true);
    setProgres(0);

    /*
      L'extension d'origine est conservée dans le chemin : sans elle, deux
      dépôts successifs d'un .mp4 puis d'un .webm écriraient sur le même
      objet, et le second hériterait du type du premier.
    */
    const extension = fichier.name.split('.').pop()?.toLowerCase() || 'mp4';
    const tache = uploadBytesResumable(ref(storage, `${storagePath}.${extension}`), fichier, {
      contentType: fichier.type,
    });

    tache.on(
      'state_changed',
      (etat) => setProgres(Math.round((etat.bytesTransferred / etat.totalBytes) * 100)),
      (err) => {
        setEnvoi(false);
        setErreur(`Erreur d’envoi : ${err.message}`);
      },
      async () => {
        onChange(await getDownloadURL(tache.snapshot.ref));
        setEnvoi(false);
        setProgres(0);
      }
    );
  };

  const styleOnglet = (actif: boolean) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 14px',
    borderRadius: 6,
    fontSize: 12.5,
    cursor: disabled ? 'default' : 'pointer',
    background: actif ? 'rgba(255,188,64,0.12)' : 'transparent',
    border: `1px solid ${actif ? 'rgba(255,188,64,0.35)' : 'var(--color-card-border)'}`,
    color: actif ? '#FFBC40' : 'var(--color-text-muted)',
    opacity: disabled ? 0.5 : 1,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <label className="label">Vidéo de présentation</label>

      {/* ─── Le choix de la source ─── */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" disabled={disabled} onClick={() => setMode('lien')} style={styleOnglet(mode === 'lien')}>
          <LinkIcon size={13} />
          Lien
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setMode('fichier')}
          style={styleOnglet(mode === 'fichier')}
        >
          <Upload size={13} />
          Fichier
        </button>
      </div>

      {mode === 'lien' ? (
        <input
          className="input-field"
          value={value}
          disabled={disabled}
          placeholder="https://…/defi-inondations_30s.mp4"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={envoi || disabled}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '14px 12px',
              borderRadius: 10,
              fontSize: 12.5,
              border: '2px dashed var(--color-card-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              cursor: envoi || disabled ? 'default' : 'pointer',
              opacity: envoi || disabled ? 0.6 : 1,
            }}
          >
            <Film size={16} />
            {envoi ? `Envoi… ${progres} %` : 'Choisir une vidéo (MP4, WebM, MOV — 50 Mo max)'}
          </button>

          {envoi && (
            <div style={{ height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${progres}%`, height: '100%', background: '#FFBC40', transition: 'width 0.2s' }} />
            </div>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            style={{ display: 'none' }}
            onChange={choisirFichier}
          />
        </div>
      )}

      {/* ─── L'aperçu : la seule façon de vérifier que le lien marche ─── */}
      {value && !envoi ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={value}
            controls
            preload="metadata"
            style={{ width: '100%', maxHeight: 200, borderRadius: 10, background: '#000' }}
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => onChange('')}
              style={{
                alignSelf: 'flex-start',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 12,
                background: 'rgba(244,67,54,0.1)',
                border: '1px solid rgba(244,67,54,0.25)',
                color: '#f44336',
                cursor: 'pointer',
              }}
            >
              <X size={13} />
              Retirer la vidéo
            </button>
          )}
        </div>
      ) : null}

      {erreur ? <p style={{ fontSize: 12, color: '#f44336', margin: 0 }}>{erreur}</p> : null}

      <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: 0 }}>
        Sans vidéo, le bloc n’est pas affiché. Le parcours n’est jamais bloqué
        par la vidéo. Elle est regardée sur téléphone, souvent en 4G : une
        vidéo courte et compressée vaut mieux qu’une vidéo longue.
      </p>
    </div>
  );
}
