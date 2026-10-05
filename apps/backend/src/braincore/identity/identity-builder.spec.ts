import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveIdentityConfigDir } from '../braincore-paths.js';
import { IDENTITY_CONFIG_FILE, IdentityBuilder } from './identity-builder.js';

/** botcore `_BASE_SYSTEM_PROMPT` with NOT_MODE on and an empty `_load_memory_context()`. */
const BOTCORE_SYSTEM_PROMPT =
  'You are Noops. Your full persona, rules and ability index live in the project ' +
  'CLAUDE.md (auto-injected) \u2014 follow it to the letter.' +
  " N\u1ed1t mode is ON: your name is 'N\u1ed1t' -- refer to yourself as 'N\u1ed1t' (third " +
  "person) everywhere CLAUDE.md says 'Noops'; persona and every other rule " +
  'stay unchanged.';

describe('IdentityBuilder', () => {
  let configDir: string;

  beforeEach(async () => {
    configDir = await mkdtemp(path.join(os.tmpdir(), 'noot-NV-3-identity-'));
  });

  afterEach(async () => {
    await rm(configDir, { recursive: true, force: true });
  });

  async function writeConfig(config: unknown): Promise<void> {
    await writeFile(path.join(configDir, IDENTITY_CONFIG_FILE), JSON.stringify(config));
  }

  it('builds the shipped config byte-identical to the botcore prompt', async () => {
    const builder = await IdentityBuilder.load(resolveIdentityConfigDir());
    expect(await builder.buildSystemPrompt()).toBe(BOTCORE_SYSTEM_PROMPT);
  });

  it('appends the memory file verbatim and nothing else', async () => {
    await writeConfig({
      baseSystemPromptAnchor: ' anchor ',
      notModeSuffix: ' suffix',
      notModeEnabled: false,
      memoryContextFile: 'memory.txt',
    });
    await writeFile(path.join(configDir, 'memory.txt'), '\nfact one\n');
    const builder = await IdentityBuilder.load(configDir);
    expect(await builder.buildSystemPrompt()).toBe(' anchor \nfact one\n');
  });

  it('fails loud when a configured memory file is missing', async () => {
    await writeConfig({
      baseSystemPromptAnchor: 'anchor',
      notModeSuffix: '',
      notModeEnabled: false,
      memoryContextFile: 'missing.txt',
    });
    const builder = await IdentityBuilder.load(configDir);
    await expect(builder.buildSystemPrompt()).rejects.toThrow(/ENOENT/);
  });

  it.each([
    [{ notModeSuffix: '', notModeEnabled: true }, /baseSystemPromptAnchor/],
    [{ baseSystemPromptAnchor: 'a', notModeSuffix: '', notModeEnabled: 'yes' }, /notModeEnabled/],
    [{ baseSystemPromptAnchor: 'a', notModeEnabled: true }, /notModeSuffix/],
    [
      {
        baseSystemPromptAnchor: 'a',
        notModeSuffix: '',
        notModeEnabled: true,
        memoryContextFile: 3,
      },
      /memoryContextFile/,
    ],
  ])('rejects an invalid config %#', async (config, message) => {
    await writeConfig(config);
    await expect(IdentityBuilder.load(configDir)).rejects.toThrow(message);
  });
});
