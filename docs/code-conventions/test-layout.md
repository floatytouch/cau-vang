# Test layout

## House rule (deliberate)

**Every test file lives under the workspace `test/` tree, mirroring `src/`.** No `*.spec.*` / `*.test.*` file and no `__tests__/` folder under any `src/`.

Test-only helpers, mocks, and fixtures live under `test/` too (`test/support/`, `test/fixtures/`). A mock stays in `src/` only when the running app wires it (the backend mock engines behind `NOOT_BRAINCORE_MOCK_ENGINES`).

This is a conscious deviation from NestJS's co-located-spec habit and from many React templates. Reason: code review of production files must not scroll through specs; test discovery is owned by Vitest `include` paths.

## Examples

| Source                                                 | Test                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| `apps/backend/src/braincore/turn/turn-runner.ts`       | `apps/backend/test/braincore/turn/turn-runner.spec.ts`       |
| `packages/shared/src/conversation/event-validation.ts` | `packages/shared/test/conversation/event-validation.spec.ts` |
| `apps/frontend/src/health/HealthStatus.tsx`            | `apps/frontend/test/health/HealthStatus.test.tsx`            |

## Tooling

- Vitest `include`: `test/**/*.spec.ts` (frontend: `test/**/*.test.tsx` and `test/**/*.test.ts`).
- Build `tsconfig`: `rootDir` / `include` stay on `src` only; tests are excluded from emit.
- Workspace `tsconfig.json` (typecheck for tests) includes both `src` and `test`.
- Automated guard: `yarn lint` runs `scripts/assert-no-specs-in-src.mjs`. It exits non-zero when a test file or `__tests__/` folder sits under a workspace `src/`, and also when it finds no `src/` to scan. `packages/shared/test/guards/no-specs-in-src.spec.ts` runs the same script against planted fixtures.

## Practice

Quality expectations (mutation probes, fail-closed) remain in [test-practice.md](./test-practice.md).
