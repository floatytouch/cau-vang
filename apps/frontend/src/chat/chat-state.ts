import type {
  ChoiceOption,
  ConversationMode,
  HistoryMessageDto,
  NootEvent,
  ToolCallStatus,
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
  | { type: 'engine/set'; engineId: string; model: string }
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
    case 'engine/set':
      return { ...state, engineId: action.engineId, model: action.model };
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

  if (event.type === 'choices') {
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

  if (event.type === 'done') {
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
  if (event.type === 'internal_note') {
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
    case 'text_delta':
      return { ...turn, text: turn.text + event.text };
    case 'thinking_delta':
      return { ...turn, thinking: turn.thinking + event.text };
    case 'tool_call':
      return { ...turn, tools: upsertTool(turn.tools, event) };
    case 'choices':
      return turn;
    case 'progress':
      return {
        ...turn,
        progressLabel: event.label,
        progressFraction: event.fraction,
      };
    case 'usage':
      return {
        ...turn,
        usageLabel: `${event.engine}/${event.model}: ${event.inputTokens}+${event.outputTokens} tok`,
      };
    case 'error':
      return { ...turn, errorMessage: event.message };
    case 'done':
      return { ...turn, doneReason: event.reason };
    case 'internal_note':
      return { ...turn, internalNote: event.text };
    default:
      return turn;
  }
}

function upsertTool(
  tools: ChatToolCall[],
  event: Extract<NootEvent, { type: 'tool_call' }>,
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

function toolMessage(event: Extract<NootEvent, { type: 'tool_call' }>): string | undefined {
  if (event.phase === 'update') {
    return event.message;
  }
  if (event.phase === 'end') {
    return event.error;
  }
  return undefined;
}
