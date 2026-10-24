export const OPENAI_API_KEY_ENV = 'OPENAI_API_KEY';
export const OPENAI_BASE_URL_ENV = 'OPENAI_BASE_URL';
export const DEFAULT_OPENAI_BASE_URL = 'http://127.0.0.1:8000/v1';

export interface OpenAiClientConfig {
  apiKey: string;
  baseUrl: string;
}

export interface OpenAiClientConfigInput {
  apiKey?: string;
  baseUrl?: string;
}

export class OpenAiCredentialsError extends Error {
  override readonly name = 'OpenAiCredentialsError';
}

export function resolveOpenAiClientConfig(input: OpenAiClientConfigInput = {}): OpenAiClientConfig {
  const apiKey = input.apiKey?.trim() ?? '';
  if (!apiKey) {
    throw new OpenAiCredentialsError('OpenAI-compatible engine requires an API key.');
  }
  const baseUrl = (input.baseUrl?.trim() || DEFAULT_OPENAI_BASE_URL).replace(/\/$/, '');
  return { apiKey, baseUrl };
}
