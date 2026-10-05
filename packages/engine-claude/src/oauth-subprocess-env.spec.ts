import { afterEach, describe, expect, it } from 'vitest';

import { oauthSubprocessEnv } from './oauth-subprocess-env.js';

describe('oauthSubprocessEnv', () => {
  const previous = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = previous;
    }
  });

  it('drops ANTHROPIC_API_KEY so OAuth credentials in ~/.claude are used', () => {
    process.env.ANTHROPIC_API_KEY = 'must-not-leak';
    const env = oauthSubprocessEnv();
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.HOME).toBe(process.env.HOME);
  });
});
