import { describe, expect, it } from 'vitest';

import { oauthSubprocessEnv } from '../src/oauth-subprocess-env.js';

const CREDENTIAL_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] as const;

describe('oauthSubprocessEnv', () => {
  it.each(CREDENTIAL_VARS)('drops %s so the OAuth login in ~/.claude is used', (name) => {
    const parent = { HOME: '/home/noot', [name]: 'must-not-leak' };
    const env = oauthSubprocessEnv(parent);
    expect(env[name]).toBeUndefined();
    expect(Object.values(env)).not.toContain('must-not-leak');
    expect(env.HOME).toBe('/home/noot');
  });

  it('does not mutate the parent environment object', () => {
    const parent: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: 'parent-keeps-it' };
    oauthSubprocessEnv(parent);
    expect(parent.ANTHROPIC_API_KEY).toBe('parent-keeps-it');
  });

  it('fails closed when the parent environment is missing', () => {
    expect(() => oauthSubprocessEnv(undefined as unknown as NodeJS.ProcessEnv)).toThrow(
      /app config layer/,
    );
  });
});
