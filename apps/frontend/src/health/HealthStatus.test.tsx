import { HEALTH_PATH, type HealthResponse } from '@noot/shared';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HealthStatus } from './HealthStatus.js';

const healthyResponse: HealthResponse = {
  status: 'ok',
  service: 'noot-backend',
  uptimeSeconds: 42,
  timestamp: '2026-01-01T00:00:00.000Z',
};

function stubFetch(response: Response) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
}

describe('HealthStatus', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('shows the backend status from /health', async () => {
    stubFetch(Response.json(healthyResponse));
    render(<HealthStatus />);

    expect(await screen.findByText('Backend noot-backend: ok (up 42s)')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(HEALTH_PATH, expect.anything());
  });

  it('shows an error when /health fails', async () => {
    stubFetch(new Response(null, { status: 503 }));
    render(<HealthStatus />);

    expect((await screen.findByRole('alert')).textContent).toContain('HTTP 503');
  });
});
