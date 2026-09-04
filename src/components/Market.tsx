import { useMemo } from 'react';
import { useGame } from '@/app/GameProvider';
import { LOOT_BY_ID } from '@/data/loot';
import { getMarketView } from '@/game/market';
import { getEffects } from '@/game/perks';
import { useSound } from '@/hooks/useSound';
import { formatNumber } from './ui';

/**
 * MARKNAD - the daily shop.
 *
 * Stock is derived from the local date, so it is identical on every load that
 * day and restocks at midnight. Buying is never required to progress.
 */
export function Market(): JSX.Element {
  const { state, dispatch } = useGame();
  const play = useSound();

  const { offers } = useMemo(
    () => getMarketView(state.save),
    // Re-derive when gold, purchases or perks change.
    [state.save.progression.gold, state.save.market, state.save.perks],
  );

  const effects = getEffects(state.save);
  const gold = state.save.progression.gold;

  return (
    <section className="section">
      <div className="market__head">
        <div>
          <h2 className="section__title" style={{ margin: 0 }}>
            DAGENS MARKNAD
          </h2>
          <p className="market__sub">Nytt utbud varje dag vid midnatt.</p>
        </div>
        <span className="market__purse">
          <span aria-hidden="true">🪙</span> {formatNumber(gold)}
        </span>
      </div>

      {effects.merchantDiscount > 0 && (
        <p className="notice notice--ok market__discount">
          🏷️ Dina förmågor ger {Math.round(effects.merchantDiscount * 100)}% rabatt.
        </p>
      )}

      {state.marketMessage && (
        <p
          className={
            state.marketMessage.ok ? 'notice notice--ok' : 'notice notice--warn'
          }
          role="status"
          style={{ marginBottom: 10 }}
        >
          {state.marketMessage.text}
        </p>
      )}

      <ul className="market__list">
        {offers.map((offer) => {
          const item = LOOT_BY_ID[offer.itemId];
          const disabled = offer.soldOut || !offer.affordable;

          return (
            <li
              key={offer.offerId}
              className={
                offer.featured ? 'market-item market-item--featured' : 'market-item'
              }
              data-rarity={item.rarity}
            >
              <span className="market-item__icon" aria-hidden="true">
                {item.icon}
              </span>

              <div className="market-item__body">
                <div className="market-item__name">
                  {item.name}
                  {offer.featured && <span className="market-item__tag">DAGENS FYND</span>}
                </div>
                <p className="market-item__desc">{item.description}</p>
                <div className="market-item__meta">
                  {offer.discountPercent > 0 && (
                    <span className="market-item__discount">−{offer.discountPercent}%</span>
                  )}
                  <span>
                    {offer.soldOut ? 'SLUTSÅLD' : `${offer.remaining} kvar`}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className={
                  offer.soldOut
                    ? 'btn btn--sm btn--ghost market-item__buy'
                    : 'btn btn--sm market-item__buy'
                }
                disabled={disabled}
                aria-label={
                  offer.soldOut
                    ? `${item.name} är slutsåld`
                    : `Köp ${item.name} för ${offer.finalPrice} guld`
                }
                onClick={() => {
                  play('loot');
                  dispatch({ type: 'BUY_OFFER', offerId: offer.offerId });
                }}
              >
                {offer.soldOut ? 'SLUTSÅLD' : `${formatNumber(offer.finalPrice)} 🪙`}
              </button>
            </li>
          );
        })}
      </ul>

      <p className="market__footnote">
        Guld är enbart spelvaluta. Inget här kostar riktiga pengar.
      </p>
    </section>
  );
}
