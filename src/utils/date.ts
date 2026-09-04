/**
 * Local-calendar date helpers.
 *
 * Everything is based on the user's own device clock - there is no server date
 * API anywhere in RogueDay. Dates are stored as local YYYY-MM-DD strings so a
 * timezone shift never silently rewrites history.
 */

/** Local YYYY-MM-DD for a Date (never UTC). */
export function toLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parse a local YYYY-MM-DD back into a local midnight Date. */
export function fromLocalDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0);
}

export function isValidDateKey(key: unknown): key is string {
  if (typeof key !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const parsed = fromLocalDateKey(key);
  return !Number.isNaN(parsed.getTime()) && toLocalDateKey(parsed) === key;
}

/** Whole local days between two date keys (b - a). */
export function daysBetween(aKey: string, bKey: string): number {
  const a = fromLocalDateKey(aKey).getTime();
  const b = fromLocalDateKey(bKey).getTime();
  return Math.round((b - a) / 86400000);
}

export function addDays(key: string, days: number): string {
  const date = fromLocalDateKey(key);
  date.setDate(date.getDate() + days);
  return toLocalDateKey(date);
}

/**
 * Local date key for the Monday that starts the week containing `date`.
 * Weeks run Monday..Sunday, matching Swedish convention.
 */
export function getWeekKey(date: Date = new Date()): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = local.getDay(); // 0 = Sunday
  const daysSinceMonday = (weekday + 6) % 7;
  local.setDate(local.getDate() - daysSinceMonday);
  return toLocalDateKey(local);
}

/** Milliseconds until the next local Monday 00:00. */
export function msUntilWeeklyReset(now: Date = new Date()): number {
  const weekStart = fromLocalDateKey(getWeekKey(now));
  const nextReset = new Date(weekStart);
  nextReset.setDate(nextReset.getDate() + 7);
  return Math.max(0, nextReset.getTime() - now.getTime());
}

/** Milliseconds until local midnight. */
export function msUntilDailyReset(now: Date = new Date()): number {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, tomorrow.getTime() - now.getTime());
}

/** "2d 5h 12m" style countdown, Swedish units. */
export function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Swedish short date+time for history rows. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  const dateKey = toLocalDateKey(date);
  const time = `${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}`;
  return `${dateKey} ${time}`;
}

const SWEDISH_MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'maj',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'dec',
];

export function formatFriendlyDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.getDate()} ${SWEDISH_MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Minutes formatted as "1h 20m" / "45 min". */
export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
