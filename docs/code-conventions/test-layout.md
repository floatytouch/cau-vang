# Test layout

## House rule (deliberate)

**Every test file lives under the workspace `test/` tree, mirroring `src/`.** No `*.spec.ts`, `*.test.ts`, or `*.test.tsx` under any `src/`.

This is a conscious deviation from NestJS's co-located-spec habit and from many React templates. Reason: code review of production files must not scroll through specs; test discovery is owned by Vitest `include` paths.

## Examples

| Source                                           | Test                                                   |
| ------------------------------------------------ | ------------------------------------------------------ |
| `apps/backend/src/braincore/turn/turn-runner.ts` | `apps/backend/test/braincore/turn/turn-runner.spec.ts` |
| `packages/shared/src/conversation/events.ts`     | `packages/shared/test/conversation/events.spec.ts`     |
| `apps/frontend/src/health/HealthStatus.tsx`      | `apps/frontend/test/health/HealthStatus.test.tsx`      |

## Tooling

- Vitest `include`: `test/**/*.spec.ts` (and frontend `test/**/*.test.tsx`).
- Build `tsconfig`: `rootDir` / `include` stay on `src` only; tests are excluded from emit.
- Workspace `tsconfig.json` (typecheck for tests) includes both `src` and `test`.
- Automated guard: lint runs `scripts/assert-no-specs-in-src.mjs`, which fails if any spec/test file appears under `src/`.

## Practice

Quality expectations (mutation probes, fail-closed) remain in [test-practice.md](./test-practice.md).
