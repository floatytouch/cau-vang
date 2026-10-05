import { describe, expect, it } from 'vitest';

import { choicesFromAskUserQuestionArgs } from './choices-from-tool.js';

const META = {
  sessionId: 's1',
  turnId: 't1',
  seq: 0,
  emittedAt: '2026-10-05T00:00:00.000Z',
};

describe('choicesFromAskUserQuestionArgs', () => {
  it('maps AskUserQuestion-shaped args to a choices event', () => {
    const choices = choicesFromAskUserQuestionArgs(META, {
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
});
