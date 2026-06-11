import _ from 'lodash';
import type { toJSONSchema } from 'zod';

type JsonObject = Record<string, unknown>;

const STRIP_PROPERTIES = new Set(['createdAt', 'updatedAt']);

// Subtrees with a canonical form shorter than this aren't worth hoisting into $defs.
const MIN_DEF_CANONICAL_LENGTH = 100;

// Keywords whose values are themselves schemas, in the three shapes they come in.
// Only these positions are traversed/rewritten, so non-schema objects (a `properties`
// map, an `examples` entry, etc.) are never hoisted or replaced with a $ref.
const SCHEMA_MAP_KEYWORDS: readonly string[] = ['properties', 'patternProperties', '$defs', 'definitions'];
const SCHEMA_LIST_KEYWORDS: readonly string[] = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const SCHEMA_CHILD_KEYWORDS: readonly string[] = [
  'items',
  'additionalProperties',
  'propertyNames',
  'not',
  'if',
  'then',
  'else',
  'contains',
];

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function singularize(name: string): string {
  if (name.endsWith('ies')) {
    return `${name.slice(0, -3)}y`;
  }

  return name.length > 1 && name.endsWith('s') && !name.endsWith('ss') ? name.slice(0, -1) : name;
}

function normalizeSchema(
  schema: unknown,
  templateChainTitle: string,
  templateChainDescription: string
): JsonObject {
  if (!isJsonObject(schema)) {
    throw new Error(`Expected context schema JSON to be an object for chain "${templateChainTitle}".`);
  }

  const normalizedSchema = { ...schema };
  if (typeof normalizedSchema.$schema !== 'string' || normalizedSchema.$schema.length === 0) {
    normalizedSchema.$schema = 'https://json-schema.org/draft/2020-12/schema';
  }

  if (typeof normalizedSchema.title !== 'string' || normalizedSchema.title.length === 0) {
    normalizedSchema.title = `${templateChainTitle} Context`;
    console.log('ADDED TITLE');
  }

  if (typeof normalizedSchema.description !== 'string' || normalizedSchema.description.length === 0) {
    normalizedSchema.description = templateChainDescription;
  }

  return normalizedSchema;
}

function toPascalCase(value: string): string {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  if (words.length === 0) {
    return 'Def';
  }

  return words.map((word) => word[0]!.toUpperCase() + word.slice(1)).join('');
}

function isRefTo(value: unknown, refPath: string): value is JsonObject {
  return isJsonObject(value) && value.$ref === refPath && Object.keys(value).length === 1;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }

  if (isJsonObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

// Only composite schemas are worth naming in $defs; hoisting description-heavy string
// leaves would shrink the files further but clutters rendered docs with trivial defs.
function isDefWorthySchema(node: JsonObject): boolean {
  return (
    node.type === 'object' ||
    node.type === 'array' ||
    isJsonObject(node.properties) ||
    isJsonObject(node.items)
  );
}

function stripProperties(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripProperties);
  }

  if (!isJsonObject(node)) {
    return node;
  }

  const result: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === 'properties' && isJsonObject(value)) {
      const stripped: JsonObject = {};
      for (const [propName, propSchema] of Object.entries(value)) {
        if (!STRIP_PROPERTIES.has(propName)) {
          stripped[propName] = stripProperties(propSchema);
        }
      }
      result[key] = stripped;
    } else if (key === 'required' && Array.isArray(value)) {
      const filtered = value.filter((k) => !STRIP_PROPERTIES.has(k as string));
      if (filtered.length > 0) {
        result[key] = filtered;
      }
    } else {
      result[key] = stripProperties(value);
    }
  }

  return result;
}

function mergePropertySchema(existing: unknown, incoming: unknown): unknown {
  if (_.isEqual(existing, incoming)) {
    return existing;
  }

  if (isJsonObject(existing) && Array.isArray(existing.allOf)) {
    if (existing.allOf.some((entry) => _.isEqual(entry, incoming))) {
      return existing;
    }

    return {
      ...existing,
      allOf: [...existing.allOf, incoming],
    };
  }

  return {
    allOf: [existing, incoming],
  };
}

function isMergeableObjectFragment(value: unknown): value is JsonObject {
  return (
    isJsonObject(value) &&
    (value.type === undefined || value.type === 'object') &&
    (value.properties === undefined || isJsonObject(value.properties)) &&
    (value.required === undefined ||
      (Array.isArray(value.required) &&
        value.required.every((requiredKey) => typeof requiredKey === 'string')))
  );
}

/**
 * Recursively flattens `allOf` chains into a single object schema. Wherever a node
 * is an `allOf` made up entirely of object fragments, the fragments' `properties` and
 * `required` are merged into one object and the `allOf` (and the wrapper's description /
 * additionalProperties) is discarded. Runs bottom-up, so an arbitrarily deep chain of
 * nested `allOf` wrappers collapses into a single merged object.
 *
 * Nodes that aren't a mergeable `allOf` are returned unchanged (but still recursed into,
 * so property values are reconstructed without mutating the input).
 */
function collapseAllOfDeep(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((entry) => collapseAllOfDeep(entry));
  }

  if (!isJsonObject(node)) {
    return node;
  }

  const collapsed: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    collapsed[key] = collapseAllOfDeep(value);
  }

  const allOf = collapsed.allOf;
  if (!Array.isArray(allOf) || allOf.length === 0 || !allOf.every(isMergeableObjectFragment)) {
    return collapsed;
  }

  const mergedProperties: JsonObject = isJsonObject(collapsed.properties) ? { ...collapsed.properties } : {};
  const mergedRequired = new Set<string>(
    Array.isArray(collapsed.required)
      ? collapsed.required.filter((key): key is string => typeof key === 'string')
      : []
  );

  for (const fragment of allOf) {
    if (isJsonObject(fragment.properties)) {
      for (const [propertyName, propertySchema] of Object.entries(fragment.properties)) {
        mergedProperties[propertyName] =
          propertyName in mergedProperties
            ? mergePropertySchema(mergedProperties[propertyName], propertySchema)
            : propertySchema;
      }
    }

    if (Array.isArray(fragment.required)) {
      for (const requiredKey of fragment.required) {
        if (typeof requiredKey === 'string') {
          mergedRequired.add(requiredKey);
        }
      }
    }
  }

  const merged: JsonObject = { type: 'object' };
  if (Object.keys(mergedProperties).length > 0) {
    merged.properties = mergedProperties;
  }
  if (mergedRequired.size > 0) {
    merged.required = Array.from(mergedRequired);
  }

  return merged;
}

function collapseTopLevelAllOfObjectSchema(schema: JsonObject): JsonObject {
  if (!Array.isArray(schema.allOf)) {
    return schema;
  }

  const collapsed = collapseAllOfDeep(schema);
  if (!isJsonObject(collapsed) || collapsed.type !== 'object') {
    // The chain wasn't a mergeable object schema; leave it untouched.
    return schema;
  }

  // The merge intentionally drops everything but type/properties/required, so re-attach
  // the top-level metadata and present the keys in a readable order.
  const result: JsonObject = {};
  for (const key of ['$schema', 'title', 'description'] as const) {
    if (schema[key] !== undefined) {
      result[key] = schema[key];
    }
  }
  result.type = 'object';

  const properties = isJsonObject(collapsed.properties) ? { ...collapsed.properties } : {};
  delete properties.settings;
  if (Object.keys(properties).length > 0) {
    result.properties = properties;
  }

  if (Array.isArray(collapsed.required)) {
    const required = collapsed.required.filter(
      (key): key is string => typeof key === 'string' && key !== 'settings'
    );
    if (required.length > 0) {
      result.required = required;
    }
  }

  return result;
}

/**
 * Finds schema subtrees that occur more than once (compared by canonical JSON),
 * hoists them into `$defs`, and replaces every occurrence with a `$ref`. Def names
 * are derived from the first property key each subtree was seen under.
 */
function extractSharedDefs(schema: JsonObject): JsonObject {
  type Occurrence = { count: number; hint: string | undefined };
  const occurrences = new Map<string, Occurrence>();

  function countNode(node: unknown, hint: string | undefined, isRoot: boolean): void {
    if (!isJsonObject(node)) {
      return;
    }

    if (!isRoot && isDefWorthySchema(node)) {
      const key = canonicalJson(node);
      if (key.length >= MIN_DEF_CANONICAL_LENGTH) {
        const existing = occurrences.get(key);
        if (existing) {
          existing.count += 1;
          existing.hint ??= hint;
        } else {
          occurrences.set(key, { count: 1, hint });
        }
      }
    }

    for (const keyword of SCHEMA_MAP_KEYWORDS) {
      const map = node[keyword];
      if (isJsonObject(map)) {
        for (const [propertyName, child] of Object.entries(map)) {
          countNode(child, toPascalCase(propertyName), false);
        }
      }
    }

    for (const keyword of SCHEMA_LIST_KEYWORDS) {
      const list = node[keyword];
      if (Array.isArray(list)) {
        for (const child of list) {
          countNode(child, hint, false);
        }
      }
    }

    for (const keyword of SCHEMA_CHILD_KEYWORDS) {
      const child = node[keyword];
      if (isJsonObject(child)) {
        countNode(child, keyword === 'items' && hint !== undefined ? singularize(hint) : hint, false);
      }
    }
  }

  countNode(schema, undefined, true);

  const defNames = new Map<string, string>();
  const usedNames = new Set<string>(isJsonObject(schema.$defs) ? Object.keys(schema.$defs) : []);
  for (const [key, occurrence] of occurrences) {
    if (occurrence.count < 2) {
      continue;
    }

    const base = occurrence.hint ?? 'Def';
    let name = base;
    let suffix = 2;
    while (usedNames.has(name)) {
      name = `${base}${suffix}`;
      suffix += 1;
    }

    usedNames.add(name);
    defNames.set(key, name);
  }

  if (defNames.size === 0) {
    return schema;
  }

  const defs: JsonObject = {};

  function rewriteChildren(node: JsonObject): JsonObject {
    const result: JsonObject = {};
    for (const [key, value] of Object.entries(node)) {
      if (SCHEMA_MAP_KEYWORDS.includes(key) && isJsonObject(value)) {
        const rewrittenMap: JsonObject = {};
        for (const [propertyName, child] of Object.entries(value)) {
          rewrittenMap[propertyName] = rewriteNode(child);
        }
        result[key] = rewrittenMap;
      } else if (SCHEMA_LIST_KEYWORDS.includes(key) && Array.isArray(value)) {
        result[key] = value.map(rewriteNode);
      } else if (SCHEMA_CHILD_KEYWORDS.includes(key) && isJsonObject(value)) {
        result[key] = rewriteNode(value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  function rewriteNode(node: unknown): unknown {
    if (!isJsonObject(node)) {
      return node;
    }

    const name = defNames.get(canonicalJson(node));
    if (name === undefined) {
      return rewriteChildren(node);
    }

    if (!Object.hasOwn(defs, name)) {
      defs[name] = rewriteChildren(node);
    }

    return { $ref: `#/$defs/${name}` };
  }

  const rewrittenRoot = rewriteChildren(schema);

  // Duplicates nested inside a larger hoisted subtree can end up referenced only once
  // (from inside that def's body). Inline those back to avoid pointless indirection.
  function countRefs(node: unknown, counts: Map<string, number>): void {
    if (Array.isArray(node)) {
      for (const child of node) {
        countRefs(child, counts);
      }
      return;
    }

    if (!isJsonObject(node)) {
      return;
    }

    if (typeof node.$ref === 'string') {
      const match = node.$ref.match(/^#\/\$defs\/(.+)$/);
      if (match) {
        counts.set(match[1]!, (counts.get(match[1]!) ?? 0) + 1);
      }
    }

    for (const child of Object.values(node)) {
      countRefs(child, counts);
    }
  }

  function inlineSingleRef(node: unknown, refPath: string, body: JsonObject): boolean {
    if (Array.isArray(node)) {
      for (let index = 0; index < node.length; index += 1) {
        if (isRefTo(node[index], refPath)) {
          node[index] = body;
          return true;
        }
        if (inlineSingleRef(node[index], refPath, body)) {
          return true;
        }
      }
      return false;
    }

    if (!isJsonObject(node)) {
      return false;
    }

    for (const [key, value] of Object.entries(node)) {
      if (isRefTo(value, refPath)) {
        node[key] = body;
        return true;
      }
      if (inlineSingleRef(value, refPath, body)) {
        return true;
      }
    }

    return false;
  }

  let changed = true;
  while (changed) {
    changed = false;
    const counts = new Map<string, number>();
    countRefs(rewrittenRoot, counts);
    countRefs(defs, counts);

    for (const name of Object.keys(defs)) {
      if ((counts.get(name) ?? 0) > 1) {
        continue;
      }

      const body = defs[name] as JsonObject;
      delete defs[name];
      inlineSingleRef(rewrittenRoot, `#/$defs/${name}`, body) ||
        inlineSingleRef(defs, `#/$defs/${name}`, body);
      changed = true;
    }
  }

  if (Object.keys(defs).length > 0) {
    rewrittenRoot.$defs = defs;
  }

  return rewrittenRoot;
}

export function getUsabilityProcessedJSONSchema(
  schema: ReturnType<typeof toJSONSchema>,
  promptChainTitle: string,
  promptChainDescription: string
): JsonObject {
  console.log(promptChainTitle);
  return extractSharedDefs(
    stripProperties(
      collapseTopLevelAllOfObjectSchema(normalizeSchema(schema, promptChainTitle, promptChainDescription))
    ) as any
  );
}
