import type { EventResult } from '@/types';
import { LOOT_BY_ID } from '@/data/loot';
import { getEventDefinition } from '@/game/events';
import { Modal } from './Modal';

interface EventResultModalProps {
  result: EventResult;
  onClose: () => void;
}

/**
 * What the event actually did.
 *
 * An event no longer vanishes the moment a choice is made: the player sees the
 * outcome - gold, XP, items, and any new bonus objective - before it closes.
 */
export function EventResultModal({ result, onClose }: EventResultModalProps): JSX.Element {
  const definition = getEventDefinition(result.eventId);

  const hasNumbers = result.goldDelta !== 0 || result.xpDelta !== 0;

  return (
    <Modal
      bare
      dismissible={false}
      title={result.title}
      footer={
        <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
          FORTSÄTT
        </button>
      }
    >
      <div className="event-modal">
        <div className="event-modal__icon" aria-hidden="true">
          {definition?.icon ?? '✨'}
        </div>
        <h2 className="event-modal__title">{result.title}</h2>

        <div className="event-result__messages">
          {result.messages.map((message, index) => (
            <p key={index} className="event-result__line">
              {message}
            </p>
          ))}
        </div>

        {hasNumbers && (
          <div className="event-result__figures">
            {result.xpDelta !== 0 && (
              <div>
                <div className="reward-modal__figure reward-xp">
                  {result.xpDelta > 0 ? '+' : ''}
                  {result.xpDelta}
                </div>
                <div className="reward-modal__figure-label">XP</div>
              </div>
            )}
            {result.goldDelta !== 0 && (
              <div>
                <div
                  className={
                    result.goldDelta > 0
                      ? 'reward-modal__figure reward-gold'
                      : 'reward-modal__figure reward-dmg'
                  }
                >
                  {result.goldDelta > 0 ? '+' : ''}
                  {result.goldDelta}
                </div>
                <div className="reward-modal__figure-label">GULD</div>
              </div>
            )}
          </div>
        )}

        {result.itemsGained.length > 0 && (
          <div className="loot-reveal">
            <div className="loot-reveal__label">🎁 DU FICK</div>
            {result.itemsGained.map((itemId, index) => (
              <div key={`${itemId}-${index}`} className="loot-reveal__item">
                {LOOT_BY_ID[itemId]?.icon} {LOOT_BY_ID[itemId]?.name}
              </div>
            ))}
          </div>
        )}

        {result.followUp && (
          <div className="loot-reveal" style={{ borderColor: 'rgba(217,70,239,0.5)' }}>
            <div className="loot-reveal__label" style={{ color: 'var(--magenta-bright)' }}>
              🎲 BONUSMÅL
            </div>
            <div className="loot-reveal__item" style={{ color: 'var(--magenta-bright)' }}>
              {result.followUp.title}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
              {result.followUp.description}
            </p>
            <p className="mono" style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              Klarar du det: +{result.followUp.rewardXp} XP · +{result.followUp.rewardGold} guld
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
