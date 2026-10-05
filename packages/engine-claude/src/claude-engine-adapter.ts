import type { Query } from '@anthropic-ai/claude-agent-sdk';
import type { EngineAdapter, EngineSession, NootEvent, TurnInput, TurnOptions } from '@noot/shared';

import type { ClaudeQueryFactory } from './claude-query-factory.js';
import { defaultClaudeQueryFactory } from './claude-query-factory.js';
import { CLAUDE_ENGINE_CAPABILITIES, CLAUDE_ENGINE_ID } from './constants.js';
import { EventSequence } from './event-sequence.js';
import { oauthSubprocessEnv } from './oauth-subprocess-env.js';
import { SdkMessageMapper } from './sdk-message-mapper.js';
import { SessionHandleStore } from './session-handle-store.js';
import { createToolBridgeMcpServer } from './tool-bridge-mcp-server.js';

interface ActiveTurn {
  abortController: AbortController;
  query?: Query;
}

export interface ClaudeEngineAdapterOptions {
  queryFactory?: ClaudeQueryFactory;
  sessionHandles?: SessionHandleStore;
}

export class ClaudeEngineAdapter implements EngineAdapter {
  readonly id = CLAUDE_ENGINE_ID;
  readonly capabilities = CLAUDE_ENGINE_CAPABILITIES;

  private readonly queryFactory: ClaudeQueryFactory;
  private readonly sessionHandles: SessionHandleStore;
  private readonly activeTurns = new Map<string, ActiveTurn>();

  constructor(options: ClaudeEngineAdapterOptions = {}) {
    this.queryFactory = options.queryFactory ?? defaultClaudeQueryFactory;
    this.sessionHandles = options.sessionHandles ?? new SessionHandleStore();
  }

  async *startTurn(
    session: EngineSession,
    input: TurnInput,
    options: TurnOptions,
  ): AsyncIterable<NootEvent> {
    const sequence = new EventSequence(session.sessionId, options.turnId);
    const mapper = new SdkMessageMapper(sequence, options.model);
    const abortController = new AbortController();
    this.activeTurns.set(options.turnId, { abortController });

    let doneReason: 'completed' | 'cancelled' | 'failed' = 'completed';
    let sawError = false;

    const mcpServers = buildMcpServers(options.tools);
    const claudeResumeId = this.sessionHandles.claudeSessionIdFor(session.sessionId);

    const queryOptions = {
      model: options.model,
      systemPrompt: options.systemPrompt,
      tools: [] as string[],
      settingSources: [] as [],
      includePartialMessages: true,
      permissionMode: 'bypassPermissions' as const,
      allowDangerouslySkipPermissions: true,
      abortController,
      env: oauthSubprocessEnv(),
      strictMcpConfig: mcpServers !== undefined,
      mcpServers,
      ...(claudeResumeId ? { resume: claudeResumeId } : {}),
    };

    const claudeQuery = this.queryFactory({ prompt: input.text, options: queryOptions });
    const active = this.activeTurns.get(options.turnId);
    if (active) {
      active.query = claudeQuery;
    }

    try {
      for await (const message of claudeQuery) {
        if (typeof message.session_id === 'string') {
          this.sessionHandles.remember(session.sessionId, message.session_id);
        }

        const mapped = mapper.mapMessage(message);
        for (const event of mapped) {
          if (event.type === 'error') {
            sawError = true;
          }
          yield event;
        }

        if (abortController.signal.aborted) {
          doneReason = 'cancelled';
          break;
        }
      }
    } catch (error) {
      sawError = true;
      doneReason = 'failed';
      yield {
        ...sequence.meta(),
        type: 'error',
        code: 'engine_unavailable',
        message: error instanceof Error ? error.message : String(error),
        recoverable: false,
      };
    } finally {
      this.activeTurns.delete(options.turnId);
      if (abortController.signal.aborted) {
        doneReason = 'cancelled';
      } else if (sawError) {
        doneReason = 'failed';
      }
      yield { ...sequence.meta(), type: 'done', reason: doneReason };
    }
  }

  async cancel(turnId: string): Promise<void> {
    const active = this.activeTurns.get(turnId);
    if (!active) {
      return;
    }
    active.abortController.abort();
    if (active.query?.interrupt) {
      try {
        await active.query.interrupt();
      } catch {
        // interrupt is best-effort; abort still stops the turn
      }
    }
  }
}

function buildMcpServers(
  tools: TurnOptions['tools'],
): Record<string, ReturnType<typeof createToolBridgeMcpServer>['config']> | undefined {
  if (!tools || tools.definitions.length === 0) {
    return undefined;
  }
  const { serverName, config } = createToolBridgeMcpServer(tools);
  return { [serverName]: config };
}
