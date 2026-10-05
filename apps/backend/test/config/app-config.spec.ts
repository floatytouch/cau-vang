import path from 'node:path';
import { DEFAULT_BACKEND_PORT } from '@noot/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BRAINCORE_DATA_DIR,
  DEFAULT_IDENTITY_CONFIG_DIR,
  DEFAULT_LIVE_SESSION_CAP,
  DEFAULT_MAX_CHAT_TEXT_LENGTH,
  loadAppConfig,
} from '../../src/config/app-config.js';

describe('loadAppConfig', () => {
  it('applies defaults when env vars are absent and mock engines allow open WS', () => {
    const config = loadAppConfig({ NOOT_BRAINCORE_MOCK_ENGINES: '1' });
    expect(config.port).toBe(DEFAULT_BACKEND_PORT);
    expect(config.wsToken).toBeUndefined();
    expect(config.braincore).toEqual({
      dataDir: path.resolve(DEFAULT_BRAINCORE_DATA_DIR),
      identityConfigDir: path.resolve(DEFAULT_IDENTITY_CONFIG_DIR),
      liveSessionCap: DEFAULT_LIVE_SESSION_CAP,
      maxChatTextLength: DEFAULT_MAX_CHAT_TEXT_LENGTH,
      mockEngines: true,
    });
  });

  it('reads ops-tunables from the environment', () => {
    const config = loadAppConfig({
      PORT: '4100',
      NOOT_WS_TOKEN: ' test-ws-token ',
      NOOT_BRAINCORE_DATA_DIR: '/tmp/noot-data',
      NOOT_IDENTITY_CONFIG_DIR: '/tmp/noot-identity',
      NOOT_BRAINCORE_LIVE_SESSION_CAP: '7',
      NOOT_BRAINCORE_MAX_CHAT_TEXT_LENGTH: '500',
      NOOT_BRAINCORE_MOCK_ENGINES: '1',
    });
    expect(config.port).toBe(4100);
    expect(config.wsToken).toBe('test-ws-token');
    expect(config.braincore.dataDir).toBe(path.resolve('/tmp/noot-data'));
    expect(config.braincore.identityConfigDir).toBe(path.resolve('/tmp/noot-identity'));
    expect(config.braincore.liveSessionCap).toBe(7);
    expect(config.braincore.maxChatTextLength).toBe(500);
    expect(config.braincore.mockEngines).toBe(true);
  });

  it('requires NOOT_WS_TOKEN when mock engines are off', () => {
    expect(() => loadAppConfig({})).toThrow(/NOOT_WS_TOKEN is required/);
    expect(() => loadAppConfig({ NOOT_BRAINCORE_MOCK_ENGINES: '0' })).toThrow(
      /NOOT_WS_TOKEN is required/,
    );
    expect(
      loadAppConfig({ NOOT_WS_TOKEN: 'prod-token', NOOT_BRAINCORE_MOCK_ENGINES: '0' }).wsToken,
    ).toBe('prod-token');
  });

  it('accepts 0 as mock engines off when a WS token is set', () => {
    expect(
      loadAppConfig({ NOOT_WS_TOKEN: 'x', NOOT_BRAINCORE_MOCK_ENGINES: '0' }).braincore.mockEngines,
    ).toBe(false);
  });

  it.each([
    [
      { NOOT_BRAINCORE_MOCK_ENGINES: '1', NOOT_BRAINCORE_LIVE_SESSION_CAP: '0' },
      /LIVE_SESSION_CAP/,
    ],
    [
      { NOOT_BRAINCORE_MOCK_ENGINES: '1', NOOT_BRAINCORE_MAX_CHAT_TEXT_LENGTH: 'nope' },
      /MAX_CHAT_TEXT_LENGTH/,
    ],
    [{ NOOT_BRAINCORE_MOCK_ENGINES: '1', PORT: 'abc' }, /Invalid PORT/],
    [{ NOOT_BRAINCORE_MOCK_ENGINES: 'true' }, /MOCK_ENGINES must be 0 or 1/],
  ])('fails closed on bad env %#', (env, message) => {
    expect(() => loadAppConfig(env)).toThrow(message);
  });
});
