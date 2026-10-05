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

export const TRUNCATION_MARKER = '...';

export function resolveLumoRecapBudgets(
  overrides: Partial<LumoRecapBudgets> = {},
): LumoRecapBudgets {
  const budgets: LumoRecapBudgets = {
    charBudget: overrides.charBudget ?? DEFAULT_LUMO_RECAP_BUDGETS.charBudget,
    messageLimit: overrides.messageLimit ?? DEFAULT_LUMO_RECAP_BUDGETS.messageLimit,
    messageChars: overrides.messageChars ?? DEFAULT_LUMO_RECAP_BUDGETS.messageChars,
  };
  requirePositiveInteger('budgets.charBudget', budgets.charBudget);
  requirePositiveInteger('budgets.messageLimit', budgets.messageLimit);
  requirePositiveInteger('budgets.messageChars', budgets.messageChars);
  if (budgets.messageChars <= TRUNCATION_MARKER.length) {
    throw new RangeError(
      `Lumo budgets.messageChars must exceed ${TRUNCATION_MARKER.length}, got ${budgets.messageChars}`,
    );
  }
  return budgets;
}

export function requirePositiveInteger(name: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new RangeError(`Lumo ${name} must be a positive integer, got ${String(value)}`);
  }
}
