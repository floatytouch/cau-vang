import { Agent, CursorAgentError, type AgentOptions, type Run, type SDKAgent } from '@cursor/sdk';
import type { EngineAdapter, EngineSession, NootEvent, TurnInput, TurnOptions } from '@noot/shared';
import {
  CURSOR_ENGINE_CAPABILITIES,
  CURSOR_ENGINE_ID,
  DEFAULT_TURN_TIMEOUT_MS,
} from './constants.js';
import { resolveCursorApiKeyOptional } from './resolve-api-key.js';
import { createToolCallTracker, mapSdkMessageToNootEvents } from './sdk-message-mapper.js';
import { toolBridgeToCustomTools } from './tool-bridge-custom-tools.js';
import { TurnEventBuilder } from './turn-event-builder.js';

export interface CursorEngineAdapterConfig {
  /** Working directory for the local Cursor agent (brief / project root). */
  cwd: string;
  apiKey?: string;
  turnTimeoutMs?: number;
}

export interface CursorEngineAdapterDeps {
  createAgent: (options: AgentOptions) => Promise<SDKAgent>;
}

interface ActiveTurn {
  run: Run;
  cancelRequested: boolean;
}

interface SessionEntry {
  agent: SDKAgent;
}

const defaultDeps: CursorEngineAdapterDeps = {
  createAgent: (options) => Agent.create(options),
};

export function createCursorEngineAdapter(
  config: CursorEngineAdapterConfig,
  deps: CursorEngineAdapterDeps = defaultDeps,
): EngineAdapter {
  const turnTimeoutMs = config.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
  const sessions = new Map<string, SessionEntry>();
  const activeTurns = new Map<string, ActiveTurn>();

  return {
    id: CURSOR_ENGINE_ID,
    capabilities: CURSOR_ENGINE_CAPABILITIES,

    async *startTurn(
      session: EngineSession,
      input: TurnInput,
      options: TurnOptions,
    ): AsyncIterable<NootEvent> {
      const builder = new TurnEventBuilder(session.sessionId, options.turnId);
      const toolTracker = createToolCallTracker();
      let doneReason: 'completed' | 'cancelled' | 'failed' = 'completed';

      const emitError = (code: string, message: string, recoverable: boolean): NootEvent => ({
        ...builder.meta(),
        type: 'error',
        code,
        message,
        recoverable,
      });

      const emitDone = (reason: 'completed' | 'cancelled' | 'failed'): NootEvent => ({
        ...builder.meta(),
        type: 'done',
        reason,
      });

      let run: Run | undefined;
      let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

      try {
        const agent = await getOrCreateSessionAgent(
          sessions,
          session.sessionId,
          config,
          deps,
          options,
        );
        run = await agent.send(input.text, buildSendOptions(options));

        const active: ActiveTurn = { run, cancelRequested: false };
        activeTurns.set(options.turnId, active);

        timeoutHandle = setTimeout(() => {
          void run?.cancel();
        }, turnTimeoutMs);

        let usageFromStream = false;

        for await (const message of run.stream()) {
          if (active.cancelRequested) {
            doneReason = 'cancelled';
            break;
          }
          const mapped = mapSdkMessageToNootEvents(message, builder, options.model, toolTracker);
          for (const event of mapped) {
            if (event.type === 'usage') {
              usageFromStream = true;
            }
            yield event;
          }
        }

        const result = await run.wait();
        if (active.cancelRequested || result.status === 'cancelled' || run.status === 'cancelled') {
          doneReason = 'cancelled';
        } else if (result.status === 'error') {
          doneReason = 'failed';
          yield emitError(
            result.error?.code ?? 'engine_error',
            result.error?.message ?? 'Cursor run failed',
            false,
          );
        }

        if (!usageFromStream && result.usage) {
          yield {
            ...builder.meta(),
            type: 'usage',
            engine: CURSOR_ENGINE_ID,
            model: options.model,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            cacheReadTokens: result.usage.cacheReadTokens,
            cacheWriteTokens: result.usage.cacheWriteTokens,
          };
        }
      } catch (error) {
        doneReason = 'failed';
        if (error instanceof CursorAgentError) {
          yield emitError('engine_unavailable', error.message, error.isRetryable);
        } else if (error instanceof Error) {
          yield emitError('engine_error', error.message, false);
        } else {
          yield emitError('engine_error', 'Unknown Cursor adapter failure', false);
        }
      } finally {
        if (timeoutHandle !== undefined) {
          clearTimeout(timeoutHandle);
        }
        activeTurns.delete(options.turnId);
        yield emitDone(doneReason);
      }
    },

    async cancel(turnId: string): Promise<void> {
      const active = activeTurns.get(turnId);
      if (active === undefined) {
        return;
      }
      active.cancelRequested = true;
      if (active.run.supports('cancel')) {
        await active.run.cancel();
      }
    },
  };
}

async function getOrCreateSessionAgent(
  sessions: Map<string, SessionEntry>,
  sessionId: string,
  config: CursorEngineAdapterConfig,
  deps: CursorEngineAdapterDeps,
  options: TurnOptions,
): Promise<SDKAgent> {
  const existing = sessions.get(sessionId);
  if (existing !== undefined) {
    return existing.agent;
  }

  const apiKey = resolveCursorApiKeyOptional(config.apiKey);
  const customTools = options.tools ? toolBridgeToCustomTools(options.tools) : undefined;
  const agent = await deps.createAgent({
    ...(apiKey !== undefined ? { apiKey } : {}),
    model: { id: options.model },
    systemPrompt: options.systemPrompt,
    tools: customTools ? ['mcp'] : undefined,
    local: {
      cwd: config.cwd,
      settingSources: [],
      customTools,
    },
  });
  sessions.set(sessionId, { agent });
  return agent;
}

function buildSendOptions(options: TurnOptions) {
  const customTools = options.tools ? toolBridgeToCustomTools(options.tools) : undefined;
  if (customTools === undefined) {
    return undefined;
  }
  return { local: { customTools } };
}
