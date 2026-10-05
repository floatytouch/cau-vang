import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { NootEvent, UsageEvent } from '@noot/shared';

import { choicesFromAskUserQuestionArgs } from './choices-from-tool.js';
import type { EventSequence } from './event-sequence.js';
import { CLAUDE_ENGINE_ID } from './constants.js';

interface ToolBlockState {
  callId: string;
  name: string;
  partialJson: string;
  started: boolean;
}

export class SdkMessageMapper {
  private readonly toolBlocks = new Map<number, ToolBlockState>();
  private readonly engineModel: string;

  constructor(
    private readonly sequence: EventSequence,
    engineModel: string,
  ) {
    this.engineModel = engineModel;
  }

  mapMessage(message: SDKMessage): NootEvent[] {
    switch (message.type) {
      case 'stream_event':
        return this.mapStreamEvent(message);
      case 'assistant':
        return this.mapAssistantMessage(message);
      case 'user':
        return this.mapUserMessage(message);
      case 'tool_progress':
        return [
          {
            ...this.sequence.meta(),
            type: 'progress',
            label: message.tool_name,
            fraction: undefined,
          },
          {
            ...this.sequence.meta(),
            type: 'tool_call',
            phase: 'update',
            status: 'running',
            callId: message.tool_use_id,
            name: message.tool_name,
            message: `Running (${message.elapsed_time_seconds}s)`,
          },
        ];
      case 'result':
        return this.mapResultMessage(message);
      case 'system':
        if (message.subtype === 'permission_denied') {
          return [
            {
              ...this.sequence.meta(),
              type: 'tool_call',
              phase: 'end',
              status: 'blocked',
              callId: message.tool_use_id,
              name: message.tool_name,
              error: message.message,
            },
          ];
        }
        return [];
      default:
        return [];
    }
  }

  private mapStreamEvent(message: SDKMessage & { type: 'stream_event' }): NootEvent[] {
    const event = message.event;
    if (!event || typeof event !== 'object') {
      return [];
    }

    const eventType = (event as { type?: string }).type;
    if (eventType === 'content_block_delta') {
      const delta = (event as { delta?: { type?: string; text?: string; partial_json?: string } }).delta;
      if (!delta) {
        return [];
      }
      if (delta.type === 'text_delta' && typeof delta.text === 'string' && delta.text.length > 0) {
        return [{ ...this.sequence.meta(), type: 'text_delta', text: delta.text }];
      }
      if (delta.type === 'thinking_delta' && typeof delta.text === 'string' && delta.text.length > 0) {
        return [{ ...this.sequence.meta(), type: 'thinking_delta', text: delta.text }];
      }
      if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
        const index = (event as { index?: number }).index;
        if (typeof index !== 'number') {
          return [];
        }
        const state = this.toolBlocks.get(index);
        if (!state) {
          return [];
        }
        state.partialJson += delta.partial_json;
        return [
          {
            ...this.sequence.meta(),
            type: 'tool_call',
            phase: 'update',
            status: 'running',
            callId: state.callId,
            name: state.name,
            args: tryParseJson(state.partialJson),
          },
        ];
      }
    }

    if (eventType === 'content_block_start') {
      const index = (event as { index?: number }).index;
      const contentBlock = (event as { content_block?: { type?: string; id?: string; name?: string } })
        .content_block;
      if (typeof index !== 'number' || !contentBlock || contentBlock.type !== 'tool_use') {
        return [];
      }
      const callId = contentBlock.id ?? crypto.randomUUID();
      const name = contentBlock.name ?? 'unknown_tool';
      this.toolBlocks.set(index, { callId, name, partialJson: '', started: false });
      return [];
    }

    if (eventType === 'content_block_stop') {
      const index = (event as { index?: number }).index;
      if (typeof index !== 'number') {
        return [];
      }
      const state = this.toolBlocks.get(index);
      if (!state) {
        return [];
      }
      const args = tryParseJson(state.partialJson);
      const events: NootEvent[] = [];
      if (!state.started) {
        state.started = true;
        events.push({
          ...this.sequence.meta(),
          type: 'tool_call',
          phase: 'start',
          status: 'running',
          callId: state.callId,
          name: state.name,
          args,
        });
        const choices = choicesFromAskUserQuestionArgs(this.sequence.meta(), args);
        if (choices) {
          events.push(choices);
        }
      }
      this.toolBlocks.delete(index);
      return events;
    }

    return [];
  }

  private mapAssistantMessage(message: SDKMessage & { type: 'assistant' }): NootEvent[] {
    const events: NootEvent[] = [];
    const content = message.message.content;
    if (!Array.isArray(content)) {
      return events;
    }

    for (const block of content) {
      if (!block || typeof block !== 'object') {
        continue;
      }
      const blockType = (block as { type?: string }).type;
      if (blockType === 'thinking') {
        const thinking = (block as { thinking?: string }).thinking;
        if (typeof thinking === 'string' && thinking.length > 0) {
          events.push({ ...this.sequence.meta(), type: 'thinking_delta', text: thinking });
        }
      }
      if (blockType === 'text') {
        const text = (block as { text?: string }).text;
        if (typeof text === 'string' && text.length > 0) {
          events.push({ ...this.sequence.meta(), type: 'text_delta', text });
        }
      }
      if (blockType === 'tool_use') {
        const callId = (block as { id?: string }).id ?? crypto.randomUUID();
        const name = (block as { name?: string }).name ?? 'unknown_tool';
        const args = (block as { input?: unknown }).input;
        events.push({
          ...this.sequence.meta(),
          type: 'tool_call',
          phase: 'start',
          status: 'running',
          callId,
          name,
          args,
        });
        const choices = choicesFromAskUserQuestionArgs(this.sequence.meta(), args);
        if (choices) {
          events.push(choices);
        }
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

  private mapUserMessage(message: SDKMessage & { type: 'user' }): NootEvent[] {
    const events: NootEvent[] = [];
    const content = message.message.content;
    if (!Array.isArray(content)) {
      return events;
    }

    for (const block of content) {
      if (!block || typeof block !== 'object') {
        continue;
      }
      if ((block as { type?: string }).type !== 'tool_result') {
        continue;
      }
      const callId = (block as { tool_use_id?: string }).tool_use_id ?? crypto.randomUUID();
      const isError = (block as { is_error?: boolean }).is_error === true;
      const rawContent = (block as { content?: unknown }).content;
      if (isError) {
        events.push({
          ...this.sequence.meta(),
          type: 'tool_call',
          phase: 'end',
          status: 'failed',
          callId,
          name: 'tool',
          error: stringifyToolContent(rawContent),
        });
        continue;
      }
      events.push({
        ...this.sequence.meta(),
        type: 'tool_call',
        phase: 'end',
        status: 'succeeded',
        callId,
        name: 'tool',
        result: rawContent,
      });
    }

    return events;
  }

  private mapResultMessage(message: SDKMessage & { type: 'result' }): NootEvent[] {
    const events: NootEvent[] = [];

    if (message.subtype !== 'success') {
      const errorText =
        message.errors?.join('; ') ||
        (typeof message.result === 'string' ? message.result : 'Claude turn failed');
      events.push({
        ...this.sequence.meta(),
        type: 'error',
        code: message.subtype,
        message: errorText,
        recoverable: false,
      });
      return events;
    }

    const usage = pickUsage(this.sequence, message, this.engineModel);
    if (usage) {
      events.push(usage);
    }

    return events;
  }
}

function tryParseJson(partial: string): unknown {
  if (!partial) {
    return {};
  }
  try {
    return JSON.parse(partial) as unknown;
  } catch {
    return { _partial: partial };
  }
}

function stringifyToolContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  return JSON.stringify(content);
}

function pickUsage(
  sequence: EventSequence,
  message: SDKMessage & { type: 'result'; subtype: 'success' },
  fallbackModel: string,
): UsageEvent | undefined {
  const modelUsage = message.modelUsage;
  if (!modelUsage || typeof modelUsage !== 'object') {
    return undefined;
  }

  const modelKeys = Object.keys(modelUsage);
  const model = modelKeys.includes(fallbackModel) ? fallbackModel : modelKeys[0];
  if (!model) {
    return undefined;
  }

  const entry = modelUsage[model];
  if (!entry || typeof entry !== 'object') {
    return undefined;
  }

  const inputTokens = numberField(entry, 'inputTokens') ?? numberField(entry, 'input_tokens') ?? 0;
  const outputTokens = numberField(entry, 'outputTokens') ?? numberField(entry, 'output_tokens') ?? 0;
  const cacheReadTokens =
    numberField(entry, 'cacheReadInputTokens') ?? numberField(entry, 'cache_read_input_tokens');
  const cacheWriteTokens =
    numberField(entry, 'cacheCreationInputTokens') ?? numberField(entry, 'cache_write_input_tokens');
  const costUsd = numberField(entry, 'costUSD') ?? numberField(entry, 'cost_usd');

  return {
    ...sequence.meta(),
    type: 'usage',
    engine: CLAUDE_ENGINE_ID,
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    costUsd,
  };
}

function numberField(record: object, key: string): number | undefined {
  const value = (record as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
