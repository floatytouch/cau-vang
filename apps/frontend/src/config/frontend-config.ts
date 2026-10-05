import { DEFAULT_BACKEND_PORT } from '@noot/shared';

export interface FrontendConfig {
  /** Socket.IO endpoint; empty string means same origin (Vite proxy). */
  wsUrl: string;
  /** Shared funnel token; NV-10 rejects connects without a matching value. */
  wsToken: string;
}

export interface FrontendEnv {
  readonly VITE_WS_URL?: string;
  readonly VITE_WS_TOKEN?: string;
}

const DEFAULT_WS_TOKEN = 'dev-ws-token';

/** Sole place that reads Vite env for the UI; feature code takes FrontendConfig. */
export function loadFrontendConfig(env: FrontendEnv = import.meta.env): FrontendConfig {
  const wsUrl = trimOrDefault(env.VITE_WS_URL, '');
  const wsToken = trimOrDefault(env.VITE_WS_TOKEN, DEFAULT_WS_TOKEN);
  if (!wsToken) {
    throw new Error('VITE_WS_TOKEN must be a non-empty string when set');
  }
  if (wsUrl.includes('\0') || wsToken.includes('\0')) {
    throw new Error('frontend config values must not contain null bytes');
  }
  return { wsUrl, wsToken };
}

export function defaultBackendHttpOrigin(): string {
  return `http://localhost:${DEFAULT_BACKEND_PORT}`;
}

function trimOrDefault(raw: string | undefined, fallback: string): string {
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed === '') {
    return fallback;
  }
  return trimmed;
}
