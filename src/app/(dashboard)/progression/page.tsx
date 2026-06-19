'use client';

import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { getProgressionConfig, saveProgressionConfig } from '@/lib/firestore-service';
import type { ProgressionConfig, RankConfig, XPRewardConfig } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import SaveStatusIndicator from '@/components/ui/SaveStatusIndicator';
import { useAutoSave } from '@/hooks/useAutoSave';
import { generateId } from '@/lib/utils';
import toast from 'react-hot-toast';

type Tab = 'ranks' | 'xp-rewards' | 'challenge-xp';

export default function ProgressionPage() {
  const [config, setConfig] = useState<ProgressionConfig>({
    ranks: [],
    xpRewards: [],
    challengeXPRewards: [],
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('ranks');

  const { status: saveStatus } = useAutoSave({
    data: config,
    save: saveProgressionConfig,
    enabled: !loading,
  });

  const load = useCallback(async () => {
    try {
      const data = await getProgressionConfig();
      if (data) setConfig(data);
    } catch { toast.error('Erreur de chargement'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Rank CRUD
  const addRank = () => {
    setConfig((prev) => ({
      ...prev,
      ranks: [...prev.ranks, { id: `rank_${generateId()}`, name: '', minXP: 0, maxXP: 100, icon: 'star-outline', color: '#FFBC40', order: prev.ranks.length + 1 }],
    }));
  };

  const updateRank = (i: number, field: keyof RankConfig, value: unknown) => {
    setConfig((prev) => {
      const ranks = [...prev.ranks];
      ranks[i] = { ...ranks[i], [field]: value } as RankConfig;
      return { ...prev, ranks };
    });
  };

  const removeRank = (i: number) => {
    setConfig((prev) => ({ ...prev, ranks: prev.ranks.filter((_, idx) => idx !== i) }));
  };

  // XP Reward CRUD
  const addXPReward = (isChallenge: boolean) => {
    const key = isChallenge ? 'challengeXPRewards' : 'xpRewards';
    setConfig((prev) => ({
      ...prev,
      [key]: [...prev[key], { action: '', label: '', xp: 10 }],
    }));
  };

  const updateXPReward = (i: number, isChallenge: boolean, field: keyof XPRewardConfig, value: unknown) => {
    const key = isChallenge ? 'challengeXPRewards' : 'xpRewards';
    setConfig((prev) => {
      const rewards = [...prev[key]];
      rewards[i] = { ...rewards[i], [field]: value } as XPRewardConfig;
      return { ...prev, [key]: rewards };
    });
  };

  const removeXPReward = (i: number, isChallenge: boolean) => {
    const key = isChallenge ? 'challengeXPRewards' : 'xpRewards';
    setConfig((prev) => ({ ...prev, [key]: prev[key].filter((_, idx) => idx !== i) }));
  };

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {config.ranks.length} rangs, {config.xpRewards.length} recompenses XP
        </p>
        <SaveStatusIndicator status={saveStatus} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl" style={{ background: 'var(--color-surface-variant)' }}>
        {[
          { key: 'ranks' as Tab, label: `Rangs (${config.ranks.length})` },
          { key: 'xp-rewards' as Tab, label: `XP Jeu (${config.xpRewards.length})` },
          { key: 'challenge-xp' as Tab, label: `XP Challenge (${config.challengeXPRewards.length})` },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2 rounded-lg transition-all"
            style={{
              background: activeTab === tab.key ? 'rgba(255,188,64,0.15)' : 'transparent',
              color: activeTab === tab.key ? '#FFBC40' : 'var(--color-text-muted)',
              border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 400,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="glass-card p-6">
        {/* Ranks */}
        {activeTab === 'ranks' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Definissez les rangs et paliers XP</p>
              <button className="btn-primary flex items-center gap-2" onClick={addRank} style={{ fontSize: 13, padding: '8px 16px' }}>
                <Plus size={14} />
                Ajouter
              </button>
            </div>
            <div className="flex flex-col gap-3">
              {config.ranks.sort((a, b) => a.order - b.order).map((rank, i) => (
                <div key={rank.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${rank.color}20`, fontSize: 14, fontWeight: 700, color: rank.color }}>
                    {rank.order}
                  </div>
                  <input className="input-field flex-1" value={rank.name} onChange={(e) => updateRank(i, 'name', e.target.value)} placeholder="Nom du rang" style={{ fontSize: 13 }} />
                  <div className="flex items-center gap-1">
                    <input type="number" className="input-field" value={rank.minXP} onChange={(e) => updateRank(i, 'minXP', Number(e.target.value))} style={{ width: 80, fontSize: 12 }} />
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>-</span>
                    <input type="number" className="input-field" value={rank.maxXP} onChange={(e) => updateRank(i, 'maxXP', Number(e.target.value))} style={{ width: 80, fontSize: 12 }} />
                    <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>XP</span>
                  </div>
                  <input type="color" value={rank.color} onChange={(e) => updateRank(i, 'color', e.target.value)} style={{ width: 28, height: 28, border: 'none', cursor: 'pointer', borderRadius: 6 }} />
                  <button onClick={() => removeRank(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* XP Rewards */}
        {(activeTab === 'xp-rewards' || activeTab === 'challenge-xp') && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                {activeTab === 'xp-rewards' ? 'XP gagnes pendant les parties' : 'XP gagnes dans les challenges'}
              </p>
              <button className="btn-primary flex items-center gap-2" onClick={() => addXPReward(activeTab === 'challenge-xp')} style={{ fontSize: 13, padding: '8px 16px' }}>
                <Plus size={14} />
                Ajouter
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {(activeTab === 'challenge-xp' ? config.challengeXPRewards : config.xpRewards).map((reward, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-card-border)' }}>
                  <input className="input-field" value={reward.action} onChange={(e) => updateXPReward(i, activeTab === 'challenge-xp', 'action', e.target.value)} placeholder="Action (ex: win_game)" style={{ width: 160, fontSize: 12 }} />
                  <input className="input-field flex-1" value={reward.label} onChange={(e) => updateXPReward(i, activeTab === 'challenge-xp', 'label', e.target.value)} placeholder="Label visible" style={{ fontSize: 12 }} />
                  <div className="flex items-center gap-1">
                    <input type="number" className="input-field" value={reward.xp} onChange={(e) => updateXPReward(i, activeTab === 'challenge-xp', 'xp', Number(e.target.value))} style={{ width: 70, fontSize: 12 }} />
                    <span style={{ fontSize: 10, color: '#FFBC40', fontWeight: 600 }}>XP</span>
                  </div>
                  <button onClick={() => removeXPReward(i, activeTab === 'challenge-xp')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#F44336', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
