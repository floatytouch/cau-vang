import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONVERSATION_MODE_AUTO,
  CONVERSATION_MODE_PLAN,
  CONVERSATION_MODES,
  DEFAULT_CONVERSATION_MODE,
} from '@noot/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORK_MODE,
  WORK_MODE_AUTO,
  WORK_MODE_PLAN,
  WORK_MODES,
} from '../../../src/braincore/mode/work-mode.js';

const WORK_MODE_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../src/braincore/mode/work-mode.ts',
);
const WORK_MODE_SOURCE = readFileSync(WORK_MODE_FILE, 'utf8');

describe('work mode aliases', () => {
  it('reuses shared conversation mode constants by identity, not local copies', () => {
    expect(WORK_MODE_AUTO).toBe(CONVERSATION_MODE_AUTO);
    expect(WORK_MODE_PLAN).toBe(CONVERSATION_MODE_PLAN);
    expect(WORK_MODES).toBe(CONVERSATION_MODES);
    expect(DEFAULT_WORK_MODE).toBe(DEFAULT_CONVERSATION_MODE);
    expect(WORK_MODE_SOURCE).toContain('export const WORK_MODE_AUTO = CONVERSATION_MODE_AUTO;');
    expect(WORK_MODE_SOURCE).toContain('export const WORK_MODE_PLAN = CONVERSATION_MODE_PLAN;');
    expect(WORK_MODE_SOURCE).toContain('export const WORK_MODES = CONVERSATION_MODES;');
    expect(WORK_MODE_SOURCE).toContain(
      'export const DEFAULT_WORK_MODE: WorkMode = DEFAULT_CONVERSATION_MODE;',
    );
  });

  it('pins the conversation mode wire literals once', () => {
    expect(WORK_MODE_AUTO).toBe('auto');
    expect(WORK_MODE_PLAN).toBe('plan');
    expect(DEFAULT_WORK_MODE).toBe('auto');
    expect([...WORK_MODES]).toEqual(['auto', 'plan']);
  });
});
