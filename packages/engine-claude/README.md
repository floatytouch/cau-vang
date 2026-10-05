# @noot/engine-claude

Harness `EngineAdapter` over `@anthropic-ai/claude-agent-sdk` (Claude Max OAuth).

## Configuration

This package never reads `process.env`. The Nest registration layer (when BrainCore
wires the adapter) resolves the host environment through `ConfigService` and passes
every runtime value as constructor options:

| Option           | Expected Nest / app source                                                       | Purpose                                                                                                                                                             |
| ---------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subprocessEnv`  | `ConfigService`-resolved host env (typically `process.env` at the Nest boundary) | Environment inherited by the Claude CLI subprocess. `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` are stripped so the Max plan OAuth login in `~/.claude` is used. |
| `queryFactory`   | tests or DI override                                                             | SDK `query` entry point (default: real SDK).                                                                                                                        |
| `sessionHandles` | DI singleton                                                                     | Maps brain session ids to Claude `resume` ids.                                                                                                                      |

```ts
import { ClaudeEngineAdapter } from '@noot/engine-claude';

new ClaudeEngineAdapter({
  subprocessEnv: configService.getOrThrow<NodeJS.ProcessEnv>('subprocessEnv'),
});
```

Until Nest wires the engine, callers (tests, smokes) must pass an explicit
`subprocessEnv` map. Missing or non-object values fail closed.

## OAuth smoke

```bash
NOOT_CLAUDE_OAUTH_SMOKE=1 yarn workspace @noot/engine-claude test
```

The smoke gate is a vitest opt-in in the test file, not package runtime config.
