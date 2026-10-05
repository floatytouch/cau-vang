# Naming

Grounded in the [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) / [gts](https://github.com/google/gts).

## Rules

- English everywhere in code: identifiers, comments, logs, commit subjects.
- Descriptive names; no cryptic abbreviations.
- Variables and functions: `camelCase`.
- Types, interfaces, classes, enums: `PascalCase`.
- Exported constants and enum values: `UPPER_SNAKE_CASE` (`CONSTANT_CASE`).
- Exported functions are `function` declarations, not `const` arrows (an exported `const` is a constant and must be upper case).
- `PascalCase` on an exported `const` is reserved for values that are used as a type-like thing: a wrapped React component, a Nest decorator, a context object.
- Folders by feature or domain (`braincore/`, `identity/`), not type dumps (`utils/`, `helpers/`).
- One file, one responsibility; split past ~300-400 lines or mixed concerns.
- One function, one job; keep under ~50 lines when practical.
- ASCII identifiers in code symbols (human string content may be UTF-8; see [utf8-literals.md](./utf8-literals.md)).

## Enforcement

`@typescript-eslint/naming-convention` in root `eslint.config.ts`, source files only:

- exported `const`: `UPPER_SNAKE_CASE` or `PascalCase`;
- other variables: `camelCase`, or `UPPER_SNAKE_CASE` for a module-level constant, or `PascalCase` for a component-like value; destructured names are exempt because vendor payloads dictate them;
- functions: `camelCase` (`PascalCase` for React components); parameters: `camelCase`;
- types, interfaces, classes, enums: `PascalCase`;
- enum members: upper case.

Lint cannot tell a component from plain data, so `export const MaxRetries = 3` passes lint and is still a violation. Reviewers catch that case.

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
export const loadThing = () => ...;     // wrong: export function loadThing()
export const MaxRetries = 3;            // wrong: MAX_RETRIES (lint does not catch this one)
```
