import { PromptTemplateChain } from './prompt_template_chain';
import type { PromptExecutionContext } from './prompt_template_context_fields';

type AnyPromptTemplateChain = PromptTemplateChain<PromptExecutionContext, unknown>;

type TemplateNode = AnyPromptTemplateChain | TemplateGroup;

export class TemplateGroup {
  public readonly groupId: string;
  public readonly title: string;
  public readonly description: string;
  public readonly children: TemplateNode[];

  public constructor(params: {
    groupId: string;
    title: string;
    description: string;
    children: TemplateNode[];
  }) {
    this.groupId = params.groupId;
    this.title = params.title;
    this.description = params.description;
    this.children = params.children;
  }
}

export function isTemplateGroup(node: TemplateNode): node is TemplateGroup {
  return node instanceof TemplateGroup;
}

export function isTemplateChain(node: TemplateNode): node is AnyPromptTemplateChain {
  return node instanceof PromptTemplateChain;
}
