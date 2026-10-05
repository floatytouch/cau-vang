import { z } from 'zod/v4';

export function jsonSchemaToZodShape(schema: Readonly<Record<string, unknown>>): z.ZodRawShape {
  const properties = schema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    return {};
  }

  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((entry): entry is string => typeof entry === 'string')
      : [],
  );

  const shape: z.ZodRawShape = {};
  for (const [key, propertySchema] of Object.entries(properties as Record<string, unknown>)) {
    let field: z.ZodType = z.unknown();
    if (propertySchema && typeof propertySchema === 'object' && !Array.isArray(propertySchema)) {
      const typeName = (propertySchema as { type?: unknown }).type;
      if (typeName === 'string') {
        field = z.string();
      } else if (typeName === 'number' || typeName === 'integer') {
        field = z.number();
      } else if (typeName === 'boolean') {
        field = z.boolean();
      } else if (typeName === 'array') {
        field = z.array(z.unknown());
      } else if (typeName === 'object') {
        field = z.record(z.string(), z.unknown());
      }
    }
    shape[key] = required.has(key) ? field : field.optional();
  }

  return shape;
}
