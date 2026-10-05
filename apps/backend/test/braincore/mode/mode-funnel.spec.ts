import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { NootEvent } from '@noot/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_IDENTITY_CONFIG_DIR } from '../../../src/config/app-config.js';
import { BraincoreService, BRAINCORE_EVENT_CHANNEL } from '../../../src/braincore/braincore.service.js';
import { WORK_MODE_AUTO, WORK_MODE_PLAN } from '../../../src/braincore/mode/work-mode.js';
import {
  MOCK_ENGINE_ID,
  MOCK_HARNESS_ENGINE_ID,
  MOCK_USE_WRITE_TOOL_MARKER,
} from '../../../src/braincore/testing/mock-engine-adapter.js';
import { WRITE_SCRATCH_TOOL_NAME } from '../../../src/braincore/tools/tool-registry.js';

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

function toolEnd(events: NootEvent[]): NootEvent | undefined {
  return events.find((event) => event.type === 'tool_call' && event.phase === 'end');
}

function assistantText(events: NootEvent[]): string {
  return events.map((event) => (event.type === 'text_delta' ? event.text : '')).join('');
}

function sessionFile(dataDir: string, sessionId: string): string {
  return path.join(dataDir, 'conversations', `${sessionId}.json`);
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
    await service.setMode(session.id, WORK_MODE_PLAN);
    const planEvents = collectEvents(service);
    await service.sendUserMessage(session.id, `please ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(
      planEvents.find((event) => event.type === 'tool_call' && event.phase === 'end'),
    ).toMatchObject({
      status: 'blocked',
      name: WRITE_SCRATCH_TOOL_NAME,
    });

    service.removeAllListeners();
    await service.setMode(session.id, WORK_MODE_AUTO);
    const autoEvents = collectEvents(service);
    await service.sendUserMessage(session.id, `go ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(
      autoEvents.find((event) => event.type === 'tool_call' && event.phase === 'end'),
    ).toMatchObject({
      status: 'succeeded',
      name: WRITE_SCRATCH_TOOL_NAME,
    });
  });

  it('blocks a mutating tool on harness in plan mode and allows it in auto', async () => {
    const session = await service.createSession(MOCK_HARNESS_ENGINE_ID, 'harness-model');
    await service.setMode(session.id, WORK_MODE_PLAN);
    const planEvents = collectEvents(service);
    await service.sendUserMessage(session.id, `please ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(toolEnd(planEvents)).toMatchObject({
      status: 'blocked',
      name: WRITE_SCRATCH_TOOL_NAME,
    });
    expect(assistantText(planEvents)).toBe('harness-write:offered=false:blocked');

    service.removeAllListeners();
    await service.setMode(session.id, WORK_MODE_AUTO);
    const autoEvents = collectEvents(service);
    await service.sendUserMessage(session.id, `go ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(toolEnd(autoEvents)).toMatchObject({
      status: 'succeeded',
      name: WRITE_SCRATCH_TOOL_NAME,
    });
    expect(assistantText(autoEvents)).toBe('harness-write:offered=true:ok');
  });

  it('persists mode across restart', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    await service.setMode(session.id, WORK_MODE_PLAN);
    expect(service.getMode(session.id)).toBe(WORK_MODE_PLAN);

    const restarted = await startService(tempDataDir);
    expect(restarted.getMode(session.id)).toBe(WORK_MODE_PLAN);
  });

  it('loads a session file with a corrupt mode as plan and blocks mutating tools', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    const filePath = sessionFile(tempDataDir, session.id);
    const stored = JSON.parse(await readFile(filePath, 'utf8')) as Record<string, unknown>;
    await writeFile(filePath, JSON.stringify({ ...stored, mode: 'AUTO ' }));

    const restarted = await startService(tempDataDir);
    expect(restarted.getMode(session.id)).toBe(WORK_MODE_PLAN);
    const events = collectEvents(restarted);
    await restarted.sendUserMessage(session.id, `run ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(toolEnd(events)).toMatchObject({ status: 'blocked' });
    restarted.removeAllListeners();
  });

  it('refuses plan_approve outside plan mode', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    expect(() => service.queuePlanApproval(session.id, true)).toThrow(/plan mode/);
  });

  it('drops a pending Approve when the mode changes', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    await service.setMode(session.id, WORK_MODE_PLAN);
    service.queuePlanApproval(session.id, true);
    await service.setMode(session.id, WORK_MODE_AUTO);
    await service.setMode(session.id, WORK_MODE_PLAN);

    const events = collectEvents(service);
    await service.sendUserMessage(session.id, `run ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(toolEnd(events)).toMatchObject({ status: 'blocked' });
  });

  it('the next turn consumes the Approve even when it uses no tool', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    await service.setMode(session.id, WORK_MODE_PLAN);
    service.queuePlanApproval(session.id, true);
    await service.sendUserMessage(session.id, 'just chatting');

    const events = collectEvents(service);
    await service.sendUserMessage(session.id, `run ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(toolEnd(events)).toMatchObject({ status: 'blocked' });
  });

  it('injects the plan note into engine input only, never stored history', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    await service.setMode(session.id, WORK_MODE_PLAN);
    const events = collectEvents(service);
    await service.sendUserMessage(session.id, 'hello');
    expect(assistantText(events)).toMatch(/^\(PLAN MODE is on.*hello$/s);
    const history = service.getHistory(session.id);
    expect(history.find((message) => message.role === 'user')).toMatchObject({ text: 'hello' });
  });

  it('Approve unlocks mutating tools for exactly one turn, then locks again', async () => {
    const session = await service.createSession(MOCK_ENGINE_ID, 'mock-model');
    await service.setMode(session.id, WORK_MODE_PLAN);
    service.queuePlanApproval(session.id, true);

    const unlocked = collectEvents(service);
    await service.sendUserMessage(session.id, `run ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(
      unlocked.find((event) => event.type === 'tool_call' && event.phase === 'end'),
    ).toMatchObject({
      status: 'succeeded',
    });

    service.removeAllListeners();
    const lockedAgain = collectEvents(service);
    await service.sendUserMessage(session.id, `again ${MOCK_USE_WRITE_TOOL_MARKER}`);
    expect(
      lockedAgain.find((event) => event.type === 'tool_call' && event.phase === 'end'),
    ).toMatchObject({ status: 'blocked' });
  });
});
