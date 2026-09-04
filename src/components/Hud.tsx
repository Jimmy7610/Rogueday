import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/app/GameProvider';
import { getLevelInfo } from '@/game/progression';
import { getStreakStatus } from '@/game/streak';
import { MAX_LEVEL } from '@/data/levels';
import { ProgressBar, formatNumber } from './ui';

/**
 * Compact top HUD: brand, hero identity, streak badge and the animated XP bar.
 */
export function Hud(): JSX.Element {
  const { state } = useGame();
  const { save } = state;

  const level = getLevelInfo(save.progression);
  const streak = getStreakStatus(save.streak, save.inventory);
  const completedToday = save.statistics.completionDates[todayKey()] ?? 0;

  // Hold the previous XP for one frame so the bar animates from where it was
  // rather than snapping after a completion.
  const [displayXp, setDisplayXp] = useState(level.xpIntoLevel);
  const previousLevel = useRef(level.level);

  useEffect(() => {
    if (previousLevel.current !== level.level) {
      previousLevel.current = level.level;
      setDisplayXp(0);
      const id = window.setTimeout(() => setDisplayXp(level.xpIntoLevel), 60);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setDisplayXp(level.xpIntoLevel), 40);
    return () => window.clearTimeout(id);
  }, [level.xpIntoLevel, level.level]);

  const atMax = level.level >= MAX_LEVEL;

  return (
    <header className="hud">
      <div className="hud__inner">
        <div className="hud__top">
          <div className="hud__brand">
            <span className="hud__title">ROGUEDAY</span>
            <span className="hud__subtitle">OFFLINE RPG</span>
          </div>

          <div className="hud__identity">
            <span className="hud__name">{save.player.name}</span>
            <span className="hud__rank">{level.title}</span>
            <span
              className={`hud__streak hud__streak--${streak.tone}`}
              title={`Längsta svit: ${save.streak.longest} dagar`}
            >
              <span className="hud__streak-flame" aria-hidden="true">
                {streak.icon}
              </span>
              {streak.label}
            </span>
          </div>
        </div>

        <div className="hud__level">
          <div className="hud__level-row">
            <span className="hud__level-badge">LVL {level.level}</span>
            <span className="hud__level-meta">
              {completedToday} avklarade
              {completedToday === 1 ? '' : ''}
            </span>
            <span className="hud__gold">
              <span aria-hidden="true">🪙</span>
              {formatNumber(save.progression.gold)}
            </span>
          </div>

          <ProgressBar
            value={atMax ? 1 : displayXp}
            max={atMax ? 1 : level.xpForLevel}
            variant="xp"
            ariaLabel={
              atMax
                ? 'Maxnivå uppnådd'
                : `${level.xpIntoLevel} av ${level.xpForLevel} XP till nästa nivå`
            }
          />

          <div className="hud__level-xp" style={{ marginTop: 4 }}>
            {atMax
              ? `MAXNIVÅ · ${formatNumber(level.totalXp)} XP TOTALT`
              : `${formatNumber(level.xpIntoLevel)} / ${formatNumber(level.xpForLevel)} XP`}
          </div>
        </div>
      </div>
    </header>
  );
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-${`${now.getDate()}`.padStart(2, '0')}`;
}
