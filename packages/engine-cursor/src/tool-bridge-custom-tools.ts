import type { SDKCustomTool, SDKJsonValue } from '@cursor/sdk';
import type { ToolBridge } from '@noot/shared';

function isJsonRecord(value: unknown): value is Record<string, SDKJsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toolBridgeToCustomTools(bridge: ToolBridge): Record<string, SDKCustomTool> {
  const tools: Record<string, SDKCustomTool> = {};

  for (const definition of bridge.definitions) {
    tools[definition.name] = {
      description: definition.description,
      inputSchema: definition.inputSchema as Record<string, SDKJsonValue>,
      execute: async (args, context) => {
        const invocationArgs = isJsonRecord(args) ? args : {};
        const outcome = await bridge.execute({
          callId: context.toolCallId ?? definition.name,
          name: definition.name,
          args: invocationArgs,
        });
        if (outcome.ok) {
          return outcome.result as SDKJsonValue;
        }
        return { content: [{ type: 'text', text: outcome.error }], isError: true };
      },
    };
  }

  return tools;
}
