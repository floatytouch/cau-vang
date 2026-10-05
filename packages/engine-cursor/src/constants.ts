import {
  ENGINE_TOOL_LOOP_OWN,
  TURN_ERROR_CODE_ENGINE_ERROR,
  TURN_ERROR_CODE_ENGINE_UNAVAILABLE,
} from '@noot/shared';
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
  RUN_FAILED: TURN_ERROR_CODE_ENGINE_ERROR,
  ENGINE_UNAVAILABLE: TURN_ERROR_CODE_ENGINE_UNAVAILABLE,
  AUTH_FAILED: 'auth_failed',
  RATE_LIMITED: 'rate_limited',
  INVALID_CONFIG: 'invalid_config',
  CANCEL_FAILED: 'cancel_failed',
} as const;
