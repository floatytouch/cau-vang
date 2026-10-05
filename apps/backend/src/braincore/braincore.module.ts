import { Module, type OnModuleInit } from '@nestjs/common';
import { BraincoreService } from './braincore.service.js';
import { BraincoreGateway } from './ws/braincore.gateway.js';

@Module({
  providers: [BraincoreService, BraincoreGateway],
  exports: [BraincoreService],
})
export class BraincoreModule implements OnModuleInit {
  constructor(private readonly braincore: BraincoreService) {}

  async onModuleInit(): Promise<void> {
    await this.braincore.initialize();
  }
}
