import { describe, expect, it } from 'vitest';
import { LumoApiError, LumoProxyClient } from '../src/lumo-proxy-client.js';

const TEST_CONFIG = { baseUrl: 'http://127.0.0.1:9', apiKey: 'test-key' };

describe('LumoProxyClient', () => {
  it('maps a successful proxy JSON body to content and usage', async () => {
    const client = new LumoProxyClient({
      config: TEST_CONFIG,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'hello from lumo' } }],
            usage: { prompt_tokens: 12, completion_tokens: 3 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    const result = await client.complete('lumo-lite', [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ]);

    expect(result).toEqual({
      content: 'hello from lumo',
      usage: { inputTokens: 12, outputTokens: 3 },
    });
  });

  it('raises LumoApiError when the proxy returns HTTP errors', async () => {
    const client = new LumoProxyClient({
      config: TEST_CONFIG,
      fetchImpl: async () => new Response('unauthorized', { status: 401 }),
    });

    await expect(
      client.complete('lumo-lite', [{ role: 'user', content: 'hi' }]),
    ).rejects.toBeInstanceOf(LumoApiError);
  });

  it('reports a proxy that does not answer in time as LumoApiError', async () => {
    const client = new LumoProxyClient({
      config: TEST_CONFIG,
      requestTimeoutMs: 20,
      fetchImpl: hangUntilAborted,
    });

    await expect(client.complete('lumo-lite', [{ role: 'user', content: 'hi' }])).rejects.toThrow(
      /did not answer within 20 ms/,
    );
  });

  it('rethrows a caller abort untouched instead of reporting the proxy down', async () => {
    const client = new LumoProxyClient({ config: TEST_CONFIG, fetchImpl: hangUntilAborted });
    const caller = new AbortController();

    const pending = client.complete('lumo-lite', [{ role: 'user', content: 'hi' }], caller.signal);
    caller.abort();

    const error: unknown = await pending.catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(LumoApiError);
    expect((error as Error).name).toBe('AbortError');
  });

  it('rejects non-text message content instead of stringifying it', async () => {
    const client = clientAnswering({ choices: [{ message: { content: [{ type: 'text' }] } }] });

    await expect(client.complete('lumo-lite', [{ role: 'user', content: 'hi' }])).rejects.toThrow(
      /non-text content/,
    );
  });

  it('zeroes token counts that are not non-negative integers', async () => {
    const client = clientAnswering({
      choices: [{ message: { content: 'ok' } }],
      usage: { prompt_tokens: -4, completion_tokens: 1.5 },
    });

    const result = await client.complete('lumo-lite', [{ role: 'user', content: 'hi' }]);

    expect(result.usage).toEqual({ inputTokens: 0, outputTokens: 0 });
  });

  it('shows a JSON body without choices in the error detail', async () => {
    const client = clientAnswering({ object: 'error' });

    await expect(client.complete('lumo-lite', [{ role: 'user', content: 'hi' }])).rejects.toThrow(
      'without any choices: {"object":"error"}',
    );
  });
});

function clientAnswering(body: unknown): LumoProxyClient {
  return new LumoProxyClient({
    config: TEST_CONFIG,
    fetchImpl: async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });
}

function hangUntilAborted(_url: string | URL | Request, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    });
  });
}
