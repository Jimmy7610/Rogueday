import type { ReactNode } from 'react';
import type { Difficulty, Rarity } from '@/types';
import { RARITY_LABELS } from '@/game/rarity';

/* --- rarity ------------------------------------------------------------- */

export function RarityTag({ rarity }: { rarity: Rarity }): JSX.Element {
  return <span className={`rarity-tag rarity-${rarity}`}>{RARITY_LABELS[rarity]}</span>;
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'LÄTT',
  medium: 'MEDEL',
  hard: 'SVÅR',
  extreme: 'EXTREM',
};

export const ENERGY_LABELS = { low: 'LÅG', medium: 'MEDEL', high: 'HÖG' } as const;

export const LOCATION_LABELS = {
  home: 'HEMMA',
  outside: 'UTE',
  anywhere: 'VAR SOM HELST',
} as const;

export const MOOD_LABELS = {
  bored: 'UTTRÅKAD',
  stressed: 'STRESSAD',
  motivated: 'MOTIVERAD',
  adventurous: 'ÄVENTYRLIG',
} as const;

/* --- bars --------------------------------------------------------------- */

interface ProgressBarProps {
  value: number;
  max: number;
  label?: string;
  variant?: 'xp' | 'boss';
  ariaLabel?: string;
}

export function ProgressBar({
  value,
  max,
  label,
  variant = 'xp',
  ariaLabel,
}: ProgressBarProps): JSX.Element {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      className={variant === 'boss' ? 'bar bar--boss' : 'bar'}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
      aria-label={ariaLabel}
    >
      <div className="bar__fill" style={{ width: `${percent}%` }} />
      {label && <span className="bar__label">{label}</span>}
    </div>
  );
}

/* --- stats -------------------------------------------------------------- */

interface StatProps {
  value: ReactNode;
  label: string;
  tone?: 'cyan' | 'magenta' | 'green' | 'amber';
  /** Use for long values such as countdowns, which otherwise wrap. */
  small?: boolean;
}

export function Stat({ value, label, tone = 'cyan', small = false }: StatProps): JSX.Element {
  const toneClass = tone === 'cyan' ? '' : ` stat--${tone}`;
  const sizeClass = small ? ' stat__value--sm' : '';
  return (
    <div className={`stat${toneClass}`}>
      <div className={`stat__value${sizeClass}`}>{value}</div>
      <div className="stat__label">{label}</div>
    </div>
  );
}

/* --- chips -------------------------------------------------------------- */

interface ChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  variant?: 'cyan' | 'magenta';
  ariaLabel?: string;
}

export function Chip({
  active,
  onClick,
  children,
  variant = 'cyan',
  ariaLabel,
}: ChipProps): JSX.Element {
  const classes = ['chip'];
  if (variant === 'magenta') classes.push('chip--magenta');
  if (active) classes.push('chip--active');

  return (
    <button
      type="button"
      className={classes.join(' ')}
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  );
}

/* --- misc --------------------------------------------------------------- */

export function Pill({ children }: { children: ReactNode }): JSX.Element {
  return <span className="pill">{children}</span>;
}

export function EmptyState({ icon, text }: { icon: string; text: string }): JSX.Element {
  return (
    <div className="empty">
      <div className="empty__icon" aria-hidden="true">
        {icon}
      </div>
      <p className="empty__text">{text}</p>
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }): JSX.Element {
  return <h2 className="section__title">{children}</h2>;
}

interface ToggleRowProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

export function ToggleRow({ label, hint, checked, onChange }: ToggleRowProps): JSX.Element {
  return (
    <div className="toggle-row">
      <div className="toggle-row__text">
        <div className="toggle-row__label">{label}</div>
        {hint && <div className="toggle-row__hint">{hint}</div>}
      </div>
      <button
        type="button"
        className="toggle"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

export function KeyValue({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: 'ok' | 'bad';
}): JSX.Element {
  const toneClass = tone ? ` kv__value--${tone}` : '';
  return (
    <div className="kv">
      <span className="kv__key">{label}</span>
      <span className={`kv__value${toneClass}`}>{value}</span>
    </div>
  );
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('sv-SE').format(Math.round(value));
}
