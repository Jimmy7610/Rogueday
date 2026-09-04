import { useEffect, useState } from 'react';
import type { RewardSummary } from '@/types';
import { LOOT_BY_ID } from '@/data/loot';
import { Modal } from './Modal';

interface RewardModalProps {
  reward: RewardSummary;
  onContinue: () => void;
  onNewQuest: () => void;
}

/**
 * Completion celebration. A level-up interrupts with its own stronger
 * presentation before the normal summary is shown.
 */
export function RewardModal({ reward, onContinue, onNewQuest }: RewardModalProps): JSX.Element {
  const [levelUpIndex, setLevelUpIndex] = useState(0);
  const showingLevelUp = levelUpIndex < reward.levelUps.length;

  if (showingLevelUp) {
    const levelUp = reward.levelUps[levelUpIndex];
    return (
      <Modal bare dismissible={false} title="Level up">
        <div className="levelup">
          <div className="levelup__flash">LEVEL UP!</div>
          <div className="levelup__level">NIVÅ {levelUp.level}</div>
          <div className="levelup__title-label">NY TITEL</div>
          <div className="levelup__title">{levelUp.title}</div>
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            onClick={() => setLevelUpIndex((index) => index + 1)}
          >
            FORTSÄTT
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      bare
      dismissible={false}
      title="Uppdrag slutfört"
      footer={
        <>
          <button type="button" className="btn btn--primary btn--block" onClick={onNewQuest}>
            NYTT UPPDRAG
          </button>
          <button type="button" className="btn btn--ghost btn--block" onClick={onContinue}>
            FORTSÄTT
          </button>
        </>
      }
    >
      <RewardBody reward={reward} />
    </Modal>
  );
}

function RewardBody({ reward }: { reward: RewardSummary }): JSX.Element {
  return (
    <div className="reward-modal">
      <div className="reward-modal__burst" aria-hidden="true">
        🎉
      </div>
      <h2 className="reward-modal__title">UPPDRAG SLUTFÖRT!</h2>

      <div className="reward-modal__grid">
        <div>
          <div className="reward-modal__figure reward-xp">+{reward.xp}</div>
          <div className="reward-modal__figure-label">XP</div>
        </div>
        <div>
          <div className="reward-modal__figure reward-gold" style={{ animationDelay: '90ms' }}>
            +{reward.gold}
          </div>
          <div className="reward-modal__figure-label">GULD</div>
        </div>
        {reward.bossDamage > 0 && (
          <div>
            <div className="reward-modal__figure reward-dmg" style={{ animationDelay: '180ms' }}>
              -{reward.bossDamage}
            </div>
            <div className="reward-modal__figure-label">BOSS HP</div>
          </div>
        )}
      </div>

      {reward.dailyBonus && (
        <p className="notice notice--warn" style={{ marginBottom: 12 }}>
          ⭐ DAGENS UPPDRAG · bonusbelöning inräknad
        </p>
      )}

      {reward.bossDefeated && (
        <div className="boss-defeated-banner" style={{ marginBottom: 14 }}>
          <div className="boss-defeated-banner__title">BOSS BESEGRAD!</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
            Veckans fiende har fallit. Belöningen har lagts till.
          </p>
        </div>
      )}

      {reward.chainCompleted && (
        <div className="loot-reveal" style={{ borderColor: 'rgba(168,85,247,0.5)' }}>
          <div className="loot-reveal__label" style={{ color: 'var(--purple)' }}>
            ⛓️ KEDJA SLUTFÖRD
          </div>
          <div className="loot-reveal__item" style={{ color: 'var(--purple)' }}>
            {reward.chainCompleted.icon} {reward.chainCompleted.name}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
            +{reward.chainCompleted.bonusXp} XP · +{reward.chainCompleted.bonusGold} guld
          </p>
        </div>
      )}

      {reward.loot.length > 0 && (
        <div className="loot-reveal">
          <div className="loot-reveal__label">🎁 DU HITTADE</div>
          {reward.loot.map((itemId, index) => (
            <div key={`${itemId}-${index}`} className="loot-reveal__item">
              {LOOT_BY_ID[itemId].icon} {LOOT_BY_ID[itemId].name}
            </div>
          ))}
        </div>
      )}

      {reward.achievements.length > 0 && (
        <div className="loot-reveal" style={{ borderColor: 'rgba(217,70,239,0.5)' }}>
          <div className="loot-reveal__label" style={{ color: 'var(--magenta-bright)' }}>
            🏆 NYA MÄRKEN
          </div>
          {reward.achievements.map((achievement) => (
            <div
              key={achievement.id}
              className="loot-reveal__item"
              style={{ color: 'var(--magenta-bright)' }}
            >
              {achievement.icon} {achievement.name}
            </div>
          ))}
        </div>
      )}

      {reward.streak > 1 && (
        <p style={{ fontSize: 12, color: 'var(--amber)', marginTop: 10 }}>
          🔥 {reward.streak} dagar i rad
        </p>
      )}
    </div>
  );
}

/** Small CSS particle burst used behind celebration modals. */
export function ParticleBurst({ count = 14 }: { count?: number }): JSX.Element | null {
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; left: number }[]>(
    [],
  );

  useEffect(() => {
    setParticles(
      Array.from({ length: count }, (_, index) => ({
        id: index,
        x: (Math.random() - 0.5) * 200,
        y: -40 - Math.random() * 110,
        left: 20 + Math.random() * 60,
      })),
    );
  }, [count]);

  if (particles.length === 0) return null;

  return (
    <div className="particles" aria-hidden="true">
      {particles.map((particle) => (
        <span
          key={particle.id}
          className="particle"
          style={
            {
              left: `${particle.left}%`,
              top: '45%',
              '--px': `${particle.x}px`,
              '--py': `${particle.y}px`,
              animationDelay: `${particle.id * 24}ms`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
