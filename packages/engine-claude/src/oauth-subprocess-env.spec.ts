import { afterEach, describe, expect, it } from 'vitest';

import { oauthSubprocessEnv } from './oauth-subprocess-env.js';

const CREDENTIAL_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const;

describe('oauthSubprocessEnv', () => {
  const previous = Object.fromEntries(CREDENTIAL_VARS.map((name) => [name, process.env[name]]));

  afterEach(() => {
    for (const name of CREDENTIAL_VARS) {
      if (previous[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = previous[name];
      }
    }
  });

  it.each(CREDENTIAL_VARS)('drops %s so the OAuth login in ~/.claude is used', (name) => {
    process.env[name] = 'must-not-leak';
    const env = oauthSubprocessEnv();
    expect(env[name]).toBeUndefined();
    expect(Object.values(env)).not.toContain('must-not-leak');
    expect(env.HOME).toBe(process.env.HOME);
  });

  it('does not mutate the parent process environment', () => {
    process.env.ANTHROPIC_API_KEY = 'parent-keeps-it';
    oauthSubprocessEnv();
    expect(process.env.ANTHROPIC_API_KEY).toBe('parent-keeps-it');
  });
});
