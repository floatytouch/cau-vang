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

describe('work mode aliases', () => {
  it('reuses shared conversation mode wire values', () => {
    expect(WORK_MODE_AUTO).toBe(CONVERSATION_MODE_AUTO);
    expect(WORK_MODE_PLAN).toBe(CONVERSATION_MODE_PLAN);
    expect(WORK_MODES).toBe(CONVERSATION_MODES);
    expect(DEFAULT_WORK_MODE).toBe(DEFAULT_CONVERSATION_MODE);
  });
});
