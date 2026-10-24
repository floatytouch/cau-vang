import {
  DONE_REASON_CANCELLED,
  DONE_REASON_COMPLETED,
  DONE_REASON_FAILED,
  ENGINE_TOOL_LOOP_BARE_API,
  NOOT_EVENT_TYPE_DONE,
  NOOT_EVENT_TYPE_ERROR,
  NOOT_EVENT_TYPE_TEXT_DELTA,
  NOOT_EVENT_TYPE_USAGE,
  TURN_ERROR_CODE_ENGINE_ERROR,
  TURN_ERROR_CODE_ENGINE_UNAVAILABLE,
} from '@noot/shared';
import type {
  EngineAdapter,
  EngineCapabilities,
  EngineSession,
  NootEvent,
  TurnInput,
  TurnOptions,
} from '@noot/shared';
import { OpenAiApiError, OpenAiClient } from './openai-client.js';
import {
  OpenAiCredentialsError,
  resolveOpenAiClientConfig,
  type OpenAiClientConfigInput,
} from './openai-config.js';
import { buildOpenAiMessages } from './openai-messages.js';

export const OPENAI_ENGINE_ID = 'openai-compatible';

const EMPTY_ANSWER_ERROR_CODE = 'empty_answer';
const MISSING_CREDENTIALS_ERROR_CODE = 'missing_credentials';

export const OPENAI_CAPABILITIES: EngineCapabilities = {
  toolLoop: ENGINE_TOOL_LOOP_BARE_API,
  thinkingStream: false,
  sessions: false,
  choices: false,
};

export interface OpenAiAdapterOptions extends OpenAiClientConfigInput {
  client?: OpenAiClient;
  requestTimeoutMs?: number;
}

export function createOpenAiAdapter(options: OpenAiAdapterOptions = {}): EngineAdapter {
  const { client, apiKey, baseUrl, requestTimeoutMs } = options;
  const resolveClient = client
    ? () => client
    : () =>
        new OpenAiClient({
          config: resolveOpenAiClientConfig({ apiKey, baseUrl }),
          requestTimeoutMs,
        });
  return new OpenAiEngineAdapter(resolveClient);
}

class OpenAiEngineAdapter implements EngineAdapter {
  readonly id = OPENAI_ENGINE_ID;
  readonly capabilities = OPENAI_CAPABILITIES;

  private readonly resolveClient: () => OpenAiClient;
  private readonly abortByTurn = new Map<string, AbortController>();

  constructor(resolveClient: () => OpenAiClient) {
    this.resolveClient = resolveClient;
  }

  async *startTurn(
    session: EngineSession,
    input: TurnInput,
    options: TurnOptions,
  ): AsyncIterable<NootEvent> {
    const abort = new AbortController();
    this.abortByTurn.set(options.turnId, abort);

    let seq = 0;
    const meta = () => {
      const eventSeq = seq;
      seq += 1;
      return {
        sessionId: session.sessionId,
        turnId: options.turnId,
        seq: eventSeq,
        emittedAt: new Date().toISOString(),
      };
    };

    try {
      const messages = buildOpenAiMessages(options.systemPrompt, session.history, input.text);
      const client = this.resolveClient();
      const result = await client.complete(options.model, messages, abort.signal);

      if (abort.signal.aborted) {
        yield { ...meta(), type: NOOT_EVENT_TYPE_DONE, reason: DONE_REASON_CANCELLED };
        return;
      }

      if (!result.content) {
        yield {
          ...meta(),
          type: NOOT_EVENT_TYPE_ERROR,
          code: EMPTY_ANSWER_ERROR_CODE,
          message: 'OpenAI-compatible API returned an empty answer.',
          recoverable: false,
        };
        yield { ...meta(), type: NOOT_EVENT_TYPE_DONE, reason: DONE_REASON_FAILED };
        return;
      }

      yield { ...meta(), type: NOOT_EVENT_TYPE_TEXT_DELTA, text: result.content };

      if (result.inputTokens > 0 || result.outputTokens > 0) {
        yield {
          ...meta(),
          type: NOOT_EVENT_TYPE_USAGE,
          engine: this.id,
          model: options.model,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        };
      }

      yield { ...meta(), type: NOOT_EVENT_TYPE_DONE, reason: DONE_REASON_COMPLETED };
    } catch (error) {
      if (abort.signal.aborted) {
        yield { ...meta(), type: NOOT_EVENT_TYPE_DONE, reason: DONE_REASON_CANCELLED };
        return;
      }
      const mapped = mapTurnError(error);
      yield {
        ...meta(),
        type: NOOT_EVENT_TYPE_ERROR,
        code: mapped.code,
        message: mapped.message,
        recoverable: mapped.recoverable,
      };
      yield { ...meta(), type: NOOT_EVENT_TYPE_DONE, reason: DONE_REASON_FAILED };
    } finally {
      if (this.abortByTurn.get(options.turnId) === abort) {
        this.abortByTurn.delete(options.turnId);
      }
    }
  }

  async cancel(turnId: string): Promise<void> {
    this.abortByTurn.get(turnId)?.abort();
  }
}

function mapTurnError(error: unknown): { code: string; message: string; recoverable: boolean } {
  if (error instanceof OpenAiCredentialsError) {
    return {
      code: MISSING_CREDENTIALS_ERROR_CODE,
      message: error.message,
      recoverable: false,
    };
  }
  if (error instanceof OpenAiApiError) {
    return {
      code: TURN_ERROR_CODE_ENGINE_UNAVAILABLE,
      message: error.message,
      recoverable: false,
    };
  }
  return {
    code: TURN_ERROR_CODE_ENGINE_ERROR,
    message: error instanceof Error ? error.message : String(error),
    recoverable: false,
  };
}
