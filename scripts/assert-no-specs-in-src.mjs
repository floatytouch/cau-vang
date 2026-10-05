#!/usr/bin/env node
/**
 * Fails when any *.spec.ts / *.test.ts(x) lives under a workspace src/ tree.
 * House rule: tests belong in test/ (see docs/code-conventions/test-layout.md).
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOTS = ['apps', 'packages'];
const TEST_FILE = /\.(spec|test)\.(ts|tsx)$/;

function listDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

function collectViolations(dir, found = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue;
      }
      collectViolations(fullPath, found);
      continue;
    }
    if (TEST_FILE.test(entry.name)) {
      found.push(path.relative(REPO_ROOT, fullPath));
    }
  }
  return found;
}

const violations = [];
for (const rootName of WORKSPACE_ROOTS) {
  for (const workspace of listDirs(path.join(REPO_ROOT, rootName))) {
    const srcDir = path.join(workspace, 'src');
    try {
      if (!statSync(srcDir).isDirectory()) {
        continue;
      }
    } catch {
      continue;
    }
    collectViolations(srcDir, violations);
  }
}

if (violations.length > 0) {
  console.error('Tests must not live under src/. Move them to the workspace test/ tree:');
  for (const file of violations.sort()) {
    console.error(`  - ${file}`);
  }
  process.exit(1);
}

console.log('OK: no *.spec.ts / *.test.ts(x) under any workspace src/');
