import { describe, expect, it } from 'vitest';
import { LumoApiError, LumoProxyClient } from './lumo-proxy-client.js';

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
});
