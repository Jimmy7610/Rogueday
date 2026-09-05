import { useMemo, useState } from 'react';
import type { ActivityPack } from '@/types';
import { useGame } from '@/app/GameProvider';
import { getBossById } from '@/data/bosses';
import { CATEGORY_LABELS } from '@/data/quests';
import { FEATURED_PACK_COUNT, FAVOURITE_PACK_LIMIT } from '@/data/activityPacks';
import {
  favouritesFull,
  getDailyPack,
  dailyPackBonusAvailable,
  isFavouritePack,
  orderedPacks,
  packPool,
  recentPacks,
  type PackContext,
} from '@/game/activityPacks';
import { useSound } from '@/hooks/useSound';
import { Modal } from './Modal';
import { formatNumber } from './ui';

/**
 * VÄLJ ETT LÄGE — the situation picker.
 *
 * The point is to replace four filter decisions with one. Six cards are shown
 * by default, favourites first, and the rest are one tap away. Every card
 * shows a real, live pool size counted from the library, never a stored number.
 */

const ENERGY_LABEL: Record<string, string> = {
  low: 'LÅG',
  medium: 'MELLAN',
  high: 'HÖG',
};

/** "5–15 MIN · LÅG ENERGI" — the one line of metadata a card carries. */
function packSummary(pack: ActivityPack): string {
  const durations = [...pack.allowedDurations].sort((a, b) => a - b);
  const time =
    durations.length === 1
      ? `${durations[0]} MIN`
      : `${durations[0]}–${durations[durations.length - 1]} MIN`;

  const energies = pack.allowedEnergies;
  const energy =
    energies.length === 3
      ? 'ALL ENERGI'
      : energies.length === 1
        ? `${ENERGY_LABEL[energies[0]]} ENERGI`
        : `${ENERGY_LABEL[energies[0]]}–${ENERGY_LABEL[energies[energies.length - 1]]}`;

  return `${time} · ${energy}`;
}

/**
 * What the pack actually restricts you to.
 *
 * `anywhere` in the allow-list means "location is not a constraint", so a pack
 * that allows home + anywhere is really a stay-in pack — saying "var som helst"
 * there would be a lie.
 */
function locationLabel(pack: ActivityPack): string {
  const outside = pack.allowedLocations.includes('outside');
  const home = pack.allowedLocations.includes('home');
  if (outside && home) return 'Var som helst';
  if (outside) return 'Ute';
  if (home) return 'Hemma eller var som helst';
  return 'Var som helst';
}

export function PackPicker(): JSX.Element {
  const { state, dispatch } = useGame();
  const play = useSound();
  const [showAll, setShowAll] = useState(false);

  const save = state.save;

  const context = useMemo<PackContext>(
    () => ({
      boss: save.boss ? getBossById(save.boss.bossId) : undefined,
      secrets: { now: new Date(), save },
      chains: save.questChains,
    }),
    [save],
  );

  const packs = useMemo(
    () => orderedPacks(save.packs, save.progression.level),
    [save.packs, save.progression.level],
  );

  // Pool sizes are counted from the live library, once per render of the list.
  const pools = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const pack of packs) sizes.set(pack.id, packPool(pack, context).length);
    return sizes;
  }, [packs, context]);

  const dailyPack = useMemo(() => getDailyPack(), []);
  const bonusLeft = dailyPackBonusAvailable(save.packs);
  const recent = recentPacks(save.packs).filter((pack) => !save.packs.favourites.includes(pack.id));

  const shown = showAll ? packs : packs.slice(0, FEATURED_PACK_COUNT);

  const open = (packId: string): void => {
    play('click');
    dispatch({ type: 'OPEN_PACK', packId });
  };

  return (
    <section className="packs" aria-labelledby="packs-heading">
      <div className="packs__head">
        <h2 className="packs__title" id="packs-heading">
          VÄLJ ETT LÄGE
        </h2>
        <p className="packs__lead">Beskriv läget du är i — spelet sköter filtren.</p>
      </div>

      {/* DAGENS LÄGE: one pack per local day, with a small first-completion bonus. */}
      <button
        type="button"
        className="pack-daily"
        style={{ '--pack-accent': dailyPack.accent } as React.CSSProperties}
        aria-label={`Öppna dagens läge: ${dailyPack.name}`}
        onClick={() => open(dailyPack.id)}
      >
        <span className="pack-daily__label">DAGENS LÄGE</span>
        <span className="pack-daily__name">
          <span aria-hidden="true">{dailyPack.icon}</span> {dailyPack.name}
        </span>
        {bonusLeft ? (
          <span className="pack-daily__bonus">+10% GULD på första uppdraget</span>
        ) : (
          <span className="pack-daily__bonus pack-daily__bonus--used">Bonus uttagen idag</span>
        )}
      </button>

      <button
        type="button"
        className="btn btn--primary btn--block pack-surprise"
        onClick={() => {
          play('accept');
          dispatch({ type: 'SURPRISE_ME' });
        }}
      >
        🎲 ÖVERRASKA MIG
      </button>

      {recent.length > 0 && (
        <div className="packs__recent">
          <span className="packs__recent-label">SENAST ANVÄNDA</span>
          {recent.map((pack) => (
            <button
              key={pack.id}
              type="button"
              className="packs__recent-chip"
              onClick={() => open(pack.id)}
            >
              <span aria-hidden="true">{pack.icon}</span> {pack.name}
            </button>
          ))}
        </div>
      )}

      <ul className="pack-grid">
        {shown.map((pack) => {
          const size = pools.get(pack.id) ?? 0;
          const favourite = isFavouritePack(save.packs, pack.id);
          return (
            <li key={pack.id}>
              <div
                className={`pack-card${favourite ? ' pack-card--favourite' : ''}`}
                style={{ '--pack-accent': pack.accent } as React.CSSProperties}
              >
                <button
                  type="button"
                  className="pack-card__main"
                  aria-label={`Öppna läget ${pack.name}`}
                  onClick={() => open(pack.id)}
                >
                  <span className="pack-card__name">
                    <span aria-hidden="true">{pack.icon}</span> {pack.name}
                  </span>
                  <span className="pack-card__desc">{pack.shortDescription}</span>
                  <span className="pack-card__meta">{packSummary(pack)}</span>
                  <span className="pack-card__count">
                    {size === 0 ? 'Inga uppdrag just nu' : `${formatNumber(size)} möjliga uppdrag`}
                  </span>
                </button>
                <button
                  type="button"
                  className="pack-card__fav"
                  aria-pressed={favourite}
                  aria-label={
                    favourite
                      ? `Ta bort ${pack.name} från favoriter`
                      : `Spara ${pack.name} som favorit`
                  }
                  disabled={!favourite && favouritesFull(save.packs)}
                  title={
                    !favourite && favouritesFull(save.packs)
                      ? `Du kan spara högst ${FAVOURITE_PACK_LIMIT} favoritlägen`
                      : undefined
                  }
                  onClick={() => {
                    play('click');
                    dispatch({ type: 'TOGGLE_FAVOURITE_PACK', packId: pack.id });
                  }}
                >
                  {favourite ? '★' : '☆'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {packs.length > FEATURED_PACK_COUNT && (
        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={() => {
            play('click');
            setShowAll((open) => !open);
          }}
        >
          {showAll ? 'VISA FÄRRE LÄGEN' : `VISA ALLA LÄGEN (${packs.length})`}
        </button>
      )}
    </section>
  );
}

/**
 * The pack screen.
 *
 * Choosing a pack never assigns a quest by itself. This is the step in
 * between: what the pack is, how much it can offer, and then the same
 * KASTA TÄRNINGEN that the manual path uses.
 */
export function PackModal(): JSX.Element | null {
  const { state, dispatch } = useGame();
  const play = useSound();

  const packs = orderedPacks(state.save.packs, state.save.progression.level);
  const pack = packs.find((entry) => entry.id === state.activePackId);
  if (!pack) return null;

  const save = state.save;
  const boss = save.boss ? getBossById(save.boss.bossId) : undefined;
  const pool = packPool(pack, {
    boss,
    secrets: { now: new Date(), save },
    chains: save.questChains,
  });

  const isDaily = getDailyPack().id === pack.id;
  const bonusLeft = dailyPackBonusAvailable(save.packs);

  return (
    <Modal
      title={pack.name}
      onClose={() => dispatch({ type: 'CLOSE_PACK' })}
      footer={
        <>
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            disabled={pool.length === 0}
            onClick={() => {
              play('accept');
              dispatch({ type: 'ROLL_PACK', packId: pack.id });
            }}
          >
            KASTA TÄRNINGEN 🎲
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={() => dispatch({ type: 'CLOSE_PACK' })}
          >
            AVBRYT
          </button>
        </>
      }
    >
      <div className="pack-detail" style={{ '--pack-accent': pack.accent } as React.CSSProperties}>
        <div className="pack-detail__icon" aria-hidden="true">
          {pack.icon}
        </div>
        <p className="pack-detail__flavour">{pack.flavourText}</p>

        <div className="pack-detail__count">
          {pool.length === 0
            ? 'Inga uppdrag matchar just nu'
            : `${formatNumber(pool.length)} uppdrag matchar`}
        </div>

        <dl className="pack-detail__facts">
          <div>
            <dt>TID</dt>
            <dd>{[...pack.allowedDurations].sort((a, b) => a - b).join(' / ')} min</dd>
          </div>
          <div>
            <dt>ENERGI</dt>
            <dd>{pack.allowedEnergies.map((level) => ENERGY_LABEL[level]).join(' / ')}</dd>
          </div>
          <div>
            <dt>PLATS</dt>
            <dd>{locationLabel(pack)}</dd>
          </div>
        </dl>

        {pack.dynamic === 'boss-weakness' && boss && (
          <p className="notice notice--ok">
            🔥 BRA MOT VECKANS BOSS — {boss.name} är svag mot{' '}
            {boss.weaknessCategories.map((category) => CATEGORY_LABELS[category]).join(', ')}.
          </p>
        )}
        {pack.dynamic === 'boss-weakness' && !boss && (
          <p className="notice">Ingen boss den här veckan ännu.</p>
        )}

        {isDaily && bonusLeft && (
          <p className="notice notice--ok">⭐ DAGENS LÄGE — +10% guld på dagens första uppdrag.</p>
        )}

        <p className="pack-detail__note">
          Du får fortfarande tre val: TRYGGT, VILT och FARLIGT.
        </p>
      </div>
    </Modal>
  );
}
