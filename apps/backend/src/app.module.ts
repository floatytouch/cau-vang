import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BraincoreModule } from './braincore/braincore.module.js';
import { createConfigModuleOptions } from './config/env-files.js';
import { HealthModule } from './health/health.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';

@Module({
  imports: [
    ConfigModule.forRoot(createConfigModuleOptions()),
    HealthModule,
    RealtimeModule,
    BraincoreModule,
  ],
})
export class AppModule {}
