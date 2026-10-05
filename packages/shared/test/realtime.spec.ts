import { describe, expect, it } from 'vitest';
import { WS_NOOT_EVENT } from '../src/realtime.js';

describe('WS_NOOT_EVENT', () => {
  it('pins the BrainCore funnel wire name', () => {
    expect(WS_NOOT_EVENT).toBe('noot_event');
  });
});
