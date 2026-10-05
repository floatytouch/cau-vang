import fs from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../persistence/atomic-write.js';

export const IDENTITY_CONFIG_FILE = 'identity.json';
export const DEFAULT_BOT_NAME = 'Noops';

export interface IdentityConfig {
  baseSystemPromptAnchor: string;
  /** User-settable display name; rendered into the system prompt by code. */
  botName: string;
  /** Optional file (relative to the config dir) whose contents are appended verbatim. */
  memoryContextFile?: string;
}

export class IdentityBuilder {
  private constructor(
    private readonly configDir: string,
    private config: IdentityConfig,
  ) {}

  static async load(configDir: string): Promise<IdentityBuilder> {
    const configPath = path.join(configDir, IDENTITY_CONFIG_FILE);
    const raw = await fs.readFile(configPath, 'utf8');
    return new IdentityBuilder(configDir, parseIdentityConfig(JSON.parse(raw), configPath));
  }

  getBotName(): string {
    return this.config.botName;
  }

  getConfig(): Readonly<IdentityConfig> {
    return this.config;
  }

  async setBotName(botName: string): Promise<void> {
    this.config = { ...this.config, botName: normalizeBotName(botName) };
    await this.persist();
  }

  /**
   * Renders: anchor + bot-name clause (when renamed) + optional memory file.
   * Name override is produced by code, never by a stored prompt suffix.
   */
  async buildSystemPrompt(): Promise<string> {
    return (
      this.config.baseSystemPromptAnchor +
      renderBotNameClause(this.config.botName) +
      (await this.loadMemoryContext())
    );
  }

  private async loadMemoryContext(): Promise<string> {
    const fileName = this.config.memoryContextFile;
    if (fileName === undefined) {
      return '';
    }
    return fs.readFile(path.join(this.configDir, fileName), 'utf8');
  }

  private async persist(): Promise<void> {
    const configPath = path.join(this.configDir, IDENTITY_CONFIG_FILE);
    await writeFileAtomic(configPath, `${JSON.stringify(this.config, null, 2)}\n`);
  }
}

/** Deterministic name clause: empty for the default persona name, otherwise an override line. */
export function renderBotNameClause(botName: string): string {
  if (botName === DEFAULT_BOT_NAME) {
    return '';
  }
  return (
    ` Your name is '${botName}' -- refer to yourself as '${botName}' (third ` +
    `person) everywhere CLAUDE.md says '${DEFAULT_BOT_NAME}'; persona and every other rule ` +
    'stay unchanged.'
  );
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
  const botNameRaw = record.botName;
  if (botNameRaw !== undefined && typeof botNameRaw !== 'string') {
    fail('botName', 'a string when present');
  }
  const memoryFile = record.memoryContextFile;
  if (memoryFile !== undefined && (typeof memoryFile !== 'string' || !memoryFile.trim())) {
    fail('memoryContextFile', 'a non-empty string when present');
  }
  return {
    baseSystemPromptAnchor: anchor as string,
    botName: botNameRaw === undefined ? DEFAULT_BOT_NAME : normalizeBotName(botNameRaw as string),
    memoryContextFile: memoryFile as string | undefined,
  };
}

function normalizeBotName(botName: string): string {
  const trimmed = botName.trim();
  if (!trimmed) {
    throw new Error('botName must be a non-empty string');
  }
  return trimmed;
}
