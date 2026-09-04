import { useGame } from '@/app/GameProvider';
import { getBossById } from '@/data/bosses';
import { CATEGORY_ICONS, CATEGORY_LABELS } from '@/data/quests';
import { formatNumber } from './ui';

interface BossStripProps {
  /** Switches the app to the boss screen. */
  onOpen: () => void;
}

/**
 * Compact weekly-boss readout for the quest hub: who the enemy is, how much
 * is left, and which quest categories hit it hardest.
 */
export function BossStrip({ onOpen }: BossStripProps): JSX.Element | null {
  const { state } = useGame();
  const boss = state.save.boss;
  const definition = boss ? getBossById(boss.bossId) : undefined;

  if (!boss || !definition) return null;

  const percent = boss.maxHp > 0 ? Math.max(0, (boss.currentHp / boss.maxHp) * 100) : 0;

  return (
    <button
      type="button"
      className={boss.defeated ? 'boss-strip boss-strip--defeated' : 'boss-strip'}
      style={{ '--boss-accent': definition.accent } as React.CSSProperties}
      onClick={onOpen}
      aria-label={`Veckans boss: ${definition.name}, ${boss.currentHp} av ${boss.maxHp} HP. Öppna bossvyn.`}
    >
      <span className="boss-strip__icon" aria-hidden="true">
        {definition.icon}
      </span>

      <span className="boss-strip__body">
        <span className="boss-strip__row">
          <span className="boss-strip__name">{definition.name}</span>
          <span className="boss-strip__hp">
            {boss.defeated
              ? 'BESEGRAD'
              : `${formatNumber(boss.currentHp)} / ${formatNumber(boss.maxHp)}`}
          </span>
        </span>

        <span className="bar bar--slim" aria-hidden="true">
          <span className="bar__fill" style={{ width: `${percent}%` }} />
        </span>

        {!boss.defeated && definition.weaknessCategories.length > 0 && (
          <span className="boss-strip__weakness">
            <span className="boss-strip__weakness-label">SVAG:</span>
            {definition.weaknessCategories.slice(0, 3).map((category) => (
              <span key={category} className="boss-strip__tag">
                {CATEGORY_ICONS[category]} {CATEGORY_LABELS[category]}
              </span>
            ))}
          </span>
        )}
      </span>

      <span className="boss-strip__chevron" aria-hidden="true">
        ›
      </span>
    </button>
  );
}
