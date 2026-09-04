import type { PendingEvent } from '@/types';
import { LOOT_BY_ID } from '@/data/loot';
import { getEventDefinition } from '@/game/events';
import { Modal } from './Modal';

interface EventModalProps {
  event: PendingEvent;
  gold: number;
  onChoose: (choiceId: string) => void;
  onDismiss: () => void;
}

/** Random event presentation. Every branch is safe to pick. */
export function EventModal({ event, gold, onChoose, onDismiss }: EventModalProps): JSX.Element {
  const definition = getEventDefinition(event.eventId);

  if (!definition) {
    return (
      <Modal bare title="Händelse" dismissible={false}>
        <div className="event-modal">
          <p className="event-modal__text">Något hände, men det försvann i dimman.</p>
          <button type="button" className="btn btn--block" onClick={onDismiss}>
            FORTSÄTT
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal bare title={definition.name} dismissible={false}>
      <div className="event-modal">
        <div className="event-modal__icon" aria-hidden="true">
          {definition.icon}
        </div>
        <h2 className="event-modal__title">{definition.title}</h2>
        <p className="event-modal__text">{definition.description}</p>

        <EventDetail event={event} />

        <div style={{ marginTop: 6 }}>
          {definition.choices.map((choice) => {
            const disabled = isChoiceDisabled(event, choice.id, gold);
            return (
              <button
                key={choice.id}
                type="button"
                className="event-choice"
                onClick={() => onChoose(choice.id)}
                disabled={disabled}
                style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
              >
                <div className="event-choice__label">{choice.label}</div>
                <div className="event-choice__desc">
                  {choice.description}
                  {disabled ? ' · Du har inte råd.' : ''}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

function isChoiceDisabled(event: PendingEvent, choiceId: string, gold: number): boolean {
  if (event.eventId === 'wandering_merchant' && choiceId === 'buy') {
    return gold < Number(event.payload.price ?? 0);
  }
  if (event.eventId === 'ancient_shrine' && choiceId === 'offer') {
    const cost = Number(event.payload.cost ?? 0);
    return cost <= 0 || gold < cost;
  }
  return false;
}

function EventDetail({ event }: { event: PendingEvent }): JSX.Element | null {
  switch (event.eventId) {
    case 'wandering_merchant': {
      const itemId = String(event.payload.itemId) as keyof typeof LOOT_BY_ID;
      const item = LOOT_BY_ID[itemId];
      if (!item) return null;
      return (
        <div className="loot-reveal" style={{ marginBottom: 16 }}>
          <div className="loot-reveal__label">TILL SALU · −{event.payload.discount}%</div>
          <div className="loot-reveal__item">
            {item.icon} {item.name}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
            {item.description} · {event.payload.price} guld
          </p>
        </div>
      );
    }
    case 'double_or_nothing':
      return (
        <p className="notice notice--warn" style={{ marginBottom: 16 }}>
          Insats: +{event.payload.bonusXp} XP och +{event.payload.bonusGold} guld om du klarar det.
        </p>
      );
    case 'goblin_tax':
      return (
        <p className="notice" style={{ marginBottom: 16 }}>
          Den begär {event.payload.amount} guld. Du kan vägra utan påföljd.
        </p>
      );
    case 'ancient_shrine':
      return (
        <p className="notice notice--warn" style={{ marginBottom: 16 }}>
          Offer: {event.payload.cost} guld · Ger +30% XP på {event.payload.quests} uppdrag.
        </p>
      );
    default:
      return null;
  }
}
