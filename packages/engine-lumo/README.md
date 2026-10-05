# @noot/engine-lumo

Bare-API `EngineAdapter` for Lumo via the local lumo-tamer HTTP proxy. Stateless:
no tools, no sessions, no thinking stream. Recap history is trimmed to a char
budget before each call.

## Factory options (only config path)

This package never reads `process.env`. The Nest host resolves runtime values
through `ConfigService` and passes them into `createLumoAdapter(...)`.

| Option                 | Source in the Nest app                                                | Default inside this package                                     |
| ---------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| `apiKey`               | `ConfigService` key `LUMO_API_KEY` (exported as `LUMO_API_KEY_ENV`)   | none -- missing/blank fails the turn with `missing_credentials` |
| `baseUrl`              | `ConfigService` key `LUMO_BASE_URL` (exported as `LUMO_BASE_URL_ENV`) | `http://localhost:3003/v1`                                      |
| `budgets.charBudget`   | Nest config / feature options                                         | `24000` (`HISTORY_CHAR_BUDGET`)                                 |
| `budgets.messageLimit` | Nest config / feature options                                         | `40` (`HISTORY_MESSAGE_LIMIT`)                                  |
| `budgets.messageChars` | Nest config / feature options                                         | `4000` (`HISTORY_MESSAGE_CHARS`)                                |
| `requestTimeoutMs`     | Nest config / feature options                                         | `300000`                                                        |
| `client`               | tests / custom HTTP injection                                         | built from `apiKey` + `baseUrl`                                 |

```ts
import { createLumoAdapter } from '@noot/engine-lumo';

const adapter = createLumoAdapter({
  apiKey: configService.getOrThrow<string>('LUMO_API_KEY'),
  baseUrl: configService.get<string>('LUMO_BASE_URL'),
  budgets: {
    charBudget: configService.get<number>('LUMO_RECAP_CHAR_BUDGET'),
  },
});
```

Credential checks stay per turn: `createLumoAdapter` does not throw when
`apiKey` is missing; the first `startTurn` yields `error(missing_credentials)`
then `done(failed)`.
