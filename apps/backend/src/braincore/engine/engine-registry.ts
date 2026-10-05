import type { EngineAdapter } from '@noot/shared';

export class EngineRegistry {
  private readonly engines = new Map<string, EngineAdapter>();

  register(adapter: EngineAdapter): void {
    if (this.engines.has(adapter.id)) {
      throw new Error(`Engine ${adapter.id} is already registered`);
    }
    this.engines.set(adapter.id, adapter);
  }

  get(engineId: string): EngineAdapter {
    const adapter = this.engines.get(engineId);
    if (!adapter) {
      throw new Error(`Unknown engine ${engineId}`);
    }
    return adapter;
  }

  has(engineId: string): boolean {
    return this.engines.has(engineId);
  }

  listIds(): string[] {
    return [...this.engines.keys()].sort();
  }
}
