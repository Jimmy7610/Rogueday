import { useState } from 'react';
import type { EnergyLevel, Mood, QuestDuration, QuestFilters, QuestLocation } from '@/types';
import { Modal } from './Modal';
import { Chip, ENERGY_LABELS, LOCATION_LABELS, MOOD_LABELS } from './ui';

interface QuestFinderModalProps {
  initial: QuestFilters;
  onClose: () => void;
  onRoll: (filters: QuestFilters) => void;
}

const DURATIONS: QuestDuration[] = [5, 15, 30, 60];
const ENERGIES: EnergyLevel[] = ['low', 'medium', 'high'];
const LOCATIONS: QuestLocation[] = ['home', 'outside', 'anywhere'];
const MOODS: Mood[] = ['bored', 'stressed', 'motivated', 'adventurous'];

/** The filter modal that precedes a roll. */
export function QuestFinderModal({
  initial,
  onClose,
  onRoll,
}: QuestFinderModalProps): JSX.Element {
  const [filters, setFilters] = useState<QuestFilters>(initial);

  const update = <K extends keyof QuestFilters>(key: K, value: QuestFilters[K]): void => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  return (
    <Modal
      title="⚔ SÖK ETT VERKLIGT UPPDRAG"
      onClose={onClose}
      footer={
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block"
          onClick={() => onRoll(filters)}
        >
          KASTA TÄRNINGEN &amp; HÄMTA UPPDRAG
        </button>
      }
    >
      <fieldset className="filter-group" style={{ border: 'none' }}>
        <legend className="filter-group__label">TILLGÄNGLIG TID</legend>
        <div className="chip-group chip-group--grid">
          {DURATIONS.map((duration) => (
            <Chip
              key={duration}
              active={filters.duration === duration}
              onClick={() => update('duration', duration)}
              ariaLabel={`${duration} minuter`}
            >
              {duration} MIN
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="filter-group" style={{ border: 'none' }}>
        <legend className="filter-group__label">ENERGINIVÅ</legend>
        <div className="chip-group chip-group--grid">
          {ENERGIES.map((energy) => (
            <Chip
              key={energy}
              active={filters.energy === energy}
              onClick={() => update('energy', energy)}
            >
              {ENERGY_LABELS[energy]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="filter-group" style={{ border: 'none' }}>
        <legend className="filter-group__label">PLATS</legend>
        <div className="chip-group chip-group--grid">
          {LOCATIONS.map((location) => (
            <Chip
              key={location}
              active={filters.location === location}
              onClick={() => update('location', location)}
            >
              {LOCATION_LABELS[location]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="filter-group" style={{ border: 'none' }}>
        <legend className="filter-group__label">SINNESSTÄMNING</legend>
        <div className="chip-group chip-group--grid">
          {MOODS.map((mood) => (
            <Chip key={mood} active={filters.mood === mood} onClick={() => update('mood', mood)}>
              {MOOD_LABELS[mood]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="filter-group" style={{ border: 'none', marginBottom: 0 }}>
        <legend className="filter-group__label">UPPDRAGSLÄGE</legend>
        <div className="chip-group chip-group--grid">
          <Chip active={filters.mode === 'normal'} onClick={() => update('mode', 'normal')}>
            NORMAL ROGUELIKE
          </Chip>
          <Chip
            active={filters.mode === 'chaos'}
            onClick={() => update('mode', 'chaos')}
            variant="magenta"
          >
            KAOS-LÄGE
          </Chip>
        </div>
        {filters.mode === 'chaos' && (
          <p className="notice" style={{ marginTop: 10 }}>
            Kaos-läget lägger till förbannelser, speedruns och mysterieuppdrag — och betydligt
            bättre belöningar.
          </p>
        )}
      </fieldset>
    </Modal>
  );
}
