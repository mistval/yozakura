import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type GroupPathEntry = { id: string; title: string };

type ChainManifestEntry = {
  templateChainId: string;
  templateChainTitle: string;
  groupPath: GroupPathEntry[];
  htmlFileName: string;
};

const SECTION_HEADING = '## Prompt Template Chain Context Docs';
const HTML_BASE_PATH = 'pathname:///prompt_docs/template_chain_context_schemas';

function generateSection(chains: ChainManifestEntry[]): string {
  const groupOrder: string[] = [];
  const groups = new Map<string, ChainManifestEntry[]>();

  for (const chain of chains) {
    const groupTitle = chain.groupPath[1]?.title ?? chain.groupPath[0]?.title ?? 'Other';
    if (!groups.has(groupTitle)) {
      groupOrder.push(groupTitle);
      groups.set(groupTitle, []);
    }
    groups.get(groupTitle)!.push(chain);
  }

  const lines: string[] = [SECTION_HEADING, ''];

  lines.push(
    'If you want to get your hands dirty, you can find the documentation for the context object of each prompt group below.',
    ''
  );

  for (const groupTitle of groupOrder) {
    const groupChains = groups.get(groupTitle)!;
    lines.push(`### ${groupTitle}`, '');
    groupChains.forEach((chain, index) => {
      const linkText = `${chain.templateChainTitle} (\`${chain.templateChainId}\`)`;
      lines.push(`${index + 1}. [${linkText}](${HTML_BASE_PATH}/${chain.htmlFileName})`);
    });
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function replaceSection(content: string, newSection: string): string {
  const sectionStart = content.indexOf(`\n${SECTION_HEADING}`);

  if (sectionStart === -1) {
    return `${content.trimEnd()}\n\n${newSection}\n`;
  }

  const headingLineEnd = content.indexOf('\n', sectionStart + 1) + 1;
  const nextSectionStart = content.indexOf('\n## ', headingLineEnd);

  if (nextSectionStart === -1) {
    return `${content.slice(0, sectionStart + 1)}${newSection}\n`;
  }

  return `${content.slice(0, sectionStart + 1)}${newSection}\n${content.slice(nextSectionStart)}`;
}

async function main(): Promise<void> {
  const thisFilePath = fileURLToPath(import.meta.url);
  const scriptsDirectory = path.dirname(thisFilePath);
  const projectRoot = path.resolve(scriptsDirectory, '..');

  const schemaDir = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.resolve(projectRoot, 'generated/prompt_template_chain_context_schemas/json');

  const manifestPath = path.join(schemaDir, 'chains.json');
  const docsPath = path.resolve(projectRoot, 'docs/docs/template-system.md');

  const chains: ChainManifestEntry[] = JSON.parse(await readFile(manifestPath, 'utf8'));
  const docsContent = await readFile(docsPath, 'utf8');

  const newSection = generateSection(chains);
  const updatedContent = replaceSection(docsContent, newSection);

  await writeFile(docsPath, updatedContent, 'utf8');
  console.log(`Updated "${SECTION_HEADING}" in ${docsPath}`);
}

void main();
