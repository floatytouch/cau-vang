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
});
