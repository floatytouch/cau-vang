import type { EngineCapabilities } from '@noot/shared';

export const CURSOR_ENGINE_ID = 'cursor';

export const DEFAULT_TURN_TIMEOUT_MS = 30 * 60 * 1000;

export const CURSOR_ENGINE_CAPABILITIES: EngineCapabilities = {
  toolLoop: 'ownToolLoop',
  thinkingStream: true,
  sessions: true,
  choices: true,
};
