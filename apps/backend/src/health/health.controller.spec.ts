import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HEALTH_PATH, type HealthResponse } from '@noot/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthModule } from './health.module.js';
import { SERVICE_NAME } from './health.service.js';

describe('GET /health', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [HealthModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('returns an ok HealthResponse', async () => {
    const response = await request(app.getHttpServer()).get(HEALTH_PATH).expect(200);
    const body = response.body as HealthResponse;

    expect(body.status).toBe('ok');
    expect(body.service).toBe(SERVICE_NAME);
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
