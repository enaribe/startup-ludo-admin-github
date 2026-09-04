'use client';

/**
 * Connexion — écran scindé (maquette 19/08). Panneau navy « plateau de jeu »
 * à gauche (motif CSS, logo du jeu, accroche en Luckiest Guy), carte de
 * connexion à droite.
 *
 * PAS de choix d'espace : le rôle vient des claims du compte, jamais d'un
 * bouton. Demander « êtes-vous établissement ou annonceur ? » laissait croire
 * à un choix qui n'en était pas un — la valeur n'était lue nulle part, et un
 * annonceur cochant « Établissement » se connectait quand même en annonceur.
 *
 * Chiffres du panneau gauche : rien d'inventé — le nombre d'éditions est lu
 * en base quand la lecture publique le permet, sinon le libellé reste neutre.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  sendPasswordResetEmail,
  setPersistence,
} from 'firebase/auth';
import { Eye, EyeOff } from 'lucide-react';
import { signInAdmin } from '@/lib/auth';
import { auth } from '@/lib/firebase';
import { getEditions } from '@/lib/firestore-service';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const NAVY = '#0F1C2E';
const ORANGE = '#F5A623';


export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rester, setRester] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  /** Nombre d'éditions (lecture publique) — affiché seulement s'il est réel. */
  const [nbEditions, setNbEditions] = useState<number | null>(null);
  useEffect(() => {
    getEditions()
      .then((liste) => setNbEditions(liste.length))
      .catch(() => {
        // Lecture refusée hors connexion : le panneau garde un libellé neutre.
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      // « Rester connecté » : persistance locale, sinon le temps de l'onglet.
      await setPersistence(auth, rester ? browserLocalPersistence : browserSessionPersistence);
      await signInAdmin(email, password);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const motDePasseOublie = async () => {
    setError('');
    setInfo('');
    if (!email.trim()) {
      setError('Saisissez d’abord votre e-mail, puis cliquez de nouveau sur « Mot de passe oublié ? ».');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setInfo('E-mail de réinitialisation envoyé — vérifiez votre boîte de réception.');
    } catch {
      setError('Envoi impossible — vérifiez l’adresse saisie.');
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#F4F6FA' }}>
      {/* ═══ Panneau gauche — plateau de jeu ═══ */}
      <div
        className="hidden lg:flex flex-col justify-between"
        style={{
          width: '46%',
          padding: '36px 46px 40px',
          color: '#FFFFFF',
          backgroundColor: '#10263F',
          backgroundImage: [
            'radial-gradient(circle at 30% 18%, rgba(64,156,255,0.16), transparent 55%)',
            'linear-gradient(rgba(13,33,56,0.86), rgba(13,33,56,0.93))',
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.09) 0px, rgba(255,255,255,0.09) 2px, transparent 2px, transparent 72px)',
            'repeating-linear-gradient(90deg, rgba(255,255,255,0.09) 0px, rgba(255,255,255,0.09) 2px, transparent 2px, transparent 72px)',
          ].join(', '),
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-startup-ludo.png"
          alt="Startup Ludo"
          style={{ width: 130, alignSelf: 'flex-start', filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.35))' }}
        />

        <div>
          <h1
            style={{
              fontFamily: "'Luckiest Guy', cursive",
              fontSize: 42,
              lineHeight: 1.16,
              letterSpacing: 1,
              maxWidth: 440,
              textShadow: '0 4px 0 rgba(9,26,44,0.55), 0 0 20px rgba(64,156,255,0.35)',
            }}
          >
            Révélez l’entrepreneur qui sommeille en chacun
          </h1>
          <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.75)', marginTop: 16, maxWidth: 410, lineHeight: 1.65 }}>
            Le jeu d’apprentissage de l’entrepreneuriat — en classe, en cohorte de formation, et
            dans les parties de milliers de joueurs au Sénégal.
          </p>
        </div>

        <div className="flex gap-10 flex-wrap">
          <Repere valeur="Mode Classe" texte="classes et cohortes guidées" />
          <Repere valeur="Espace Annonceur" texte="opportunités dans le jeu" />
          <Repere
            valeur={nbEditions ? `${nbEditions} éditions` : 'Éditions'}
            texte="univers thématiques de jeu"
          />
        </div>
      </div>

      {/* ═══ Panneau droit — connexion ═══ */}
      <div className="flex-1 flex flex-col items-center justify-center" style={{ padding: '28px 20px' }}>
        <div style={{ width: '100%', maxWidth: 470 }}>
          <div className="flex items-center gap-3" style={{ marginBottom: 14 }}>
            <span
              className="flex items-center justify-center"
              style={{ width: 34, height: 34, borderRadius: 10, background: ORANGE, color: NAVY, fontWeight: 900, fontSize: 16 }}
            >
              C
            </span>
            <span>
              <span style={{ display: 'block', fontWeight: 800, letterSpacing: 2.5, fontSize: 13, color: NAVY }}>CONCREE</span>
              <span style={{ fontSize: 11.5, color: 'var(--color-text-muted)' }}>Dashboard Startup Ludo</span>
            </span>
          </div>

          <div style={{ background: '#FFFFFF', borderRadius: 20, boxShadow: '0 14px 40px rgba(15,28,46,0.10)', padding: '26px 26px 22px' }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>Connexion</h2>
            <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', margin: '4px 0 16px' }}>
              Vous êtes dirigé vers votre espace selon votre compte.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="label">E-mail professionnel</label>
                <input
                  type="email"
                  className="input-field"
                  placeholder="direction@ism.sn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="mb-3">
                <label className="label">Mot de passe</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="input-field"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    style={{ paddingRight: 40 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
                <label className="flex items-center gap-2" style={{ fontSize: 12.5, color: NAVY, cursor: 'pointer' }}>
                  <input type="checkbox" checked={rester} onChange={(e) => setRester(e.target.checked)} />
                  Rester connecté
                </label>
                <button
                  type="button"
                  onClick={() => void motDePasseOublie()}
                  style={{ fontSize: 12.5, color: '#B87A0C', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Mot de passe oublié ?
                </button>
              </div>

              {error && (
                <div
                  className="mb-4 p-3 rounded-lg"
                  style={{ background: 'rgba(244,67,54,0.08)', border: '1px solid rgba(244,67,54,0.25)', color: '#C62828', fontSize: 13 }}
                >
                  {error}
                </div>
              )}
              {info && (
                <div
                  className="mb-4 p-3 rounded-lg"
                  style={{ background: 'rgba(46,160,67,0.08)', border: '1px solid rgba(46,160,67,0.3)', color: '#2E7D32', fontSize: 13 }}
                >
                  {info}
                </div>
              )}

              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2"
                disabled={loading || !email || !password}
                style={{
                  height: 46, fontSize: 15, fontWeight: 800, borderRadius: 12, border: 'none',
                  background: ORANGE, color: NAVY, cursor: 'pointer',
                  opacity: loading || !email || !password ? 0.55 : 1,
                }}
              >
                {loading ? <LoadingSpinner size={20} color="#0C243E" /> : 'Se connecter'}
              </button>
            </form>

            <p
              style={{
                fontSize: 12, color: '#5A4A1A', background: 'rgba(245,166,35,0.09)',
                border: '1px solid rgba(245,166,35,0.35)', borderRadius: 12, padding: '12px 14px',
                marginTop: 16, lineHeight: 1.55,
              }}
            >
              <strong style={{ color: NAVY }}>Vous représentez un établissement ?</strong> Activez la
              licence de votre école, institut ou université avec le code reçu par CONCREE — vos
              enseignants seront rattachés automatiquement.{' '}
              <a href="/inscription" style={{ color: '#B87A0C', fontWeight: 700 }}>
                Saisir un code établissement
              </a>
            </p>
          </div>

          <p style={{ fontSize: 12, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 16 }}>
            Pas encore de compte ?{' '}
            <a href="/inscription" style={{ color: '#B87A0C', fontWeight: 700 }}>
              Demander un accès
            </a>{' '}
            ·{' '}
            <a href="https://concree.com" target="_blank" rel="noreferrer" style={{ color: '#B87A0C', fontWeight: 700 }}>
              Découvrir Startup Ludo
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

/** Repère du bas du panneau gauche — valeur forte + libellé, sans chiffre inventé. */
function Repere({ valeur, texte }: { valeur: string; texte: string }) {
  return (
    <span>
      <span style={{ display: 'block', fontFamily: "'Luckiest Guy', cursive", fontSize: 19, color: '#FFD873', letterSpacing: 0.5 }}>
        {valeur}
      </span>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{texte}</span>
    </span>
  );
}
