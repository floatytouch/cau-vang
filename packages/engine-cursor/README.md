# @noot/engine-cursor

`EngineAdapter` harness around [`@cursor/sdk`](https://www.npmjs.com/package/@cursor/sdk)
for Noot-v2. Bills to the Cursor plan that owns the local login or API key.

## Factory options

All runtime settings enter through `createCursorEngineAdapter(config)` -- this
package never reads `process.env`.

| Option | Required | Source (host responsibility) |
| --- | --- | --- |
| `cwd` | yes | Session brief / project root from BrainCore |
| `apiKey` | no | Nest `ConfigService` (e.g. `CURSOR_API_KEY`) or omit for SDK stored login via `Cursor.auth.login()` |
| `turnTimeoutMs` | no | Nest config; defaults to 30 minutes inside the package |

```ts
import { createCursorEngineAdapter } from '@noot/engine-cursor';

const adapter = createCursorEngineAdapter({
  cwd: briefRoot,
  apiKey: configService.get<string>('CURSOR_API_KEY'),
});
```

If `apiKey` is omitted or the host passes `undefined`, `Agent.create` is called
without `apiKey` and `@cursor/sdk` uses the stored login. An explicit empty
string fails closed.

## Live smoke

Opt-in only (saves Cursor quota):

```sh
NOOT_CURSOR_SMOKE=1 yarn workspace @noot/engine-cursor test
```

The smoke adapter is created without `apiKey` so it uses stored login. To exercise
an API key path, pass `apiKey` from a host that already resolved it -- do not add
env reads inside this package.
