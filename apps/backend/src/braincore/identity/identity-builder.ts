import fs from 'node:fs/promises';
import path from 'node:path';

export interface IdentityConfigFile {
  baseSystemPromptAnchor: string;
  notModeSuffix: string;
  notModeEnabled: boolean;
  memoryContextFile: string;
}

export interface IdentityBuilderOptions {
  configDir: string;
  config?: IdentityConfigFile;
}

export class IdentityBuilder {
  private readonly configDir: string;
  private readonly config: IdentityConfigFile;

  constructor(options: IdentityBuilderOptions) {
    this.configDir = options.configDir;
    if (!options.config) {
      throw new Error('IdentityBuilder requires loaded identity config');
    }
    this.config = options.config;
  }

  static async load(configDir: string): Promise<IdentityBuilder> {
    const configPath = path.join(configDir, 'identity.json');
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as IdentityConfigFile;
    if (!parsed.baseSystemPromptAnchor?.trim()) {
      throw new Error(`identity.json missing baseSystemPromptAnchor (${configPath})`);
    }
    return new IdentityBuilder({ configDir, config: parsed });
  }

  async buildSystemPrompt(): Promise<string> {
    let prompt = this.config.baseSystemPromptAnchor.trim();
    if (this.config.notModeEnabled) {
      prompt += this.config.notModeSuffix;
    }
    prompt += await this.loadMemoryContext();
    return prompt;
  }

  private async loadMemoryContext(): Promise<string> {
    const fileName = this.config.memoryContextFile?.trim();
    if (!fileName) {
      return '';
    }
    const memoryPath = path.join(this.configDir, fileName);
    try {
      const text = await fs.readFile(memoryPath, 'utf8');
      return text.trim() ? `\n\n${text.trim()}` : '';
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return '';
      }
      throw error;
    }
  }
}
