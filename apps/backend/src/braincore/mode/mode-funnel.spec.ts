import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { NootEvent } from '@noot/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_IDENTITY_CONFIG_DIR } from '../../config/app-config.js';
import { BraincoreService, BRAINCORE_EVENT_CHANNEL } from '../braincore.service.js';
import {
  MOCK_ENGINE_ID,
  MOCK_HARNESS_ENGINE_ID,
  MOCK_USE_WRITE_TOOL_MARKER,
} from '../testing/mock-engine-adapter.js';
import { createTurnToolPolicy } from './tool-access-policy.js';
import { ToolRegistry, registerSampleTools } from '../tools/tool-registry.js';

async function startService(dataDir: string): Promise<BraincoreService> {
  const service = new BraincoreService({
    dataDir,
    identityConfigDir: DEFAULT_IDENTITY_CONFIG_DIR,
    registerMocks: true,
  });
  await service.initialize();
  return service;
}

function collectEvents(service: BraincoreService): NootEvent[] {
  const collected: NootEvent[] = [];
  service.on(BRAINCORE_EVENT_CHANNEL, (event: NootEvent) => collected.push(event));
  return collected;
}

describe('Plan/Auto mode gate (NV-7)', () => {
  let tempDataDir: string;
  let service: BraincoreService;

  beforeEach(async () => {
    tempDataDir = await mkdtemp(path.join(os.tmpdir(), 'noot-NV-7-mode-'));
    service = await startService(tempDataDir);
  });

  afterEach(async () => {
    service.removeAllListeners();
    await rm(tempDataDir, { recursive: true, force: true });
  });

  it('blocks a mutating tool on bare-API in plan mode and allows it in auto', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    await service.setMode(session.id, 'plan');
    const planEvents = collectEvents(service);
    await service.sendUserMessage(session.id, `please ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(planEvents.find((event) => event.type === 'tool_call' && event.phase === 'end')).toMatchObject({
      status: 'blocked',
      name: 'write_scratch',
    });

    service.removeAllListeners();
    await service.setMode(session.id, 'auto');
    const autoEvents = collectEvents(service);
    await service.sendUserMessage(session.id, `go ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(autoEvents.find((event) => event.type === 'tool_call' && event.phase === 'end')).toMatchObject({
      status: 'succeeded',
      name: 'write_scratch',
    });
  });

  it('blocks a mutating tool on harness in plan mode and allows it in auto', async () => {
    const session = await service.createSession(MOCK_HARNESS_ENGINE_ID, 'harness-model');
    await service.setMode(session.id, 'plan');
    const planEvents = collectEvents(service);
    await service.sendUserMessage(session.id, `please ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(planEvents.find((event) => event.type === 'tool_call' && event.phase === 'end')).toMatchObject({
      status: 'blocked',
      name: 'write_scratch',
    });

    service.removeAllListeners();
    await service.setMode(session.id, 'auto');
    const autoEvents = collectEvents(service);
    await service.sendUserMessage(session.id, `go ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(autoEvents.find((event) => event.type === 'tool_call' && event.phase === 'end')).toMatchObject({
      status: 'succeeded',
      name: 'write_scratch',
    });
  });

  it('persists mode across restart', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    await service.setMode(session.id, 'plan');
    expect(service.getMode(session.id)).toBe('plan');

    const restarted = await startService(tempDataDir);
    expect(restarted.getMode(session.id)).toBe('plan');
  });

  it('Approve unlocks mutating tools for exactly one turn, then locks again', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    await service.setMode(session.id, 'plan');
    service.queuePlanApproval(session.id, true);

    const unlocked = collectEvents(service);
    await service.sendUserMessage(session.id, `run ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(unlocked.find((event) => event.type === 'tool_call' && event.phase === 'end')).toMatchObject({
      status: 'succeeded',
    });

    service.removeAllListeners();
    const lockedAgain = collectEvents(service);
    await service.sendUserMessage(session.id, `again ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(
      lockedAgain.find((event) => event.type === 'tool_call' && event.phase === 'end'),
    ).toMatchObject({ status: 'blocked' });
  });

  it('mutation probe: disabling the execute gate lets a plan-mode mutating call succeed', async () => {
    const registry = new ToolRegistry();
    registerSampleTools(registry);
    const locked = createTurnToolPolicy(false);
    const blocked = await registry.execute(
      { callId: 'c1', name: 'write_scratch', args: { note: 'x' } },
      locked,
    );
    expect(blocked).toMatchObject({ ok: false, blocked: true });

    const bypassed = await registry.execute(
      { callId: 'c2', name: 'write_scratch', args: { note: 'x' } },
      undefined,
    );
    expect(bypassed).toEqual({ ok: true, result: { written: 'x' } });
  });
});
