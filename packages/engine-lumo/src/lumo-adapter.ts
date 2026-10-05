import type {
  EngineAdapter,
  EngineCapabilities,
  EngineSession,
  NootEvent,
  TurnInput,
  TurnOptions,
} from '@noot/shared';
import {
  LumoCredentialsError,
  resolveLumoClientConfig,
  type LumoClientConfigInput,
} from './lumo-config.js';
import { LumoApiError, LumoProxyClient } from './lumo-proxy-client.js';
import {
  resolveLumoRecapBudgets,
  type LumoRecapBudgets,
} from './recap-budget.js';
import { buildLumoChatMessages } from './recap-window.js';

export const LUMO_ENGINE_ID = 'lumo';

export const LUMO_CAPABILITIES: EngineCapabilities = {
  toolLoop: 'bareApi',
  thinkingStream: false,
  sessions: false,
  choices: false,
};

export interface LumoAdapterOptions extends LumoClientConfigInput {
  budgets?: Partial<LumoRecapBudgets>;
  client?: LumoProxyClient;
  requestTimeoutMs?: number;
}

export function createLumoAdapter(options: LumoAdapterOptions = {}): EngineAdapter {
  const { client, apiKey, baseUrl, budgets, requestTimeoutMs } = options;
  const recapBudgets = resolveLumoRecapBudgets(budgets);
  // Resolved per turn so a missing key fails that turn, not the process that registers engines.
  const resolveClient = client
    ? () => client
    : () =>
        new LumoProxyClient({
          config: resolveLumoClientConfig({ apiKey, baseUrl }),
          requestTimeoutMs,
        });
  return new LumoEngineAdapter(resolveClient, recapBudgets);
}

class LumoEngineAdapter implements EngineAdapter {
  readonly id = LUMO_ENGINE_ID;
  readonly capabilities = LUMO_CAPABILITIES;

  private readonly resolveClient: () => LumoProxyClient;
  private readonly budgets: LumoRecapBudgets;
  private readonly abortByTurn = new Map<string, AbortController>();

  constructor(resolveClient: () => LumoProxyClient, budgets: LumoRecapBudgets) {
    this.resolveClient = resolveClient;
    this.budgets = budgets;
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
      const messages = buildLumoChatMessages(
        options.systemPrompt,
        session.history,
        input.text,
        this.budgets,
      );
      const client = this.resolveClient();
      const result = await client.complete(options.model, messages, abort.signal);

      if (abort.signal.aborted) {
        yield { ...meta(), type: 'done', reason: 'cancelled' };
        return;
      }

      if (!result.content) {
        yield {
          ...meta(),
          type: 'error',
          code: 'empty_answer',
          message: 'Lumo returned an empty answer.',
          recoverable: false,
        };
        yield { ...meta(), type: 'done', reason: 'failed' };
        return;
      }

      yield { ...meta(), type: 'text_delta', text: result.content };

      if (result.usage.inputTokens > 0 || result.usage.outputTokens > 0) {
        yield {
          ...meta(),
          type: 'usage',
          engine: this.id,
          model: options.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        };
      }

      yield { ...meta(), type: 'done', reason: 'completed' };
    } catch (error) {
      if (abort.signal.aborted) {
        yield { ...meta(), type: 'done', reason: 'cancelled' };
        return;
      }

      const mapped = mapTurnError(error);
      yield {
        ...meta(),
        type: 'error',
        code: mapped.code,
        message: mapped.message,
        recoverable: mapped.recoverable,
      };
      yield { ...meta(), type: 'done', reason: 'failed' };
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
  if (error instanceof LumoCredentialsError) {
    return {
      code: 'missing_credentials',
      message: error.message,
      recoverable: false,
    };
  }
  if (error instanceof LumoApiError) {
    return {
      code: 'engine_unavailable',
      message: `Lumo could not be reached (local lumo-tamer proxy is down or rejected the request): ${error.message}`,
      recoverable: false,
    };
  }
  return {
    code: 'engine_error',
    message: error instanceof Error ? error.message : String(error),
    recoverable: false,
  };
}
