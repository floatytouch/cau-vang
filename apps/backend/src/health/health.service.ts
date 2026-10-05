import { HEALTH_STATUS_OK } from '@noot/shared';
import { Injectable } from '@nestjs/common';
import type { HealthResponse } from '@noot/shared';

export const SERVICE_NAME = 'noot-backend';

@Injectable()
export class HealthService {
  check(): HealthResponse {
    return {
      status: HEALTH_STATUS_OK,
      service: SERVICE_NAME,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
