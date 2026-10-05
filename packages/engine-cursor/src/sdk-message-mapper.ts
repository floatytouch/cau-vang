import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKThinkingMessage,
  SDKToolUseMessage,
  SDKUsageMessage,
} from '@cursor/sdk';
import type { NootEvent } from '@noot/shared';
import { CURSOR_ENGINE_ID } from './constants.js';
import type { TurnEventBuilder } from './turn-event-builder.js';

export interface ToolCallTracker {
  started: Set<string>;
  /** callId -> tool name for calls that have started but not ended. */
  open: Map<string, string>;
}

const TOOL_FAILED_WITHOUT_DETAIL = 'tool execution failed';
const TOOL_INTERRUPTED = 'turn ended before the tool call finished';

export function mapSdkMessageToNootEvents(
  message: SDKMessage,
  builder: TurnEventBuilder,
  model: string,
  toolTracker: ToolCallTracker,
): NootEvent[] {
  switch (message.type) {
    case 'thinking':
      return mapThinkingMessage(message, builder);
    case 'tool_call':
      return mapToolUseMessage(message, builder, toolTracker);
    case 'assistant':
      return mapAssistantMessage(message, builder);
    case 'usage':
      return mapUsageMessage(message, builder, model);
    default:
      return [];
  }
}

function mapThinkingMessage(message: SDKThinkingMessage, builder: TurnEventBuilder): NootEvent[] {
  if (message.text.length === 0) {
    return [];
  }
  return [{ ...builder.meta(), type: 'thinking_delta', text: message.text }];
}

function mapAssistantMessage(message: SDKAssistantMessage, builder: TurnEventBuilder): NootEvent[] {
  const events: NootEvent[] = [];
  for (const block of message.message.content) {
    if (block.type === 'text' && block.text.length > 0) {
      events.push({ ...builder.meta(), type: 'text_delta', text: block.text });
    }
  }
  return events;
}

function mapToolUseMessage(
  message: SDKToolUseMessage,
  builder: TurnEventBuilder,
  toolTracker: ToolCallTracker,
): NootEvent[] {
  const base = {
    callId: message.call_id,
    name: message.name,
  };
  const events: NootEvent[] = [];

  const ensureStarted = () => {
    if (toolTracker.started.has(message.call_id)) {
      return;
    }
    toolTracker.started.add(message.call_id);
    toolTracker.open.set(message.call_id, message.name);
    events.push({
      ...builder.meta(),
      type: 'tool_call',
      phase: 'start',
      status: 'running',
      ...base,
      args: message.args ?? {},
    });
  };

  if (message.status === 'running') {
    if (!toolTracker.started.has(message.call_id)) {
      ensureStarted();
      return events;
    }
    return [
      {
        ...builder.meta(),
        type: 'tool_call',
        phase: 'update',
        status: 'running',
        ...base,
        args: message.args,
      },
    ];
  }

  ensureStarted();
  toolTracker.open.delete(message.call_id);
  const succeeded = message.status === 'completed';
  events.push({
    ...builder.meta(),
    type: 'tool_call',
    phase: 'end',
    status: succeeded ? 'succeeded' : 'failed',
    ...base,
    result: succeeded ? message.result : undefined,
    error: succeeded ? undefined : toolErrorDetail(message.result),
  });
  return events;
}

function toolErrorDetail(result: unknown): string {
  if (typeof result === 'string' && result.length > 0) {
    return result;
  }
  return TOOL_FAILED_WITHOUT_DETAIL;
}

/** Ends every started-but-unfinished call so no tool row stays `running` after the turn. */
export function closeOpenToolCalls(
  builder: TurnEventBuilder,
  toolTracker: ToolCallTracker,
): NootEvent[] {
  const events: NootEvent[] = [];
  for (const [callId, name] of toolTracker.open) {
    events.push({
      ...builder.meta(),
      type: 'tool_call',
      phase: 'end',
      status: 'failed',
      callId,
      name,
      error: TOOL_INTERRUPTED,
    });
  }
  toolTracker.open.clear();
  return events;
}

function mapUsageMessage(
  message: SDKUsageMessage,
  builder: TurnEventBuilder,
  model: string,
): NootEvent[] {
  const usage = message.usage;
  return [
    {
      ...builder.meta(),
      type: 'usage',
      engine: CURSOR_ENGINE_ID,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
    },
  ];
}

export function createToolCallTracker(): ToolCallTracker {
  return { started: new Set(), open: new Map() };
}
