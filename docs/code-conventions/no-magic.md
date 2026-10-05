# No magic strings or numbers

## Contract values

A contract value is any string another module, the UI, or a persisted file depends on: event `type`, tool-call `phase` / `status`, done `reason`, error `code`, WS event names, engine tool-loop mode, conversation roles, engine ids, and any tool name referenced outside its own definition.

- Each contract value has exactly one definition, an `UPPER_SNAKE_CASE` constant (unions are derived from the constants).
- Used by more than one workspace: the definition lives in `@noot/shared`. Used by one workspace: it lives in that workspace, next to the code that owns it.
- Emit, compare, and switch sites import the constant. The definition is the only place the raw string appears in `src/`.
- Tests keep writing the raw string (`'tool_call'`, `'failed'`). That is the independent pin that turns an accidental wire-value change red.

```ts
// good
yield { ...meta(), type: NOOT_EVENT_TYPE_DONE, reason: DONE_REASON_FAILED };

// bad
yield { ...meta(), type: 'done', reason: 'failed' };
```

## Not contract values

Write these as literals; the compiler already checks them.

- Vendor discriminants: Anthropic / Cursor SDK message types and statuses, JSON Schema keywords, MCP content types, chat-completion roles sent to a model API. Spell them as the vendor does.
- Tags of a discriminated union that is declared and consumed inside one file (`kind: 'loading'`).
- Type positions (`MessageOf<'assistant'>`, a union type declaration).

Never compare a vendor value against a Noot constant, even when the strings are identical today.

```ts
// bad: the Anthropic delta type only happens to share the spelling of a Noot event type
if (delta.type === NOOT_EVENT_TYPE_TEXT_DELTA) { ... }

// good
if (delta.type === 'text_delta') { ... }
```

## Magic numbers

Repeated or ops-meaningful numbers (caps, timeouts, budgets, limits) become named constants at a single source of truth, or config values when an operator may tune them ([config-standard.md](./config-standard.md)). `0`, `1`, `-1`, and plain arithmetic inside the constant's own definition (`30 * 60 * 1000`) are fine.

## Enforcement

Review only. No lint rule covers this page; `no-magic-numbers` is not enabled.
