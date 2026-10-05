import {
  DONE_REASONS,
  NOOT_EVENT_TYPES,
  TOOL_CALL_PHASES,
  TOOL_CALL_TERMINAL_STATUSES,
  type NootEvent,
  type NootEventType,
  type ToolCallPhase,
} from './events.js';
import {
  anyString,
  booleanValue,
  findShapeViolation,
  isRecord,
  isoTimestamp,
  nonEmptyString,
  nonNegativeInteger,
  nonNegativeNumber,
  oneOf,
  optional,
  presentValue,
  unitFraction,
  type Shape,
} from './shape.js';

export type NootEventParseResult = { ok: true; event: NootEvent } | { ok: false; error: string };

const META_SHAPE: Shape = {
  sessionId: nonEmptyString,
  turnId: nonEmptyString,
  seq: nonNegativeInteger,
  emittedAt: isoTimestamp,
};

const CHOICE_OPTION_SHAPE: Shape = {
  id: nonEmptyString,
  label: nonEmptyString,
  description: optional(anyString),
};

const TOOL_CALL_BASE_SHAPE: Shape = {
  callId: nonEmptyString,
  name: nonEmptyString,
};

const TOOL_CALL_PHASE_SHAPES: Readonly<Record<ToolCallPhase, Shape>> = {
  start: { status: oneOf(['running']), args: presentValue },
  update: {
    status: oneOf(['running']),
    args: optional(presentValue),
    message: optional(anyString),
  },
  end: {
    status: oneOf(TOOL_CALL_TERMINAL_STATUSES),
    result: optional(presentValue),
    error: optional(anyString),
  },
};

type FlatEventType = Exclude<NootEventType, 'tool_call' | 'choices'>;

const FLAT_EVENT_SHAPES: Readonly<Record<FlatEventType, Shape>> = {
  text_delta: { text: anyString },
  thinking_delta: { text: anyString },
  progress: { label: nonEmptyString, fraction: optional(unitFraction) },
  usage: {
    engine: nonEmptyString,
    model: nonEmptyString,
    inputTokens: nonNegativeInteger,
    outputTokens: nonNegativeInteger,
    cacheReadTokens: optional(nonNegativeInteger),
    cacheWriteTokens: optional(nonNegativeInteger),
    costUsd: optional(nonNegativeNumber),
  },
  done: { reason: oneOf(DONE_REASONS) },
  error: { code: nonEmptyString, message: anyString, recoverable: booleanValue },
  internal_note: { source: nonEmptyString, text: anyString },
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
    return `tool_call.phase must be ${oneOf(TOOL_CALL_PHASES).expected}`;
  }
  return (
    findShapeViolation(record, TOOL_CALL_BASE_SHAPE, 'tool_call') ??
    findShapeViolation(
      record,
      TOOL_CALL_PHASE_SHAPES[phase as ToolCallPhase],
      `tool_call(${phase})`,
    )
  );
}

function findChoicesViolation(record: Record<string, unknown>): string | undefined {
  const promptViolation = findShapeViolation(record, { prompt: optional(anyString) }, 'choices');
  if (promptViolation !== undefined) {
    return promptViolation;
  }
  const options = record['options'];
  if (!Array.isArray(options) || options.length === 0) {
    return 'choices.options must be a non-empty array';
  }
  const seenIds = new Set<unknown>();
  for (const [index, option] of options.entries()) {
    const path = `choices.options[${index}]`;
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
  if (type === 'tool_call') {
    return findToolCallViolation(record);
  }
  if (type === 'choices') {
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
