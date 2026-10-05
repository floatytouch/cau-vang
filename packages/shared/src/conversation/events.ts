/**
 * NootEvent: the single envelope every engine's output is translated into
 * before it leaves the brain (over WS to the UI, into session history).
 *
 * Turn invariant: every turn's stream ends with exactly one `done` event, and
 * nothing for that turn follows it. `error` events may precede `done`.
 */

export const NOOT_EVENT_TYPE_TEXT_DELTA = 'text_delta' as const;
export const NOOT_EVENT_TYPE_THINKING_DELTA = 'thinking_delta' as const;
export const NOOT_EVENT_TYPE_TOOL_CALL = 'tool_call' as const;
export const NOOT_EVENT_TYPE_CHOICES = 'choices' as const;
export const NOOT_EVENT_TYPE_PROGRESS = 'progress' as const;
export const NOOT_EVENT_TYPE_USAGE = 'usage' as const;
export const NOOT_EVENT_TYPE_DONE = 'done' as const;
export const NOOT_EVENT_TYPE_ERROR = 'error' as const;
export const NOOT_EVENT_TYPE_INTERNAL_NOTE = 'internal_note' as const;

export const NOOT_EVENT_TYPES = [
  NOOT_EVENT_TYPE_TEXT_DELTA,
  NOOT_EVENT_TYPE_THINKING_DELTA,
  NOOT_EVENT_TYPE_TOOL_CALL,
  NOOT_EVENT_TYPE_CHOICES,
  NOOT_EVENT_TYPE_PROGRESS,
  NOOT_EVENT_TYPE_USAGE,
  NOOT_EVENT_TYPE_DONE,
  NOOT_EVENT_TYPE_ERROR,
  NOOT_EVENT_TYPE_INTERNAL_NOTE,
] as const;

export type NootEventType = (typeof NOOT_EVENT_TYPES)[number];

/** Metadata carried by every event, so a client can route and order it. */
export interface NootEventMeta {
  sessionId: string;
  turnId: string;
  /** Position inside the turn: starts at 0, +1 per event. */
  seq: number;
  /** ISO-8601 timestamp of when the brain emitted the event. */
  emittedAt: string;
}

export interface TextDeltaEvent extends NootEventMeta {
  type: typeof NOOT_EVENT_TYPE_TEXT_DELTA;
  text: string;
}

export interface ThinkingDeltaEvent extends NootEventMeta {
  type: typeof NOOT_EVENT_TYPE_THINKING_DELTA;
  text: string;
}

export const TOOL_CALL_PHASE_START = 'start' as const;
export const TOOL_CALL_PHASE_UPDATE = 'update' as const;
export const TOOL_CALL_PHASE_END = 'end' as const;

export const TOOL_CALL_PHASES = [
  TOOL_CALL_PHASE_START,
  TOOL_CALL_PHASE_UPDATE,
  TOOL_CALL_PHASE_END,
] as const;
export type ToolCallPhase = (typeof TOOL_CALL_PHASES)[number];

export const TOOL_CALL_STATUS_RUNNING = 'running' as const;
export const TOOL_CALL_STATUS_SUCCEEDED = 'succeeded' as const;
export const TOOL_CALL_STATUS_FAILED = 'failed' as const;
export const TOOL_CALL_STATUS_BLOCKED = 'blocked' as const;

export const TOOL_CALL_STATUSES = [
  TOOL_CALL_STATUS_RUNNING,
  TOOL_CALL_STATUS_SUCCEEDED,
  TOOL_CALL_STATUS_FAILED,
  TOOL_CALL_STATUS_BLOCKED,
] as const;
/** `blocked` = refused before running (e.g. a mutating tool while in plan mode). */
export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];

export const TOOL_CALL_TERMINAL_STATUSES = [
  TOOL_CALL_STATUS_SUCCEEDED,
  TOOL_CALL_STATUS_FAILED,
  TOOL_CALL_STATUS_BLOCKED,
] as const;
export type ToolCallTerminalStatus = (typeof TOOL_CALL_TERMINAL_STATUSES)[number];

interface ToolCallBase extends NootEventMeta {
  type: typeof NOOT_EVENT_TYPE_TOOL_CALL;
  /** Stable across the start/update/end events of one call. */
  callId: string;
  name: string;
}

export interface ToolCallStartEvent extends ToolCallBase {
  phase: typeof TOOL_CALL_PHASE_START;
  status: typeof TOOL_CALL_STATUS_RUNNING;
  args: unknown;
}

export interface ToolCallUpdateEvent extends ToolCallBase {
  phase: typeof TOOL_CALL_PHASE_UPDATE;
  status: typeof TOOL_CALL_STATUS_RUNNING;
  /** Refined arguments when the engine streams them in pieces. */
  args?: unknown;
  message?: string;
}

export interface ToolCallEndEvent extends ToolCallBase {
  phase: typeof TOOL_CALL_PHASE_END;
  status: ToolCallTerminalStatus;
  result?: unknown;
  error?: string;
}

export type ToolCallEvent = ToolCallStartEvent | ToolCallUpdateEvent | ToolCallEndEvent;

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
}

export interface ChoicesEvent extends NootEventMeta {
  type: typeof NOOT_EVENT_TYPE_CHOICES;
  prompt?: string;
  options: ChoiceOption[];
}

export interface TurnProgressEvent extends NootEventMeta {
  type: typeof NOOT_EVENT_TYPE_PROGRESS;
  label: string;
  /** Completion between 0 and 1 when the engine can estimate it. */
  fraction?: number;
}

export interface UsageEvent extends NootEventMeta {
  type: typeof NOOT_EVENT_TYPE_USAGE;
  engine: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
}

export const DONE_REASON_COMPLETED = 'completed' as const;
export const DONE_REASON_CANCELLED = 'cancelled' as const;
export const DONE_REASON_FAILED = 'failed' as const;

export const DONE_REASONS = [
  DONE_REASON_COMPLETED,
  DONE_REASON_CANCELLED,
  DONE_REASON_FAILED,
] as const;
export type DoneReason = (typeof DONE_REASONS)[number];

export interface DoneEvent extends NootEventMeta {
  type: typeof NOOT_EVENT_TYPE_DONE;
  reason: DoneReason;
}

/** Codes more than one engine emits; an engine may also pass its SDK's own code through. */
export const TURN_ERROR_CODE_ENGINE_UNAVAILABLE = 'engine_unavailable' as const;
export const TURN_ERROR_CODE_ENGINE_ERROR = 'engine_error' as const;

export interface TurnErrorEvent extends NootEventMeta {
  type: typeof NOOT_EVENT_TYPE_ERROR;
  /** Machine-readable class, e.g. `engine_unavailable`, `rate_limited`. */
  code: string;
  message: string;
  /** True when the turn keeps going (e.g. after failover to another engine). */
  recoverable: boolean;
}

/** A background job's result posted into a conversation, distinct from typed turns. */
export interface InternalNoteEvent extends NootEventMeta {
  type: typeof NOOT_EVENT_TYPE_INTERNAL_NOTE;
  /** The job or subsystem that produced the note. */
  source: string;
  text: string;
}

export type NootEvent =
  | TextDeltaEvent
  | ThinkingDeltaEvent
  | ToolCallEvent
  | ChoicesEvent
  | TurnProgressEvent
  | UsageEvent
  | DoneEvent
  | TurnErrorEvent
  | InternalNoteEvent;

export function isTerminalEvent(event: NootEvent): event is DoneEvent {
  return event.type === NOOT_EVENT_TYPE_DONE;
}
