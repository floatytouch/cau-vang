import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';

import { jsonSchemaToZodShape, UnsupportedToolSchemaError } from './json-schema-to-zod.js';

function parse(schema: Record<string, unknown>, value: unknown) {
  return z.object(jsonSchemaToZodShape('probe_tool', schema)).safeParse(value);
}

describe('jsonSchemaToZodShape', () => {
  const schema = {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' },
      unit: { type: 'string', enum: ['c', 'f'] },
      days: { type: 'integer' },
      tags: { type: 'array', items: { type: 'string' } },
      extra: { type: 'object' },
    },
    required: ['city'],
  };

  it('accepts arguments matching the schema', () => {
    expect(parse(schema, { city: 'Hanoi', unit: 'c', days: 3, tags: ['a'] }).success).toBe(true);
  });

  it.each([
    ['missing required property', { unit: 'c' }],
    ['wrong primitive type', { city: 1 }],
    ['value outside the enum', { city: 'Hanoi', unit: 'k' }],
    ['non-integer for an integer', { city: 'Hanoi', days: 1.5 }],
    ['wrong array item type', { city: 'Hanoi', tags: [1] }],
  ])('rejects %s', (_label, value) => {
    expect(parse(schema, value).success).toBe(false);
  });

  it('keeps property descriptions visible to the model', () => {
    const json = z.toJSONSchema(z.object(jsonSchemaToZodShape('probe_tool', schema))) as {
      properties: Record<string, { description?: string }>;
    };
    expect(json.properties.city?.description).toBe('City name');
  });

  it.each([
    ['anyOf', { type: 'object', properties: { a: { anyOf: [{ type: 'string' }] } } }],
    ['$ref at root', { $ref: '#/definitions/x' }],
    ['type arrays', { type: 'object', properties: { a: { type: ['string', 'null'] } } }],
    ['untyped property', { type: 'object', properties: { a: {} } }],
    [
      'nested object properties',
      {
        type: 'object',
        properties: { a: { type: 'object', properties: { b: { type: 'string' } } } },
      },
    ],
    [
      'complex array items',
      { type: 'object', properties: { a: { type: 'array', items: { type: 'object' } } } },
    ],
    ['non-object root', { type: 'string' }],
    ['open additionalProperties', { type: 'object', additionalProperties: true }],
    ['required without declaration', { type: 'object', properties: {}, required: ['ghost'] }],
    ['enum on a number', { type: 'object', properties: { a: { type: 'number', enum: [1] } } }],
  ])('refuses %s instead of degrading silently', (_label, unsupported) => {
    expect(() => jsonSchemaToZodShape('probe_tool', unsupported)).toThrow(
      UnsupportedToolSchemaError,
    );
  });

  it('names the tool and the path in the refusal', () => {
    expect(() =>
      jsonSchemaToZodShape('probe_tool', { type: 'object', properties: { a: { type: 'null' } } }),
    ).toThrow(/probe_tool.*properties\.a/);
  });

  it('accepts a tool without arguments', () => {
    expect(jsonSchemaToZodShape('probe_tool', { type: 'object', properties: {} })).toEqual({});
    expect(jsonSchemaToZodShape('probe_tool', {})).toEqual({});
  });
});
