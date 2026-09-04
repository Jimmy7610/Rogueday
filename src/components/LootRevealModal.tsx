import { useEffect, useState } from 'react';
import type { ItemRevealState } from '@/types';
import { LOOT_BY_ID } from '@/data/loot';
import { useGame } from '@/app/GameProvider';
import { Modal } from './Modal';

interface LootRevealModalProps {
  reveal: ItemRevealState;
  onClose: () => void;
}

/**
 * Chest / purchase reveal.
 *
 * The inventory and gold changes have already been applied and persisted by
 * the time this renders - this is presentation only. Contents appear one at a
 * time, unless motion is reduced, in which case they are shown at once.
 */
export function LootRevealModal({ reveal, onClose }: LootRevealModalProps): JSX.Element {
  const { state } = useGame();
  const animate = state.save.settings.animations && !state.save.settings.reducedMotion;

  const entries = [
    ...reveal.itemsGained.map((itemId) => ({ kind: 'item' as const, itemId })),
    ...(reveal.goldGained > 0 ? [{ kind: 'gold' as const, amount: reveal.goldGained }] : []),
  ];

  const [shown, setShown] = useState(animate ? 0 : entries.length);

  useEffect(() => {
    if (!animate || shown >= entries.length) return;
    const id = window.setTimeout(() => setShown((count) => count + 1), 420);
    return () => window.clearTimeout(id);
  }, [animate, shown, entries.length]);

  const source = LOOT_BY_ID[reveal.sourceItemId];
  const spent = reveal.goldGained < 0 ? Math.abs(reveal.goldGained) : 0;

  return (
    <Modal
      bare
      dismissible={false}
      title={reveal.title}
      footer={
        <button type="button" className="btn btn--primary btn--block" onClick={onClose}>
          FORTSÄTT
        </button>
      }
    >
      <div className="loot-modal">
        <div className={reveal.isChest ? 'loot-modal__chest' : 'loot-modal__chest loot-modal__chest--calm'} aria-hidden="true">
          {source?.icon ?? '🎁'}
        </div>

        <h2 className="loot-modal__title">{reveal.title}</h2>
        <p className="loot-modal__source">{source?.name ?? ''}</p>

        {entries.length > 0 ? (
          <ul className="loot-modal__list">
            {entries.slice(0, shown).map((entry, index) => (
              <li key={index} className="loot-modal__entry">
                <span className="loot-modal__arrow" aria-hidden="true">
                  →
                </span>
                {entry.kind === 'item' ? (
                  <span className="loot-modal__item">
                    <span aria-hidden="true">{LOOT_BY_ID[entry.itemId].icon}</span>{' '}
                    {LOOT_BY_ID[entry.itemId].name}
                  </span>
                ) : (
                  <span className="loot-modal__item loot-modal__item--gold">
                    <span aria-hidden="true">🪙</span> +{entry.amount} GULD
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="loot-modal__messages">
            {reveal.messages.join(' ') || 'Ingenting den här gången.'}
          </p>
        )}

        {spent > 0 && <p className="loot-modal__spent">−{spent} guld</p>}
      </div>
    </Modal>
  );
}
