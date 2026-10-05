import { describe, expect, it } from 'vitest';

import { isNootEvent } from '@noot/shared';

import { choicesFromAskUserQuestionArgs } from './choices-from-tool.js';
import { EventSequence } from './event-sequence.js';

describe('choicesFromAskUserQuestionArgs', () => {
  it('maps AskUserQuestion-shaped args to a choices event', () => {
    const choices = choicesFromAskUserQuestionArgs(new EventSequence('s1', 't1'), {
      questions: [
        {
          question: 'Pick one',
          options: [{ label: 'A', description: 'first' }, { label: 'B' }],
        },
      ],
    });

    expect(choices).toMatchObject({
      type: 'choices',
      prompt: 'Pick one',
      options: [
        { id: '0', label: 'A', description: 'first' },
        { id: '1', label: 'B' },
      ],
    });
  });

  it('returns nothing and consumes no seq for args without options', () => {
    const sequence = new EventSequence('s1', 't1');
    expect(
      choicesFromAskUserQuestionArgs(sequence, { questions: [{ question: 'q' }] }),
    ).toBeUndefined();
    expect(sequence.meta().seq).toBe(0);
  });

  it('replaces non-string labels so the event stays valid', () => {
    const choices = choicesFromAskUserQuestionArgs(new EventSequence('s1', 't1'), {
      questions: [{ options: [{ label: 7 }] }],
    });
    expect(choices && isNootEvent(choices)).toBe(true);
    expect(choices?.options[0]?.label).toBe('Option 1');
  });
});
