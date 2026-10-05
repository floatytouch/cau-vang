export const CLAUDE_ENGINE_ID = 'claude';

export const NOOT_BRAIN_MCP_SERVER_NAME = 'noot-brain';

export const CLAUDE_ENGINE_CAPABILITIES = {
  toolLoop: 'ownToolLoop' as const,
  thinkingStream: true,
  sessions: true,
  choices: true,
};
