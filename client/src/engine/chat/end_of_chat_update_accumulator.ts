import { useScenarioCharacterRelationshipStore } from '../../state/scenario_character_relationship_store';
import { useScenarioCharacterStore } from '../../state/scenario_character_store';
import type { ContextResolvers } from '../prompt_templates/prompt_template_context_fields';
import { relationshipKey } from '../relationship';
import type {
  Character,
  CharacterRelationship,
  ConversationSummary,
  OffscreenLearnedInformation,
} from '../types';
import { trimNewestByCreatedAt } from '../../util/array';

type RelationshipSaveKey = Pick<CharacterRelationship, 'fromId' | 'toId'>;

export class EndOfChatUpdateAccumulator {
  private readonly characterFieldsById = new Map<string, Partial<Character>>();
  private readonly relationshipUpdates = new Map<
    string,
    { saveKey: RelationshipSaveKey; fields: Partial<CharacterRelationship> }
  >();

  resolvedCharacter(characterId: string): Character {
    const base = useScenarioCharacterStore.getState().getRequiredCharacterById(characterId);
    return { ...base, ...this.characterFieldsById.get(characterId) };
  }

  async resolvedRelationship(fromId: string, toId: string): Promise<CharacterRelationship> {
    const fresh = await useScenarioCharacterRelationshipStore
      .getState()
      .getCharacterRelationship(fromId, toId);
    const staged = this.relationshipUpdates.get(relationshipKey(fromId, toId))?.fields;
    return { ...fresh, ...staged };
  }

  readonly resolvers: ContextResolvers = {
    getCharacter: (id) => this.resolvedCharacter(id),
    getRelationship: (fromId, toId) => this.resolvedRelationship(fromId, toId),
  };

  stageCharacterFields(characterId: string, fields: Partial<Character>) {
    this.characterFieldsById.set(characterId, { ...this.characterFieldsById.get(characterId), ...fields });
  }

  stageConversationSummary(characterId: string, summary: ConversationSummary) {
    this.stageCharacterFields(characterId, {
      rollingConversationSummaries: trimNewestByCreatedAt(
        this.resolvedCharacter(characterId).rollingConversationSummaries.concat(summary)
      ),
    });
  }

  stageRelationshipFields(fromId: string, toId: string, fields: Partial<CharacterRelationship>) {
    const key = relationshipKey(fromId, toId);
    const existing = this.relationshipUpdates.get(key);
    this.relationshipUpdates.set(key, {
      saveKey: { fromId, toId },
      fields: { ...existing?.fields, ...fields },
    });
  }

  async stagePairwiseConversationSummary(fromId: string, toId: string, summary: ConversationSummary) {
    const base = await this.resolvedRelationship(fromId, toId);
    this.stageRelationshipFields(fromId, toId, {
      rollingPairwiseSummaries: trimNewestByCreatedAt(base.rollingPairwiseSummaries.concat(summary)),
    });
  }

  async stagePairwiseLearnedInformation(
    fromId: string,
    toId: string,
    information: OffscreenLearnedInformation
  ) {
    const base = await this.resolvedRelationship(fromId, toId);
    this.stageRelationshipFields(fromId, toId, {
      rollingOffscreenLearnedInformation: trimNewestByCreatedAt(
        base.rollingOffscreenLearnedInformation.concat(information)
      ),
    });
  }

  async commit() {
    for (const [characterId, fields] of this.characterFieldsById.entries()) {
      if (Object.keys(fields).length > 0) {
        useScenarioCharacterStore.getState().saveScenarioCharacterFields(characterId, fields);
      }
    }

    await Promise.all(
      this.relationshipUpdates
        .values()
        .map(({ saveKey, fields }) =>
          useScenarioCharacterRelationshipStore.getState().saveRelationshipFields(saveKey, fields)
        )
    );
  }
}
