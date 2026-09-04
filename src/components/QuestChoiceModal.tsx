import type { ChoiceTier, QuestOffer } from '@/types';
import { CATEGORY_ICONS, CATEGORY_LABELS } from '@/data/quests';
import { TIER_DESCRIPTIONS, TIER_LABELS } from '@/game/rarity';
import { Modal } from './Modal';
import { DIFFICULTY_LABELS, ENERGY_LABELS, RarityTag } from './ui';

interface QuestChoiceModalProps {
  offers: QuestOffer[];
  selectedId: string | null;
  onSelect: (offerId: string) => void;
  onAccept: (offer: QuestOffer) => void;
  onReroll: () => void;
  rerollLabel: string;
  canReroll: boolean;
  onClose: () => void;
}

const TIER_ORDER: ChoiceTier[] = ['safe', 'wild', 'dangerous'];

/** The three-choice presentation after a roll. */
export function QuestChoiceModal({
  offers,
  selectedId,
  onSelect,
  onAccept,
  onReroll,
  rerollLabel,
  canReroll,
  onClose,
}: QuestChoiceModalProps): JSX.Element {
  const ordered = TIER_ORDER.map((tier) => offers.find((offer) => offer.tier === tier)).filter(
    (offer): offer is QuestOffer => Boolean(offer),
  );

  const selected = ordered.find((offer) => offer.offerId === selectedId) ?? null;

  return (
    <Modal
      title="🎲 VÄLJ DITT ÖDE"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn btn--success btn--lg btn--block"
            disabled={!selected}
            onClick={() => selected && onAccept(selected)}
          >
            ACCEPTERA UPPDRAG
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--block"
            onClick={onReroll}
            disabled={!canReroll}
            title={rerollLabel}
          >
            KASTA OM · {rerollLabel}
          </button>
        </>
      }
    >
      <div className="offer-list">
        {ordered.map((offer) => {
          const classes = ['offer'];
          if (offer.offerId === selectedId) classes.push('offer--selected');
          if (offer.rarity === 'legendary') classes.push('offer--legendary');

          return (
            <button
              key={offer.offerId}
              type="button"
              className={classes.join(' ')}
              data-rarity={offer.rarity}
              aria-pressed={offer.offerId === selectedId}
              onClick={() => onSelect(offer.offerId)}
            >
              <div className="offer__head">
                <span className={`offer__tier offer__tier--${offer.tier}`}>
                  {TIER_LABELS[offer.tier]}
                </span>
                <RarityTag rarity={offer.rarity} />
              </div>

              <div className="offer__category">
                {CATEGORY_ICONS[offer.quest.category]} {CATEGORY_LABELS[offer.quest.category]}
                {offer.chainInfo &&
                  ` · ${offer.chainInfo.chainName} ${offer.chainInfo.step}/${offer.chainInfo.total}`}
              </div>

              <h3 className="offer__title">{offer.quest.title}</h3>

              <p className="offer__desc">
                {offer.hidden
                  ? 'Målet är förseglat. Det avslöjas först när du accepterat uppdraget.'
                  : offer.quest.description}
              </p>

              <p className="offer__flavour">”{offer.quest.flavourText}”</p>

              {offer.modifier && (
                <div className="offer__modifier">
                  <span aria-hidden="true">🌀</span>
                  <span>
                    <span className="offer__modifier-name">{offer.modifier.name}</span>
                    <br />
                    <span className="offer__modifier-desc">{offer.modifier.description}</span>
                  </span>
                </div>
              )}

              <p
                className="offer__flavour"
                style={{ marginBottom: 8, fontStyle: 'normal', fontSize: 11 }}
              >
                {TIER_DESCRIPTIONS[offer.tier]}
              </p>

              <div className="offer__footer">
                <div className="meta-row">
                  <span>{offer.quest.duration} MIN</span>
                  <span>{DIFFICULTY_LABELS[offer.quest.difficulty]}</span>
                  <span>{ENERGY_LABELS[offer.quest.energy]}</span>
                </div>
                <div className="reward-row">
                  <span className="reward-xp">+{offer.xp} XP</span>
                  <span className="reward-gold">+{offer.gold} G</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
