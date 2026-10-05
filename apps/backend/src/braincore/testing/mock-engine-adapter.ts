import type {
  EngineAdapter,
  EngineCapabilities,
  EngineSession,
  NootEvent,
  TurnOptions,
} from '@noot/shared';
import { MOCK_USE_ECHO_TOOL_MARKER, TOOL_RESULTS_INPUT_PREFIX } from '../session/session-types.js';
import { newToolCallId } from '../tools/tool-registry.js';

export const MOCK_ENGINE_ID = 'mock';

export const MOCK_ENGINE_CAPABILITIES: EngineCapabilities = {
  toolLoop: 'bareApi',
  thinkingStream: true,
  sessions: false,
  choices: false,
};

export const MOCK_HARNESS_ENGINE_ID = 'mock-harness';

export const MOCK_HARNESS_CAPABILITIES: EngineCapabilities = {
  toolLoop: 'ownToolLoop',
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

export function createMockBareApiAdapter(): EngineAdapter {
  return {
    id: MOCK_ENGINE_ID,
    capabilities: MOCK_ENGINE_CAPABILITIES,
    async *startTurn(session, input, options) {
      if (input.text.startsWith(TOOL_RESULTS_INPUT_PREFIX)) {
        const payload = input.text.slice(TOOL_RESULTS_INPUT_PREFIX.length);
        yield {
          ...meta(session, options, 0),
          type: 'text_delta',
          text: `tool loop finished: ${payload}`,
        } satisfies NootEvent;
        yield {
          ...meta(session, options, 1),
          type: 'done',
          reason: 'completed',
        } satisfies NootEvent;
        return;
      }

      if (input.text.includes(MOCK_USE_ECHO_TOOL_MARKER)) {
        const callId = newToolCallId();
        yield {
          ...meta(session, options, 0),
          type: 'thinking_delta',
          text: 'selecting echo_message tool',
        } satisfies NootEvent;
        yield {
          ...meta(session, options, 1),
          type: 'tool_call',
          phase: 'start',
          status: 'running',
          callId,
          name: 'echo_message',
          args: { message: 'from-mock' },
        } satisfies NootEvent;
        yield {
          ...meta(session, options, 2),
          type: 'done',
          reason: 'completed',
        } satisfies NootEvent;
        return;
      }

      yield {
        ...meta(session, options, 0),
        type: 'text_delta',
        text: input.text,
      } satisfies NootEvent;
      yield { ...meta(session, options, 1), type: 'done', reason: 'completed' } satisfies NootEvent;
    },
    async cancel() {},
  };
}

export function createMockHarnessAdapter(): EngineAdapter {
  return {
    id: MOCK_HARNESS_ENGINE_ID,
    capabilities: MOCK_HARNESS_CAPABILITIES,
    async *startTurn(session, input, options) {
      yield {
        ...meta(session, options, 0),
        type: 'text_delta',
        text: `harness:${input.text}`,
      } satisfies NootEvent;
      yield { ...meta(session, options, 1), type: 'done', reason: 'completed' } satisfies NootEvent;
    },
    async cancel() {},
  };
}
