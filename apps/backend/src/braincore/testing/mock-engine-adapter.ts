import {
  DONE_REASON_COMPLETED,
  ENGINE_TOOL_LOOP_BARE_API,
  ENGINE_TOOL_LOOP_OWN,
  MOCK_ENGINE_ID,
  MOCK_HARNESS_ENGINE_ID,
  NOOT_EVENT_TYPE_DONE,
  NOOT_EVENT_TYPE_TEXT_DELTA,
  NOOT_EVENT_TYPE_THINKING_DELTA,
  NOOT_EVENT_TYPE_TOOL_CALL,
  NOOT_EVENT_TYPE_USAGE,
  TOOL_CALL_PHASE_END,
  TOOL_CALL_PHASE_START,
  TOOL_CALL_STATUS_BLOCKED,
  TOOL_CALL_STATUS_FAILED,
  TOOL_CALL_STATUS_RUNNING,
  TOOL_CALL_STATUS_SUCCEEDED,
} from '@noot/shared';
import { randomUUID } from 'node:crypto';
import type {
  EngineAdapter,
  EngineCapabilities,
  EngineSession,
  NootEvent,
  ToolCallTerminalStatus,
  ToolOutcome,
  TurnOptions,
} from '@noot/shared';
import { ECHO_MESSAGE_TOOL_NAME, WRITE_SCRATCH_TOOL_NAME } from '../tools/tool-registry.js';
import { TOOL_RESULTS_INPUT_PREFIX } from '../turn/turn-runner.js';

export { MOCK_ENGINE_ID, MOCK_HARNESS_ENGINE_ID };

/** Typed text containing this makes the bare-API mock request the echo_message tool. */
export const MOCK_USE_ECHO_TOOL_MARKER = 'USE_ECHO_TOOL';

export const MOCK_USAGE_INPUT_TOKENS = 10;
export const MOCK_USAGE_OUTPUT_TOKENS = 5;
export const MOCK_USAGE_COST_USD = 0.001;

/** Typed text containing this makes the bare-API mock request the mutating write_scratch tool. */
export const MOCK_USE_WRITE_TOOL_MARKER = 'USE_WRITE_TOOL';

export const MOCK_ENGINE_CAPABILITIES: EngineCapabilities = {
  toolLoop: ENGINE_TOOL_LOOP_BARE_API,
  thinkingStream: true,
  sessions: false,
  choices: false,
};

export const MOCK_HARNESS_CAPABILITIES: EngineCapabilities = {
  toolLoop: ENGINE_TOOL_LOOP_OWN,
  thinkingStream: false,
  sessions: true,
  choices: false,
};

function terminalToolStatus(outcome: ToolOutcome): ToolCallTerminalStatus {
  if (outcome.ok) {
    return TOOL_CALL_STATUS_SUCCEEDED;
  }
  if (outcome.blocked) {
    return TOOL_CALL_STATUS_BLOCKED;
  }
  return TOOL_CALL_STATUS_FAILED;
}

function meta(session: EngineSession, options: TurnOptions, seq: number) {
  return {
    sessionId: session.sessionId,
    turnId: options.turnId,
    seq,
    emittedAt: new Date().toISOString(),
  };
}

function usageEvent(session: EngineSession, options: TurnOptions, seq: number, engine: string) {
  return {
    ...meta(session, options, seq),
    type: NOOT_EVENT_TYPE_USAGE,
    engine,
    model: options.model,
    inputTokens: MOCK_USAGE_INPUT_TOKENS,
    outputTokens: MOCK_USAGE_OUTPUT_TOKENS,
    costUsd: MOCK_USAGE_COST_USD,
  } satisfies NootEvent;
}

export function createMockBareApiAdapter(): EngineAdapter {
  return {
    id: MOCK_ENGINE_ID,
    capabilities: MOCK_ENGINE_CAPABILITIES,
    async *startTurn(session, input, options) {
      if (input.text.startsWith(TOOL_RESULTS_INPUT_PREFIX)) {
        const payload = input.text.slice(TOOL_RESULTS_INPUT_PREFIX.length);
        yield {
          ...meta(session, options, 0),
          type: NOOT_EVENT_TYPE_TEXT_DELTA,
          text: `tool loop finished: ${payload}`,
        } satisfies NootEvent;
        yield usageEvent(session, options, 1, MOCK_ENGINE_ID);
        yield {
          ...meta(session, options, 2),
          type: NOOT_EVENT_TYPE_DONE,
          reason: DONE_REASON_COMPLETED,
        } satisfies NootEvent;
        return;
      }

      if (input.text.includes(MOCK_USE_WRITE_TOOL_MARKER)) {
        const callId = randomUUID();
        yield {
          ...meta(session, options, 0),
          type: NOOT_EVENT_TYPE_THINKING_DELTA,
          text: `selecting ${WRITE_SCRATCH_TOOL_NAME} tool`,
        } satisfies NootEvent;
        yield {
          ...meta(session, options, 1),
          type: NOOT_EVENT_TYPE_TOOL_CALL,
          phase: TOOL_CALL_PHASE_START,
          status: TOOL_CALL_STATUS_RUNNING,
          callId,
          name: WRITE_SCRATCH_TOOL_NAME,
          args: { note: 'from-mock' },
        } satisfies NootEvent;
        yield {
          ...meta(session, options, 2),
          type: NOOT_EVENT_TYPE_DONE,
          reason: DONE_REASON_COMPLETED,
        } satisfies NootEvent;
        return;
      }

      if (input.text.includes(MOCK_USE_ECHO_TOOL_MARKER)) {
        const callId = randomUUID();
        yield {
          ...meta(session, options, 0),
          type: NOOT_EVENT_TYPE_THINKING_DELTA,
          text: 'selecting echo_message tool',
        } satisfies NootEvent;
        yield {
          ...meta(session, options, 1),
          type: NOOT_EVENT_TYPE_TOOL_CALL,
          phase: TOOL_CALL_PHASE_START,
          status: TOOL_CALL_STATUS_RUNNING,
          callId,
          name: ECHO_MESSAGE_TOOL_NAME,
          args: { message: 'from-mock' },
        } satisfies NootEvent;
        yield {
          ...meta(session, options, 2),
          type: NOOT_EVENT_TYPE_DONE,
          reason: DONE_REASON_COMPLETED,
        } satisfies NootEvent;
        return;
      }

      yield {
        ...meta(session, options, 0),
        type: NOOT_EVENT_TYPE_TEXT_DELTA,
        text: input.text,
      } satisfies NootEvent;
      yield usageEvent(session, options, 1, MOCK_ENGINE_ID);
      yield {
        ...meta(session, options, 2),
        type: NOOT_EVENT_TYPE_DONE,
        reason: DONE_REASON_COMPLETED,
      } satisfies NootEvent;
    },
    async cancel() {},
  };
}

export function createMockHarnessAdapter(): EngineAdapter {
  return {
    id: MOCK_HARNESS_ENGINE_ID,
    capabilities: MOCK_HARNESS_CAPABILITIES,
    async *startTurn(session, input, options) {
      const tools = options.tools;
      if (tools && input.text.includes(MOCK_USE_WRITE_TOOL_MARKER)) {
        const callId = randomUUID();
        yield {
          ...meta(session, options, 0),
          type: NOOT_EVENT_TYPE_TOOL_CALL,
          phase: TOOL_CALL_PHASE_START,
          status: TOOL_CALL_STATUS_RUNNING,
          callId,
          name: WRITE_SCRATCH_TOOL_NAME,
          args: { note: 'from-harness' },
        } satisfies NootEvent;
        const offered = tools.definitions.some(
          (definition) => definition.name === WRITE_SCRATCH_TOOL_NAME,
        );
        // Calls even when not offered: models a harness that ignores the tool list, so the execute gate is exercised.
        const outcome = await tools.execute({
          callId,
          name: WRITE_SCRATCH_TOOL_NAME,
          args: { note: 'from-harness' },
        });
        yield {
          ...meta(session, options, 1),
          type: NOOT_EVENT_TYPE_TOOL_CALL,
          phase: TOOL_CALL_PHASE_END,
          callId,
          name: WRITE_SCRATCH_TOOL_NAME,
          status: terminalToolStatus(outcome),
          result: outcome.ok ? outcome.result : undefined,
          error: outcome.ok ? undefined : outcome.error,
        } satisfies NootEvent;
        yield {
          ...meta(session, options, 2),
          type: NOOT_EVENT_TYPE_TEXT_DELTA,
          text: `harness-write:offered=${offered}:${outcome.ok ? 'ok' : 'blocked'}`,
        } satisfies NootEvent;
        yield {
          ...meta(session, options, 3),
          type: NOOT_EVENT_TYPE_DONE,
          reason: DONE_REASON_COMPLETED,
        } satisfies NootEvent;
        return;
      }

      yield {
        ...meta(session, options, 0),
        type: NOOT_EVENT_TYPE_TEXT_DELTA,
        text: `harness:${input.text}`,
      } satisfies NootEvent;
      yield usageEvent(session, options, 1, MOCK_HARNESS_ENGINE_ID);
      yield {
        ...meta(session, options, 2),
        type: NOOT_EVENT_TYPE_DONE,
        reason: DONE_REASON_COMPLETED,
      } satisfies NootEvent;
    },
    async cancel() {},
  };
}
