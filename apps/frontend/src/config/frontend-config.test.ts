import { describe, expect, it } from 'vitest';
import { loadFrontendConfig } from './frontend-config.js';

describe('loadFrontendConfig', () => {
  it('defaults the WS token used for the NV-10 handshake', () => {
    expect(loadFrontendConfig({})).toEqual({ wsUrl: '', wsToken: 'dev-ws-token' });
  });

  it('reads Vite env overrides', () => {
    expect(
      loadFrontendConfig({
        VITE_WS_URL: 'http://127.0.0.1:3000',
        VITE_WS_TOKEN: 'secret-token',
      }),
    ).toEqual({ wsUrl: 'http://127.0.0.1:3000', wsToken: 'secret-token' });
  });
});
