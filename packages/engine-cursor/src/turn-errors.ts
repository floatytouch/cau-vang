import {
  AuthenticationError,
  ConfigurationError,
  CursorAgentError,
  RateLimitError,
  type RunResult,
  type SDKStatusMessage,
} from '@cursor/sdk';
import { TURN_ERROR_CODES } from './constants.js';

export interface TurnErrorDetail {
  code: string;
  message: string;
  recoverable: boolean;
}

const FAILED_STATUSES: ReadonlySet<SDKStatusMessage['status']> = new Set(['ERROR', 'EXPIRED']);

/** Last failure the run reported on its stream; the final RunResult often omits it. */
export function statusFailureMessage(message: SDKStatusMessage): string | undefined {
  if (!FAILED_STATUSES.has(message.status)) {
    return undefined;
  }
  return message.message ?? `Cursor run status ${message.status}`;
}

export function describeRunFailure(
  result: RunResult,
  streamFailure: string | undefined,
): TurnErrorDetail {
  const reason = result.error?.message ?? streamFailure ?? 'no reason reported by the SDK';
  return {
    code: result.error?.code ?? TURN_ERROR_CODES.RUN_FAILED,
    message: `Cursor run ${result.id} failed: ${reason}`,
    recoverable: false,
  };
}

export function describeException(error: unknown): TurnErrorDetail {
  if (error instanceof AuthenticationError) {
    return { code: TURN_ERROR_CODES.AUTH_FAILED, message: error.message, recoverable: false };
  }
  if (error instanceof RateLimitError) {
    return { code: TURN_ERROR_CODES.RATE_LIMITED, message: error.message, recoverable: true };
  }
  if (error instanceof ConfigurationError) {
    return { code: TURN_ERROR_CODES.INVALID_CONFIG, message: error.message, recoverable: false };
  }
  if (error instanceof CursorAgentError) {
    return {
      code: TURN_ERROR_CODES.ENGINE_UNAVAILABLE,
      message: error.message,
      recoverable: error.isRetryable,
    };
  }
  const message = error instanceof Error ? error.message : 'Unknown Cursor adapter failure';
  return { code: TURN_ERROR_CODES.RUN_FAILED, message, recoverable: false };
}
