# @noot/shared

Contracts shared by the backend and the frontend. No runtime dependencies.

## The conversation funnel

Every conversation, whatever engine runs it, passes through one funnel and
leaves it as one event format, `NootEvent`.

```
 typed message (UI)        background job result
        |                          |
        v                          v
 +------------------------------------------------+
 | BrainCore (knows no model)                     |
 |  identity + memory -> system prompt (verbatim) |
 |  session history, Plan/Auto gate, ToolRegistry |
 +------------------------------------------------+
        |  startTurn(session, input, options)
        |  cancel(turnId)
        v
 +------------------------------------------------+
 | EngineAdapter (replaceable per conversation)   |
 |                                                |
 |  toolLoop: 'ownToolLoop'   toolLoop: 'bareApi' |
 |  (harness: Claude SDK,     (plain API: Lumo,   |
 |   Cursor SDK) runs tools    ...) only          |
 |   via the brain's           generates; the     |
 |   ToolBridge                brain runs tools   |
 +------------------------------------------------+
        |  AsyncIterable<NootEvent>
        v
 +------------------------------------------------+
 | NootEvent stream, one per turn                 |
 |  text_delta  thinking_delta  tool_call         |
 |  choices  progress  usage  error  internal_note|
 |  ... always ends with exactly one `done`       |
 +------------------------------------------------+
        |  WS (parseNootEvent at the receiving end)
        v
   chat UI: text, thinking panel, tool rows,
            choice buttons, progress, Stop
```

## What lives where

| File                                    | Contents                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `conversation/events.ts`                | `NootEvent` union, per-event types, enums as `as const` arrays                             |
| `conversation/event-validation.ts`      | `parseNootEvent` / `isNootEvent` for untrusted WS input                                    |
| `conversation/engine-adapter.ts`        | `EngineAdapter`, `EngineCapabilities`, `isHarnessEngine` / `isBareApiEngine`, `ToolBridge` |
| `health.ts`, `realtime.ts`, `server.ts` | Health endpoint, generic WS message, default port                                          |

Every event carries `sessionId`, `turnId`, `seq` (0-based, per turn) and
`emittedAt`. Validation tolerates unknown extra fields so an older client keeps
working when a field is added.
