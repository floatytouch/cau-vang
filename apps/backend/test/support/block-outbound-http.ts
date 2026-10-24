import http from 'node:http';
import https from 'node:https';
import { afterEach, beforeEach, vi } from 'vitest';

const OUTBOUND_HTTP_MESSAGE = 'Unexpected outbound HTTP in offline-rules test';

/** Fails the test if anything opens an outbound HTTP(S) client during the example. */
export function useOutboundHttpGuard(): void {
  let restoreFetch: (() => void) | undefined;

  beforeEach(() => {
    vi.spyOn(http, 'request').mockImplementation(() => {
      throw new Error(OUTBOUND_HTTP_MESSAGE);
    });
    vi.spyOn(https, 'request').mockImplementation(() => {
      throw new Error(OUTBOUND_HTTP_MESSAGE);
    });
    if (typeof globalThis.fetch === 'function') {
      const original = globalThis.fetch.bind(globalThis);
      globalThis.fetch = (() => {
        throw new Error(OUTBOUND_HTTP_MESSAGE);
      }) as typeof fetch;
      restoreFetch = () => {
        globalThis.fetch = original;
      };
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreFetch?.();
    restoreFetch = undefined;
  });
}
