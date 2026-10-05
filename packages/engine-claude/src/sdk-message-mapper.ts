import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { NootEvent } from '@noot/shared';

import type { EventSequence } from './event-sequence.js';
import { StreamEventMapper } from './stream-event-mapper.js';
import { ToolCallRegistry } from './tool-call-registry.js';
import { brainToolName } from './tool-names.js';
import { usageEventsFromModelUsage } from './usage-events.js';

type MessageOf<T extends SDKMessage['type']> = Extract<SDKMessage, { type: T }>;

/** Translates one turn's SDK messages into NootEvents; one instance per turn. */
export class SdkMessageMapper {
  private readonly toolCalls: ToolCallRegistry;
  private readonly streamEvents: StreamEventMapper;

  constructor(private readonly sequence: EventSequence) {
    this.toolCalls = new ToolCallRegistry(sequence);
    this.streamEvents = new StreamEventMapper(sequence, this.toolCalls);
  }

  mapMessage(message: SDKMessage): NootEvent[] {
    switch (message.type) {
      case 'stream_event':
        return this.streamEvents.map(message.event);
      case 'assistant':
        return this.mapAssistantMessage(message);
      case 'user':
        return this.mapUserMessage(message);
      case 'tool_progress':
        return this.mapToolProgress(message);
      case 'result':
        return this.mapResultMessage(message);
      case 'system':
        return message.subtype === 'permission_denied' ? this.mapPermissionDenied(message) : [];
      default:
        return [];
    }
  }

  private mapAssistantMessage(message: MessageOf<'assistant'>): NootEvent[] {
    const events: NootEvent[] = [];
    // Streamed content was already emitted delta by delta; only unstreamed (e.g. synthetic) messages carry new content.
    if (!this.streamEvents.isStreamingMessage) {
      for (const block of message.message.content) {
        events.push(...this.mapUnstreamedBlock(block));
      }
    }
    if (message.error) {
      events.push({
        ...this.sequence.meta(),
        type: 'error',
        code: message.error,
        message: `Claude assistant error: ${message.error}`,
        recoverable: false,
      });
    }
    return events;
  }

  private mapUnstreamedBlock(
    block: MessageOf<'assistant'>['message']['content'][number],
  ): NootEvent[] {
    if (block.type === 'thinking' && block.thinking) {
      return [{ ...this.sequence.meta(), type: 'thinking_delta', text: block.thinking }];
    }
    if (block.type === 'text' && block.text) {
      return [{ ...this.sequence.meta(), type: 'text_delta', text: block.text }];
    }
    if (block.type === 'tool_use') {
      const args = block.input ?? {};
      const { callId, events } = this.toolCalls.start(block.id, block.name, args);
      return [...events, ...this.toolCalls.choicesFor(callId, args)];
    }
    return [];
  }

  private mapUserMessage(message: MessageOf<'user'>): NootEvent[] {
    const content = message.message.content;
    if (!Array.isArray(content)) {
      return [];
    }
    const events: NootEvent[] = [];
    for (const block of content) {
      if (block.type !== 'tool_result') {
        continue;
      }
      const callId = block.tool_use_id;
      const base = {
        ...this.sequence.meta(),
        type: 'tool_call' as const,
        phase: 'end' as const,
        callId,
        name: this.toolCalls.nameOf(callId),
      };
      events.push(
        block.is_error === true
          ? { ...base, status: 'failed', error: stringifyToolContent(block.content) }
          : { ...base, status: 'succeeded', result: block.content ?? null },
      );
    }
    return events;
  }

  private mapToolProgress(message: MessageOf<'tool_progress'>): NootEvent[] {
    const name = brainToolName(message.tool_name);
    return [
      { ...this.sequence.meta(), type: 'progress', label: name },
      {
        ...this.sequence.meta(),
        type: 'tool_call',
        phase: 'update',
        status: 'running',
        callId: message.tool_use_id,
        name,
        message: `Running (${message.elapsed_time_seconds}s)`,
      },
    ];
  }

  private mapPermissionDenied(
    message: Extract<MessageOf<'system'>, { subtype: 'permission_denied' }>,
  ): NootEvent[] {
    return [
      {
        ...this.sequence.meta(),
        type: 'tool_call',
        phase: 'end',
        status: 'blocked',
        callId: message.tool_use_id,
        name: brainToolName(message.tool_name),
        error: message.message,
      },
    ];
  }

  private mapResultMessage(message: MessageOf<'result'>): NootEvent[] {
    const usage = usageEventsFromModelUsage(this.sequence, message.modelUsage);
    if (message.subtype === 'success') {
      return usage;
    }
    const errorText = message.errors.join('; ') || `Claude turn failed (${message.subtype})`;
    return [
      ...usage,
      {
        ...this.sequence.meta(),
        type: 'error',
        code: message.subtype,
        message: errorText,
        recoverable: false,
      },
    ];
  }
}

function stringifyToolContent(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content ?? null);
}
