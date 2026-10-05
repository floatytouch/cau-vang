import type { ToolBridge, ToolDefinition, ToolInvocation, ToolOutcome } from '@noot/shared';
import { decideMutatingToolAccess, type ToolAccessPolicy } from '../mode/tool-access-policy.js';

export type ToolHandler = (args: unknown) => Promise<ToolOutcome>;

export interface RegisterToolOptions {
  /** Default true: unknown tools stay gated in plan mode (fail closed). */
  mutating?: boolean;
}

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  mutating: boolean;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(
    definition: ToolDefinition,
    handler: ToolHandler,
    options: RegisterToolOptions = {},
  ): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool ${definition.name} is already registered`);
    }
    this.tools.set(definition.name, {
      definition,
      handler,
      mutating: options.mutating ?? true,
    });
  }

  definitions(policy?: ToolAccessPolicy): ToolDefinition[] {
    return [...this.tools.values()]
      .filter((entry) => policy?.allowMutating !== false || !entry.mutating)
      .map((entry) => entry.definition);
  }

  async execute(invocation: ToolInvocation, policy?: ToolAccessPolicy): Promise<ToolOutcome> {
    const entry = this.tools.get(invocation.name);
    if (!entry) {
      return { ok: false, error: `Unknown tool ${invocation.name}` };
    }
    if (entry.mutating) {
      const decision = decideMutatingToolAccess(policy, invocation.name);
      if (!decision.ok) {
        return { ok: false, error: decision.reason, blocked: true };
      }
    }
    try {
      return await entry.handler(invocation.args);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Tool ${invocation.name} threw: ${reason}` };
    }
  }

  createBridge(policy?: ToolAccessPolicy): ToolBridge {
    return {
      definitions: this.definitions(policy),
      execute: (invocation: ToolInvocation) => this.execute(invocation, policy),
    };
  }
}

export const ECHO_MESSAGE_TOOL_NAME = 'echo_message';

export function registerSampleTools(registry: ToolRegistry): void {
  registry.register(
    {
      name: ECHO_MESSAGE_TOOL_NAME,
      description: 'Returns the message argument unchanged (sample brain tool).',
      inputSchema: {
        type: 'object',
        properties: { message: { type: 'string' } },
        required: ['message'],
      },
    },
    async (args) => {
      const record = args as { message?: string };
      const message = typeof record.message === 'string' ? record.message : '';
      return { ok: true, result: { echoed: message } };
    },
    { mutating: false },
  );

  registry.register(
    {
      name: 'add_numbers',
      description: 'Adds two numbers (sample brain tool).',
      inputSchema: {
        type: 'object',
        properties: {
          left: { type: 'number' },
          right: { type: 'number' },
        },
        required: ['left', 'right'],
      },
    },
    async (args) => {
      const record = args as { left?: number; right?: number };
      if (typeof record.left !== 'number' || typeof record.right !== 'number') {
        return { ok: false, error: 'left and right must be numbers' };
      }
      return { ok: true, result: { sum: record.left + record.right } };
    },
    { mutating: false },
  );

  registry.register(
    {
      name: 'now_iso',
      description: 'Returns the current time in ISO-8601 (sample brain tool).',
      inputSchema: { type: 'object', properties: {} },
    },
    async () => ({ ok: true, result: { now: new Date().toISOString() } }),
    { mutating: false },
  );

  registry.register(
    {
      name: 'write_scratch',
      description: 'Writes a scratch note (sample mutating brain tool).',
      inputSchema: {
        type: 'object',
        properties: { note: { type: 'string' } },
        required: ['note'],
      },
    },
    async (args) => {
      const record = args as { note?: string };
      const note = typeof record.note === 'string' ? record.note : '';
      return { ok: true, result: { written: note } };
    },
    { mutating: true },
  );
}
