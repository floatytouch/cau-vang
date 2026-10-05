# Naming

Grounded in the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) / [gts](https://github.com/google/gts) and enforced via [`@typescript-eslint/naming-convention`](https://typescript-eslint.io/rules/naming-convention/).

## Rules

- English everywhere in code: identifiers, comments, logs, commit subjects.
- Descriptive names; no cryptic abbreviations.
- Variables and functions: `camelCase`.
- Types, interfaces, classes, enums: `PascalCase`.
- Exported constants and enum values: `UPPER_SNAKE_CASE` (`CONSTANT_CASE`).
- Folders by feature or domain (`braincore/`, `identity/`), not type dumps (`utils/`, `helpers/`).
- One file, one responsibility; split past ~300-400 lines or mixed concerns.
- One function, one job; keep under ~50 lines when practical.
- ASCII identifiers in code symbols (human string content may be UTF-8; see [utf8-literals.md](./utf8-literals.md)).

## Examples

```ts
export const NOOT_EVENT_TYPE_TOOL_CALL = 'tool_call' as const;
export const TOOL_CALL_PHASE_START = 'start' as const;

export function runConversationTurn(...): AsyncGenerator<NootEvent> { ... }
export interface ToolCallStartEvent { ... }
```

## Anti-patterns

```ts
export const anyString = ...;           // wrong: exported const must be UPPER_SNAKE
type: 'tool_call'                       // wrong in emit/compare logic; use constant
export const defaultFactory = ...;      // wrong: DEFAULT_FACTORY
```
