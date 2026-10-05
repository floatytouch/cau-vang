import {
  NOOT_EVENT_TYPE_CHOICES,
} from '@noot/shared';
import type { ChoiceOption, ChoicesEvent } from '@noot/shared';

import type { EventSequence } from './event-sequence.js';

interface AskUserQuestionOption {
  label?: string;
  description?: string;
}

interface AskUserQuestionEntry {
  question?: string;
  header?: string;
  options?: AskUserQuestionOption[];
}

export function choicesFromAskUserQuestionArgs(
  sequence: EventSequence,
  args: unknown,
): ChoicesEvent | undefined {
  if (!args || typeof args !== 'object') {
    return undefined;
  }

  const questions = (args as { questions?: unknown }).questions;
  if (!Array.isArray(questions) || questions.length === 0) {
    return undefined;
  }

  const first = questions[0] as AskUserQuestionEntry;
  const options = first.options;
  if (!Array.isArray(options) || options.length === 0) {
    return undefined;
  }

  const mapped: ChoiceOption[] = options.map((option, index) => ({
    id: String(index),
    label:
      typeof option.label === 'string' && option.label.length > 0
        ? option.label
        : `Option ${index + 1}`,
    description: typeof option.description === 'string' ? option.description : undefined,
  }));

  return {
    ...sequence.meta(),
    type: NOOT_EVENT_TYPE_CHOICES,
    prompt: first.question ?? first.header,
    options: mapped,
  };
}
