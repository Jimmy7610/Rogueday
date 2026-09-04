import { useMemo, useState } from 'react';
import type { HistoryEntry, QuestCategory } from '@/types';
import { useGame } from '@/app/GameProvider';
import { CATEGORY_ICONS, CATEGORY_LABELS } from '@/data/quests';
import { RARITY_LABELS } from '@/game/rarity';
import { daysBetween, formatDateTime, formatMinutes, toLocalDateKey } from '@/utils/date';
import { DIFFICULTY_LABELS, EmptyState, SectionTitle, Stat, formatNumber } from '@/components/ui';

type RangeFilter = 'all' | 'today' | '7' | '30';

const RANGE_LABELS: Record<RangeFilter, string> = {
  all: 'ALLA',
  today: 'IDAG',
  '7': '7 DAGAR',
  '30': '30 DAGAR',
};

/**
 * Explicit order. Object.keys would hoist the integer-like keys ('7', '30')
 * ahead of 'all' and 'today', putting the tabs in the wrong order.
 */
const RANGE_ORDER: RangeFilter[] = ['all', 'today', '7', '30'];

/**
 * Full quest history, read straight from the persisted save. Filters are UI
 * state only - the records themselves always come from storage.
 */
export function HistoryScreen(): JSX.Element {
  const { state } = useGame();
  const { save } = state;

  const [range, setRange] = useState<RangeFilter>('all');
  const [category, setCategory] = useState<QuestCategory | 'all'>('all');

  const filtered = useMemo(() => filterHistory(save.history, range, category), [
    save.history,
    range,
    category,
  ]);

  const usedCategories = useMemo(() => {
    const set = new Set<QuestCategory>();
    save.history.forEach((entry) => set.add(entry.category));
    return Array.from(set).sort((a, b) => CATEGORY_LABELS[a].localeCompare(CATEGORY_LABELS[b], 'sv'));
  }, [save.history]);

  const stats = save.statistics;

  return (
    <>
      <section className="section">
        <SectionTitle>STATISTIK</SectionTitle>
        <div className="stat-grid">
          <Stat value={formatNumber(stats.questsCompleted)} label="Avklarade" />
          <Stat
            value={formatNumber(stats.totalBossDamage)}
            label="Total skada"
            tone="magenta"
          />
          <Stat value={formatMinutes(stats.totalMinutes)} label="Tid ägnad" tone="green" />
        </div>

        <div className="stat-grid" style={{ marginTop: 9 }}>
          <Stat value={formatNumber(stats.totalXpEarned)} label="Total XP" />
          <Stat value={formatNumber(stats.totalGoldEarned)} label="Guld tjänat" tone="amber" />
          <Stat value={save.streak.longest} label="Längsta svit" tone="amber" />
        </div>

        <div className="stat-grid" style={{ marginTop: 9 }}>
          <Stat value={stats.bossesDefeated} label="Bossar" tone="magenta" />
          <Stat value={stats.legendaryQuests} label="Legendariska" tone="amber" />
          <Stat value={stats.chaosQuests} label="Kaosuppdrag" tone="magenta" />
        </div>

        <div className="panel" style={{ marginTop: 12 }}>
          <div className="panel__body">
            <div className="kv">
              <span className="kv__key">Snittlängd</span>
              <span className="kv__value">
                {stats.questsCompleted > 0
                  ? `${Math.round(stats.totalMinutes / stats.questsCompleted)} min`
                  : '-'}
              </span>
            </div>
            <div className="kv">
              <span className="kv__key">Vanligaste kategori</span>
              <span className="kv__value">{mostPlayedCategory(stats.questsByCategory)}</span>
            </div>
            <div className="kv">
              <span className="kv__key">Kedjor klara</span>
              <span className="kv__value">{stats.chainsCompleted}</span>
            </div>
            <div className="kv">
              <span className="kv__key">Dagliga uppdrag</span>
              <span className="kv__value">{stats.dailyQuestsCompleted}</span>
            </div>
            <div className="kv">
              <span className="kv__key">Föremål hittade</span>
              <span className="kv__value">{stats.lootFound}</span>
            </div>
            <div className="kv">
              <span className="kv__key">Omkastningar</span>
              <span className="kv__value">{stats.rerollsUsed}</span>
            </div>
            <div className="kv">
              <span className="kv__key">Övergivna uppdrag</span>
              <span className="kv__value">{stats.questsAbandoned}</span>
            </div>
            <div className="kv">
              <span className="kv__key">Aktiva dagar</span>
              <span className="kv__value">{Object.keys(stats.completionDates).length}</span>
            </div>
          </div>
        </div>

        <RarityBreakdown stats={stats} />
      </section>

      <section className="section">
        <SectionTitle>FULLGJORDA UPPDRAG ({save.history.length})</SectionTitle>

        <div className="tabs" role="tablist" aria-label="Tidsfilter">
          {RANGE_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={range === key}
              className={range === key ? 'tab tab--active' : 'tab'}
              onClick={() => setRange(key)}
            >
              {RANGE_LABELS[key]}
            </button>
          ))}
        </div>

        {usedCategories.length > 1 && (
          <select
            className="select"
            value={category}
            onChange={(event) => setCategory(event.target.value as QuestCategory | 'all')}
            aria-label="Filtrera på kategori"
            style={{ marginBottom: 12 }}
          >
            <option value="all">ALLA KATEGORIER</option>
            {usedCategories.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        )}

        {filtered.length === 0 ? (
          <EmptyState
            icon="📜"
            text={
              save.history.length === 0
                ? 'Ingen historik ännu. Slutför ditt första uppdrag.'
                : 'Inga uppdrag matchar filtret.'
            }
          />
        ) : (
          filtered.map((entry) => <HistoryRow key={entry.entryId} entry={entry} />)
        )}
      </section>
    </>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }): JSX.Element {
  return (
    <div className="history-row" data-rarity={entry.rarity}>
      <span className="history-row__icon" aria-hidden="true">
        {CATEGORY_ICONS[entry.category]}
      </span>
      <div className="history-row__main">
        <div className="history-row__title">
          {entry.isDaily && '⭐ '}
          {entry.title}
        </div>
        <div className="history-row__meta">
          <span>{CATEGORY_LABELS[entry.category]}</span>
          <span className={`rarity-${entry.rarity}`}>{RARITY_LABELS[entry.rarity]}</span>
          <span>{DIFFICULTY_LABELS[entry.difficulty]}</span>
          <span>{entry.duration} MIN</span>
          {entry.mode === 'chaos' && <span style={{ color: 'var(--magenta)' }}>KAOS</span>}
        </div>
        <div className="history-row__meta" style={{ marginTop: 2 }}>
          <span>{formatDateTime(entry.completedAt)}</span>
        </div>
      </div>
      <div className="history-row__rewards">
        <span className="reward-xp">+{entry.xpEarned} XP</span>
        <span className="reward-gold">+{entry.goldEarned} G</span>
        {entry.bossDamage > 0 && <span className="reward-dmg">-{entry.bossDamage}</span>}
      </div>
    </div>
  );
}

function RarityBreakdown({
  stats,
}: {
  stats: { questsByRarity: Record<string, number> };
}): JSX.Element | null {
  const entries = Object.entries(stats.questsByRarity).filter(([, count]) => count > 0);
  if (entries.length === 0) return null;

  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="panel" style={{ marginTop: 12 }}>
      <div className="panel__header">
        <span className="panel__heading">SÄLLSYNTHET</span>
      </div>
      <div className="panel__body">
        {entries.map(([rarity, count]) => (
          <div key={rarity} style={{ marginBottom: 8 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 10,
                marginBottom: 3,
              }}
              className="mono"
            >
              <span className={`rarity-${rarity}`}>{RARITY_LABELS[rarity as never]}</span>
              <span style={{ color: 'var(--text-dim)' }}>{count}</span>
            </div>
            <div className="bar" style={{ height: 5 }}>
              <div
                className="bar__fill"
                style={{
                  width: `${(count / total) * 100}%`,
                  background: `var(--rarity-${rarity})`,
                  boxShadow: 'none',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function filterHistory(
  history: HistoryEntry[],
  range: RangeFilter,
  category: QuestCategory | 'all',
  now: Date = new Date(),
): HistoryEntry[] {
  const today = toLocalDateKey(now);

  return history.filter((entry) => {
    if (category !== 'all' && entry.category !== category) return false;
    if (range === 'all') return true;
    if (range === 'today') return entry.completedDate === today;

    const days = daysBetween(entry.completedDate, today);
    if (range === '7') return days >= 0 && days < 7;
    if (range === '30') return days >= 0 && days < 30;
    return true;
  });
}

function mostPlayedCategory(byCategory: Record<string, number>): string {
  const entries = Object.entries(byCategory);
  if (entries.length === 0) return '-';
  const [category] = entries.reduce((best, current) => (current[1] > best[1] ? current : best));
  return CATEGORY_LABELS[category as QuestCategory] ?? category;
}
