import { USAGE_DAY_PATTERN } from '@noot/shared';

/** Missing day means today (UTC); anything else must be a real `YYYY-MM-DD` calendar day. */
export function normalizeUsageDay(day: string | undefined, now = new Date()): string {
  if (day === undefined || day.trim() === '') {
    return utcDayOf(now.toISOString());
  }
  const trimmed = day.trim();
  if (!USAGE_DAY_PATTERN.test(trimmed) || !isCalendarDay(trimmed)) {
    throw new Error(`day must be a real YYYY-MM-DD UTC date, got ${JSON.stringify(day)}`);
  }
  return trimmed;
}

export function utcDayOf(isoTimestamp: string): string {
  const millis = Date.parse(isoTimestamp);
  if (Number.isNaN(millis)) {
    throw new Error(
      `usage record ts is not a valid ISO timestamp: ${JSON.stringify(isoTimestamp)}`,
    );
  }
  return new Date(millis).toISOString().slice(0, 10);
}

function isCalendarDay(day: string): boolean {
  const millis = Date.parse(`${day}T00:00:00.000Z`);
  return !Number.isNaN(millis) && new Date(millis).toISOString().startsWith(day);
}
