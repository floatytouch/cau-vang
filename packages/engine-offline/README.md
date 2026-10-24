# @noot/engine-offline

Rules-only `EngineAdapter` for BrainCore: deterministic turns with no model API,
no HTTP, and zero token usage. Intended for local dev, demos, and automated
tests when `NOOT_BRAINCORE_MOCK_ENGINES=1`.

| Engine id        | Behavior |
| ---------------- | -------- |
| `offline-rules`  | Controlled echo (`echo: ...`), optional fixture choices when user text contains `SHOW_CHOICES`, always ends with `done(completed)`. |

The Nest host registers this adapter alongside the inline `mock` engines when
mock engines are enabled. The package never reads `process.env`.

```ts
import { createOfflineRulesAdapter } from '@noot/engine-offline';

braincore.engines.register(createOfflineRulesAdapter());
```
