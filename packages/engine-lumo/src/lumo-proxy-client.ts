import type { LumoClientConfig } from './lumo-config.js';
import type { LumoWireMessage } from './recap-window.js';

export const LUMO_REASONING_OFF = 'none';
export const LUMO_REQUEST_TIMEOUT_MS = 300_000;
const ERROR_DETAIL_MAX_CHARS = 400;

export interface LumoUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LumoCompletionResult {
  content: string;
  usage: LumoUsage;
}

export class LumoApiError extends Error {
  override readonly name = 'LumoApiError';
}

export interface LumoProxyClientOptions {
  config: LumoClientConfig;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
}

export class LumoProxyClient {
  private readonly config: LumoClientConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;

  constructor(options: LumoProxyClientOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? LUMO_REQUEST_TIMEOUT_MS;
  }

  async complete(
    model: string,
    messages: readonly LumoWireMessage[],
    signal?: AbortSignal,
  ): Promise<LumoCompletionResult> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    const onExternalAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timeout);
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          reasoning_effort: LUMO_REASONING_OFF,
        }),
        signal: controller.signal,
      });

      const rawBody = await response.text();
      if (!response.ok) {
        throw new LumoApiError(`${url} answered HTTP ${response.status}: ${shortDetail(rawBody)}`);
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody) as unknown;
      } catch (error) {
        throw new LumoApiError(`${url} answered with a body that is not JSON`, { cause: error });
      }

      return parseCompletionBody(body);
    } catch (error) {
      if (error instanceof LumoApiError) {
        throw error;
      }
      if (signal?.aborted) {
        throw error;
      }
      if (controller.signal.aborted) {
        throw new LumoApiError(
          `the lumo-tamer proxy at ${url} did not answer within ${this.requestTimeoutMs} ms`,
          { cause: error },
        );
      }
      throw new LumoApiError(`cannot reach the lumo-tamer proxy at ${url}: ${String(error)}`, {
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      if (signal) {
        signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }
}

function parseCompletionBody(body: unknown): LumoCompletionResult {
  if (!body || typeof body !== 'object') {
    throw new LumoApiError(`the proxy answered without any choices: ${shortDetail(body)}`);
  }
  const record = body as Record<string, unknown>;
  const choices = record.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new LumoApiError(`the proxy answered without any choices: ${shortDetail(body)}`);
  }
  const first: unknown = choices[0];
  if (!first || typeof first !== 'object') {
    throw new LumoApiError(`the proxy answered without a message: ${shortDetail(first)}`);
  }
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== 'object') {
    throw new LumoApiError(`the proxy answered without a message: ${shortDetail(first)}`);
  }
  const content = (message as Record<string, unknown>).content ?? '';
  if (typeof content !== 'string') {
    throw new LumoApiError(`the proxy answered with non-text content: ${shortDetail(content)}`);
  }
  return { content: content.trim(), usage: mapUsage(record.usage) };
}

function mapUsage(raw: unknown): LumoUsage {
  if (!raw || typeof raw !== 'object') {
    return { inputTokens: 0, outputTokens: 0 };
  }
  const usage = raw as Record<string, unknown>;
  return {
    inputTokens: tokenCount(usage.prompt_tokens),
    outputTokens: tokenCount(usage.completion_tokens),
  };
}

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function shortDetail(value: unknown): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (text.length <= ERROR_DETAIL_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, ERROR_DETAIL_MAX_CHARS)} ...(truncated)`;
}
