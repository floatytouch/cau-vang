import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { ToolBridge, ToolInvocation } from '@noot/shared';
import { describe, expect, it } from 'vitest';

import { createToolBridgeMcpServer } from '../src/tool-bridge-mcp-server.js';

async function connect(bridge: ToolBridge): Promise<Client> {
  const { config } = createToolBridgeMcpServer(bridge);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await (config as unknown as { instance: McpServer }).instance.connect(serverTransport);
  const client = new Client({ name: 'probe', version: '1.0.0' });
  await client.connect(clientTransport);
  return client;
}

function recordingBridge(): { bridge: ToolBridge; invocations: ToolInvocation[] } {
  const invocations: ToolInvocation[] = [];
  return {
    invocations,
    bridge: {
      definitions: [
        {
          name: 'get_weather',
          description: 'Weather for a city',
          inputSchema: {
            type: 'object',
            properties: { city: { type: 'string', description: 'City' } },
            required: ['city'],
          },
        },
      ],
      execute: async (invocation) => {
        invocations.push(invocation);
        return invocation.args && (invocation.args as { city?: string }).city === 'fail'
          ? { ok: false, error: 'brain gate refused' }
          : { ok: true, result: { forecast: 'sunny' } };
      },
    },
  };
}

describe('createToolBridgeMcpServer', () => {
  it('adds no server instructions to the model context', async () => {
    const client = await connect(recordingBridge().bridge);
    expect(client.getInstructions()).toBeUndefined();
  });

  it('exposes the brain schema with descriptions', async () => {
    const client = await connect(recordingBridge().bridge);
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: 'get_weather',
      description: 'Weather for a city',
      inputSchema: {
        properties: { city: { type: 'string', description: 'City' } },
        required: ['city'],
      },
    });
  });

  it('executes through the brain with the model tool_use id as callId', async () => {
    const { bridge, invocations } = recordingBridge();
    const client = await connect(bridge);
    const result = await client.callTool({
      name: 'get_weather',
      arguments: { city: 'Hanoi' },
      _meta: { 'claudecode/toolUseId': 'toolu_123' },
    });
    expect(invocations).toEqual([
      { callId: 'toolu_123', name: 'get_weather', args: { city: 'Hanoi' } },
    ]);
    expect(result).toMatchObject({ content: [{ type: 'text', text: '{"forecast":"sunny"}' }] });
  });

  it('returns brain refusals as MCP errors', async () => {
    const client = await connect(recordingBridge().bridge);
    const result = await client.callTool({ name: 'get_weather', arguments: { city: 'fail' } });
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: 'text', text: 'brain gate refused' }],
    });
  });

  it('rejects arguments that break the schema before reaching the brain', async () => {
    const { bridge, invocations } = recordingBridge();
    const client = await connect(bridge);
    const result = await client.callTool({ name: 'get_weather', arguments: { city: 42 } });
    expect(result).toMatchObject({ isError: true });
    expect(invocations).toHaveLength(0);
  });
});
