import path from 'node:path';
import { DEFAULT_BACKEND_PORT } from '@noot/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRAINCORE_DATA_DIR,
  DEFAULT_IDENTITY_CONFIG_DIR,
  DEFAULT_LIVE_SESSION_CAP,
  DEFAULT_MAX_CHAT_TEXT_LENGTH,
  loadAppConfig,
} from './app-config.js';

describe('loadAppConfig', () => {
  it('applies defaults when env vars are absent', () => {
    const config = loadAppConfig({});
    expect(config.port).toBe(DEFAULT_BACKEND_PORT);
    expect(config.braincore).toEqual({
      dataDir: path.resolve(DEFAULT_BRAINCORE_DATA_DIR),
      identityConfigDir: path.resolve(DEFAULT_IDENTITY_CONFIG_DIR),
      liveSessionCap: DEFAULT_LIVE_SESSION_CAP,
      maxChatTextLength: DEFAULT_MAX_CHAT_TEXT_LENGTH,
      mockEngines: false,
    });
  });

  it('reads ops-tunables from the environment', () => {
    const config = loadAppConfig({
      PORT: '4100',
      NOOT_BRAINCORE_DATA_DIR: '/tmp/noot-NV-3-data',
      NOOT_IDENTITY_CONFIG_DIR: '/tmp/noot-NV-3-identity',
      NOOT_BRAINCORE_LIVE_SESSION_CAP: '7',
      NOOT_BRAINCORE_MAX_CHAT_TEXT_LENGTH: '500',
      NOOT_BRAINCORE_MOCK_ENGINES: '1',
    });
    expect(config.port).toBe(4100);
    expect(config.braincore.dataDir).toBe(path.resolve('/tmp/noot-NV-3-data'));
    expect(config.braincore.identityConfigDir).toBe(path.resolve('/tmp/noot-NV-3-identity'));
    expect(config.braincore.liveSessionCap).toBe(7);
    expect(config.braincore.maxChatTextLength).toBe(500);
    expect(config.braincore.mockEngines).toBe(true);
  });

  it('accepts 0 as mock engines off', () => {
    expect(loadAppConfig({ NOOT_BRAINCORE_MOCK_ENGINES: '0' }).braincore.mockEngines).toBe(false);
  });

  it.each([
    [{ NOOT_BRAINCORE_LIVE_SESSION_CAP: '0' }, /LIVE_SESSION_CAP/],
    [{ NOOT_BRAINCORE_MAX_CHAT_TEXT_LENGTH: 'nope' }, /MAX_CHAT_TEXT_LENGTH/],
    [{ PORT: 'abc' }, /Invalid PORT/],
    [{ NOOT_BRAINCORE_MOCK_ENGINES: 'true' }, /MOCK_ENGINES must be 0 or 1/],
  ])('fails closed on bad env %#', (env, message) => {
    expect(() => loadAppConfig(env)).toThrow(message);
  });
});
