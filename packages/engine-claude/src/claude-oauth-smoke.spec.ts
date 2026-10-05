import { execFileSync } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import type { AddressInfo } from 'node:net';

import type { NootEvent, ToolBridge } from '@noot/shared';
import { isNootEvent } from '@noot/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ClaudeEngineAdapter } from './claude-engine-adapter.js';

const RUN_OAUTH_SMOKE = process.env.NOOT_CLAUDE_OAUTH_SMOKE === '1';
const SMOKE_MODEL = 'claude-sonnet-5';
const SMOKE_TIMEOUT_MS = 180_000;
const UPSTREAM_HOST = 'api.anthropic.com';
const MESSAGES_PATH = '/v1/messages';
// Added by the CLI itself on the OAuth lane (billing header + SDK identity line); anything else is an injection.
const PLATFORM_SYSTEM_BLOCKS = [
  /^x-anthropic-billing-header: /,
  /^You are a Claude agent, built on Anthropic's Claude Agent SDK\.$/,
];
const SOUL_PROMPT =
  'You are Noot smoke.\nWhen asked for the marker, call echo_marker exactly once, then reply with its result.\n';
// A leaked key would win over OAuth and fail auth, so a completed turn proves it was stripped.
const BOGUS_API_KEY = 'sk-ant-api03-smoke-invalid';

interface CapturedRequest {
  system: { text: string }[];
  messages: unknown[];
}

/** Records every Messages API body the CLI sends, then forwards it unchanged. */
function startRecordingProxy(captured: CapturedRequest[]): Promise<http.Server> {
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks);
      if (request.url?.startsWith(MESSAGES_PATH) && body.length > 0) {
        captured.push(JSON.parse(body.toString('utf8')) as CapturedRequest);
      }
      const upstream = https.request(
        {
          host: UPSTREAM_HOST,
          path: request.url,
          method: request.method,
          headers: { ...request.headers, host: UPSTREAM_HOST },
        },
        (upstreamResponse) => {
          response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
          upstreamResponse.pipe(response);
        },
      );
      upstream.on('error', (error) => response.destroy(error));
      upstream.end(body);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function childProcessCount(): number {
  try {
    return execFileSync('pgrep', ['-P', String(process.pid)])
      .toString()
      .trim()
      .split('\n').length;
  } catch {
    return 0;
  }
}

const MARKER_TOOLS: ToolBridge = {
  definitions: [
    {
      name: 'echo_marker',
      description: 'Returns the smoke marker',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
  execute: async () => ({ ok: true, result: 'MARKER-7731' }),
};

let smokeSubprocessEnv: NodeJS.ProcessEnv = { ...process.env };

function newTurn(prompt: string, tools?: ToolBridge) {
  const adapter = new ClaudeEngineAdapter({ subprocessEnv: smokeSubprocessEnv });
  const turnId = `turn-${crypto.randomUUID()}`;
  const stream = adapter.startTurn(
    { sessionId: `smoke-${crypto.randomUUID()}`, history: [] },
    { text: prompt },
    {
      turnId,
      model: SMOKE_MODEL,
      systemPrompt: SOUL_PROMPT,
      tools,
    },
  );
  return { adapter, turnId, stream };
}

describe.runIf(RUN_OAUTH_SMOKE)('Claude OAuth smoke', () => {
  const captured: CapturedRequest[] = [];
  let proxy: http.Server;

  beforeAll(async () => {
    proxy = await startRecordingProxy(captured);
    const proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    // Bogus key is included so a strip failure would bill API auth and fail the turn.
    smokeSubprocessEnv = {
      ...process.env,
      ANTHROPIC_BASE_URL: proxyUrl,
      ANTHROPIC_API_KEY: BOGUS_API_KEY,
    };
  });

  afterAll(async () => {
    await new Promise((resolve) => proxy.close(resolve));
  });

  it(
    'streams thinking, a brain tool call and text on the OAuth plan with the soul prompt byte-identical',
    { timeout: SMOKE_TIMEOUT_MS },
    async () => {
      const events: NootEvent[] = [];
      for await (const event of newTurn(
        'Reason step by step about which is larger, 17*23 or 391-2, then give me the marker and your answer.',
        MARKER_TOOLS,
      ).stream) {
        events.push(event);
      }

      expect(events.every(isNootEvent)).toBe(true);
      expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'completed' });
      const types = events.map((event) => event.type);
      expect(types).toContain('thinking_delta');
      expect(types).toContain('text_delta');
      const toolPhases = events.flatMap((event) =>
        event.type === 'tool_call' && event.name === 'echo_marker' ? [event.phase] : [],
      );
      expect(toolPhases[0]).toBe('start');
      expect(toolPhases.at(-1)).toBe('end');

      const soulRequests = captured.filter((request) =>
        request.system.some((block) => block.text === SOUL_PROMPT),
      );
      expect(soulRequests.length).toBeGreaterThan(0);
      for (const request of soulRequests) {
        const extraBlocks = request.system.filter((block) => block.text !== SOUL_PROMPT);
        expect(
          extraBlocks.every((block) =>
            PLATFORM_SYSTEM_BLOCKS.some((pattern) => pattern.test(block.text)),
          ),
        ).toBe(true);
        expect(JSON.stringify(request.messages)).not.toContain('MCP Server Instructions');
      }
    },
  );

  it(
    'cancels mid-stream with done(cancelled) and leaves no CLI process behind',
    { timeout: SMOKE_TIMEOUT_MS },
    async () => {
      const before = childProcessCount();
      const { adapter, turnId, stream } = newTurn('Count from 1 to 400, one number per line.');
      const events: NootEvent[] = [];
      for await (const event of stream) {
        events.push(event);
        if (
          event.type === 'text_delta' &&
          events.filter((seen) => seen.type === 'text_delta').length === 1
        ) {
          await adapter.cancel(turnId);
        }
      }

      expect(events.at(-1)).toMatchObject({ type: 'done', reason: 'cancelled' });
      expect(events.some((event) => event.type === 'error')).toBe(false);
      await expect.poll(childProcessCount, { timeout: 5_000 }).toBe(before);
    },
  );
});
