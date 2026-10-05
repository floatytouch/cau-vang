import type { ReactElement } from 'react';
import { HealthStatus } from './health/HealthStatus.js';

export function App(): ReactElement {
  return (
    <main>
      <h1>Noot</h1>
      <HealthStatus />
    </main>
  );
}
