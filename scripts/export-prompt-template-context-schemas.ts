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

function collapseTopLevelAllOfObjectSchema(schema: JsonObject): JsonObject {
  const allOf = schema.allOf;
  if (!Array.isArray(allOf) || allOf.length === 0) {
    return schema;
  }

  if (
    !allOf.every(
      (entry) =>
        isJsonObject(entry) &&
        (entry.type === undefined || entry.type === 'object') &&
        (entry.properties === undefined || isJsonObject(entry.properties)) &&
        (entry.required === undefined ||
          (Array.isArray(entry.required) &&
            entry.required.every((requiredKey) => typeof requiredKey === 'string')))
    )
  ) {
    return schema;
  }

  const collapsedSchema: JsonObject = { ...schema };
  delete collapsedSchema.allOf;
  collapsedSchema.type = 'object';

  const mergedProperties: JsonObject = isJsonObject(collapsedSchema.properties)
    ? { ...collapsedSchema.properties }
    : {};
  const mergedRequired = new Set<string>(
    Array.isArray(collapsedSchema.required)
      ? collapsedSchema.required.filter(
          (requiredKey): requiredKey is string => typeof requiredKey === 'string'
        )
      : []
  );

  let mergedAdditionalProperties: unknown = collapsedSchema.additionalProperties;
  let hasAdditionalProperties = Object.hasOwn(collapsedSchema, 'additionalProperties');

  for (const entry of allOf) {
    const fragment = entry as JsonObject;

    if (isJsonObject(fragment.properties)) {
      for (const [propertyName, propertySchema] of Object.entries(fragment.properties)) {
        const existingPropertySchema = mergedProperties[propertyName];
        if (existingPropertySchema === undefined) {
          mergedProperties[propertyName] = propertySchema;
          continue;
        }

        mergedProperties[propertyName] = mergePropertySchema(existingPropertySchema, propertySchema);
      }
    }

    if (Array.isArray(fragment.required)) {
      for (const requiredKey of fragment.required) {
        if (typeof requiredKey === 'string') {
          mergedRequired.add(requiredKey);
        }
      }
    }

    if (Object.hasOwn(fragment, 'additionalProperties')) {
      if (!hasAdditionalProperties) {
        mergedAdditionalProperties = fragment.additionalProperties;
        hasAdditionalProperties = true;
      } else if (!isDeepStrictEqual(mergedAdditionalProperties, fragment.additionalProperties)) {
        mergedAdditionalProperties =
          mergedAdditionalProperties === false || fragment.additionalProperties === false
            ? false
            : mergedAdditionalProperties;
      }
    }
  }

  if (Object.keys(mergedProperties).length > 0) {
    collapsedSchema.properties = mergedProperties;
  } else {
    delete collapsedSchema.properties;
  }

  if (mergedRequired.size > 0) {
    collapsedSchema.required = Array.from(mergedRequired).sort();
  } else {
    delete collapsedSchema.required;
  }

  if (hasAdditionalProperties) {
    collapsedSchema.additionalProperties = mergedAdditionalProperties;
  } else {
    delete collapsedSchema.additionalProperties;
  }

  delete (collapsedSchema as any).properties['settings'];
  collapsedSchema.required = (collapsedSchema.required as string[] | undefined)?.filter(
    (key) => key !== 'settings'
  );

  return collapsedSchema;
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
