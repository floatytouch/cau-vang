import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LUMO_RECAP_BUDGETS,
  HISTORY_CHAR_BUDGET,
  HISTORY_MESSAGE_CHARS,
  HISTORY_MESSAGE_LIMIT,
  resolveLumoRecapBudgets,
} from './recap-budget.js';

describe('resolveLumoRecapBudgets', () => {
  it('returns the package defaults when no overrides are given', () => {
    expect(resolveLumoRecapBudgets()).toEqual(DEFAULT_LUMO_RECAP_BUDGETS);
    expect(DEFAULT_LUMO_RECAP_BUDGETS).toEqual({
      charBudget: HISTORY_CHAR_BUDGET,
      messageLimit: HISTORY_MESSAGE_LIMIT,
      messageChars: HISTORY_MESSAGE_CHARS,
    });
  });

  it('merges partial factory overrides onto the defaults', () => {
    expect(resolveLumoRecapBudgets({ charBudget: 100 })).toEqual({
      ...DEFAULT_LUMO_RECAP_BUDGETS,
      charBudget: 100,
    });
  });

  it.each([
    ['charBudget', Number.NaN],
    ['charBudget', 0],
    ['messageLimit', -1],
    ['messageLimit', 1.5],
    ['messageChars', '4000' as unknown as number],
    ['messageChars', 3],
  ])('fails closed on an invalid %s of %s instead of trimming nothing', (key, value) => {
    expect(() => resolveLumoRecapBudgets({ [key]: value })).toThrow(RangeError);
  });
});
