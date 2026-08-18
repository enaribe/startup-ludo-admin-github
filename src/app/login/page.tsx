'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signInAdmin } from '@/lib/auth';
import { Gamepad2, Eye, EyeOff } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInAdmin(email, password);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{
      background: 'linear-gradient(135deg, #0a1e33 0%, #0C243E 40%, #194F8A 100%)',
    }}>
      <div className="w-full" style={{ maxWidth: 400 }}>
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{
            background: 'rgba(255, 188, 64, 0.15)',
            border: '1px solid rgba(255, 188, 64, 0.2)',
          }}>
            <Gamepad2 size={32} color="#FFBC40" />
          </div>
          <h1 style={{
            fontFamily: "'Luckiest Guy', cursive",
            fontSize: 28,
            color: '#FFBC40',
            letterSpacing: 1,
          }}>
            Startup Ludo
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
            Administration
          </p>
        </div>

        {/* Login Card */}
        <div className="glass-card p-6">
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="label">Email</label>
              <input
                type="email"
                className="input-field"
                placeholder="admin@startup-ludo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="mb-6">
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
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
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
              disabled={loading || !email || !password}
              style={{ height: 44, fontSize: 15 }}
            >
              {loading ? <LoadingSpinner size={20} color="#0C243E" /> : 'Se connecter'}
            </button>
          </form>
          <p style={{ fontSize: 12.5, color: 'var(--color-text-muted)', textAlign: 'center', marginTop: 14 }}>
            Établissement, enseignant, annonceur ou partenaire ?{' '}
            <a href="/inscription" style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
              Créer un compte
            </a>
          </p>
        </div>

        <p className="text-center mt-6" style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
          Acces reserve aux administrateurs
        </p>
      </div>
    </div>
  );
}
