export const LUMO_BASE_URL_ENV = 'LUMO_BASE_URL';
export const LUMO_API_KEY_ENV = 'LUMO_API_KEY';

export const DEFAULT_LUMO_BASE_URL = 'http://localhost:3003/v1';

export interface LumoClientConfig {
  baseUrl: string;
  apiKey: string;
}

export function readLumoClientConfig(env: NodeJS.ProcessEnv = process.env): LumoClientConfig {
  const baseUrl =
    (env[LUMO_BASE_URL_ENV] ?? '').trim().replace(/\/+$/, '') || DEFAULT_LUMO_BASE_URL;
  const apiKey = (env[LUMO_API_KEY_ENV] ?? '').trim();
  if (!apiKey) {
    throw new LumoCredentialsError(
      `set ${LUMO_API_KEY_ENV} to the lumo-tamer proxy API key before calling Lumo`,
    );
  }
  return { baseUrl, apiKey };
}

export class LumoCredentialsError extends Error {
  override readonly name = 'LumoCredentialsError';
}
