import type { EngineCapabilities } from '@noot/shared';

export const CURSOR_ENGINE_ID = 'cursor';

export const DEFAULT_TURN_TIMEOUT_MS = 30 * 60 * 1000;

export const CURSOR_ENGINE_CAPABILITIES: EngineCapabilities = {
  toolLoop: 'ownToolLoop',
  thinkingStream: true,
  sessions: true,
  choices: false,
};

export const TURN_ERROR_CODES = {
  timeout: 'timeout',
  runFailed: 'engine_error',
  engineUnavailable: 'engine_unavailable',
  authFailed: 'auth_failed',
  rateLimited: 'rate_limited',
  invalidConfig: 'invalid_config',
  cancelFailed: 'cancel_failed',
} as const;
