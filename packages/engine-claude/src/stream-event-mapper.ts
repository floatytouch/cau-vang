import type { SDKPartialAssistantMessage } from '@anthropic-ai/claude-agent-sdk';
import type { NootEvent } from '@noot/shared';

import type { EventSequence } from './event-sequence.js';
import type { ToolCallRegistry } from './tool-call-registry.js';

interface StreamingToolBlock {
  callId: string;
  partialJson: string;
}

type RawStreamEvent = SDKPartialAssistantMessage['event'];

/**
 * Maps raw Messages API stream events. While a streamed message is open, the
 * complete `assistant` messages the SDK also yields repeat the same content, so
 * `isStreamingMessage` tells the assistant mapper to skip them.
 */
export class StreamEventMapper {
  private readonly toolBlocks = new Map<number, StreamingToolBlock>();
  private streaming = false;

  constructor(
    private readonly sequence: EventSequence,
    private readonly toolCalls: ToolCallRegistry,
  ) {}

  get isStreamingMessage(): boolean {
    return this.streaming;
  }

  map(event: RawStreamEvent): NootEvent[] {
    switch (event.type) {
      case 'message_start':
        this.streaming = true;
        this.toolBlocks.clear();
        return [];
      case 'message_stop':
        this.streaming = false;
        return [];
      case 'content_block_start':
        return this.mapBlockStart(event.index, event.content_block);
      case 'content_block_delta':
        return this.mapBlockDelta(event.index, event.delta);
      case 'content_block_stop':
        return this.mapBlockStop(event.index);
      default:
        return [];
    }
  }

  private mapBlockStart(
    index: number,
    block: { type: string; id?: string; name?: string },
  ): NootEvent[] {
    if (block.type !== 'tool_use') {
      return [];
    }
    const { callId, events } = this.toolCalls.start(block.id, block.name, {});
    this.toolBlocks.set(index, { callId, partialJson: '' });
    return events;
  }

  private mapBlockDelta(
    index: number,
    delta: { type: string; text?: string; thinking?: string; partial_json?: string },
  ): NootEvent[] {
    if (delta.type === 'text_delta' && delta.text) {
      return [{ ...this.sequence.meta(), type: 'text_delta', text: delta.text }];
    }
    if (delta.type === 'thinking_delta' && delta.thinking) {
      return [{ ...this.sequence.meta(), type: 'thinking_delta', text: delta.thinking }];
    }
    if (delta.type !== 'input_json_delta' || !delta.partial_json) {
      return [];
    }
    const block = this.toolBlocks.get(index);
    if (!block) {
      return [];
    }
    block.partialJson += delta.partial_json;
    const args = parseCompleteJson(block.partialJson);
    if (args === undefined) {
      return [];
    }
    return [
      {
        ...this.sequence.meta(),
        type: 'tool_call',
        phase: 'update',
        status: 'running',
        callId: block.callId,
        name: this.toolCalls.nameOf(block.callId),
        args,
      },
    ];
  }

  private mapBlockStop(index: number): NootEvent[] {
    const block = this.toolBlocks.get(index);
    if (!block) {
      return [];
    }
    this.toolBlocks.delete(index);
    return this.toolCalls.choicesFor(block.callId, parseCompleteJson(block.partialJson) ?? {});
  }
}

/** Partial tool JSON is only surfaced once it parses; half an object is not an argument. */
function parseCompleteJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
