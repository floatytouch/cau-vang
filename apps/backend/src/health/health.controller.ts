import { Controller, Get } from '@nestjs/common';
import { HEALTH_PATH, type HealthResponse } from '@noot/shared';
import { HealthService } from './health.service.js';

@Controller(HEALTH_PATH)
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check(): HealthResponse {
    return this.healthService.check();
  }
}
