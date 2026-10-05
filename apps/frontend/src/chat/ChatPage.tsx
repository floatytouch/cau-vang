import type { ChoiceOption, ConversationMode, EngineSummary } from '@noot/shared';
import { useEffect, useReducer, useState } from 'react';
import { defaultModelForEngine } from '../config/engine-models.js';
import type { FunnelConnectionState, FunnelPort } from '../funnel/funnel-port.js';
import { ChoicesBar } from './ChoicesBar.js';
import { chatReducer, createInitialChatState } from './chat-state.js';
import { ConnectionStatus } from './ConnectionStatus.js';
import { ModeToggle } from './ModeToggle.js';
import { ModelPicker } from './ModelPicker.js';
import { ThemeToggle } from './ThemeToggle.js';
import { ThinkingPanel } from './ThinkingPanel.js';
import { ToolCallRow } from './ToolCallRow.js';
import './chat.css';

const DEFAULT_ENGINE_ID = 'mock';

interface ChatPageProps {
  funnel: FunnelPort;
}

export function ChatPage({ funnel }: ChatPageProps) {
  const [connection, setConnection] = useState<FunnelConnectionState>(funnel.connectionState);
  const [engines, setEngines] = useState<EngineSummary[]>([]);
  const [state, dispatch] = useReducer(
    chatReducer,
    createInitialChatState(DEFAULT_ENGINE_ID, defaultModelForEngine(DEFAULT_ENGINE_ID)),
  );

  useEffect(() => {
    const stopConnection = funnel.onConnectionChange(setConnection);
    const stopEvents = funnel.onEvent((event) => dispatch({ type: 'turn/event', event }));
    let cancelled = false;

    void (async () => {
      try {
        await funnel.connect();
        if (cancelled) return;
        const listed = await funnel.listEngines();
        if (cancelled) return;
        setEngines(listed);
        const engineId = listed[0]?.id ?? DEFAULT_ENGINE_ID;
        const model = defaultModelForEngine(engineId);
        const session = await funnel.createSession(engineId, model);
        if (cancelled) return;
        await funnel.subscribeSession(session.id);
        if (cancelled) return;
        const details = await funnel.getHistory(session.id);
        if (cancelled) return;
        dispatch({
          type: 'session/loaded',
          sessionId: session.id,
          engineId: details.engineId,
          model: details.model,
          mode: details.mode,
          history: details.history,
        });
      } catch (error) {
        if (cancelled) return;
        dispatch({
          type: 'status/set',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();

    return () => {
      cancelled = true;
      stopConnection();
      stopEvents();
      funnel.disconnect();
    };
  }, [funnel]);

  async function sendText(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || !state.sessionId || state.streaming) {
      return;
    }
    dispatch({ type: 'turn/local-user', text: trimmed });
    const ack = await funnel.sendChat(state.sessionId, trimmed);
    dispatch({ type: 'turn/streaming', streaming: false });
    if (!ack.ok) {
      showError(ack.error ?? 'chat_send failed');
    }
  }

  async function onStop(): Promise<void> {
    if (!state.sessionId) return;
    const ack = await funnel.cancelTurn(state.sessionId, state.activeTurnId);
    if (!ack.ok) {
      showError(ack.error ?? 'cancel_turn failed');
    }
  }

  async function onEngineChange(engineId: string, model: string): Promise<void> {
    if (!state.sessionId) return;
    const ack = await funnel.setEngine(state.sessionId, engineId, model);
    if (!ack.ok) {
      showError(ack.error ?? 'set_engine failed');
      return;
    }
    const details = await funnel.getHistory(state.sessionId);
    dispatch({
      type: 'session/loaded',
      sessionId: state.sessionId,
      engineId: details.engineId,
      model: details.model,
      mode: details.mode,
      history: details.history,
    });
  }

  async function onModeChange(mode: ConversationMode): Promise<void> {
    if (!state.sessionId) return;
    const next = await funnel.setMode(state.sessionId, mode);
    dispatch({ type: 'mode/set', mode: next });
  }

  function showError(message: string): void {
    dispatch({ type: 'status/set', message });
  }

  function reportFailure(action: Promise<void>): void {
    action.catch((error: unknown) =>
      showError(error instanceof Error ? error.message : String(error)),
    );
  }

  async function onChoice(option: ChoiceOption): Promise<void> {
    if (state.choicesConsumed) return;
    dispatch({ type: 'choices/consumed' });
    await sendText(option.label);
  }

  return (
    <div className="noot-shell">
      <header className="noot-header">
        <h1 className="noot-brand">Noot</h1>
        <div className="noot-header-controls">
          <ConnectionStatus state={connection} />
          <ThemeToggle />
        </div>
      </header>

      <section className="noot-chat" aria-label="Chat">
        <div className="noot-toolbar">
          <ModelPicker
            engines={engines}
            engineId={state.engineId}
            model={state.model}
            disabled={!state.sessionId || state.streaming}
            onChange={(engineId, model) => reportFailure(onEngineChange(engineId, model))}
          />
          <ModeToggle
            mode={state.mode}
            disabled={!state.sessionId}
            onChange={(mode) => reportFailure(onModeChange(mode))}
          />
        </div>

        <div className="noot-messages" aria-live="polite">
          {state.history.map((message, index) => (
            <div key={`${message.ts}-${index}`} className="noot-bubble" data-role={message.role}>
              {message.text}
            </div>
          ))}

          {state.turn ? (
            <div className="noot-bubble" data-role="assistant" aria-busy={state.streaming}>
              <ThinkingPanel text={state.turn.thinking} defaultOpen={state.streaming} />
              {state.turn.tools.map((tool) => (
                <ToolCallRow key={tool.callId} tool={tool} />
              ))}
              {state.turn.progressLabel ? (
                <p className="noot-progress" role="status">
                  {state.turn.progressLabel}
                  {state.turn.progressFraction !== undefined
                    ? ` (${Math.round(state.turn.progressFraction * 100)}%)`
                    : ''}
                </p>
              ) : null}
              {state.streaming && state.turn.text ? <p>{state.turn.text}</p> : null}
              {state.turn.usageLabel ? <p className="noot-usage">{state.turn.usageLabel}</p> : null}
              {state.turn.errorMessage ? (
                <p className="noot-error" role="alert">
                  {state.turn.errorMessage}
                </p>
              ) : null}
              {state.turn.doneReason === 'cancelled' ? (
                <p className="noot-status" role="status">
                  Stopped
                </p>
              ) : null}
            </div>
          ) : null}

          <ChoicesBar
            prompt={state.choicesPrompt}
            options={state.choices}
            disabled={state.choicesConsumed || state.streaming}
            onSelect={(option) => reportFailure(onChoice(option))}
          />
        </div>

        {state.statusMessage ? (
          <p className="noot-error" role="alert">
            {state.statusMessage}
          </p>
        ) : null}

        <form
          className="noot-composer"
          onSubmit={(event) => {
            event.preventDefault();
            reportFailure(sendText(state.draft));
          }}
        >
          <label className="visually-hidden" htmlFor="chat-draft">
            Message
          </label>
          <textarea
            id="chat-draft"
            value={state.draft}
            placeholder="Message Noot"
            disabled={!state.sessionId || state.streaming}
            onChange={(event) => dispatch({ type: 'draft/set', draft: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                reportFailure(sendText(state.draft));
              }
            }}
          />
          <button
            type="button"
            className="noot-btn"
            data-variant="danger"
            disabled={!state.streaming}
            onClick={() => reportFailure(onStop())}
          >
            Stop
          </button>
          <button
            type="submit"
            className="noot-btn"
            data-variant="primary"
            disabled={!state.sessionId || state.streaming || !state.draft.trim()}
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
