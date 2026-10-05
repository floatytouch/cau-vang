# React structure

Grounded in [React 19 docs](https://react.dev/).

## Rules

- Function components with a typed props interface (or no props). Do **not** use `React.FC` / `React.FunctionComponent`.
- One responsibility per component; split when rendering and data-loading entangle.
- Custom hooks use the `use*` prefix and follow the Rules of Hooks.
- Prefer a presentational vs container split when one side owns fetching/subscriptions and the other owns markup.
- Colocate feature UI under domain folders (`health/`, `chat/`), not a flat `components/` dump of unrelated widgets.
- Tests for components live under `apps/frontend/test/...` (see [test-layout.md](./test-layout.md)).
