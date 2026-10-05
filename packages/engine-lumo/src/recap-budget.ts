/** Matches botcore/lumo_chat.py: recap spends under half of Lumo's ~20K token window. */
export const HISTORY_CHAR_BUDGET = 24_000;
export const HISTORY_MESSAGE_LIMIT = 40;
export const HISTORY_MESSAGE_CHARS = 4_000;

export interface LumoRecapBudgets {
  charBudget: number;
  messageLimit: number;
  messageChars: number;
}

export const DEFAULT_LUMO_RECAP_BUDGETS: LumoRecapBudgets = {
  charBudget: HISTORY_CHAR_BUDGET,
  messageLimit: HISTORY_MESSAGE_LIMIT,
  messageChars: HISTORY_MESSAGE_CHARS,
};

export function resolveLumoRecapBudgets(
  overrides: Partial<LumoRecapBudgets> = {},
): LumoRecapBudgets {
  return {
    charBudget: overrides.charBudget ?? DEFAULT_LUMO_RECAP_BUDGETS.charBudget,
    messageLimit: overrides.messageLimit ?? DEFAULT_LUMO_RECAP_BUDGETS.messageLimit,
    messageChars: overrides.messageChars ?? DEFAULT_LUMO_RECAP_BUDGETS.messageChars,
  };
}
