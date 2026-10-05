import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { USAGE_DAILY_PATH, type DailyUsageResponse } from '@noot/shared';
import { BraincoreService } from '../braincore.service.js';
import { normalizeUsageDay } from './usage-day.js';

@Controller(USAGE_DAILY_PATH)
export class UsageController {
  constructor(private readonly braincore: BraincoreService) {}

  @Get()
  async dailyTotals(@Query('day') day?: string): Promise<DailyUsageResponse> {
    return this.braincore.usage.summarizeDay(parseDayQuery(day));
  }
}

function parseDayQuery(day: string | undefined): string {
  try {
    return normalizeUsageDay(day);
  } catch (error) {
    throw new BadRequestException(error instanceof Error ? error.message : String(error));
  }
}
