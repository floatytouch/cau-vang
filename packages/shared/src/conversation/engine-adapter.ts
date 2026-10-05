import type { NootEvent } from './events.js';

/**
 * Who runs the tool loop:
 * - `ownToolLoop` (harness engines, e.g. Claude Agent SDK, Cursor SDK): the
 *   engine runs tools itself; the brain bridges its ToolBridge down to it.
 * - `bareApi` (plain model APIs, e.g. Lumo): the engine only generates; the
 *   brain runs the tool loop.
 * One field instead of two booleans so an engine cannot claim both or neither.
 */
export const ENGINE_TOOL_LOOP_OWN = 'ownToolLoop' as const;
export const ENGINE_TOOL_LOOP_BARE_API = 'bareApi' as const;

export const ENGINE_TOOL_LOOPS = [ENGINE_TOOL_LOOP_OWN, ENGINE_TOOL_LOOP_BARE_API] as const;
export type EngineToolLoop = (typeof ENGINE_TOOL_LOOPS)[number];

export interface EngineCapabilities {
  toolLoop: EngineToolLoop;
  /** Emits `thinking_delta` events. */
  thinkingStream: boolean;
  /** Keeps conversation state between turns; when false the brain resends history. */
  sessions: boolean;
  /** Emits structured `choices` events. */
  choices: boolean;
}

export function isHarnessEngine(capabilities: EngineCapabilities): boolean {
  return capabilities.toolLoop === ENGINE_TOOL_LOOP_OWN;
}

export function isBareApiEngine(capabilities: EngineCapabilities): boolean {
  return capabilities.toolLoop === ENGINE_TOOL_LOOP_BARE_API;
}

export const CONVERSATION_ROLE_USER = 'user' as const;
export const CONVERSATION_ROLE_ASSISTANT = 'assistant' as const;

export type ConversationRole = typeof CONVERSATION_ROLE_USER | typeof CONVERSATION_ROLE_ASSISTANT;

export interface ConversationMessage {
  role: ConversationRole;
  text: string;
}

/** The conversation as the brain owns it; adapters read it, never mutate it. */
export interface EngineSession {
  sessionId: string;
  history: readonly ConversationMessage[];
}

export interface TurnInput {
  text: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema of the tool's arguments. */
  inputSchema: Readonly<Record<string, unknown>>;
}

export interface ToolInvocation {
  callId: string;
  name: string;
  args: unknown;
}

export type ToolOutcome =
  { ok: true; result: unknown } | { ok: false; error: string; blocked?: boolean };

/** Brain-owned tools handed to a harness engine; `execute` applies the brain's gates. */
export interface ToolBridge {
  definitions: readonly ToolDefinition[];
  execute(invocation: ToolInvocation): Promise<ToolOutcome>;
}

export interface TurnOptions {
  /** Allocated by the brain; every event of the turn carries it. */
  turnId: string;
  model: string;
  /** Passed to the engine byte-identical; adapters never rewrite it. */
  systemPrompt: string;
  tools?: ToolBridge;
}

/**
 * Contract every engine plugs in through. The brain knows engines only via
 * this interface, so an engine can be swapped per conversation.
 */
export interface EngineAdapter {
  /** Stable engine id, e.g. `claude`, `cursor`, `lumo`; reported in `usage` events. */
  readonly id: string;
  readonly capabilities: EngineCapabilities;
  /**
   * Runs one turn. The stream must end with exactly one `done` event; a failure
   * is reported as `error` + `done(failed)` rather than a rejected iterator.
   */
  startTurn(
    session: EngineSession,
    input: TurnInput,
    options: TurnOptions,
  ): AsyncIterable<NootEvent>;
  /** Stops a running turn; its stream then ends with `done(cancelled)`. Unknown ids are a no-op. */
  cancel(turnId: string): Promise<void>;
}
