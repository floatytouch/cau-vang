import type { ChoiceOption, ChoicesEvent, NootEventMeta } from '@noot/shared';

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
  meta: NootEventMeta,
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
    label: option.label ?? `Option ${index + 1}`,
    description: option.description,
  }));

  return {
    ...meta,
    type: 'choices',
    prompt: first.question ?? first.header,
    options: mapped,
  };
}
