import {
  ENGINE_TOOL_LOOP_OWN,
} from '@noot/shared';
import type { EngineCapabilities } from '@noot/shared';

export const CLAUDE_ENGINE_ID = 'claude';

export const NOOT_BRAIN_MCP_SERVER_NAME = 'noot-brain';

/** The SDK exposes MCP tools to the model as `mcp__<server>__<tool>`. */
export const NOOT_BRAIN_TOOL_PREFIX = `mcp__${NOOT_BRAIN_MCP_SERVER_NAME}__`;

/** Brain tool whose arguments are rendered as a structured `choices` event. */
export const ASK_USER_QUESTION_TOOL_NAME = 'AskUserQuestion';

export const UNKNOWN_TOOL_NAME = 'unknown_tool';

export const CLAUDE_ENGINE_CAPABILITIES: EngineCapabilities = Object.freeze({
  toolLoop: ENGINE_TOOL_LOOP_OWN,
  thinkingStream: true,
  sessions: true,
  choices: true,
});
