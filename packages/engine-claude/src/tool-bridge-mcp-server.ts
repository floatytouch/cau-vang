import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolBridge, ToolDefinition, ToolOutcome } from '@noot/shared';
import { jsonSchemaToZodShape } from './json-schema-to-zod.js';
import { NOOT_BRAIN_MCP_SERVER_NAME } from './constants.js';

const BRIDGE_SERVER_VERSION = '1.0.0';
// The CLI puts the model's tool_use id here; reusing it lets the brain join execute() with tool_call events.
const TOOL_USE_ID_META_KEY = 'claudecode/toolUseId';

function outcomeToCallToolResult(outcome: ToolOutcome): CallToolResult {
  if (outcome.ok) {
    const text =
      typeof outcome.result === 'string' ? outcome.result : JSON.stringify(outcome.result ?? null);
    return { content: [{ type: 'text', text }] };
  }
  return { content: [{ type: 'text', text: outcome.error }], isError: true };
}

export function toolUseIdFromExtra(extra: unknown): string {
  const meta = (extra as { _meta?: Record<string, unknown> } | undefined)?._meta;
  const toolUseId = meta?.[TOOL_USE_ID_META_KEY];
  return typeof toolUseId === 'string' && toolUseId.length > 0 ? toolUseId : crypto.randomUUID();
}

function bridgeTool(bridge: ToolBridge, definition: ToolDefinition) {
  const inputSchema = jsonSchemaToZodShape(definition.name, definition.inputSchema);
  return tool(
    definition.name,
    definition.description,
    inputSchema,
    async (args, extra) => {
      const outcome = await bridge.execute({
        callId: toolUseIdFromExtra(extra),
        name: definition.name,
        args,
      });
      return outcomeToCallToolResult(outcome);
    },
    { alwaysLoad: true },
  );
}

/** No server `instructions`: the CLI injects them into the model context next to the brain's prompt. */
export function createToolBridgeMcpServer(bridge: ToolBridge) {
  const server = createSdkMcpServer({
    name: NOOT_BRAIN_MCP_SERVER_NAME,
    version: BRIDGE_SERVER_VERSION,
    tools: bridge.definitions.map((definition) => bridgeTool(bridge, definition)),
    alwaysLoad: true,
  });

  return {
    serverName: NOOT_BRAIN_MCP_SERVER_NAME,
    config: server,
  };
}
