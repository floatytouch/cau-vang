import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';

@Module({
  imports: [HealthModule, RealtimeModule],
})
export class AppModule {}
