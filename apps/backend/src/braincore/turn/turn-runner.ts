import {
  CONVERSATION_ROLE_ASSISTANT,
  CONVERSATION_ROLE_USER,
  DONE_REASON_COMPLETED,
  DONE_REASON_FAILED,
  isBareApiEngine,
  isHarnessEngine,
  NOOT_EVENT_TYPE_DONE,
  NOOT_EVENT_TYPE_ERROR,
  NOOT_EVENT_TYPE_PROGRESS,
  NOOT_EVENT_TYPE_TEXT_DELTA,
  NOOT_EVENT_TYPE_TOOL_CALL,
  TOOL_CALL_PHASE_END,
  TOOL_CALL_PHASE_START,
  TOOL_CALL_STATUS_FAILED,
  TOOL_CALL_STATUS_SUCCEEDED,
  type ConversationMessage,
  type DoneEvent,
  type EngineAdapter,
  type EngineSession,
  type NootEvent,
  type ToolCallTerminalStatus,
  type ToolInvocation,
  type ToolOutcome,
  type TurnInput,
  type TurnOptions,
} from '@noot/shared';
import type { ToolRegistry } from '../tools/tool-registry.js';
import { PROGRESS_STAGE } from '../usage/progress-stages.js';
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
 * BrainCore stage markers (`progress`) bookend the stream so the app can track turn progress.
 */
export async function* runConversationTurn(params: RunTurnParams): AsyncGenerator<NootEvent> {
  const relay = new TurnEventRelay(params.session.sessionId, params.options.turnId);
  yield progress(relay, PROGRESS_STAGE.STARTING, 0);
  try {
    if (isHarnessEngine(params.adapter.capabilities)) {
      const step = yield* streamStep(params, params.session, params.input, relay);
      yield progress(relay, PROGRESS_STAGE.FINISHING, 1);
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
    yield relay.relay({ ...relay.meta(), type: NOOT_EVENT_TYPE_DONE, reason: DONE_REASON_FAILED });
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
    if (outcome.done.reason !== DONE_REASON_COMPLETED || outcome.pendingTools.length === 0) {
      yield progress(relay, PROGRESS_STAGE.FINISHING, 1);
      yield relay.relay(outcome.done);
      return;
    }

    yield progress(relay, PROGRESS_STAGE.RUNNING_TOOLS);
    const results: { callId: string; name: string; outcome: unknown }[] = [];
    for (const invocation of outcome.pendingTools) {
      const toolOutcome = await params.toolRegistry.execute(invocation);
      yield relay.relay({
        ...relay.meta(),
        type: NOOT_EVENT_TYPE_TOOL_CALL,
        phase: TOOL_CALL_PHASE_END,
        callId: invocation.callId,
        name: invocation.name,
        ...toolCallEndFields(toolOutcome),
      });
      results.push({ callId: invocation.callId, name: invocation.name, outcome: toolOutcome });
    }

    history.push(
      { role: CONVERSATION_ROLE_USER, text: stepInput.text },
      { role: CONVERSATION_ROLE_ASSISTANT, text: describeStep(outcome) },
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
    if (event.type === NOOT_EVENT_TYPE_DONE) {
      return { done: event, text: textParts.join(''), pendingTools };
    }
    yield relay.relay(event);
    if (event.type === NOOT_EVENT_TYPE_TEXT_DELTA) {
      textParts.push(event.text);
    }
    if (event.type === NOOT_EVENT_TYPE_TOOL_CALL && event.phase === TOOL_CALL_PHASE_START) {
      pendingTools.push({ callId: event.callId, name: event.name, args: event.args });
    }
  }
  throw new Error(`Engine ${params.adapter.id} ended its stream without a done event`);
}

function progress(relay: TurnEventRelay, label: string, fraction?: number): NootEvent {
  return relay.relay({
    ...relay.meta(),
    type: NOOT_EVENT_TYPE_PROGRESS,
    label,
    ...(fraction === undefined ? {} : { fraction }),
  });
}

function describeStep(outcome: StepOutcome): string {
  const calls = outcome.pendingTools.map(
    (call) => `[tool_call ${call.name}(${call.callId}) ${JSON.stringify(call.args)}]`,
  );
  return [outcome.text, ...calls].filter(Boolean).join('\n');
}

function toolCallEndFields(toolOutcome: ToolOutcome): {
  status: ToolCallTerminalStatus;
  result: unknown;
  error: string | undefined;
} {
  if (toolOutcome.ok) {
    return {
      status: TOOL_CALL_STATUS_SUCCEEDED,
      result: toolOutcome.result,
      error: undefined,
    };
  }
  return {
    status: TOOL_CALL_STATUS_FAILED,
    result: undefined,
    error: toolOutcome.error,
  };
}

function failureEvent(relay: TurnEventRelay, error: unknown): NootEvent {
  return {
    ...relay.meta(),
    type: NOOT_EVENT_TYPE_ERROR,
    code: TURN_FAILED_ERROR_CODE,
    message: error instanceof Error ? error.message : String(error),
    recoverable: false,
  };
}
