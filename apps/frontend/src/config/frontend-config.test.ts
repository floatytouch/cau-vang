import { describe, expect, it } from 'vitest';
import { loadFrontendConfig } from './frontend-config.js';

describe('loadFrontendConfig', () => {
  it('leaves the WS token unset when the env does not provide one', () => {
    expect(loadFrontendConfig({})).toEqual({ wsUrl: '', wsToken: undefined });
    expect(loadFrontendConfig({ VITE_NOOT_WS_TOKEN: '   ' }).wsToken).toBeUndefined();
  });

  it('reads Vite env overrides', () => {
    expect(
      loadFrontendConfig({
        VITE_WS_URL: ' http://127.0.0.1:3000 ',
        VITE_NOOT_WS_TOKEN: 'secret-token',
      }),
    ).toEqual({ wsUrl: 'http://127.0.0.1:3000', wsToken: 'secret-token' });
  });
});
