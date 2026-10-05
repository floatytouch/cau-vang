# Code conventions (Noot-v2)

The review checklist for implementers and #222 Code Sentinel. Repo-root `CLAUDE.md` / `AGENTS.md` is the short law sheet; this folder is the rulebook.

## Expert sources

Rules below are grounded in:

- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) / [gts](https://github.com/google/gts) -- `CONSTANT_CASE` (`UPPER_SNAKE_CASE`) for exported constants and enum values; `PascalCase` types/classes/enums; `camelCase` variables/functions; ASCII identifiers.
- [typescript-eslint](https://typescript-eslint.io/) strict recommendations and [`@typescript-eslint/naming-convention`](https://typescript-eslint.io/rules/naming-convention/) -- enforced in root `eslint.config.ts` with `no-nested-ternary`, sensible `no-magic-numbers`, `explicit-module-boundary-types`, `no-explicit-any`, `no-floating-promises`.
- [NestJS documentation](https://docs.nestjs.com/) -- feature modules own controller/service/dto/entities; Controller-Service pattern; `shared/` for cross-cutting guards/filters/interceptors.
- [React 19 docs](https://react.dev/) -- function components with typed props (no `React.FC`); custom hooks `use*` prefix; one responsibility per component; Rules of Hooks; presentational vs container split when state ownership matters.

## Pages

| Page                                           | Topic                                      |
| ---------------------------------------------- | ------------------------------------------ |
| [naming.md](./naming.md)                       | Identifiers, constants, folders            |
| [no-magic.md](./no-magic.md)                   | Protocol literals and magic numbers        |
| [control-flow.md](./control-flow.md)           | No nested ternary; small functions         |
| [types-and-errors.md](./types-and-errors.md)   | Public return types, no `any`, envelopes   |
| [comments.md](./comments.md)                   | WHY-only comments                          |
| [config-standard.md](./config-standard.md)     | Runtime config via ConfigService           |
| [utf8-literals.md](./utf8-literals.md)         | Human text as real UTF-8 in source         |
| [ascii-commits.md](./ascii-commits.md)         | Commit / PR text encoding                  |
| [no-ai-attribution.md](./no-ai-attribution.md) | No AI trailers or generated footers        |
| [nestjs-structure.md](./nestjs-structure.md)   | Nest feature-module layout                 |
| [react-structure.md](./react-structure.md)     | React 19 component and hook rules          |
| [test-layout.md](./test-layout.md)             | Tests under `test/`, never under `src/`    |
| [test-practice.md](./test-practice.md)         | Mutation probes and fail-closed tests      |
