import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const TEST_FILE = /\.(spec|test)\.(ts|tsx)$/;

function listWorkspaceSrcDirs(): string[] {
  const roots = ['apps', 'packages'].map((name) => path.join(REPO_ROOT, name));
  const srcDirs: string[] = [];
  for (const root of roots) {
    let workspaces: string[];
    try {
      workspaces = readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(root, entry.name, 'src'));
    } catch {
      continue;
    }
    for (const src of workspaces) {
      try {
        if (statSync(src).isDirectory()) {
          srcDirs.push(src);
        }
      } catch {
        // workspace without src
      }
    }
  }
  return srcDirs;
}

function collectTestFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      collectTestFiles(fullPath, found);
      continue;
    }
    if (TEST_FILE.test(entry.name)) {
      found.push(path.relative(REPO_ROOT, fullPath));
    }
  }
  return found;
}

describe('no specs under src/', () => {
  it('finds zero *.spec.ts / *.test.ts(x) under any workspace src/', () => {
    const violations = listWorkspaceSrcDirs().flatMap((src) => collectTestFiles(src));
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
