#!/usr/bin/env node
/**
 * Fails when a test file lives under a workspace src/ tree.
 * House rule: tests belong in test/ (see docs/code-conventions/test-layout.md).
 * Usage: node scripts/assert-no-specs-in-src.mjs [repoRoot]
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ROOTS = ['apps', 'packages'];
const TEST_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;
const TEST_DIR = '__tests__';
const SKIPPED_DIRS = new Set(['node_modules', 'dist']);
const EXIT_VIOLATIONS = 1;
const EXIT_NOTHING_SCANNED = 2;

function isDirectory(target) {
  return statSync(target, { throwIfNoEntry: false })?.isDirectory() === true;
}

function listWorkspaceSrcDirs(repoRoot) {
  return WORKSPACE_ROOTS.map((rootName) => path.join(repoRoot, rootName))
    .filter(isDirectory)
    .flatMap((root) => readdirSync(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(entry.parentPath, entry.name, 'src'))
    .filter(isDirectory);
}

function collectViolations(dir, repoRoot, found) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (!entry.isDirectory()) {
      if (TEST_FILE.test(entry.name)) {
        found.push(path.relative(repoRoot, fullPath));
      }
      continue;
    }
    if (SKIPPED_DIRS.has(entry.name)) {
      continue;
    }
    if (entry.name === TEST_DIR) {
      found.push(`${path.relative(repoRoot, fullPath)}${path.sep}`);
      continue;
    }
    collectViolations(fullPath, repoRoot, found);
  }
  return found;
}

const repoRoot = path.resolve(process.argv[2] ?? DEFAULT_REPO_ROOT);
const srcDirs = listWorkspaceSrcDirs(repoRoot);

if (srcDirs.length === 0) {
  console.error(
    `No workspace src/ directory found under ${repoRoot} (looked in ${WORKSPACE_ROOTS.join(', ')}). ` +
      'Refusing to pass without scanning anything; check the repo root or WORKSPACE_ROOTS.',
  );
  process.exit(EXIT_NOTHING_SCANNED);
}

const violations = srcDirs.flatMap((srcDir) => collectViolations(srcDir, repoRoot, []));

if (violations.length > 0) {
  console.error('Tests must not live under src/. Move them to the workspace test/ tree:');
  for (const file of violations.sort()) {
    console.error(`  - ${file}`);
  }
  process.exit(EXIT_VIOLATIONS);
}

console.log(`OK: no test files under src/ in ${srcDirs.length} workspaces`);
