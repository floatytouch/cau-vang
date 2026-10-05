import fs from 'node:fs/promises';
import path from 'node:path';

export const IDENTITY_CONFIG_FILE = 'identity.json';

export interface IdentityConfig {
  baseSystemPromptAnchor: string;
  notModeSuffix: string;
  notModeEnabled: boolean;
  /** Optional file (relative to the config dir) whose contents are appended verbatim. */
  memoryContextFile?: string;
}

export class IdentityBuilder {
  private constructor(
    private readonly configDir: string,
    private readonly config: IdentityConfig,
  ) {}

  static async load(configDir: string): Promise<IdentityBuilder> {
    const configPath = path.join(configDir, IDENTITY_CONFIG_FILE);
    const raw = await fs.readFile(configPath, 'utf8');
    return new IdentityBuilder(configDir, parseIdentityConfig(JSON.parse(raw), configPath));
  }

  /** Mirrors botcore `_BASE_SYSTEM_PROMPT + _load_memory_context()`: plain concatenation, nothing added. */
  async buildSystemPrompt(): Promise<string> {
    let prompt = this.config.baseSystemPromptAnchor;
    if (this.config.notModeEnabled) {
      prompt += this.config.notModeSuffix;
    }
    return prompt + (await this.loadMemoryContext());
  }

  private async loadMemoryContext(): Promise<string> {
    const fileName = this.config.memoryContextFile;
    if (fileName === undefined) {
      return '';
    }
    return fs.readFile(path.join(this.configDir, fileName), 'utf8');
  }
}

function parseIdentityConfig(value: unknown, configPath: string): IdentityConfig {
  const record = (value ?? {}) as Record<string, unknown>;
  const fail = (field: string, expected: string): never => {
    throw new Error(`${configPath}: ${field} must be ${expected}`);
  };
  const anchor = record.baseSystemPromptAnchor;
  if (typeof anchor !== 'string' || !anchor.trim()) {
    fail('baseSystemPromptAnchor', 'a non-empty string');
  }
  if (typeof record.notModeEnabled !== 'boolean') {
    fail('notModeEnabled', 'a boolean');
  }
  if (typeof record.notModeSuffix !== 'string') {
    fail('notModeSuffix', 'a string');
  }
  const memoryFile = record.memoryContextFile;
  if (memoryFile !== undefined && (typeof memoryFile !== 'string' || !memoryFile.trim())) {
    fail('memoryContextFile', 'a non-empty string when present');
  }
  return {
    baseSystemPromptAnchor: anchor as string,
    notModeSuffix: record.notModeSuffix as string,
    notModeEnabled: record.notModeEnabled as boolean,
    memoryContextFile: memoryFile as string | undefined,
  };
}
