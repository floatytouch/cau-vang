# Config standard

All ops-tunable runtime values flow through the framework config layer.

## NestJS apps

- Boot validates environment into a typed config object (`loadAppConfig` / equivalent).
- Feature code reads values from NestJS `ConfigService` (or options factories that inject it).
- Feature modules do **not** read `process.env` directly.
- Feature modules do **not** open env files or invent hard-coded ops constants for paths, caps, or limits.
- Library-style units stay framework-free: they accept options; the Nest layer resolves env and passes them in.

## What counts as ops-tunable

Paths, ports, live-session caps, WS text caps, feature flags for mocks, and any value an operator may change per deploy or container.

## Identity / domain files

Persisted domain config (for example `identity.json` bot name) is loaded by the owning feature after the Nest layer supplies the config directory. That is not a substitute for `ConfigService` for env-backed ops values.
