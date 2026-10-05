import { query } from '@anthropic-ai/claude-agent-sdk';

export type ClaudeQueryFactory = typeof query;

export const DEFAULT_CLAUDE_QUERY_FACTORY: ClaudeQueryFactory = query;
