import { ENGINE_TOOL_LOOP_OWN } from '@noot/shared';
import type { EngineCapabilities } from '@noot/shared';

export const CURSOR_ENGINE_ID = 'cursor';

export const DEFAULT_TURN_TIMEOUT_MS = 30 * 60 * 1000;

export const CURSOR_ENGINE_CAPABILITIES: EngineCapabilities = {
  toolLoop: ENGINE_TOOL_LOOP_OWN,
  thinkingStream: true,
  sessions: true,
  choices: false,
};

export const TURN_ERROR_CODES = {
  TIMEOUT: 'timeout',
  RUN_FAILED: 'engine_error',
  ENGINE_UNAVAILABLE: 'engine_unavailable',
  AUTH_FAILED: 'auth_failed',
  RATE_LIMITED: 'rate_limited',
  INVALID_CONFIG: 'invalid_config',
  CANCEL_FAILED: 'cancel_failed',
} as const;
