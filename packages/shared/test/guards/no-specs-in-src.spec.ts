import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const GUARD_SCRIPT = path.join(REPO_ROOT, 'scripts/assert-no-specs-in-src.mjs');
const EXIT_OK = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_NOTHING_SCANNED = 2;

interface GuardRun {
  status: number | null;
  output: string;
}

function runGuard(repoRoot?: string): GuardRun {
  const args = repoRoot === undefined ? [GUARD_SCRIPT] : [GUARD_SCRIPT, repoRoot];
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('no-specs-in-src guard', () => {
  let fixtureRoot: string;

  function plant(relativePath: string): void {
    const fullPath = path.join(fixtureRoot, relativePath);
    mkdirSync(path.dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, 'export {};\n');
  }

  beforeEach(() => {
    fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'noot-spec-guard-'));
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it('passes on this repository', () => {
    const run = runGuard();
    expect(run.output).toContain('OK: no test files under src/');
    expect(run.status).toBe(EXIT_OK);
  });

  it('passes when tests sit only under test/', () => {
    plant('packages/lib/src/feature/thing.ts');
    plant('packages/lib/test/feature/thing.spec.ts');
    plant('packages/lib/src/node_modules/dep/dep.test.js');

    expect(runGuard(fixtureRoot).status).toBe(EXIT_OK);
  });

  it.each([
    'apps/web/src/thing.spec.ts',
    'apps/web/src/deep/nested/Thing.test.tsx',
    'packages/lib/src/thing.test.ts',
    'packages/lib/src/thing.spec.mts',
    'packages/lib/src/thing.test.js',
  ])('fails on %s', (planted) => {
    plant('packages/lib/src/index.ts');
    plant(planted);

    const run = runGuard(fixtureRoot);

    expect(run.output).toContain(planted);
    expect(run.status).toBe(EXIT_VIOLATIONS);
  });

  it('fails on a __tests__ directory under src/', () => {
    plant('packages/lib/src/__tests__/thing.ts');

    const run = runGuard(fixtureRoot);

    expect(run.output).toContain('packages/lib/src/__tests__/');
    expect(run.status).toBe(EXIT_VIOLATIONS);
  });

  it('refuses to pass when it finds no workspace src/ to scan', () => {
    plant('README.md');

    const run = runGuard(fixtureRoot);

    expect(run.output).toContain('Refusing to pass without scanning anything');
    expect(run.status).toBe(EXIT_NOTHING_SCANNED);
  });
});
