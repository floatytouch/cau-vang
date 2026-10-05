import { LumoCredentialsError, type LumoClientConfig } from './lumo-config.js';
import type { LumoWireMessage } from './recap-window.js';

export const LUMO_REASONING_OFF = 'none';
export const LUMO_REQUEST_TIMEOUT_MS = 300_000;

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
        throw new LumoApiError(
          `${url} answered HTTP ${response.status}: ${shortDetail(rawBody)}`,
        );
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody) as unknown;
      } catch (error) {
        throw new LumoApiError(`${url} answered with a body that is not JSON`, { cause: error });
      }

      return parseCompletionBody(body);
    } catch (error) {
      if (error instanceof LumoApiError || error instanceof LumoCredentialsError) {
        throw error;
      }
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error;
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
  const first = choices[0];
  if (!first || typeof first !== 'object') {
    throw new LumoApiError(`the proxy answered without a message: ${shortDetail(first)}`);
  }
  const message = (first as Record<string, unknown>).message;
  if (!message || typeof message !== 'object') {
    throw new LumoApiError(`the proxy answered without a message: ${shortDetail(first)}`);
  }
  const content = String((message as Record<string, unknown>).content ?? '').trim();
  const usage = mapUsage(record.usage);
  return { content, usage };
}

function mapUsage(raw: unknown): LumoUsage {
  if (!raw || typeof raw !== 'object') {
    return { inputTokens: 0, outputTokens: 0 };
  }
  const usage = raw as Record<string, unknown>;
  return {
    inputTokens: numberField(usage.prompt_tokens),
    outputTokens: numberField(usage.completion_tokens),
  };
}

function numberField(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function shortDetail(value: unknown): string {
  const text = String(value).replace(/\s+/g, ' ').trim();
  const max = 400;
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max)} ...(truncated)`;
}
