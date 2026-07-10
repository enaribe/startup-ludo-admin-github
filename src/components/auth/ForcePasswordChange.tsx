'use client';

/**
 * Écran de changement de mot de passe FORCÉ à la première connexion
 * (ou après un reset par un super-admin). Affiché par AuthGuard tant que
 * `admin.mustChangePassword` est vrai — l'admin ne peut pas accéder au reste
 * du dashboard avant d'avoir défini un nouveau mot de passe.
 */

import { useState } from 'react';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function ForcePasswordChange() {
  const { admin, refreshAdmin, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setError('Session expirée. Reconnectez-vous.');
      return;
    }

    setLoading(true);
    try {
      // Ré-authentification si la session n'est plus récente (Firebase l'exige
      // pour changer le mot de passe passé un certain délai).
      if (needsReauth) {
        if (!user.email) throw new Error('Email introuvable.');
        const cred = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, cred);
      }

      await updatePassword(user, password);

      // Lever le flag côté serveur (Admin SDK) puis rafraîchir l'état local.
      const token = await user.getIdToken();
      const res = await fetch('/api/account/complete-password-change', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Impossible de finaliser le changement.');
      }

      await refreshAdmin();
      // AuthGuard laisse alors passer vers le dashboard.
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/requires-recent-login') {
        // On demande le mot de passe actuel pour ré-authentifier.
        setNeedsReauth(true);
        setError('Pour des raisons de sécurité, saisissez votre mot de passe actuel.');
      } else if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('Mot de passe actuel incorrect.');
      } else if (code === 'auth/weak-password') {
        setError('Mot de passe trop faible (8 caractères minimum).');
      } else {
        setError(err instanceof Error ? err.message : 'Une erreur est survenue.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{
      background: 'linear-gradient(135deg, #0a1e33 0%, #0C243E 40%, #194F8A 100%)',
    }}>
      <div className="w-full" style={{ maxWidth: 420 }}>
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{
            background: 'rgba(255, 188, 64, 0.15)',
            border: '1px solid rgba(255, 188, 64, 0.2)',
          }}>
            <ShieldCheck size={32} color="#FFBC40" />
          </div>
          <h1 style={{ fontFamily: "'Luckiest Guy', cursive", fontSize: 24, color: '#FFBC40', letterSpacing: 1, textAlign: 'center' }}>
            Changez votre mot de passe
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6, textAlign: 'center' }}>
            Première connexion : définissez un mot de passe personnel avant de continuer.
          </p>
        </div>

        <div className="glass-card p-6">
          <form onSubmit={handleSubmit}>
            {needsReauth && (
              <div className="mb-4">
                <label className="label">Mot de passe actuel</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="••••••••"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            )}

            <div className="mb-4">
              <label className="label">Nouveau mot de passe</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-field"
                  placeholder="Au moins 8 caractères"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="mb-6">
              <label className="label">Confirmer le mot de passe</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="input-field"
                placeholder="Retapez le mot de passe"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg" style={{
                background: 'rgba(244, 67, 54, 0.1)',
                border: '1px solid rgba(244, 67, 54, 0.2)',
                color: '#F44336',
                fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full flex items-center justify-center gap-2"
              disabled={loading || !password || !confirm || (needsReauth && !currentPassword)}
              style={{ height: 44, fontSize: 15 }}
            >
              {loading ? <LoadingSpinner size={20} color="#0C243E" /> : 'Valider le nouveau mot de passe'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => logout()}
            className="w-full mt-4"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 12 }}
          >
            Se déconnecter
          </button>
        </div>

        <p className="text-center mt-6" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
          {admin?.email}
        </p>
      </div>
    </div>
  );
}
