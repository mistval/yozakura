import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

type JsonObject = Record<string, unknown>;

type PromptTemplateChainLike = {
  templateChainId: string;
  templateChainTitle: string;
  templateChainDescription: string;
  contextSchema: {
    toJSONSchema: () => unknown;
  };
};

type TemplateGroupLike = {
  groupId: string;
  title: string;
  children: unknown[];
};

type TemplateNodePredicateModule = {
  isTemplateGroup: (node: unknown) => boolean;
  isTemplateChain: (node: unknown) => boolean;
};

type ChainDescriptor = {
  templateChainId: string;
  templateChainTitle: string;
  templateChainDescription: string;
  groupPath: string[];
  schemaFileName: string;
  htmlFileName: string;
  schema: JsonObject;
};

const DEFAULT_OUTPUT_DIR = 'generated/prompt_template_chain_context_schemas/json';

function installLocalStorageStub(): void {
  if (typeof globalThis.localStorage !== 'undefined') {
    return;
  }

  const storage = new Map<string, string>();

  const localStorageStub = {
    getItem(key: string): string | null {
      return storage.has(key) ? (storage.get(key) ?? null) : null;
    },
    setItem(key: string, value: string): void {
      storage.set(key, value);
    },
    removeItem(key: string): void {
      storage.delete(key);
    },
    clear(): void {
      storage.clear();
    },
    key(index: number): string | null {
      return Array.from(storage.keys())[index] ?? null;
    },
    get length(): number {
      return storage.size;
    },
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorageStub,
  });
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertTemplateGroup(value: unknown): asserts value is TemplateGroupLike {
  if (!isJsonObject(value)) {
    throw new Error('Expected template group to be an object.');
  }

  const { groupId, title, children } = value;
  if (typeof groupId !== 'string' || typeof title !== 'string' || !Array.isArray(children)) {
    throw new Error('Template group shape is invalid.');
  }
}

function assertPromptTemplateChain(value: unknown): asserts value is PromptTemplateChainLike {
  if (!isJsonObject(value)) {
    throw new Error('Expected template chain to be an object.');
  }

  const { templateChainId, templateChainTitle, templateChainDescription, contextSchema } = value;
  if (
    typeof templateChainId !== 'string' ||
    typeof templateChainTitle !== 'string' ||
    typeof templateChainDescription !== 'string' ||
    !isJsonObject(contextSchema) ||
    typeof contextSchema.toJSONSchema !== 'function'
  ) {
    throw new Error('Template chain shape is invalid.');
  }
}

function sanitizeFileBaseName(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!sanitized) {
    throw new Error(`Unable to derive file name from value: "${value}"`);
  }

  return sanitized.toLowerCase();
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
  }

  if (typeof normalizedSchema.description !== 'string' || normalizedSchema.description.length === 0) {
    normalizedSchema.description = templateChainDescription;
  }

  return normalizedSchema;
}

function mergePropertySchema(existing: unknown, incoming: unknown): unknown {
  if (isDeepStrictEqual(existing, incoming)) {
    return existing;
  }

  if (isJsonObject(existing) && Array.isArray(existing.allOf)) {
    if (existing.allOf.some((entry) => isDeepStrictEqual(entry, incoming))) {
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

  const mergedProperties: JsonObject = isJsonObject(collapsed.properties)
    ? { ...collapsed.properties }
    : {};
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

function collectChainsFromGroup(
  group: TemplateGroupLike,
  ancestry: string[],
  predicateModule: TemplateNodePredicateModule,
  seenFileNames: Set<string>
): ChainDescriptor[] {
  const nextAncestry = [...ancestry, group.groupId];
  const chains: ChainDescriptor[] = [];

  for (const child of group.children) {
    if (predicateModule.isTemplateGroup(child)) {
      assertTemplateGroup(child);
      chains.push(...collectChainsFromGroup(child, nextAncestry, predicateModule, seenFileNames));
      continue;
    }

    if (predicateModule.isTemplateChain(child)) {
      assertPromptTemplateChain(child);

      const schemaBaseName = sanitizeFileBaseName(child.templateChainId);
      const schemaFileName = `${schemaBaseName}.context.schema.json`;
      if (seenFileNames.has(schemaFileName)) {
        throw new Error(`Duplicate schema file name detected: ${schemaFileName}`);
      }

      seenFileNames.add(schemaFileName);

      chains.push({
        templateChainId: child.templateChainId,
        templateChainTitle: child.templateChainTitle,
        templateChainDescription: child.templateChainDescription,
        groupPath: nextAncestry,
        schemaFileName,
        htmlFileName: schemaFileName.replace(/\.json$/, '.html'),
        schema: collapseTopLevelAllOfObjectSchema(
          normalizeSchema(
            child.contextSchema.toJSONSchema(),
            child.templateChainTitle,
            child.templateChainDescription
          )
        ),
      });

      continue;
    }

    throw new Error(`Encountered unknown template node under group "${group.groupId}".`);
  }

  return chains;
}

function getOutputDirectory(projectRoot: string): string {
  const outputArg = process.argv[2];
  if (outputArg === '--help' || outputArg === '-h') {
    console.log(
      'Usage: node.exe --import tsx scripts/export-prompt-template-context-schemas.ts [output-directory]'
    );
    console.log('');
    console.log(`Default output directory: ${DEFAULT_OUTPUT_DIR}`);
    process.exit(0);
  }

  return outputArg ? path.resolve(process.cwd(), outputArg) : path.resolve(projectRoot, DEFAULT_OUTPUT_DIR);
}

async function main(): Promise<void> {
  installLocalStorageStub();

  const thisFilePath = fileURLToPath(import.meta.url);
  const scriptsDirectory = path.dirname(thisFilePath);
  const projectRoot = path.resolve(scriptsDirectory, '..');
  const outputDirectory = getOutputDirectory(projectRoot);

  const [rootGroupModule, templateGroupModule] = await Promise.all([
    import('../client/src/engine/prompt_templates/group.ts'),
    import('../client/src/engine/prompt_templates/template_group.ts'),
  ]);

  const predicateModule = templateGroupModule as Partial<TemplateNodePredicateModule>;
  if (typeof predicateModule.isTemplateChain !== 'function') {
    throw new Error('Expected template_group module to export isTemplateChain.');
  }

  if (typeof predicateModule.isTemplateGroup !== 'function') {
    throw new Error('Expected template_group module to export isTemplateGroup.');
  }

  const rootGroup = (rootGroupModule as { promptTemplatesRootGroup: unknown }).promptTemplatesRootGroup;
  assertTemplateGroup(rootGroup);

  const chains = collectChainsFromGroup(
    rootGroup,
    [],
    predicateModule as TemplateNodePredicateModule,
    new Set()
  );

  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  for (const chain of chains) {
    const schemaPath = path.join(outputDirectory, chain.schemaFileName);
    await writeFile(schemaPath, `${JSON.stringify(chain.schema, null, 2)}\n`, 'utf8');
  }

  console.log(`Wrote ${chains.length} prompt template context schemas to ${outputDirectory}`);
  for (const chain of chains) {
    console.log(`- ${chain.templateChainId} -> ${chain.schemaFileName}`);
  }
}

void main();
