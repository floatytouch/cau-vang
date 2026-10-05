import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { USAGE_DAILY_PATH, type DailyUsageResponse } from '@noot/shared';
import { BraincoreService } from '../braincore.service.js';
import { normalizeUsageDay } from './usage-recorder.js';

@Controller()
export class UsageController {
  constructor(private readonly braincore: BraincoreService) {}

  @Get(USAGE_DAILY_PATH.replace(/^\//, ''))
  async dailyTotals(@Query('day') day?: string): Promise<DailyUsageResponse> {
    try {
      const normalized = normalizeUsageDay(day);
      return await this.braincore.summarizeDailyUsage(normalized);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message);
    }
  }
}
