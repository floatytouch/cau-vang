import {
  DONE_REASONS,
  NOOT_EVENT_TYPE_CHOICES,
  NOOT_EVENT_TYPE_DONE,
  NOOT_EVENT_TYPE_ERROR,
  NOOT_EVENT_TYPE_INTERNAL_NOTE,
  NOOT_EVENT_TYPE_PROGRESS,
  NOOT_EVENT_TYPE_TEXT_DELTA,
  NOOT_EVENT_TYPE_THINKING_DELTA,
  NOOT_EVENT_TYPE_TOOL_CALL,
  NOOT_EVENT_TYPE_USAGE,
  NOOT_EVENT_TYPES,
  TOOL_CALL_PHASE_END,
  TOOL_CALL_PHASE_START,
  TOOL_CALL_PHASE_UPDATE,
  TOOL_CALL_PHASES,
  TOOL_CALL_STATUS_RUNNING,
  TOOL_CALL_TERMINAL_STATUSES,
  type NootEvent,
  type NootEventType,
  type ToolCallPhase,
} from './events.js';
import {
  ANY_STRING,
  BOOLEAN_VALUE,
  findShapeViolation,
  isRecord,
  ISO_TIMESTAMP,
  NON_EMPTY_STRING,
  NON_NEGATIVE_INTEGER,
  NON_NEGATIVE_NUMBER,
  oneOf,
  optional,
  PRESENT_VALUE,
  UNIT_FRACTION,
  type Shape,
} from './shape.js';

export type NootEventParseResult = { ok: true; event: NootEvent } | { ok: false; error: string };

const META_SHAPE: Shape = {
  sessionId: NON_EMPTY_STRING,
  turnId: NON_EMPTY_STRING,
  seq: NON_NEGATIVE_INTEGER,
  emittedAt: ISO_TIMESTAMP,
};

const CHOICE_OPTION_SHAPE: Shape = {
  id: NON_EMPTY_STRING,
  label: NON_EMPTY_STRING,
  description: optional(ANY_STRING),
};

const TOOL_CALL_BASE_SHAPE: Shape = {
  callId: NON_EMPTY_STRING,
  name: NON_EMPTY_STRING,
};

const TOOL_CALL_PHASE_SHAPES: Readonly<Record<ToolCallPhase, Shape>> = {
  [TOOL_CALL_PHASE_START]: { status: oneOf([TOOL_CALL_STATUS_RUNNING]), args: PRESENT_VALUE },
  [TOOL_CALL_PHASE_UPDATE]: {
    status: oneOf([TOOL_CALL_STATUS_RUNNING]),
    args: optional(PRESENT_VALUE),
    message: optional(ANY_STRING),
  },
  [TOOL_CALL_PHASE_END]: {
    status: oneOf(TOOL_CALL_TERMINAL_STATUSES),
    result: optional(PRESENT_VALUE),
    error: optional(ANY_STRING),
  },
};

type FlatEventType = Exclude<
  NootEventType,
  typeof NOOT_EVENT_TYPE_TOOL_CALL | typeof NOOT_EVENT_TYPE_CHOICES
>;

const FLAT_EVENT_SHAPES: Readonly<Record<FlatEventType, Shape>> = {
  [NOOT_EVENT_TYPE_TEXT_DELTA]: { text: ANY_STRING },
  [NOOT_EVENT_TYPE_THINKING_DELTA]: { text: ANY_STRING },
  [NOOT_EVENT_TYPE_PROGRESS]: { label: NON_EMPTY_STRING, fraction: optional(UNIT_FRACTION) },
  [NOOT_EVENT_TYPE_USAGE]: {
    engine: NON_EMPTY_STRING,
    model: NON_EMPTY_STRING,
    inputTokens: NON_NEGATIVE_INTEGER,
    outputTokens: NON_NEGATIVE_INTEGER,
    cacheReadTokens: optional(NON_NEGATIVE_INTEGER),
    cacheWriteTokens: optional(NON_NEGATIVE_INTEGER),
    costUsd: optional(NON_NEGATIVE_NUMBER),
  },
  [NOOT_EVENT_TYPE_DONE]: { reason: oneOf(DONE_REASONS) },
  [NOOT_EVENT_TYPE_ERROR]: {
    code: NON_EMPTY_STRING,
    message: ANY_STRING,
    recoverable: BOOLEAN_VALUE,
  },
  [NOOT_EVENT_TYPE_INTERNAL_NOTE]: { source: NON_EMPTY_STRING, text: ANY_STRING },
};

function describeValue(value: unknown): string {
  return typeof value === 'string' ? JSON.stringify(value) : typeof value;
}

function isNootEventType(value: unknown): value is NootEventType {
  return typeof value === 'string' && (NOOT_EVENT_TYPES as readonly string[]).includes(value);
}

function findToolCallViolation(record: Record<string, unknown>): string | undefined {
  const phase = record['phase'];
  if (typeof phase !== 'string' || !(TOOL_CALL_PHASES as readonly string[]).includes(phase)) {
    return `${NOOT_EVENT_TYPE_TOOL_CALL}.phase must be ${oneOf(TOOL_CALL_PHASES).expected}`;
  }
  return (
    findShapeViolation(record, TOOL_CALL_BASE_SHAPE, NOOT_EVENT_TYPE_TOOL_CALL) ??
    findShapeViolation(
      record,
      TOOL_CALL_PHASE_SHAPES[phase as ToolCallPhase],
      `${NOOT_EVENT_TYPE_TOOL_CALL}(${phase})`,
    )
  );
}

function findChoicesViolation(record: Record<string, unknown>): string | undefined {
  const promptViolation = findShapeViolation(
    record,
    { prompt: optional(ANY_STRING) },
    NOOT_EVENT_TYPE_CHOICES,
  );
  if (promptViolation !== undefined) {
    return promptViolation;
  }
  const options = record['options'];
  if (!Array.isArray(options) || options.length === 0) {
    return `${NOOT_EVENT_TYPE_CHOICES}.options must be a non-empty array`;
  }
  const seenIds = new Set<unknown>();
  for (const [index, option] of options.entries()) {
    const path = `${NOOT_EVENT_TYPE_CHOICES}.options[${index}]`;
    if (!isRecord(option)) {
      return `${path} must be an object`;
    }
    const violation = findShapeViolation(option, CHOICE_OPTION_SHAPE, path);
    if (violation !== undefined) {
      return violation;
    }
    if (seenIds.has(option['id'])) {
      return `${path}.id duplicates an earlier option id`;
    }
    seenIds.add(option['id']);
  }
  return undefined;
}

function findPayloadViolation(
  type: NootEventType,
  record: Record<string, unknown>,
): string | undefined {
  if (type === NOOT_EVENT_TYPE_TOOL_CALL) {
    return findToolCallViolation(record);
  }
  if (type === NOOT_EVENT_TYPE_CHOICES) {
    return findChoicesViolation(record);
  }
  return findShapeViolation(record, FLAT_EVENT_SHAPES[type], type);
}

/**
 * Validates an untrusted value (e.g. a parsed WS frame) as a NootEvent.
 * Unknown extra fields are tolerated so older clients survive additive changes.
 */
export function parseNootEvent(value: unknown): NootEventParseResult {
  if (!isRecord(value)) {
    return { ok: false, error: 'event must be an object' };
  }
  const type = value['type'];
  if (!isNootEventType(type)) {
    return {
      ok: false,
      error: `event.type must be ${oneOf(NOOT_EVENT_TYPES).expected}, got ${describeValue(type)}`,
    };
  }
  const violation =
    findShapeViolation(value, META_SHAPE, type) ?? findPayloadViolation(type, value);
  if (violation !== undefined) {
    return { ok: false, error: violation };
  }
  return { ok: true, event: value as unknown as NootEvent };
}

export function isNootEvent(value: unknown): value is NootEvent {
  return parseNootEvent(value).ok;
}
