import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BraincoreModule } from './braincore/braincore.module.js';
import { loadAppConfig } from './config/app-config.js';
import { HealthModule } from './health/health.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      load: [() => loadAppConfig(process.env)],
    }),
    HealthModule,
    RealtimeModule,
    BraincoreModule,
  ],
})
export class AppModule {}
