# Control flow

## No nested ternary

ESLint `no-nested-ternary` is an error repo-wide.

```ts
// bad
status: ok ? 'succeeded' : blocked ? 'blocked' : 'failed'

// good
status: terminalToolCallStatus(outcome)
```

Extract a named helper (or early returns) so each branch has a clear name.

## Small single-purpose functions

- One job per function; prefer early returns over deep nesting.
- Under ~50 lines when practical; extract helpers instead of deeper nesting.
- Public / exported functions declare an explicit return type (see [types-and-errors.md](./types-and-errors.md)).
