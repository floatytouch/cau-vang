import type { Options, Query, SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type {
  DoneReason,
  EngineAdapter,
  EngineSession,
  NootEvent,
  TurnInput,
  TurnOptions,
} from '@noot/shared';

import type { ClaudeQueryFactory } from './claude-query-factory.js';
import { defaultClaudeQueryFactory } from './claude-query-factory.js';
import { CLAUDE_ENGINE_CAPABILITIES, CLAUDE_ENGINE_ID } from './constants.js';
import { EventSequence } from './event-sequence.js';
import { oauthSubprocessEnv } from './oauth-subprocess-env.js';
import { SdkMessageMapper } from './sdk-message-mapper.js';
import { SessionHandleStore } from './session-handle-store.js';
import { createToolBridgeMcpServer } from './tool-bridge-mcp-server.js';

const ENGINE_FAILURE_CODE = 'engine_unavailable';

interface ActiveTurn {
  abortController: AbortController;
}

interface TurnState {
  sawError: boolean;
  /** The CLI reported `system/init`, i.e. the (resumed) session actually exists. */
  sessionEstablished: boolean;
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
    // Events dropped after a cancel must not leave seq gaps, so the final seq is stamped at yield time.
    const sequence = new EventSequence(session.sessionId, options.turnId);
    const mapper = new SdkMessageMapper(new EventSequence(session.sessionId, options.turnId));
    const abortController = new AbortController();
    this.activeTurns.set(options.turnId, { abortController });
    const state: TurnState = { sawError: false, sessionEstablished: false };
    const resumeId = this.sessionHandles.claudeSessionIdFor(session.sessionId);
    let claudeQuery: Query | undefined;

    try {
      claudeQuery = this.queryFactory({
        prompt: input.text,
        options: buildQueryOptions(options, abortController, resumeId),
      });
      for await (const message of claudeQuery) {
        this.trackSession(session.sessionId, message, state);
        for (const event of mapper.mapMessage(message)) {
          if (event.type === 'error') {
            if (abortController.signal.aborted) {
              continue;
            }
            state.sawError = true;
          }
          yield { ...event, ...sequence.meta() };
        }
        if (abortController.signal.aborted) {
          break;
        }
      }
    } catch (error) {
      // After a cancel the SDK throws "aborted by user"; after an error result it throws a summary of it.
      if (!abortController.signal.aborted && !state.sawError) {
        yield failureEvent(sequence, error);
      }
      state.sawError = true;
    } finally {
      this.activeTurns.delete(options.turnId);
      claudeQuery?.close();
    }

    if (resumeId && state.sawError && !state.sessionEstablished) {
      this.sessionHandles.forget(session.sessionId);
    }
    yield { ...sequence.meta(), type: 'done', reason: doneReason(abortController, state) };
  }

  /** Abort kills the CLI subprocess; `interrupt()` is not used because it needs streaming-input mode. */
  async cancel(turnId: string): Promise<void> {
    this.activeTurns.get(turnId)?.abortController.abort();
  }

  private trackSession(brainSessionId: string, message: SDKMessage, state: TurnState): void {
    if (message.type !== 'system' || message.subtype !== 'init') {
      return;
    }
    state.sessionEstablished = true;
    this.sessionHandles.remember(brainSessionId, message.session_id);
  }
}

function buildQueryOptions(
  options: TurnOptions,
  abortController: AbortController,
  resumeId: string | undefined,
): Options {
  const mcpServers = buildMcpServers(options.tools);
  return {
    model: options.model,
    systemPrompt: options.systemPrompt,
    tools: [],
    settingSources: [],
    // End-user text must not trigger CLI `@path` file expansion or slash commands.
    verbatimPrompts: true,
    thinking: { type: 'adaptive', display: 'summarized' },
    includePartialMessages: true,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,
    abortController,
    env: oauthSubprocessEnv(),
    strictMcpConfig: true,
    ...(mcpServers ? { mcpServers } : {}),
    ...(resumeId ? { resume: resumeId } : {}),
  };
}

function buildMcpServers(tools: TurnOptions['tools']): Options['mcpServers'] {
  if (!tools || tools.definitions.length === 0) {
    return undefined;
  }
  const { serverName, config } = createToolBridgeMcpServer(tools);
  return { [serverName]: config };
}

function failureEvent(sequence: EventSequence, error: unknown): NootEvent {
  return {
    ...sequence.meta(),
    type: 'error',
    code: ENGINE_FAILURE_CODE,
    message: error instanceof Error ? error.message : String(error),
    recoverable: false,
  };
}

function doneReason(abortController: AbortController, state: TurnState): DoneReason {
  if (abortController.signal.aborted) {
    return 'cancelled';
  }
  return state.sawError ? 'failed' : 'completed';
}
