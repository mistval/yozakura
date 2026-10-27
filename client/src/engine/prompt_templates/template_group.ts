import { assert } from '../../errors/application_error';
import type { SettingsBridge } from '../settings/settings_bridge';
import { PromptTemplateChain } from './prompt_template_chain';
import type { PromptExecutionContext } from './prompt_template_context_fields';
import type { TemplateGroupSettingsData } from './template_types';

export type AnyPromptTemplateChain = PromptTemplateChain<PromptExecutionContext, unknown>;

export type ChainInstantiator<TChain extends AnyPromptTemplateChain = AnyPromptTemplateChain> = (params: {
  chainId?: string;
  groupSettingsBridge: SettingsBridge<TemplateGroupSettingsData>;
}) => TChain;

export type TemplateNode = AnyPromptTemplateChain | TemplateGroup;

export class TemplateGroup<TChain extends AnyPromptTemplateChain = AnyPromptTemplateChain> {
  public readonly groupId: string;
  public readonly title: string;
  public readonly description: string;
  public readonly childGroups: TemplateGroup[];
  public readonly settingsBridge: SettingsBridge<TemplateGroupSettingsData>;
  private readonly initialChains: TChain[];
  private readonly chainsById: Map<string, TChain>;
  private readonly chainInstantiator: ChainInstantiator<TChain> | undefined;

  public constructor(params: {
    groupId: string;
    title: string;
    description: string;
    settingsBridge: SettingsBridge<TemplateGroupSettingsData>;
    childGroups?: TemplateGroup[];
    chains?: TChain[];
    chainInstantiator?: ChainInstantiator<TChain>;
  }) {
    this.groupId = params.groupId;
    this.title = params.title;
    this.description = params.description;
    this.settingsBridge = params.settingsBridge;
    this.childGroups = params.childGroups ?? [];
    this.initialChains = params.chains ?? [];
    this.chainInstantiator = params.chainInstantiator;
    this.chainsById = new Map<string, TChain>();

    for (const chain of this.initialChains) {
      this.chainsById.set(chain.templateChainId, chain);
    }
  }

  public getDefaultData(): TemplateGroupSettingsData {
    return {
      templateChains: Object.fromEntries(
        this.initialChains.map((chain) => [chain.templateChainId, chain.defaultData])
      ),
    };
  }

  public get children(): (TemplateGroup | TChain)[] {
    return [...this.childGroups, ...this.getChains()];
  }

  private resolveChainsFromData(groupData: TemplateGroupSettingsData): TChain[] {
    const chainIds = Object.keys(groupData.templateChains ?? {});
    const chains: TChain[] = [];

    for (const chainId of chainIds) {
      let chain = this.chainsById.get(chainId);
      if (!chain && this.chainInstantiator) {
        chain = this.chainInstantiator({
          chainId,
          groupSettingsBridge: this.settingsBridge,
        });
        this.chainsById.set(chainId, chain);
      }
      if (chain) {
        chains.push(chain);
      }
    }

    return chains;
  }

  public getChains(): TChain[] {
    return this.resolveChainsFromData(this.settingsBridge.get());
  }

  public useChains(): TChain[] {
    const groupData = this.settingsBridge.use();
    return this.resolveChainsFromData(groupData);
  }

  public canModifyChains(): boolean {
    return Boolean(this.chainInstantiator);
  }

  public addChain(): TChain {
    assert(
      this.chainInstantiator,
      `Cannot add template chain to group "${this.groupId}": no chain instantiator provided.`
    );

    const chain = this.chainInstantiator({
      groupSettingsBridge: this.settingsBridge,
    });
    this.chainsById.set(chain.templateChainId, chain);
    this.settingsBridge.set({
      templateChains: {
        [chain.templateChainId]: chain.defaultData,
      },
    });

    return chain;
  }

  public deleteChain(chainId: string): void {
    assert(
      this.chainInstantiator,
      `Cannot delete template chain from group "${this.groupId}": no chain instantiator provided.`
    );

    const currentChains = this.settingsBridge.get().templateChains ?? {};
    assert(
      chainId in currentChains,
      `Cannot delete template chain "${chainId}": chain not found in group "${this.groupId}".`
    );

    assert(
      Object.keys(currentChains).length > 1,
      `Cannot delete template chain "${chainId}": group "${this.groupId}" must retain at least one chain.`
    );

    const isInitial = this.initialChains.some((c) => c.templateChainId === chainId);
    if (!isInitial) {
      this.chainsById.delete(chainId);
    }

    this.settingsBridge.set({
      templateChains: {
        [chainId]: null,
      },
    });
  }
}

export function isTemplateGroup(node: TemplateNode): node is TemplateGroup {
  return node instanceof TemplateGroup;
}

export function isTemplateChain(node: TemplateNode): node is AnyPromptTemplateChain {
  return node instanceof PromptTemplateChain;
}
