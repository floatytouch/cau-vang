import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const BRAINCORE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/braincore',
);

/** Engine SDKs belong in adapters; the brain must stay model-agnostic. */
const FORBIDDEN_PACKAGE =
  /^(@anthropic-ai\/|@cursor\/|openai$|openai\/|@openai\/|@google\/(generative-ai|genai)|@mistralai\/|cohere-ai|ollama|ai$|@ai-sdk\/|groq-sdk|@aws-sdk\/client-bedrock)/;

const MODULE_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])([^'"]+)\1/g;

function forbiddenImports(source: string): string[] {
  return [...source.matchAll(MODULE_SPECIFIER)]
    .map((match) => match[2] ?? '')
    .filter((specifier) => FORBIDDEN_PACKAGE.test(specifier));
}

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return collectSourceFiles(fullPath);
      }
      return entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

describe('BrainCore SDK import guard', () => {
  it('detects every import form it is meant to block', () => {
    const offending = [
      "import { query } from '@anthropic-ai/claude-agent-sdk';",
      'import Agent from "@cursor/sdk";',
      "const client = require('openai');",
      "await import('@google/genai');",
      "import 'openai/shims/node';",
      "export { x } from '@ai-sdk/openai';",
    ];
    for (const line of offending) {
      expect(forbiddenImports(line), line).not.toEqual([]);
    }
    expect(forbiddenImports("import { NootEvent } from '@noot/shared';")).toEqual([]);
  });

  it('finds no engine SDK import under braincore', async () => {
    const files = await collectSourceFiles(BRAINCORE_ROOT);
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      expect(forbiddenImports(await readFile(file, 'utf8')), file).toEqual([]);
    }
  });
});
