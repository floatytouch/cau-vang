# No magic strings or numbers

Protocol and domain literals must not appear inline in business logic.

## Protocol strings

Event `type`, tool-call `phase` / `status`, done `reason`, WS event names, engine tool-loop mode, and similar wire values live as named `UPPER_SNAKE_CASE` constants (and derived unions) in `@noot/shared`.

Emit, compare, and switch sites import those constants. The definition file is the only place the raw string appears as a value initializer.

```ts
// good
yield { ...meta(), type: NOOT_EVENT_TYPE_DONE, reason: DONE_REASON_FAILED };

// bad
yield { ...meta(), type: 'done', reason: 'failed' };
```

## Magic numbers

Repeated or ops-meaningful numbers become named constants at a single source of truth. ESLint `no-magic-numbers` is on with a small allowlist (0, 1, -1, and common array index uses). Caps, timeouts, and budgets belong in config or named exports -- not bare literals in loops.
