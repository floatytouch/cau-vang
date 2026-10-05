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

interface ToolCallTracker {
  started: Set<string>;
}

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
  const status = message.status === 'completed' ? 'succeeded' : 'failed';
  events.push({
    ...builder.meta(),
    type: 'tool_call',
    phase: 'end',
    status,
    ...base,
    result: message.status === 'completed' ? message.result : undefined,
    error: message.status === 'error' ? 'tool execution failed' : undefined,
  });
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
  return { started: new Set() };
}
