'use client';

import { useRef, useState } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Upload, X, ImageIcon } from 'lucide-react';
import { storage } from '@/lib/firebase';

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  storagePath: string; // e.g. "challenges/yeah/banner"
  aspectRatio?: 'banner' | 'square';
  disabled?: boolean;
  disabledHint?: string;
}

export default function ImageUploadField({
  label,
  value,
  onChange,
  storagePath,
  aspectRatio = 'banner',
  disabled = false,
  disabledHint,
}: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const previewHeight = aspectRatio === 'banner' ? 110 : 80;
  const previewWidth = aspectRatio === 'banner' ? '100%' : 80;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Fichier non supporté. Choisissez une image (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image trop lourde (max 5 Mo).');
      return;
    }

    setError(null);
    setUploading(true);
    setProgress(0);

    const storageRef = ref(storage, storagePath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        setProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
      },
      (err) => {
        setUploading(false);
        setError(`Erreur upload : ${err.message}`);
      },
      async () => {
        const url = await getDownloadURL(uploadTask.snapshot.ref);
        onChange(url);
        setUploading(false);
        setProgress(0);
      }
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label className="label">{label}</label>

      {/* Preview zone / drop target */}
      <div
        onClick={() => !uploading && !disabled && inputRef.current?.click()}
        style={{
          width: previewWidth,
          height: previewHeight,
          borderRadius: 10,
          border: '2px dashed rgba(255,255,255,0.2)',
          background: value ? 'transparent' : 'rgba(255,255,255,0.04)',
          cursor: uploading || disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          overflow: 'hidden',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'border-color 0.2s',
        }}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="aperçu"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* Overlay on hover */}
            <div
              style={{
                position: 'absolute', inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 4,
                opacity: 0, transition: 'opacity 0.2s',
              }}
              className="img-upload-overlay"
            >
              <Upload size={20} color="white" />
              <span style={{ fontSize: 12, color: 'white' }}>Remplacer</span>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.35)' }}>
            <ImageIcon size={24} />
            <span style={{ fontSize: 12 }}>Cliquer pour uploader</span>
          </div>
        )}

        {/* Upload progress overlay */}
        {uploading && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <div style={{
              width: '70%', height: 4,
              background: 'rgba(255,255,255,0.2)',
              borderRadius: 2, overflow: 'hidden',
            }}>
              <div style={{
                width: `${progress}%`, height: '100%',
                background: '#FFBC40', transition: 'width 0.2s',
              }} />
            </div>
            <span style={{ fontSize: 12, color: 'white' }}>{progress}%</span>
          </div>
        )}
      </div>

      {/* Actions row */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || disabled}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 6, fontSize: 12,
            background: 'rgba(255,188,64,0.12)',
            border: '1px solid rgba(255,188,64,0.3)',
            color: '#FFBC40', cursor: uploading || disabled ? 'default' : 'pointer',
            opacity: uploading || disabled ? 0.5 : 1,
          }}
        >
          <Upload size={13} />
          {uploading ? `Upload... ${progress}%` : 'Choisir une image'}
        </button>

        {value && !uploading && !disabled && (
          <button
            type="button"
            onClick={() => onChange('')}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 10px', borderRadius: 6, fontSize: 12,
              background: 'rgba(244,67,54,0.1)',
              border: '1px solid rgba(244,67,54,0.25)',
              color: '#f44336', cursor: 'pointer',
            }}
          >
            <X size={13} />
            Supprimer
          </button>
        )}
      </div>

      {error && (
        <p style={{ fontSize: 12, color: '#f44336', margin: 0 }}>{error}</p>
      )}

      {disabled && disabledHint && !error && (
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>{disabledHint}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      <style>{`
        .img-upload-overlay { opacity: 0; }
        div:hover > .img-upload-overlay { opacity: 1; }
      `}</style>
    </div>
  );
}
