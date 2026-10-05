import {
  Agent,
  type AgentOptions,
  type RunResult,
  type SDKAgent,
  type SendOptions,
  type TokenUsage,
} from '@cursor/sdk';
import type {
  DoneReason,
  EngineAdapter,
  EngineSession,
  NootEvent,
  TurnInput,
  TurnOptions,
} from '@noot/shared';
import {
  CURSOR_ENGINE_CAPABILITIES,
  CURSOR_ENGINE_ID,
  DEFAULT_TURN_TIMEOUT_MS,
  TURN_ERROR_CODES,
} from './constants.js';
import { resolveCursorApiKey } from './resolve-api-key.js';
import {
  closeOpenToolCalls,
  createToolCallTracker,
  mapSdkMessageToNootEvents,
  type ToolCallTracker,
} from './sdk-message-mapper.js';
import { toolBridgeToCustomTools } from './tool-bridge-custom-tools.js';
import {
  describeException,
  describeRunFailure,
  statusFailureMessage,
  type TurnErrorDetail,
} from './turn-errors.js';
import { TurnControl } from './turn-control.js';
import { TurnEventBuilder } from './turn-event-builder.js';

export interface CursorEngineAdapterConfig {
  /** Working directory for the local Cursor agent (brief / project root). */
  cwd: string;
  /**
   * Optional Cursor API key from the host config layer (e.g. Nest ConfigService).
   * Omit to use @cursor/sdk stored login. Never read from process.env here.
   */
  apiKey?: string;
  turnTimeoutMs?: number;
}

export interface CursorEngineAdapterDeps {
  createAgent: (options: AgentOptions) => Promise<SDKAgent>;
}

interface TurnContext {
  control: TurnControl;
  builder: TurnEventBuilder;
  options: TurnOptions;
  toolTracker: ToolCallTracker;
}

/** A late agent stays in the session cache for the next turn; there is nothing to undo. */
const keepCachedAgent = async (): Promise<void> => {};

const defaultDeps: CursorEngineAdapterDeps = {
  createAgent: (options) => Agent.create(options),
};

export function createCursorEngineAdapter(
  config: CursorEngineAdapterConfig,
  deps: CursorEngineAdapterDeps = defaultDeps,
): EngineAdapter {
  const turnTimeoutMs = config.turnTimeoutMs ?? DEFAULT_TURN_TIMEOUT_MS;
  const sessionAgents = new Map<string, Promise<SDKAgent>>();
  const activeTurns = new Map<string, TurnControl>();

  const sessionAgent = (sessionId: string, options: TurnOptions): Promise<SDKAgent> => {
    const existing = sessionAgents.get(sessionId);
    if (existing !== undefined) {
      return existing;
    }
    const created = deps.createAgent(buildAgentOptions(config, options));
    sessionAgents.set(sessionId, created);
    created.catch(() => sessionAgents.delete(sessionId));
    return created;
  };

  return {
    id: CURSOR_ENGINE_ID,
    capabilities: CURSOR_ENGINE_CAPABILITIES,

    async *startTurn(
      session: EngineSession,
      input: TurnInput,
      options: TurnOptions,
    ): AsyncIterable<NootEvent> {
      const control = new TurnControl();
      const builder = new TurnEventBuilder(session.sessionId, options.turnId);
      const toolTracker = createToolCallTracker();
      activeTurns.set(options.turnId, control);
      const timeoutHandle = setTimeout(() => control.expire(), turnTimeoutMs);
      let doneReason: DoneReason = 'failed';

      try {
        const agentCreation = sessionAgent(session.sessionId, options);
        const context = { control, builder, options, toolTracker };
        doneReason = yield* runTurn(agentCreation, input, context);
      } catch (error) {
        yield errorEvent(builder, describeException(error));
      } finally {
        clearTimeout(timeoutHandle);
        activeTurns.delete(options.turnId);
        // Runs before any yield: an abandoned consumer never resumes this generator.
        await control.stopRun();
        yield* closeOpenToolCalls(builder, toolTracker);
        if (control.stopFailure !== undefined) {
          yield errorEvent(builder, {
            code: TURN_ERROR_CODES.cancelFailed,
            message: control.stopFailure,
            recoverable: false,
          });
        }
        yield { ...builder.meta(), type: 'done', reason: doneReason };
      }
    },

    async cancel(turnId: string): Promise<void> {
      await activeTurns.get(turnId)?.requestCancel();
    },
  };
}

async function* runTurn(
  agentCreation: Promise<SDKAgent>,
  input: TurnInput,
  context: TurnContext,
): AsyncGenerator<NootEvent, DoneReason> {
  const { control, builder, options, toolTracker } = context;
  const agent = await control.unlessStopped(agentCreation, keepCachedAgent);
  if (agent === undefined) {
    return yield* finishTurn(context, undefined);
  }
  const sending = agent.send(input.text, buildSendOptions(options));
  const run = await control.unlessStopped(sending, (lateRun) => lateRun.cancel());
  if (run === undefined) {
    return yield* finishTurn(context, undefined);
  }
  await control.attach(run);

  let usageFromStream = false;
  let streamFailure: string | undefined;
  for await (const message of run.stream()) {
    if (message.type === 'status') {
      streamFailure = statusFailureMessage(message) ?? streamFailure;
    }
    for (const event of mapSdkMessageToNootEvents(message, builder, options.model, toolTracker)) {
      usageFromStream ||= event.type === 'usage';
      yield event;
    }
  }

  const result = await run.wait();
  if (!usageFromStream && result.usage !== undefined) {
    yield usageEvent(builder, options.model, result.usage);
  }
  return yield* finishTurn(context, { result, streamFailure });
}

interface RunOutcome {
  result: RunResult;
  streamFailure: string | undefined;
}

async function* finishTurn(
  context: TurnContext,
  outcome: RunOutcome | undefined,
): AsyncGenerator<NootEvent, DoneReason> {
  const { control, builder, options } = context;
  if (control.timedOut) {
    yield errorEvent(builder, {
      code: TURN_ERROR_CODES.timeout,
      message: `Cursor turn ${options.turnId} exceeded the turn timeout and was cancelled`,
      recoverable: false,
    });
    return 'failed';
  }
  if (control.cancelRequested || outcome === undefined || outcome.result.status === 'cancelled') {
    return 'cancelled';
  }
  if (outcome.result.status === 'error') {
    yield errorEvent(builder, describeRunFailure(outcome.result, outcome.streamFailure));
    return 'failed';
  }
  return 'completed';
}

function errorEvent(builder: TurnEventBuilder, detail: TurnErrorDetail): NootEvent {
  return { ...builder.meta(), type: 'error', ...detail };
}

function usageEvent(builder: TurnEventBuilder, model: string, usage: TokenUsage): NootEvent {
  return {
    ...builder.meta(),
    type: 'usage',
    engine: CURSOR_ENGINE_ID,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  };
}

function buildAgentOptions(config: CursorEngineAdapterConfig, options: TurnOptions): AgentOptions {
  const apiKey = resolveCursorApiKey(config.apiKey);
  return {
    ...(apiKey !== undefined ? { apiKey } : {}),
    model: { id: options.model },
    systemPrompt: options.systemPrompt,
    tools: options.tools ? ['mcp'] : undefined,
    local: { cwd: config.cwd, settingSources: [] },
  };
}

/** Model and tools go on every send so a later turn never runs on the first turn's choices. */
function buildSendOptions(options: TurnOptions): SendOptions {
  return {
    model: { id: options.model },
    local: { customTools: options.tools ? toolBridgeToCustomTools(options.tools) : {} },
  };
}
