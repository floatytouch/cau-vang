import {
  NOOT_EVENT_TYPE_CHOICES,
  NOOT_EVENT_TYPE_DONE,
  NOOT_EVENT_TYPE_ERROR,
  NOOT_EVENT_TYPE_INTERNAL_NOTE,
  NOOT_EVENT_TYPE_PROGRESS,
  NOOT_EVENT_TYPE_TEXT_DELTA,
  NOOT_EVENT_TYPE_THINKING_DELTA,
  NOOT_EVENT_TYPE_TOOL_CALL,
  NOOT_EVENT_TYPE_USAGE,
  TOOL_CALL_PHASE_END,
  TOOL_CALL_PHASE_UPDATE,
  type ChoiceOption,
  type ConversationMode,
  type HistoryMessageDto,
  type NootEvent,
  type ToolCallStatus,
} from '@noot/shared';

export interface ChatToolCall {
  callId: string;
  name: string;
  status: ToolCallStatus;
  message?: string;
}

export interface ChatTurnView {
  turnId: string;
  text: string;
  thinking: string;
  tools: ChatToolCall[];
  progressLabel?: string;
  progressFraction?: number;
  usageLabel?: string;
  errorMessage?: string;
  doneReason?: string;
  internalNote?: string;
}

export interface ChatState {
  sessionId: string | undefined;
  engineId: string;
  model: string;
  mode: ConversationMode;
  history: HistoryMessageDto[];
  draft: string;
  streaming: boolean;
  activeTurnId: string | undefined;
  turn: ChatTurnView | undefined;
  choices: ChoiceOption[];
  choicesPrompt: string | undefined;
  choicesConsumed: boolean;
  statusMessage: string | undefined;
}

export type ChatAction =
  | {
      type: 'session/loaded';
      sessionId: string;
      engineId: string;
      model: string;
      mode: ConversationMode;
      history: HistoryMessageDto[];
    }
  | { type: 'draft/set'; draft: string }
  | { type: 'mode/set'; mode: ConversationMode }
  | { type: 'turn/local-user'; text: string }
  | { type: 'turn/streaming'; streaming: boolean }
  | { type: 'turn/event'; event: NootEvent }
  | { type: 'choices/consumed' }
  | { type: 'status/set'; message: string | undefined };

export function createInitialChatState(
  engineId: string,
  model: string,
  mode: ConversationMode = 'auto',
): ChatState {
  return {
    sessionId: undefined,
    engineId,
    model,
    mode,
    history: [],
    draft: '',
    streaming: false,
    activeTurnId: undefined,
    turn: undefined,
    choices: [],
    choicesPrompt: undefined,
    choicesConsumed: false,
    statusMessage: undefined,
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'session/loaded':
      return {
        ...state,
        sessionId: action.sessionId,
        engineId: action.engineId,
        model: action.model,
        mode: action.mode,
        history: action.history,
        turn: undefined,
        choices: [],
        choicesPrompt: undefined,
        choicesConsumed: false,
        streaming: false,
        activeTurnId: undefined,
      };
    case 'draft/set':
      return { ...state, draft: action.draft };
    case 'mode/set':
      return { ...state, mode: action.mode };
    case 'turn/local-user':
      return {
        ...state,
        draft: '',
        history: [
          ...state.history,
          { role: 'user', text: action.text, ts: new Date().toISOString() },
        ],
        turn: undefined,
        streaming: true,
        choicesConsumed: true,
        statusMessage: undefined,
      };
    case 'turn/streaming':
      return { ...state, streaming: action.streaming };
    case 'choices/consumed':
      return { ...state, choicesConsumed: true };
    case 'status/set':
      return { ...state, statusMessage: action.message };
    case 'turn/event':
      return applyEvent(state, action.event);
    default:
      return state;
  }
}

function applyEvent(state: ChatState, event: NootEvent): ChatState {
  if (state.sessionId && event.sessionId !== state.sessionId) {
    return state;
  }

  if (event.type === NOOT_EVENT_TYPE_CHOICES) {
    return {
      ...state,
      activeTurnId: event.turnId,
      choices: event.options,
      choicesPrompt: event.prompt,
      choicesConsumed: false,
      turn: reduceTurn(ensureTurn(state.turn, event.turnId), event),
    };
  }

  const turn = ensureTurn(state.turn, event.turnId);
  const next: ChatState = {
    ...state,
    activeTurnId: event.turnId,
    turn: reduceTurn(turn, event),
  };

  if (event.type === NOOT_EVENT_TYPE_DONE) {
    const assistantText = next.turn?.text.trim();
    return {
      ...next,
      streaming: false,
      activeTurnId: undefined,
      history: assistantText
        ? [...next.history, { role: 'assistant', text: assistantText, ts: event.emittedAt }]
        : next.history,
    };
  }
  if (event.type === NOOT_EVENT_TYPE_INTERNAL_NOTE) {
    return {
      ...next,
      history: [...next.history, { role: 'internal', text: event.text, ts: event.emittedAt }],
    };
  }
  return next;
}

function ensureTurn(turn: ChatTurnView | undefined, turnId: string): ChatTurnView {
  if (turn && turn.turnId === turnId) {
    return turn;
  }
  return {
    turnId,
    text: '',
    thinking: '',
    tools: [],
  };
}

function reduceTurn(turn: ChatTurnView, event: NootEvent): ChatTurnView {
  switch (event.type) {
    case NOOT_EVENT_TYPE_TEXT_DELTA:
      return { ...turn, text: turn.text + event.text };
    case NOOT_EVENT_TYPE_THINKING_DELTA:
      return { ...turn, thinking: turn.thinking + event.text };
    case NOOT_EVENT_TYPE_TOOL_CALL:
      return { ...turn, tools: upsertTool(turn.tools, event) };
    case NOOT_EVENT_TYPE_CHOICES:
      return turn;
    case NOOT_EVENT_TYPE_PROGRESS:
      return {
        ...turn,
        progressLabel: event.label,
        progressFraction: event.fraction,
      };
    case NOOT_EVENT_TYPE_USAGE:
      return {
        ...turn,
        usageLabel: `${event.engine}/${event.model}: ${event.inputTokens}+${event.outputTokens} tok`,
      };
    case NOOT_EVENT_TYPE_ERROR:
      return { ...turn, errorMessage: event.message };
    case NOOT_EVENT_TYPE_DONE:
      return { ...turn, doneReason: event.reason };
    case NOOT_EVENT_TYPE_INTERNAL_NOTE:
      return { ...turn, internalNote: event.text };
    default:
      return turn;
  }
}

function upsertTool(
  tools: ChatToolCall[],
  event: Extract<NootEvent, { type: typeof NOOT_EVENT_TYPE_TOOL_CALL }>,
): ChatToolCall[] {
  const existing = tools.find((tool) => tool.callId === event.callId);
  const nextTool: ChatToolCall = {
    callId: event.callId,
    name: event.name,
    status: event.status,
    message: toolMessage(event),
  };
  if (!existing) {
    return [...tools, nextTool];
  }
  return tools.map((tool) => (tool.callId === event.callId ? { ...tool, ...nextTool } : tool));
}

function toolMessage(
  event: Extract<NootEvent, { type: typeof NOOT_EVENT_TYPE_TOOL_CALL }>,
): string | undefined {
  if (event.phase === TOOL_CALL_PHASE_UPDATE) {
    return event.message;
  }
  if (event.phase === TOOL_CALL_PHASE_END) {
    return event.error;
  }
  return undefined;
}
