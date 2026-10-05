import { Module } from '@nestjs/common';
import { BraincoreModule } from './braincore/braincore.module.js';
import { HealthModule } from './health/health.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';

@Module({
  imports: [HealthModule, RealtimeModule, BraincoreModule],
})
export class AppModule {}
