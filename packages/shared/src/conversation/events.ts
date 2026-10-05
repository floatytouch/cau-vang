/**
 * NootEvent: the single envelope every engine's output is translated into
 * before it leaves the brain (over WS to the UI, into session history).
 *
 * Turn invariant: every turn's stream ends with exactly one `done` event, and
 * nothing for that turn follows it. `error` events may precede `done`.
 */

export const NOOT_EVENT_TYPES = [
  'text_delta',
  'thinking_delta',
  'tool_call',
  'choices',
  'progress',
  'usage',
  'done',
  'error',
  'internal_note',
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
  type: 'text_delta';
  text: string;
}

export interface ThinkingDeltaEvent extends NootEventMeta {
  type: 'thinking_delta';
  text: string;
}

export const TOOL_CALL_PHASES = ['start', 'update', 'end'] as const;
export type ToolCallPhase = (typeof TOOL_CALL_PHASES)[number];

export const TOOL_CALL_STATUSES = ['running', 'succeeded', 'failed', 'blocked'] as const;
/** `blocked` = refused before running (e.g. a mutating tool while in plan mode). */
export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];

export const TOOL_CALL_TERMINAL_STATUSES = ['succeeded', 'failed', 'blocked'] as const;
export type ToolCallTerminalStatus = (typeof TOOL_CALL_TERMINAL_STATUSES)[number];

interface ToolCallBase extends NootEventMeta {
  type: 'tool_call';
  /** Stable across the start/update/end events of one call. */
  callId: string;
  name: string;
}

export interface ToolCallStartEvent extends ToolCallBase {
  phase: 'start';
  status: 'running';
  args: unknown;
}

export interface ToolCallUpdateEvent extends ToolCallBase {
  phase: 'update';
  status: 'running';
  /** Refined arguments when the engine streams them in pieces. */
  args?: unknown;
  message?: string;
}

export interface ToolCallEndEvent extends ToolCallBase {
  phase: 'end';
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
  type: 'choices';
  prompt?: string;
  options: ChoiceOption[];
}

export interface ProgressEvent extends NootEventMeta {
  type: 'progress';
  label: string;
  /** Completion between 0 and 1 when the engine can estimate it. */
  fraction?: number;
}

export interface UsageEvent extends NootEventMeta {
  type: 'usage';
  engine: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
}

export const DONE_REASONS = ['completed', 'cancelled', 'failed'] as const;
export type DoneReason = (typeof DONE_REASONS)[number];

export interface DoneEvent extends NootEventMeta {
  type: 'done';
  reason: DoneReason;
}

export interface ErrorEvent extends NootEventMeta {
  type: 'error';
  /** Machine-readable class, e.g. `engine_unavailable`, `rate_limited`. */
  code: string;
  message: string;
  /** True when the turn keeps going (e.g. after failover to another engine). */
  recoverable: boolean;
}

/** A background job's result posted into a conversation, distinct from typed turns. */
export interface InternalNoteEvent extends NootEventMeta {
  type: 'internal_note';
  /** The job or subsystem that produced the note. */
  source: string;
  text: string;
}

export type NootEvent =
  | TextDeltaEvent
  | ThinkingDeltaEvent
  | ToolCallEvent
  | ChoicesEvent
  | ProgressEvent
  | UsageEvent
  | DoneEvent
  | ErrorEvent
  | InternalNoteEvent;

export function isTerminalEvent(event: NootEvent): event is DoneEvent {
  return event.type === 'done';
}
