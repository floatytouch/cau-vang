export const LUMO_BASE_URL_ENV = 'LUMO_BASE_URL';
export const LUMO_API_KEY_ENV = 'LUMO_API_KEY';

export const DEFAULT_LUMO_BASE_URL = 'http://localhost:3003/v1';

export interface LumoClientConfig {
  baseUrl: string;
  apiKey: string;
}

export interface LumoClientConfigInput {
  apiKey?: string;
  baseUrl?: string;
}

export function resolveLumoClientConfig(input: LumoClientConfigInput): LumoClientConfig {
  const baseUrl =
    (input.baseUrl ?? '').trim().replace(/\/+$/, '') || DEFAULT_LUMO_BASE_URL;
  const apiKey = (input.apiKey ?? '').trim();
  if (!apiKey) {
    throw new LumoCredentialsError(
      `Lumo apiKey is required; pass createLumoAdapter({ apiKey }) (Nest resolves ${LUMO_API_KEY_ENV} via ConfigService)`,
    );
  }
  return { baseUrl, apiKey };
}

export class LumoCredentialsError extends Error {
  override readonly name = 'LumoCredentialsError';
}
