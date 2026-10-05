# Types and errors

Grounded in typescript-eslint strict guidance (`explicit-module-boundary-types`, `no-explicit-any`, `no-floating-promises`).

Lint enforces the first two. `no-floating-promises` needs type-aware lint, which this repo does not run, so floating promises and everything under Errors are caught in review.

## Types

- Exported functions and public methods of exported classes declare explicit return types (React components included: `ReactElement`).
- `any` is forbidden. Prefer `unknown` at boundaries, then narrow.
- Do not leave floating promises; `void` them only when fire-and-forget is intentional and safe.

## Errors

- User-facing and wire paths map failures into the NootEvent envelope (`error` + terminal `done`) or a typed result (`{ ok: true } | { ok: false; error: string }`).
- Never `catch` and swallow without logging or re-encoding the failure.
- Fail loud in dev/test paths; soft, structured failures on live user paths.
- Error messages carry context: what failed, with what input, what happens next.
