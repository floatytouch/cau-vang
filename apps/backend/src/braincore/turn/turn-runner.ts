import {
  isBareApiEngine,
  isHarnessEngine,
  type ConversationMessage,
  type DoneEvent,
  type EngineAdapter,
  type EngineSession,
  type NootEvent,
  type ToolInvocation,
  type TurnInput,
  type TurnOptions,
} from '@noot/shared';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { TurnEventRelay } from './event-relay.js';

/** Marks a bare-API step input that carries tool results instead of typed text. */
export const TOOL_RESULTS_INPUT_PREFIX = '__tool_results__:';

export const TURN_FAILED_ERROR_CODE = 'turn_failed';

const MAX_BARE_API_STEPS = 12;

export interface RunTurnParams {
  adapter: EngineAdapter;
  session: EngineSession;
  input: TurnInput;
  options: TurnOptions;
  toolRegistry: ToolRegistry;
}

interface StepOutcome {
  done: DoneEvent;
  text: string;
  pendingTools: ToolInvocation[];
}

/**
 * Runs one turn and guarantees the envelope invariant: exactly one `done`, last.
 * A thrown engine or loop failure becomes `error` + `done(failed)` instead of a rejection.
 */
export async function* runConversationTurn(params: RunTurnParams): AsyncGenerator<NootEvent> {
  const relay = new TurnEventRelay(params.session.sessionId, params.options.turnId);
  try {
    if (isHarnessEngine(params.adapter.capabilities)) {
      const step = yield* streamStep(params, params.session, params.input, relay);
      yield relay.relay(step.done);
      return;
    }
    if (isBareApiEngine(params.adapter.capabilities)) {
      yield* runBareApiToolLoop(params, relay);
      return;
    }
    throw new Error(`Engine ${params.adapter.id} has unknown toolLoop mode`);
  } catch (error) {
    yield relay.relay(failureEvent(relay, error));
    yield relay.relay({ ...relay.meta(), type: 'done', reason: 'failed' });
  }
}

/** Settled design: one startTurn per model step; tool results go back in the NEXT step's input. */
async function* runBareApiToolLoop(
  params: RunTurnParams,
  relay: TurnEventRelay,
): AsyncGenerator<NootEvent> {
  const history: ConversationMessage[] = [...params.session.history];
  let stepInput = params.input;

  for (let step = 0; step < MAX_BARE_API_STEPS; step += 1) {
    const engineSession = { sessionId: params.session.sessionId, history: [...history] };
    const outcome = yield* streamStep(params, engineSession, stepInput, relay);
    if (outcome.done.reason !== 'completed' || outcome.pendingTools.length === 0) {
      yield relay.relay(outcome.done);
      return;
    }

    const results: { callId: string; name: string; outcome: unknown }[] = [];
    for (const invocation of outcome.pendingTools) {
      const toolOutcome = await params.toolRegistry.execute(invocation);
      yield relay.relay({
        ...relay.meta(),
        type: 'tool_call',
        phase: 'end',
        callId: invocation.callId,
        name: invocation.name,
        status: toolOutcome.ok ? 'succeeded' : 'failed',
        result: toolOutcome.ok ? toolOutcome.result : undefined,
        error: toolOutcome.ok ? undefined : toolOutcome.error,
      });
      results.push({ callId: invocation.callId, name: invocation.name, outcome: toolOutcome });
    }

    history.push(
      { role: 'user', text: stepInput.text },
      { role: 'assistant', text: describeStep(outcome) },
    );
    stepInput = { text: `${TOOL_RESULTS_INPUT_PREFIX}${JSON.stringify(results)}` };
  }

  throw new Error(`Bare API tool loop exceeded ${MAX_BARE_API_STEPS} steps`);
}

/** Relays one engine stream except its `done`, which the caller decides to emit or swallow. */
async function* streamStep(
  params: RunTurnParams,
  session: EngineSession,
  input: TurnInput,
  relay: TurnEventRelay,
): AsyncGenerator<NootEvent, StepOutcome> {
  const textParts: string[] = [];
  const pendingTools: ToolInvocation[] = [];
  for await (const event of params.adapter.startTurn(session, input, params.options)) {
    if (event.type === 'done') {
      return { done: event, text: textParts.join(''), pendingTools };
    }
    yield relay.relay(event);
    if (event.type === 'text_delta') {
      textParts.push(event.text);
    }
    if (event.type === 'tool_call' && event.phase === 'start') {
      pendingTools.push({ callId: event.callId, name: event.name, args: event.args });
    }
  }
  throw new Error(`Engine ${params.adapter.id} ended its stream without a done event`);
}

function describeStep(outcome: StepOutcome): string {
  const calls = outcome.pendingTools.map(
    (call) => `[tool_call ${call.name}(${call.callId}) ${JSON.stringify(call.args)}]`,
  );
  return [outcome.text, ...calls].filter(Boolean).join('\n');
}

function failureEvent(relay: TurnEventRelay, error: unknown): NootEvent {
  return {
    ...relay.meta(),
    type: 'error',
    code: TURN_FAILED_ERROR_CODE,
    message: error instanceof Error ? error.message : String(error),
    recoverable: false,
  };
}
