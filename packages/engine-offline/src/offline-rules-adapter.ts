import {
  DONE_REASON_COMPLETED,
  ENGINE_TOOL_LOOP_BARE_API,
  NOOT_EVENT_TYPE_CHOICES,
  NOOT_EVENT_TYPE_DONE,
  NOOT_EVENT_TYPE_TEXT_DELTA,
  NOOT_EVENT_TYPE_USAGE,
  OFFLINE_RULES_ENGINE_ID,
} from '@noot/shared';
import type {
  EngineAdapter,
  EngineCapabilities,
  EngineSession,
  NootEvent,
  TurnOptions,
} from '@noot/shared';
import {
  DEFAULT_OFFLINE_CHOICE_FIXTURE,
  DEFAULT_OFFLINE_MAX_ECHO_CHARS,
  formatOfflineEcho,
  shouldEmitOfflineChoices,
} from './offline-rules.js';

export const OFFLINE_RULES_CAPABILITIES: EngineCapabilities = {
  toolLoop: ENGINE_TOOL_LOOP_BARE_API,
  thinkingStream: false,
  sessions: false,
  choices: true,
};

export interface OfflineRulesAdapterOptions {
  maxEchoChars?: number;
  choiceFixture?: typeof DEFAULT_OFFLINE_CHOICE_FIXTURE;
}

function meta(session: EngineSession, options: TurnOptions, seq: number) {
  return {
    sessionId: session.sessionId,
    turnId: options.turnId,
    seq,
    emittedAt: new Date().toISOString(),
  };
}

export function createOfflineRulesAdapter(
  options: OfflineRulesAdapterOptions = {},
): EngineAdapter {
  const maxEchoChars = options.maxEchoChars ?? DEFAULT_OFFLINE_MAX_ECHO_CHARS;
  const choiceFixture = options.choiceFixture ?? DEFAULT_OFFLINE_CHOICE_FIXTURE;

  return {
    id: OFFLINE_RULES_ENGINE_ID,
    capabilities: OFFLINE_RULES_CAPABILITIES,
    async *startTurn(session, input, turnOptions) {
      let seq = 0;
      yield {
        ...meta(session, turnOptions, seq),
        type: NOOT_EVENT_TYPE_TEXT_DELTA,
        text: formatOfflineEcho(input.text, maxEchoChars),
      } satisfies NootEvent;
      seq += 1;

      if (shouldEmitOfflineChoices(input.text)) {
        yield {
          ...meta(session, turnOptions, seq),
          type: NOOT_EVENT_TYPE_CHOICES,
          prompt: choiceFixture.prompt,
          options: [...choiceFixture.options],
        } satisfies NootEvent;
        seq += 1;
      }

      yield {
        ...meta(session, turnOptions, seq),
        type: NOOT_EVENT_TYPE_USAGE,
        engine: OFFLINE_RULES_ENGINE_ID,
        model: turnOptions.model,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      } satisfies NootEvent;
      seq += 1;

      yield {
        ...meta(session, turnOptions, seq),
        type: NOOT_EVENT_TYPE_DONE,
        reason: DONE_REASON_COMPLETED,
      } satisfies NootEvent;
    },
    async cancel() {},
  };
}
