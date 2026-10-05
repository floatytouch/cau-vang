import type { ToolBridge, ToolDefinition, ToolInvocation, ToolOutcome } from '@noot/shared';

export type ToolHandler = (args: unknown) => Promise<ToolOutcome>;

interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(definition: ToolDefinition, handler: ToolHandler): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool ${definition.name} is already registered`);
    }
    this.tools.set(definition.name, { definition, handler });
  }

  definitions(): ToolDefinition[] {
    return [...this.tools.values()].map((entry) => entry.definition);
  }

  async execute(invocation: ToolInvocation): Promise<ToolOutcome> {
    const entry = this.tools.get(invocation.name);
    if (!entry) {
      return { ok: false, error: `Unknown tool ${invocation.name}` };
    }
    try {
      return await entry.handler(invocation.args);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `Tool ${invocation.name} threw: ${reason}` };
    }
  }

  createBridge(): ToolBridge {
    return {
      definitions: this.definitions(),
      execute: (invocation: ToolInvocation) => this.execute(invocation),
    };
  }
}

export function registerSampleTools(registry: ToolRegistry): void {
  registry.register(
    {
      name: 'echo_message',
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
  );

  registry.register(
    {
      name: 'now_iso',
      description: 'Returns the current time in ISO-8601 (sample brain tool).',
      inputSchema: { type: 'object', properties: {} },
    },
    async () => ({ ok: true, result: { now: new Date().toISOString() } }),
  );
}
