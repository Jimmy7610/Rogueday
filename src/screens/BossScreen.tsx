import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/app/GameProvider';
import { getBossById } from '@/data/bosses';
import { LOOT_BY_ID } from '@/data/loot';
import { getBossHpPercent, getDamageToday } from '@/game/boss';
import { formatCountdown, formatDateTime, msUntilWeeklyReset } from '@/utils/date';
import { EmptyState, ProgressBar, SectionTitle, Stat, formatNumber } from '@/components/ui';

/**
 * VECKANS FIENDE - the weekly boss stage, its stats and the defeat history.
 */
export function BossScreen(): JSX.Element {
  const { state } = useGame();
  const { save } = state;
  const boss = save.boss;
  const definition = boss ? getBossById(boss.bossId) : undefined;

  const [countdown, setCountdown] = useState(() => msUntilWeeklyReset());
  const [hitFlash, setHitFlash] = useState(false);
  const [damagePopup, setDamagePopup] = useState<number | null>(null);
  const previousHp = useRef(boss?.currentHp ?? 0);

  useEffect(() => {
    const id = window.setInterval(() => setCountdown(msUntilWeeklyReset()), 30000);
    return () => window.clearInterval(id);
  }, []);

  // Shake + floating number whenever the boss loses HP while this screen is up.
  useEffect(() => {
    const currentHp = boss?.currentHp ?? 0;
    const delta = previousHp.current - currentHp;
    previousHp.current = currentHp;
    if (delta <= 0) return;

    setDamagePopup(delta);
    setHitFlash(true);
    const flashId = window.setTimeout(() => setHitFlash(false), 460);
    const popupId = window.setTimeout(() => setDamagePopup(null), 1200);
    return () => {
      window.clearTimeout(flashId);
      window.clearTimeout(popupId);
    };
  }, [boss?.currentHp]);

  if (!boss || !definition) {
    return <EmptyState icon="😈" text="Ingen boss aktiv just nu. Kom tillbaka om en stund." />;
  }

  const percent = getBossHpPercent(boss);
  const damageToday = getDamageToday(boss);

  return (
    <>
      {boss.defeated && (
        <div className="boss-defeated-banner">
          <div className="boss-defeated-banner__title">SEGER!</div>
          <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 8 }}>
            {definition.name} har fallit. Nästa fiende reser sig vid veckoskiftet.
          </p>
          <p className="mono" style={{ fontSize: 11, color: 'var(--green-bright)', marginTop: 8 }}>
            +{definition.reward.xp} XP · +{definition.reward.gold} GULD ·{' '}
            {LOOT_BY_ID[definition.reward.chest].icon}{' '}
            {LOOT_BY_ID[definition.reward.chest].name}
          </p>
        </div>
      )}

      <div
        className={hitFlash ? 'boss-stage boss-stage--hit' : 'boss-stage'}
        style={{ '--boss-accent': definition.accent } as React.CSSProperties}
      >
        <div className="boss-stage__banner">VECKANS FIENDE</div>

        <div
          className={boss.defeated ? 'boss-portrait boss-portrait--defeated' : 'boss-portrait'}
          role="img"
          aria-label={`${definition.name}, ${definition.subtitle}`}
        >
          <span className="boss-portrait__icon" aria-hidden="true">
            {definition.icon}
          </span>
          {damagePopup !== null && <span className="dmg-float">-{damagePopup}</span>}
        </div>

        <h1 className="boss-stage__name">{definition.name}</h1>
        <p className="boss-stage__subtitle">{definition.subtitle}</p>

        <div className="boss-stage__hp">
          <div className="boss-stage__hp-numbers">
            <span>HP</span>
            <span>
              {formatNumber(boss.currentHp)} / {formatNumber(boss.maxHp)}
            </span>
          </div>
          <ProgressBar
            value={boss.currentHp}
            max={boss.maxHp}
            variant="boss"
            label={`${Math.round(percent * 100)}%`}
            ariaLabel={`Bossens hälsa: ${boss.currentHp} av ${boss.maxHp}`}
          />
        </div>

        <p className="boss-stage__flavour">”{definition.flavourText}”</p>
      </div>

      <section className="section" style={{ marginTop: 18 }}>
        <SectionTitle>STRIDSRAPPORT</SectionTitle>
        <div className="stat-grid">
          <Stat value={formatNumber(damageToday)} label="Skada idag" tone="magenta" />
          <Stat value={formatNumber(boss.totalDamage)} label="Total skada" />
          <Stat value={boss.questsContributed} label="Uppdrag" tone="green" />
          <Stat value={formatCountdown(countdown)} label="Till nästa boss" tone="amber" small />
        </div>
      </section>

      <section className="section">
        <SectionTitle>OM FIENDEN</SectionTitle>
        <div className="panel">
          <div className="panel__body">
            <p style={{ fontSize: 13, marginBottom: 10 }}>{definition.description}</p>
            <div className="kv">
              <span className="kv__key">Svårighet</span>
              <span className="kv__value">{definition.difficulty.toUpperCase()}</span>
            </div>
            <div className="kv">
              <span className="kv__key">Belöning</span>
              <span className="kv__value">
                {definition.reward.xp} XP · {definition.reward.gold} guld
              </span>
            </div>
            <div className="kv">
              <span className="kv__key">Kista</span>
              <span className="kv__value">
                {LOOT_BY_ID[definition.reward.chest].icon}{' '}
                {LOOT_BY_ID[definition.reward.chest].name}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <SectionTitle>BESEGRADE BOSSAR ({save.bossHistory.length})</SectionTitle>
        {save.bossHistory.length === 0 ? (
          <EmptyState icon="⚰️" text="Inga bossar besegrade ännu. Uppdrag skadar veckans fiende." />
        ) : (
          save.bossHistory.map((entry) => {
            const bossDefinition = getBossById(entry.bossId);
            return (
              <div key={`${entry.bossId}-${entry.weekKey}`} className="history-row">
                <span className="history-row__icon" aria-hidden="true">
                  {bossDefinition?.icon ?? '💀'}
                </span>
                <div className="history-row__main">
                  <div className="history-row__title">{entry.bossName}</div>
                  <div className="history-row__meta">
                    <span>{formatDateTime(entry.defeatedAt)}</span>
                    <span>{entry.questsUsed} UPPDRAG</span>
                    <span>{formatNumber(entry.totalDamage)} SKADA</span>
                  </div>
                </div>
                <div className="history-row__rewards">
                  <span className="reward-xp">+{entry.rewardXp} XP</span>
                  <span className="reward-gold">+{entry.rewardGold} G</span>
                  <span style={{ color: 'var(--text-dim)' }}>
                    {LOOT_BY_ID[entry.rewardChest]?.icon ?? '🎁'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
