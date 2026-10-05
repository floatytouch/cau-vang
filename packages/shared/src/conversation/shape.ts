/**
 * Minimal declarative object-shape checking, so the envelope can be validated
 * at the WS boundary without a runtime schema dependency.
 */

export interface FieldRule {
  check: (value: unknown) => boolean;
  /** Human description used in error messages, e.g. "a non-empty string". */
  expected: string;
  optional?: boolean;
}

export type Shape = Readonly<Record<string, FieldRule>>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const ANY_STRING: FieldRule = {
  check: (value) => typeof value === 'string',
  expected: 'a string',
};

export const NON_EMPTY_STRING: FieldRule = {
  check: (value) => typeof value === 'string' && value.length > 0,
  expected: 'a non-empty string',
};

export const NON_NEGATIVE_INTEGER: FieldRule = {
  check: (value) => Number.isSafeInteger(value) && (value as number) >= 0,
  expected: 'a non-negative integer',
};

export const NON_NEGATIVE_NUMBER: FieldRule = {
  check: (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0,
  expected: 'a finite non-negative number',
};

export const UNIT_FRACTION: FieldRule = {
  check: (value) => typeof value === 'number' && value >= 0 && value <= 1,
  expected: 'a number between 0 and 1',
};

export const BOOLEAN_VALUE: FieldRule = {
  check: (value) => typeof value === 'boolean',
  expected: 'a boolean',
};

const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export const ISO_TIMESTAMP: FieldRule = {
  // Date.parse alone accepts loose strings like "1"; the pattern pins the format, Date.parse the calendar.
  check: (value) =>
    typeof value === 'string' &&
    ISO_DATE_TIME_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value)),
  expected: 'an ISO-8601 timestamp with timezone',
};

export const PRESENT_VALUE: FieldRule = {
  check: (value) => value !== undefined,
  expected: 'present (any JSON value)',
};

export function oneOf(allowed: readonly string[]): FieldRule {
  return {
    check: (value) => typeof value === 'string' && allowed.includes(value),
    expected: `one of ${allowed.join(', ')}`,
  };
}

export function optional(rule: FieldRule): FieldRule {
  return { ...rule, optional: true };
}

/** Returns a description of the first field that breaks the shape, or undefined. */
export function findShapeViolation(
  record: Record<string, unknown>,
  shape: Shape,
  path: string,
): string | undefined {
  for (const [field, rule] of Object.entries(shape)) {
    const value = record[field];
    if (value === undefined && rule.optional) {
      continue;
    }
    if (!rule.check(value)) {
      return `${path}.${field} must be ${rule.expected}`;
    }
  }
  return undefined;
}
