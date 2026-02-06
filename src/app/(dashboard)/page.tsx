'use client';

import { useEffect, useState } from 'react';
import { Users, Gamepad2, Trophy, BookOpen, TrendingUp, Activity } from 'lucide-react';
import StatCard from '@/components/ui/StatCard';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { getDashboardStats } from '@/lib/firestore-service';
import type { DashboardStats } from '@/types';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      {/* Welcome banner */}
      <div className="glass-card p-6 mb-8" style={{
        background: 'linear-gradient(135deg, rgba(255,188,64,0.08) 0%, rgba(25,79,138,0.15) 100%)',
        border: '1px solid rgba(255,188,64,0.15)',
      }}>
        <h2 style={{ fontFamily: "'Luckiest Guy', cursive", fontSize: 22, color: '#FFBC40', marginBottom: 4 }}>
          Bienvenue !
        </h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
          Gerez le contenu du jeu Startup Ludo depuis ce dashboard.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Utilisateurs"
          value={stats?.totalUsers ?? 0}
          icon={<Users size={20} />}
          color="#4A90E2"
        />
        <StatCard
          label="Parties jouees"
          value={stats?.totalGames ?? 0}
          icon={<Gamepad2 size={20} />}
          color="#FFBC40"
        />
        <StatCard
          label="Inscriptions Challenges"
          value={stats?.totalChallengeEnrollments ?? 0}
          icon={<Trophy size={20} />}
          color="#9B59B6"
        />
        <StatCard
          label="Editions"
          value={stats?.editionsCount ?? 0}
          icon={<BookOpen size={20} />}
          color="#50C878"
        />
      </div>

      {/* Quick links */}
      <h3 style={{ fontFamily: "'Luckiest Guy', cursive", fontSize: 18, color: '#FFFFFF', marginBottom: 16 }}>
        Acces rapide
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { title: 'Editions', desc: 'Quiz, duels, evenements par edition', href: '/editions', icon: <BookOpen size={24} />, color: '#50C878' },
          { title: 'Challenges', desc: 'Programmes YEAH, niveaux, livrables', href: '/challenges', icon: <Trophy size={24} />, color: '#9B59B6' },
          { title: 'Ideation', desc: 'Cartes cibles, missions, secteurs', href: '/ideation', icon: <Activity size={24} />, color: '#FFB347' },
          { title: 'Achievements', desc: 'Badges et recompenses', href: '/achievements', icon: <Trophy size={24} />, color: '#4A90E2' },
          { title: 'Progression', desc: 'Rangs, XP, configuration', href: '/progression', icon: <TrendingUp size={24} />, color: '#FF6B6B' },
          { title: 'Projets par Defaut', desc: 'Startups fictives par edition', href: '/default-projects', icon: <Gamepad2 size={24} />, color: '#FFBC40' },
        ].map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="glass-card p-5 flex items-start gap-4 transition-all duration-200"
            style={{ textDecoration: 'none' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${item.color}40`; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'translateY(0)'; }}
          >
            <div className="rounded-lg p-2.5" style={{ background: `${item.color}15` }}>
              <span style={{ color: item.color }}>{item.icon}</span>
            </div>
            <div>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF', marginBottom: 4 }}>{item.title}</h4>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{item.desc}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
