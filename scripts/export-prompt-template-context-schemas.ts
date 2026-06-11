import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

type GroupPathEntry = {
  id: string;
  title: string;
};

type ChainDescriptor = {
  templateChainId: string;
  templateChainTitle: string;
  templateChainDescription: string;
  groupPath: GroupPathEntry[];
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

async function collectChainsFromGroup(
  group: TemplateGroupLike,
  ancestry: GroupPathEntry[],
  predicateModule: TemplateNodePredicateModule,
  seenFileNames: Set<string>
): ChainDescriptor[] {
  const nextAncestry = [...ancestry, { id: group.groupId, title: group.title }];
  const chains: ChainDescriptor[] = [];

  for (const child of group.children) {
    if (predicateModule.isTemplateGroup(child)) {
      assertTemplateGroup(child);
      chains.push(...(await collectChainsFromGroup(child, nextAncestry, predicateModule, seenFileNames)));
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

      const documentationHelper =
        await import('../client/src/engine/prompt_templates/prompt_chain_documentation_helper.ts');

      chains.push({
        templateChainId: child.templateChainId,
        templateChainTitle: child.templateChainTitle,
        templateChainDescription: child.templateChainDescription,
        groupPath: nextAncestry,
        schemaFileName,
        htmlFileName: schemaFileName.replace(/\.json$/, '.html'),
        schema: documentationHelper.getUsabilityProcessedJSONSchema(
          child.contextSchema.toJSONSchema() as any,
          child.templateChainTitle,
          child.templateChainDescription
        ) as JsonObject,
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

  const chains = await collectChainsFromGroup(
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

  const manifest = chains.map(
    ({ templateChainId, templateChainTitle, templateChainDescription, groupPath, htmlFileName }) => ({
      templateChainId,
      templateChainTitle,
      templateChainDescription,
      groupPath,
      htmlFileName,
    })
  );
  await writeFile(
    path.join(outputDirectory, 'chains.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  console.log(`Wrote ${chains.length} prompt template context schemas to ${outputDirectory}`);
  for (const chain of chains) {
    console.log(`- ${chain.templateChainId} -> ${chain.schemaFileName}`);
  }
}

void main();
