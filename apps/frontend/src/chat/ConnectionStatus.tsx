import type { FunnelConnectionState } from '../funnel/funnel-port.js';

const LABELS: Record<FunnelConnectionState, string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Disconnected',
  error: 'Connection error',
};

export function ConnectionStatus({ state }: { state: FunnelConnectionState }) {
  return (
    <p className="noot-status" data-state={state} role="status">
      Funnel: {LABELS[state]}
    </p>
  );
}
