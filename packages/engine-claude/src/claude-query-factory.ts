import { query } from '@anthropic-ai/claude-agent-sdk';

export type ClaudeQueryFactory = typeof query;

export const defaultClaudeQueryFactory: ClaudeQueryFactory = query;
