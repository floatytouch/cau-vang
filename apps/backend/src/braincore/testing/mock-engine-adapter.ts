import {
  DONE_REASON_COMPLETED,
  ENGINE_TOOL_LOOP_BARE_API,
  ENGINE_TOOL_LOOP_OWN,
  NOOT_EVENT_TYPE_DONE,
  NOOT_EVENT_TYPE_TEXT_DELTA,
  NOOT_EVENT_TYPE_THINKING_DELTA,
  NOOT_EVENT_TYPE_TOOL_CALL,
  NOOT_EVENT_TYPE_USAGE,
  TOOL_CALL_PHASE_START,
  TOOL_CALL_STATUS_RUNNING,
} from '@noot/shared';
import { randomUUID } from 'node:crypto';
import type {
  EngineAdapter,
  EngineCapabilities,
  EngineSession,
  NootEvent,
  TurnOptions,
} from '@noot/shared';
import { ECHO_MESSAGE_TOOL_NAME } from '../tools/tool-registry.js';
import { TOOL_RESULTS_INPUT_PREFIX } from '../turn/turn-runner.js';

export const MOCK_ENGINE_ID = 'mock';

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

export const MOCK_HARNESS_ENGINE_ID = 'mock-harness';

export const MOCK_HARNESS_CAPABILITIES: EngineCapabilities = {
  toolLoop: ENGINE_TOOL_LOOP_OWN,
  thinkingStream: false,
  sessions: true,
  choices: false,
};

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
          type: 'thinking_delta',
          text: 'selecting write_scratch tool',
        } satisfies NootEvent;
        yield {
          ...meta(session, options, 1),
          type: 'tool_call',
          phase: 'start',
          status: 'running',
          callId,
          name: 'write_scratch',
          args: { note: 'from-mock' },
        } satisfies NootEvent;
        yield {
          ...meta(session, options, 2),
          type: 'done',
          reason: 'completed',
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
          type: 'tool_call',
          phase: 'start',
          status: 'running',
          callId,
          name: 'write_scratch',
          args: { note: 'from-harness' },
        } satisfies NootEvent;
        const offered = tools.definitions.some((definition) => definition.name === 'write_scratch');
        const outcome = offered
          ? await tools.execute({
              callId,
              name: 'write_scratch',
              args: { note: 'from-harness' },
            })
          : {
              ok: false as const,
              error: 'write_scratch omitted from plan-mode tool set',
              blocked: true,
            };
        yield {
          ...meta(session, options, 1),
          type: 'tool_call',
          phase: 'end',
          callId,
          name: 'write_scratch',
          status: outcome.ok ? 'succeeded' : outcome.blocked ? 'blocked' : 'failed',
          result: outcome.ok ? outcome.result : undefined,
          error: outcome.ok ? undefined : outcome.error,
        } satisfies NootEvent;
        yield {
          ...meta(session, options, 2),
          type: 'text_delta',
          text: `harness-write:${outcome.ok ? 'ok' : 'blocked'}`,
        } satisfies NootEvent;
        yield {
          ...meta(session, options, 3),
          type: 'done',
          reason: 'completed',
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
