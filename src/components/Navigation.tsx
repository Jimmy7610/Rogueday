import { useRef } from 'react';
import type { ScreenId } from '@/types';

interface NavigationProps {
  active: ScreenId;
  onChange: (screen: ScreenId) => void;
  /** Number of unseen unlocked badges, shown as a dot on MÄRKEN. */
  badgeCount?: number;
  /** Shown on BOSS when the weekly boss is already defeated. */
  bossDefeated?: boolean;
}

const ITEMS: { id: ScreenId; icon: string; label: string }[] = [
  { id: 'quests', icon: '⚔', label: 'Uppdrag' },
  { id: 'boss', icon: '😈', label: 'Boss' },
  { id: 'history', icon: '📜', label: 'Historik' },
  { id: 'badges', icon: '🏆', label: 'Märken' },
  { id: 'data', icon: '⚙', label: 'Data' },
];

/**
 * Bottom navigation. Implemented as a tablist so arrow keys move between the
 * screens, matching what keyboard users expect from a tabbed interface.
 */
export function Navigation({
  active,
  onChange,
  badgeCount = 0,
  bossDefeated = false,
}: NavigationProps): JSX.Element {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: React.KeyboardEvent, index: number): void => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % ITEMS.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + ITEMS.length) % ITEMS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = ITEMS.length - 1;

    if (nextIndex === null) return;
    event.preventDefault();
    onChange(ITEMS[nextIndex].id);
    refs.current[nextIndex]?.focus();
  };

  return (
    <nav className="nav" aria-label="Huvudnavigering">
      <div className="nav__inner" role="tablist" aria-label="Skärmar">
        {ITEMS.map((item, index) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`nav-${item.id}`}
              aria-selected={isActive}
              aria-controls={`screen-${item.id}`}
              tabIndex={isActive ? 0 : -1}
              ref={(node) => {
                refs.current[index] = node;
              }}
              className={isActive ? 'nav__button nav__button--active' : 'nav__button'}
              onClick={() => onChange(item.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <span className="nav__icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="nav__label">{item.label}</span>
              {item.id === 'badges' && badgeCount > 0 && (
                <span className="nav__badge" aria-label={`${badgeCount} nya märken`}>
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              )}
              {item.id === 'boss' && bossDefeated && (
                <span className="nav__badge" aria-label="Boss besegrad" style={{ background: 'var(--green)' }}>
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
