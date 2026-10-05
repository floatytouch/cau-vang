import type { HealthResponse } from '@noot/shared';
import { useEffect, useState } from 'react';
import { fetchHealth } from './fetchHealth.js';

type HealthState =
  | { kind: 'loading' }
  | { kind: 'ready'; health: HealthResponse }
  | { kind: 'failed'; message: string };

export function HealthStatus() {
  const [state, setState] = useState<HealthState>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchHealth(controller.signal)
      .then((health) => setState({ kind: 'ready', health }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : String(error);
        setState({ kind: 'failed', message });
      });
    return () => controller.abort();
  }, []);

  if (state.kind === 'loading') return <p role="status">Checking backend...</p>;
  if (state.kind === 'failed') return <p role="alert">Backend unreachable: {state.message}</p>;

  return (
    <p role="status">
      Backend {state.health.service}: {state.health.status} (up {state.health.uptimeSeconds}s)
    </p>
  );
}
