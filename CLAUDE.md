# Noot-v2 coding law

Hard rules for every change. Detail and sources: `docs/code-conventions/`.

## Always

1. English in code. ASCII punctuation in commits/PRs. No AI attribution trailers or footers.
2. No magic protocol strings/numbers in logic -- named `UPPER_SNAKE_CASE` constants or unions from `@noot/shared`.
3. Exported constants: `UPPER_SNAKE_CASE`. Variables/functions: `camelCase`. Types/classes/enums: `PascalCase`. Enum values: `UPPER_SNAKE_CASE`.
4. No nested ternary -- extract a named helper.
5. Small single-purpose functions; explicit return types on exported/public API; no `any`.
6. Errors become envelope events or typed results; never swallow with empty catch.
7. Comments: WHY only, one short self-contained line, last resort.
8. Runtime config via Nest `ConfigService` (or library options fed by it). No `process.env` in feature code.
9. Human text in source/tests is real UTF-8, not `\uXXXX` escapes.
10. Tests live under each workspace `test/` tree mirroring `src/`. Zero `*.spec.ts` / `*.test.ts(x)` under any `src/`.

## Layout

- NestJS: feature modules own controller/service/dto; `shared/` for cross-cutting only.
- React: function components with typed props (no `React.FC`); hooks `use*`; one job per component.
- Folders by feature/domain, never type dumps (`utils/`).

## Review gate

#222 Code Sentinel checks this file and `docs/code-conventions/`. Violations block merge.
