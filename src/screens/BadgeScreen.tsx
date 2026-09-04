import { useMemo, useState } from 'react';
import type { AchievementCategory } from '@/types';
import { useGame } from '@/app/GameProvider';
import { ACHIEVEMENT_CATEGORY_LABELS } from '@/data/achievements';
import { getAchievementViews } from '@/game/achievements';
import { formatFriendlyDate } from '@/utils/date';
import { ProgressBar, SectionTitle, formatNumber } from '@/components/ui';

const CATEGORY_ORDER: AchievementCategory[] = [
  'quests',
  'streak',
  'boss',
  'rarity',
  'gold',
  'chaos',
  'chains',
  'special',
  'secret',
];

/** MÄRKEN - unlocked badges glow, locked ones stay dark, hidden ones stay ???. */
export function BadgeScreen(): JSX.Element {
  const { state } = useGame();
  const views = useMemo(() => getAchievementViews(state.save), [state.save]);
  const [filter, setFilter] = useState<AchievementCategory | 'all'>('all');

  const unlockedCount = views.filter((view) => view.unlocked).length;
  const visible = filter === 'all' ? views : views.filter((view) => view.category === filter);

  return (
    <>
      <section className="section">
        <div className="panel">
          <div className="panel__body">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 8,
              }}
            >
              <span className="display" style={{ fontSize: 15, color: 'var(--text-bright)' }}>
                {unlockedCount} / {views.length}
              </span>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-dim)' }}>
                {Math.round((unlockedCount / views.length) * 100)}% UPPLÅSTA
              </span>
            </div>
            <ProgressBar
              value={unlockedCount}
              max={views.length}
              ariaLabel={`${unlockedCount} av ${views.length} märken upplåsta`}
            />
          </div>
        </div>
      </section>

      <div className="tabs" style={{ flexWrap: 'wrap', gap: 4 }}>
        <button
          type="button"
          className={filter === 'all' ? 'tab tab--active' : 'tab'}
          onClick={() => setFilter('all')}
          style={{ flex: '1 0 60px' }}
        >
          ALLA
        </button>
        {CATEGORY_ORDER.map((category) => (
          <button
            key={category}
            type="button"
            className={filter === category ? 'tab tab--active' : 'tab'}
            onClick={() => setFilter(category)}
            style={{ flex: '1 0 60px' }}
          >
            {ACHIEVEMENT_CATEGORY_LABELS[category]}
          </button>
        ))}
      </div>

      {filter === 'all' ? (
        CATEGORY_ORDER.map((category) => {
          const inCategory = views.filter((view) => view.category === category);
          if (inCategory.length === 0) return null;
          const unlocked = inCategory.filter((view) => view.unlocked).length;

          return (
            <section key={category} className="section">
              <SectionTitle>
                {ACHIEVEMENT_CATEGORY_LABELS[category]} · {unlocked}/{inCategory.length}
              </SectionTitle>
              <BadgeGrid views={inCategory} />
            </section>
          );
        })
      ) : (
        <section className="section">
          <BadgeGrid views={visible} />
        </section>
      )}

      <section className="section">
        <SectionTitle>SENAST UPPLÅSTA</SectionTitle>
        {unlockedCount === 0 ? (
          <p className="notice">Inga märken upplåsta ännu. Ditt första uppdrag ger ett direkt.</p>
        ) : (
          <div className="panel">
            <div className="panel__body">
              {views
                .filter((view) => view.unlocked)
                .sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
                .slice(0, 6)
                .map((view) => (
                  <div className="kv" key={view.id}>
                    <span className="kv__key">
                      {view.icon} {view.displayName}
                    </span>
                    <span className="kv__value">
                      {view.unlockedAt ? formatFriendlyDate(view.unlockedAt) : '-'}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function BadgeGrid({
  views,
}: {
  views: ReturnType<typeof getAchievementViews>;
}): JSX.Element {
  return (
    <div className="badge-grid">
      {views.map((view) => (
        <div
          key={view.id}
          className={view.unlocked ? 'badge badge--unlocked' : 'badge badge--locked'}
          title={view.displayDescription}
          role="group"
          aria-label={`${view.displayName}. ${view.displayDescription}. ${
            view.unlocked ? 'Upplåst.' : 'Låst.'
          }`}
        >
          <span className="badge__icon" aria-hidden="true">
            {view.unlocked || !view.hidden ? view.icon : '❓'}
          </span>
          <span className="badge__name">{view.displayName}</span>
          {view.unlocked && view.unlockedAt && (
            <span className="badge__date">{formatFriendlyDate(view.unlockedAt)}</span>
          )}
          {!view.unlocked && view.rewardGold ? (
            <span className="badge__date">{formatNumber(view.rewardGold)} G</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
