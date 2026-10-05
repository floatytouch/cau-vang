import { Module, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/app-config.js';
import {
  BRAINCORE_OPTIONS,
  BraincoreService,
  type BraincoreServiceOptions,
} from './braincore.service.js';
import { BraincoreGateway } from './ws/braincore.gateway.js';

@Module({
  providers: [
    {
      provide: BRAINCORE_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): BraincoreServiceOptions => {
        const braincore = config.getOrThrow('braincore', { infer: true });
        return {
          dataDir: braincore.dataDir,
          identityConfigDir: braincore.identityConfigDir,
          liveSessionCap: braincore.liveSessionCap,
          maxChatTextLength: braincore.maxChatTextLength,
          registerMocks: braincore.mockEngines,
        };
      },
    },
    BraincoreService,
    BraincoreGateway,
  ],
  exports: [BraincoreService],
})
export class BraincoreModule implements OnModuleInit {
  constructor(private readonly braincore: BraincoreService) {}

  async onModuleInit(): Promise<void> {
    await this.braincore.initialize();
  }
}
