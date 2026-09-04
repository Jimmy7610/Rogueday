import { useEffect, useState } from 'react';
import type { BossHitSummary, RewardSummary } from '@/types';
import { LOOT_BY_ID } from '@/data/loot';
import { useGame } from '@/app/GameProvider';
import { Modal } from './Modal';
import { formatNumber } from './ui';

interface RewardModalProps {
  reward: RewardSummary;
  onContinue: () => void;
  onNewQuest: () => void;
}

/**
 * Completion celebration.
 *
 * A level-up interrupts with its own stronger presentation first, then the
 * itemised breakdown explains every point of XP and gold the player just
 * gained, so the HUD never moves for an unexplained reason.
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

      {reward.timeBonus && (
        <p className="notice notice--ok reward-modal__timebonus">
          ⏱ KLARAT I TID — tidsbonus inräknad
        </p>
      )}

      {reward.boss && <BossHit boss={reward.boss} />}

      {/* --- the itemised breakdown --- */}
      <div className="breakdown">
        {reward.lines.map((line) => (
          <div key={line.id} className={`breakdown__line breakdown__line--${line.tone ?? 'default'}`}>
            <div className="breakdown__head">
              <span className="breakdown__label">{line.label}</span>
              <span className="breakdown__values">
                {line.xp > 0 && <span className="reward-xp">+{formatNumber(line.xp)} XP</span>}
                {line.gold > 0 && (
                  <span className="reward-gold">+{formatNumber(line.gold)} G</span>
                )}
              </span>
            </div>
            {line.detail && <div className="breakdown__detail">{line.detail}</div>}
            {line.loot && line.loot.length > 0 && (
              <div className="breakdown__detail">
                {line.loot.map((itemId) => `${LOOT_BY_ID[itemId]?.icon ?? '🎁'} ${LOOT_BY_ID[itemId]?.name ?? ''}`).join(' · ')}
              </div>
            )}
          </div>
        ))}

        <div className="breakdown__total">
          <span className="breakdown__label">TOTALT</span>
          <span className="breakdown__values">
            <span className="reward-xp">+{formatNumber(reward.totalXp)} XP</span>
            <span className="reward-gold">+{formatNumber(reward.totalGold)} GULD</span>
          </span>
        </div>
      </div>

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

      <div className="reward-modal__footnotes">
        {reward.streakSaved && <p className="notice notice--ok">🛡️ SVIT RÄDDAD av din svitsköld</p>}
        {reward.streak > 1 && (
          <p style={{ fontSize: 12, color: 'var(--amber)' }}>🔥 {reward.streak} dagar i rad</p>
        )}
        {reward.perkChoicesUnlocked.length > 0 && (
          <p className="notice notice--warn">
            ⚡ NY FÖRMÅGA ATT VÄLJA — nivå {reward.perkChoicesUnlocked.join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}

/** The "you just hit the boss" readout, with its HP transition. */
function BossHit({ boss }: { boss: BossHitSummary }): JSX.Element | null {
  const { state } = useGame();
  const animate = state.save.settings.animations && !state.save.settings.reducedMotion;
  const [hpShown, setHpShown] = useState(animate ? boss.hpBefore : boss.hpAfter);

  useEffect(() => {
    if (!animate) return;
    const id = window.setTimeout(() => setHpShown(boss.hpAfter), 260);
    return () => window.clearTimeout(id);
  }, [animate, boss.hpAfter]);

  if (boss.damage <= 0) return null;

  const percent = boss.maxHp > 0 ? Math.max(0, (hpShown / boss.maxHp) * 100) : 0;

  return (
    <div
      className={boss.weaknessHit ? 'boss-hit boss-hit--weak' : 'boss-hit'}
      style={{ '--boss-accent': boss.accent } as React.CSSProperties}
    >
      <div className="boss-hit__head">
        <span className="boss-hit__icon" aria-hidden="true">
          {boss.icon}
        </span>
        <span className="boss-hit__name">⚔ {boss.bossName}</span>
      </div>

      {boss.weaknessHit && (
        <div className="boss-hit__weakness">
          SVAGHET TRÄFFAD! +{Math.round((boss.weaknessMultiplier - 1) * 100)}%
        </div>
      )}
      {boss.resisted && <div className="boss-hit__resist">MOTSTÅND — dämpad träff</div>}

      <div className="boss-hit__numbers">
        <span className="boss-hit__hp">{formatNumber(boss.hpBefore)} HP</span>
        <span className="boss-hit__arrow" aria-hidden="true">
          ↓
        </span>
        <span className="boss-hit__hp boss-hit__hp--after">{formatNumber(boss.hpAfter)} HP</span>
      </div>

      <div className="bar bar--boss boss-hit__bar">
        <div className="bar__fill" style={{ width: `${percent}%` }} />
        <span className="bar__label">−{formatNumber(boss.damage)} HP</span>
      </div>

      {boss.phasesTriggered.map((phase) => (
        <p key={phase.threshold} className="boss-hit__phase">
          {phase.message}
        </p>
      ))}

      {boss.defeated && <div className="boss-hit__defeated">BOSSEN ÄR BESEGRAD!</div>}
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
