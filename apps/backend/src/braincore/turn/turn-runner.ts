import {
  isBareApiEngine,
  isHarnessEngine,
  type EngineAdapter,
  type EngineSession,
  type NootEvent,
  type ToolInvocation,
  type TurnInput,
  type TurnOptions,
} from '@noot/shared';
import { TOOL_RESULTS_INPUT_PREFIX } from '../session/session-types.js';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { TurnEventRelay } from './event-relay.js';

const MAX_BARE_API_STEPS = 12;

export interface RunTurnParams {
  adapter: EngineAdapter;
  session: EngineSession;
  input: TurnInput;
  options: TurnOptions;
  toolRegistry: ToolRegistry;
}

export async function* runConversationTurn(params: RunTurnParams): AsyncGenerator<NootEvent> {
  if (isHarnessEngine(params.adapter.capabilities)) {
    yield* forwardHarnessTurn(params);
    return;
  }
  if (isBareApiEngine(params.adapter.capabilities)) {
    yield* runBareApiToolLoop(params);
    return;
  }
  throw new Error(`Engine ${params.adapter.id} has unknown toolLoop mode`);
}

async function* forwardHarnessTurn(params: RunTurnParams): AsyncGenerator<NootEvent> {
  const relay = new TurnEventRelay(params.session.sessionId, params.options.turnId);
  for await (const event of params.adapter.startTurn(
    params.session,
    params.input,
    params.options,
  )) {
    yield relay.relay(event);
  }
}

async function* runBareApiToolLoop(params: RunTurnParams): AsyncGenerator<NootEvent> {
  const relay = new TurnEventRelay(params.session.sessionId, params.options.turnId);
  let stepInput: TurnInput = params.input;
  let engineSession: EngineSession = params.session;

  for (let step = 0; step < MAX_BARE_API_STEPS; step += 1) {
    const pendingTools: ToolInvocation[] = [];
    let terminalDone: NootEvent | undefined;

    for await (const event of params.adapter.startTurn(engineSession, stepInput, params.options)) {
      const relayed = relay.relay(event);
      yield relayed;
      if (relayed.type === 'tool_call' && relayed.phase === 'start') {
        pendingTools.push({
          callId: relayed.callId,
          name: relayed.name,
          args: relayed.args,
        });
      }
      if (relayed.type === 'done') {
        terminalDone = relayed;
      }
    }

    if (!terminalDone) {
      throw new Error('Engine stream ended without done event');
    }
    if (terminalDone.type !== 'done' || terminalDone.reason !== 'completed') {
      return;
    }
    if (pendingTools.length === 0) {
      return;
    }

    const toolMessages: string[] = [];
    for (const invocation of pendingTools) {
      const outcome = await params.toolRegistry.execute(invocation);
      yield relay.relay({
        type: 'tool_call',
        phase: 'end',
        callId: invocation.callId,
        name: invocation.name,
        status: outcome.ok ? 'succeeded' : 'failed',
        result: outcome.ok ? outcome.result : undefined,
        error: outcome.ok ? undefined : outcome.error,
        sessionId: params.session.sessionId,
        turnId: params.options.turnId,
        seq: 0,
        emittedAt: new Date().toISOString(),
      });
      const payload = outcome.ok
        ? JSON.stringify(outcome.result)
        : JSON.stringify({ error: outcome.error });
      toolMessages.push(`${invocation.name}(${invocation.callId})=${payload}`);
    }

    stepInput = {
      text: `${TOOL_RESULTS_INPUT_PREFIX}${toolMessages.join('|')}`,
    };
    engineSession = {
      sessionId: params.session.sessionId,
      history: [...params.session.history],
    };
  }

  throw new Error(`Bare API tool loop exceeded ${MAX_BARE_API_STEPS} steps`);
}
