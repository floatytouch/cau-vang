import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_IDENTITY_CONFIG_DIR } from '../../../src/config/app-config.js';
import {
  DEFAULT_BOT_NAME,
  IDENTITY_CONFIG_FILE,
  IdentityBuilder,
  renderBotNameClause,
} from '../../../src/braincore/identity/identity-builder.js';

const SHIPPED_ANCHOR =
  'You are Noops. Your full persona, rules and ability index live in the project ' +
  'CLAUDE.md (auto-injected) — follow it to the letter.';

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

  it('builds the shipped default as anchor only (botName Noops, no memory)', async () => {
    const builder = await IdentityBuilder.load(DEFAULT_IDENTITY_CONFIG_DIR);
    expect(builder.getBotName()).toBe(DEFAULT_BOT_NAME);
    expect(await builder.buildSystemPrompt()).toBe(SHIPPED_ANCHOR);
  });

  it('renders a renamed bot by code and appends memory verbatim', async () => {
    await writeConfig({
      baseSystemPromptAnchor: 'anchor',
      botName: 'Nốt',
      memoryContextFile: 'memory.txt',
    });
    await writeFile(path.join(configDir, 'memory.txt'), '\nfact one\n');
    const builder = await IdentityBuilder.load(configDir);
    expect(await builder.buildSystemPrompt()).toBe(
      'anchor' + renderBotNameClause('Nốt') + '\nfact one\n',
    );
  });

  it('persists a user rename and rebuilds the prompt from the new botName', async () => {
    await writeConfig({ baseSystemPromptAnchor: 'anchor', botName: 'Noops' });
    const builder = await IdentityBuilder.load(configDir);
    await builder.setBotName('Nốt');
    expect(builder.getBotName()).toBe('Nốt');
    expect(await builder.buildSystemPrompt()).toBe('anchor' + renderBotNameClause('Nốt'));

    const onDisk = JSON.parse(
      await readFile(path.join(configDir, IDENTITY_CONFIG_FILE), 'utf8'),
    ) as { botName: string };
    expect(onDisk.botName).toBe('Nốt');

    const reloaded = await IdentityBuilder.load(configDir);
    expect(await reloaded.buildSystemPrompt()).toBe('anchor' + renderBotNameClause('Nốt'));
  });

  it('fails loud when a configured memory file is missing', async () => {
    await writeConfig({
      baseSystemPromptAnchor: 'anchor',
      botName: 'Noops',
      memoryContextFile: 'missing.txt',
    });
    const builder = await IdentityBuilder.load(configDir);
    await expect(builder.buildSystemPrompt()).rejects.toThrow(/ENOENT/);
  });

  it.each([
    [{ botName: 'Noops' }, /baseSystemPromptAnchor/],
    [{ baseSystemPromptAnchor: 'a', botName: 3 }, /botName/],
    [{ baseSystemPromptAnchor: 'a', botName: '   ' }, /botName/],
    [
      {
        baseSystemPromptAnchor: 'a',
        botName: 'Noops',
        memoryContextFile: 3,
      },
      /memoryContextFile/,
    ],
  ])('rejects an invalid config %#', async (config, message) => {
    await writeConfig(config);
    await expect(IdentityBuilder.load(configDir)).rejects.toThrow(message);
  });
});

describe('renderBotNameClause', () => {
  it('returns empty for the default persona name', () => {
    expect(renderBotNameClause(DEFAULT_BOT_NAME)).toBe('');
  });

  it('renders a UTF-8 rename clause without mode toggles', () => {
    expect(renderBotNameClause('Nốt')).toBe(
      " Your name is 'Nốt' -- refer to yourself as 'Nốt' (third " +
        "person) everywhere CLAUDE.md says 'Noops'; persona and every other rule " +
        'stay unchanged.',
    );
  });
});
