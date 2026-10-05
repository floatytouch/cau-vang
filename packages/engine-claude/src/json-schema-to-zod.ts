import { z } from 'zod/v4';

type JsonSchema = Readonly<Record<string, unknown>>;
type Fail = (reason: string) => never;

export class UnsupportedToolSchemaError extends Error {
  constructor(toolName: string, path: string, reason: string) {
    super(
      `Tool "${toolName}" input schema at ${path}: ${reason}; simplify the schema or extend the bridge`,
    );
    this.name = 'UnsupportedToolSchemaError';
  }
}

const UNSUPPORTED_KEYWORDS = ['anyOf', 'oneOf', 'allOf', 'not', '$ref', 'if', 'patternProperties'];

function isSchemaObject(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rejectUnsupportedKeywords(schema: JsonSchema, fail: Fail): void {
  const found = UNSUPPORTED_KEYWORDS.find((keyword) => keyword in schema);
  if (found) {
    fail(`keyword "${found}" is not supported`);
  }
}

function withDescription<T extends z.ZodType>(field: T, schema: JsonSchema): T {
  return typeof schema.description === 'string' ? field.describe(schema.description) : field;
}

function primitiveField(schema: JsonSchema, fail: Fail): z.ZodType | undefined {
  const typeName = schema.type;
  if (typeName === 'string') {
    if (schema.enum === undefined) {
      return z.string();
    }
    const values = schema.enum;
    if (
      !Array.isArray(values) ||
      values.length === 0 ||
      !values.every((v) => typeof v === 'string')
    ) {
      fail('enum must be a non-empty array of strings');
    }
    return z.enum(values as [string, ...string[]]);
  }
  if ('enum' in schema) {
    fail(`enum is only supported on string properties`);
  }
  if (typeName === 'number') {
    return z.number();
  }
  if (typeName === 'integer') {
    return z.number().int();
  }
  if (typeName === 'boolean') {
    return z.boolean();
  }
  return undefined;
}

function propertyField(schema: unknown, fail: Fail): z.ZodType {
  if (!isSchemaObject(schema)) {
    fail('property schema must be an object');
  }
  rejectUnsupportedKeywords(schema, fail);

  const primitive = primitiveField(schema, fail);
  if (primitive) {
    return withDescription(primitive, schema);
  }
  if (schema.type === 'array') {
    const items = schema.items;
    if (items === undefined) {
      return withDescription(z.array(z.unknown()), schema);
    }
    if (!isSchemaObject(items)) {
      fail('array items must be a single schema object');
    }
    rejectUnsupportedKeywords(items, fail);
    const itemField = primitiveField(items, fail);
    if (!itemField) {
      fail('array items must be string, number, integer or boolean');
    }
    return withDescription(z.array(withDescription(itemField, items)), schema);
  }
  if (schema.type === 'object') {
    if (schema.properties !== undefined) {
      fail('nested objects with declared properties are not supported');
    }
    return withDescription(z.record(z.string(), z.unknown()), schema);
  }
  return fail(`type ${JSON.stringify(schema.type)} is not supported`);
}

/**
 * Shallow JSON Schema -> zod bridge for brain tool arguments. Anything it cannot
 * express exactly is refused, because the SDK strips undeclared keys and shows the
 * model only the converted schema: a lossy conversion silently changes the tool.
 */
export function jsonSchemaToZodShape(toolName: string, schema: JsonSchema): z.ZodRawShape {
  const failAt =
    (path: string): Fail =>
    (reason) => {
      throw new UnsupportedToolSchemaError(toolName, path, reason);
    };
  const failRoot: Fail = failAt('(root)');

  rejectUnsupportedKeywords(schema, failRoot);
  if (schema.type !== undefined && schema.type !== 'object') {
    failRoot('top-level type must be "object"');
  }
  if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) {
    failRoot('additionalProperties would be stripped by the SDK; declare every property');
  }

  const properties = schema.properties ?? {};
  if (!isSchemaObject(properties)) {
    failRoot('properties must be an object');
  }
  const required = schema.required ?? [];
  if (!Array.isArray(required) || !required.every((entry) => typeof entry === 'string')) {
    failRoot('required must be an array of strings');
  }
  const undeclared = required.find((name) => !(name in properties));
  if (undeclared !== undefined) {
    failRoot(`required property "${undeclared}" is not declared in properties`);
  }

  const shape: Record<string, z.ZodType> = {};
  for (const [name, propertySchema] of Object.entries(properties)) {
    const field = propertyField(propertySchema, failAt(`properties.${name}`));
    shape[name] = required.includes(name) ? field : field.optional();
  }
  return shape;
}
