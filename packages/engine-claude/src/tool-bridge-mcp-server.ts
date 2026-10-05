import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolBridge, ToolOutcome } from '@noot/shared';
import { jsonSchemaToZodShape } from './json-schema-to-zod.js';
import { NOOT_BRAIN_MCP_SERVER_NAME } from './constants.js';

function outcomeToCallToolResult(outcome: ToolOutcome): CallToolResult {
  if (outcome.ok) {
    const text =
      typeof outcome.result === 'string' ? outcome.result : JSON.stringify(outcome.result ?? null);
    return { content: [{ type: 'text', text }] };
  }
  return { content: [{ type: 'text', text: outcome.error }], isError: true };
}

export function createToolBridgeMcpServer(bridge: ToolBridge) {
  const sdkTools = bridge.definitions.map((definition) => {
    const inputSchema = jsonSchemaToZodShape(definition.inputSchema);
    return tool(
      definition.name,
      definition.description,
      inputSchema,
      async (args) => {
        const outcome = await bridge.execute({
          callId: crypto.randomUUID(),
          name: definition.name,
          args,
        });
        return outcomeToCallToolResult(outcome);
      },
      { alwaysLoad: true },
    );
  });

  const server = createSdkMcpServer({
    name: NOOT_BRAIN_MCP_SERVER_NAME,
    version: '1.0.0',
    instructions: 'Tools owned by Noot BrainCore; execute only what the brain exposes.',
    tools: sdkTools,
    alwaysLoad: true,
  });

  return {
    serverName: NOOT_BRAIN_MCP_SERVER_NAME,
    config: server,
  };
}
