import { describe, expect, it } from 'vitest';
import {
  NODE_ENV_DEVELOPMENT,
  NODE_ENV_PRODUCTION,
  NODE_ENV_STAGING,
  shouldLoadEnvFiles,
} from '../src/env-files-policy.js';

describe('shouldLoadEnvFiles', () => {
  it('loads only when the name is development, case-insensitive', () => {
    expect(shouldLoadEnvFiles(NODE_ENV_DEVELOPMENT)).toBe(true);
    expect(shouldLoadEnvFiles('Development')).toBe(true);
    expect(shouldLoadEnvFiles('DEVELOPMENT')).toBe(true);
  });

  it('does not load when the name is unset, staging, production, or anything else', () => {
    expect(shouldLoadEnvFiles(undefined)).toBe(false);
    expect(shouldLoadEnvFiles('')).toBe(false);
    expect(shouldLoadEnvFiles('   ')).toBe(false);
    expect(shouldLoadEnvFiles(NODE_ENV_PRODUCTION)).toBe(false);
    expect(shouldLoadEnvFiles('Production')).toBe(false);
    expect(shouldLoadEnvFiles(NODE_ENV_STAGING)).toBe(false);
    expect(shouldLoadEnvFiles('test')).toBe(false);
  });
});
