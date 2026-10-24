import type { OpenAiClientConfig } from './openai-config.js';
import type { OpenAiWireMessage } from './openai-messages.js';

export const OPENAI_REQUEST_TIMEOUT_MS = 300_000;

export class OpenAiApiError extends Error {
  override readonly name = 'OpenAiApiError';
}

export interface OpenAiCompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface OpenAiClientOptions {
  config: OpenAiClientConfig;
  fetchImpl?: typeof fetch;
  requestTimeoutMs?: number;
}

export class OpenAiClient {
  private readonly config: OpenAiClientConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;

  constructor(options: OpenAiClientOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.requestTimeoutMs = options.requestTimeoutMs ?? OPENAI_REQUEST_TIMEOUT_MS;
  }

  async complete(
    model: string,
    messages: readonly OpenAiWireMessage[],
    signal?: AbortSignal,
  ): Promise<OpenAiCompletionResult> {
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
        body: JSON.stringify({ model, messages, stream: false }),
        signal: controller.signal,
      });
      const rawBody = await response.text();
      if (!response.ok) {
        throw new OpenAiApiError(`HTTP ${response.status}: ${rawBody.slice(0, 400)}`);
      }
      const body = JSON.parse(rawBody) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const content = body.choices?.[0]?.message?.content ?? '';
      return {
        content,
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      };
    } finally {
      clearTimeout(timeout);
      if (signal) {
        signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }
}
