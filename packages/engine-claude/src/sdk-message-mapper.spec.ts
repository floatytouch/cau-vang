import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { describe, expect, it } from 'vitest';

import { EventSequence } from './event-sequence.js';
import { SdkMessageMapper } from './sdk-message-mapper.js';

describe('SdkMessageMapper', () => {
  it('maps stream text and thinking deltas', () => {
    const mapper = new SdkMessageMapper(new EventSequence('s1', 't1'), 'claude-sonnet-5');
    const messages: SDKMessage[] = [
      {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'thinking_delta', text: 'Hmm' } },
        parent_tool_use_id: null,
        uuid: 'u1',
        session_id: 'claude-s1',
      } as SDKMessage,
      {
        type: 'stream_event',
        event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hi' } },
        parent_tool_use_id: null,
        uuid: 'u2',
        session_id: 'claude-s1',
      } as SDKMessage,
    ];

    const types = messages.flatMap((message) => mapper.mapMessage(message).map((event) => event.type));
    expect(types).toEqual(['thinking_delta', 'text_delta']);
  });
});
