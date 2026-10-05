# Code conventions (Noot-v2)

The review checklist for implementers and #222 Code Sentinel. Repo-root `CLAUDE.md` / `AGENTS.md` is the short law sheet; this folder is the rulebook.

## Expert sources

Rules below are grounded in:

- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) / [gts](https://github.com/google/gts) -- `CONSTANT_CASE` (`UPPER_SNAKE_CASE`) for exported constants and enum values; `PascalCase` types/classes/enums; `camelCase` variables/functions; ASCII identifiers.
- [typescript-eslint](https://typescript-eslint.io/) rules [`naming-convention`](https://typescript-eslint.io/rules/naming-convention/), [`explicit-module-boundary-types`](https://typescript-eslint.io/rules/explicit-module-boundary-types/), [`no-explicit-any`](https://typescript-eslint.io/rules/no-explicit-any/) and ESLint [`no-nested-ternary`](https://eslint.org/docs/latest/rules/no-nested-ternary).
- [NestJS documentation](https://docs.nestjs.com/) -- feature modules own controller/service/dto/entities; Controller-Service pattern; `shared/` for cross-cutting guards/filters/interceptors.
- [React 19 docs](https://react.dev/) -- function components with typed props (no `React.FC`); custom hooks `use*` prefix; one responsibility per component; Rules of Hooks; presentational vs container split when state ownership matters.

## Enforcement

What fails `yarn lint` / `yarn test` today, and what only a reviewer catches. A rule in the second table is still law; it just has no machine behind it yet.

| Machine-enforced                                                                                          | By                                                                     |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| No nested ternary (source and tests)                                                                      | ESLint `no-nested-ternary`                                             |
| Exported `const` is `UPPER_SNAKE_CASE` or `PascalCase` (source)                                           | ESLint `@typescript-eslint/naming-convention`                          |
| Variables, functions, parameters `camelCase`; a local may also be an `UPPER_SNAKE_CASE` constant (source) | ESLint `@typescript-eslint/naming-convention`                          |
| Types, classes, interfaces, enums `PascalCase`; enum members upper case (source)                          | ESLint `@typescript-eslint/naming-convention`                          |
| No `any` (source and tests)                                                                               | ESLint `@typescript-eslint/no-explicit-any`                            |
| Explicit return type on exported functions and public methods (source)                                    | ESLint `@typescript-eslint/explicit-module-boundary-types`             |
| No test file or `__tests__/` folder under any workspace `src/`                                            | `scripts/assert-no-specs-in-src.mjs` (in `yarn lint`) and its own spec |
| Formatting                                                                                                | Prettier `--check`                                                     |

| Review-enforced only (no lint rule yet)                                                 | Why not automated                                   |
| --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| No inline contract strings; magic numbers named ([no-magic.md](./no-magic.md))          | No rule can tell a contract value from other text   |
| A `PascalCase` exported `const` is a component, decorator, or context, never plain data | Lint cannot see the value's type without type info  |
| No floating promises                                                                    | Needs type-aware lint, which this repo does not run |
| Function and file size, one job per function                                            | Judgment call                                       |
| Errors mapped to the envelope, nothing swallowed                                        | Judgment call                                       |
| Config through `ConfigService`, UTF-8 literals, comments WHY-only                       | Judgment call                                       |

## Pages

| Page                                           | Topic                                    |
| ---------------------------------------------- | ---------------------------------------- |
| [naming.md](./naming.md)                       | Identifiers, constants, folders          |
| [no-magic.md](./no-magic.md)                   | Protocol literals and magic numbers      |
| [control-flow.md](./control-flow.md)           | No nested ternary; small functions       |
| [types-and-errors.md](./types-and-errors.md)   | Public return types, no `any`, envelopes |
| [comments.md](./comments.md)                   | WHY-only comments                        |
| [config-standard.md](./config-standard.md)     | Runtime config via ConfigService         |
| [utf8-literals.md](./utf8-literals.md)         | Human text as real UTF-8 in source       |
| [ascii-commits.md](./ascii-commits.md)         | Commit / PR text encoding                |
| [no-ai-attribution.md](./no-ai-attribution.md) | No AI trailers or generated footers      |
| [nestjs-structure.md](./nestjs-structure.md)   | Nest feature-module layout               |
| [react-structure.md](./react-structure.md)     | React 19 component and hook rules        |
| [test-layout.md](./test-layout.md)             | Tests under `test/`, never under `src/`  |
| [test-practice.md](./test-practice.md)         | Mutation probes and fail-closed tests    |
