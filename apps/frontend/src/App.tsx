import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { ChatPage } from './chat/ChatPage.js';
import { loadFrontendConfig } from './config/frontend-config.js';
import type { FunnelPort } from './funnel/funnel-port.js';
import { SocketFunnelClient } from './funnel/socket-funnel-client.js';
import { HealthStatus } from './health/HealthStatus.js';
import { ThemeProvider } from './theme/ThemeProvider.js';
import './theme/theme.css';

interface AppProps {
  funnel?: FunnelPort;
}

export function App({ funnel }: AppProps): ReactElement {
  const resolvedFunnel = useMemo(
    () => funnel ?? new SocketFunnelClient(loadFrontendConfig()),
    [funnel],
  );

  return (
    <ThemeProvider>
      <ChatPage funnel={resolvedFunnel} headerStatus={<HealthStatus />} />
    </ThemeProvider>
  );
}
