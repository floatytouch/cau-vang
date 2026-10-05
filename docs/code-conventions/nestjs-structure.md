# NestJS structure

Grounded in the [NestJS documentation](https://docs.nestjs.com/) feature-module model.

## Layout

- One feature folder owns its module, controller, service, DTOs, and entities (`braincore/`, `health/`, ...).
- Controllers stay thin: validate/parse input, call the service, return the result.
- Services own business logic and orchestration.
- Cross-cutting guards, filters, and interceptors live under a shared Nest area -- not copied into features.
- Library packages (`@noot/shared`, engine adapters) stay framework-free; the Nest app wires them through modules and `ConfigService`.

## House deviation: test location

Nest examples often co-locate `*.spec.ts` next to the source file. **This repo deliberately does not.** All tests live under the workspace `test/` tree (see [test-layout.md](./test-layout.md)) so code review of `src/` never wades through specs.
