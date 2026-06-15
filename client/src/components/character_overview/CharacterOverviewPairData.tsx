import { useEffect, useMemo, useState } from 'react';
import type { Character, CharacterRelationship } from '../../engine/types.js';
import { SpoilerSection } from '../ui/SpoilerSection.js';
import { getErrorMessage } from '../../errors/error_util.js';
import ConversationSearchList from '../conversation_log/ConversationSearchList.js';
import { relationshipKey } from '../../engine/relationship.js';
import { useStateRef } from '../../hooks/useStateRef.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import { useScenarioCharacterRelationshipStore } from '../../state/scenario_character_relationship_store.js';
import { useScenarioStore } from '../../state/scenario_store.js';
import { assertNonNullish } from '../../errors/application_error.js';

type RelationshipIds = Pick<CharacterRelationship, 'fromId' | 'toId'>;

type EditableRelationshipSection = {
  title: string;
  value: string;
  saveKey: RelationshipIds;
};

type SummarySection = {
  title: string;
  fromId: string;
  toId: string;
  summaries: CharacterRelationship['rollingPairwiseSummaries'];
};

type LearnedInformationSection = {
  title: string;
  fromId: string;
  toId: string;
  learnedInformations: CharacterRelationship['rollingOffscreenLearnedInformation'];
};

type CharacterOverviewPairDataProps = {
  selectedCharacterIds: [string, string];
  onShowConversationDetail: (entryId: string) => void;
};

export default function CharacterOverviewPairData({
  selectedCharacterIds,
  onShowConversationDetail,
}: CharacterOverviewPairDataProps) {
  const scenario = useScenarioStore((state) => state.activeScenario);
  const charactersById = useScenarioCharacterStore((state) => state.scenarioCharactersById);
  const getCharacterRelationship = useScenarioCharacterRelationshipStore(
    (state) => state.getCharacterRelationship
  );
  const saveRelationshipFields = useScenarioCharacterRelationshipStore(
    (state) => state.saveRelationshipFields
  );

  const [idA, idB] = selectedCharacterIds;
  const charA = charactersById[idA];
  const charB = charactersById[idB];

  const keyAToB = relationshipKey(idA, idB);
  const keyBToA = relationshipKey(idB, idA);

  const [relationshipByKey, setRelationshipByKey] = useState<Record<string, CharacterRelationship>>({});
  const [relationshipLoadError, setRelationshipLoadError] = useState('');

  const relationshipAToB = relationshipByKey[keyAToB];
  const relationshipBToA = relationshipByKey[keyBToA];
  const familiarityBetween = Math.max(relationshipAToB?.familiarity || 0, relationshipBToA?.familiarity || 0);

  const [familiarityDraft, setFamiliarityDraft] = useState(() => Math.round(familiarityBetween));
  const [familiaritySaving, setFamiliaritySaving, familiaritySavingRef] = useStateRef(false);
  const [familiaritySaved, setFamiliaritySaved] = useState(false);
  const [familiarityError, setFamiliarityError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setRelationshipByKey({});
      setRelationshipLoadError('');
      setFamiliaritySaving(false);
      setFamiliaritySaved(false);
      setFamiliarityError('');

      try {
        const [loadedAToB, loadedBToA] = await Promise.all([
          getCharacterRelationship(idA, idB),
          getCharacterRelationship(idB, idA),
        ]);

        if (cancelled) {
          return;
        }

        setRelationshipByKey({
          [relationshipKey(loadedAToB.fromId, loadedAToB.toId)]: loadedAToB,
          [relationshipKey(loadedBToA.fromId, loadedBToA.toId)]: loadedBToA,
        });
      } catch (error) {
        if (!cancelled) {
          setRelationshipLoadError(getErrorMessage(error));
        }
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [idA, idB, getCharacterRelationship]);

  useEffect(() => {
    setFamiliarityDraft(Math.round(familiarityBetween));
  }, [idA, idB, familiarityBetween]);

  const saveRelationshipPatch = async (saveKey: RelationshipIds, update: Partial<CharacterRelationship>) => {
    const updated = await saveRelationshipFields(saveKey, update);
    const key = relationshipKey(updated.fromId, updated.toId);

    setRelationshipByKey((prev) => ({
      ...prev,
      [key]: updated,
    }));
  };

  const savePairFamiliarity = async () => {
    if (familiaritySavingRef.current) {
      return;
    }

    const parsed = Number(familiarityDraft);

    setFamiliaritySaving(true);
    setFamiliarityError('');
    try {
      await Promise.all([
        saveRelationshipPatch({ fromId: idA, toId: idB }, { familiarity: parsed }),
        saveRelationshipPatch({ fromId: idB, toId: idA }, { familiarity: parsed }),
      ]);
      setFamiliarityDraft(parsed);
      setFamiliaritySaved(true);
    } catch (error) {
      setFamiliarityError(getErrorMessage(error));
    } finally {
      setFamiliaritySaving(false);
    }
  };

  const detailSections = useMemo(() => {
    if (!charA || !charB || !scenario) {
      return {
        memories: [] as EditableRelationshipSection[],
        nextGoals: [] as EditableRelationshipSection[],
        relationshipDescriptors: [] as EditableRelationshipSection[],
        pastConversationSummarySections: [] as SummarySection[],
        offscreenLearnedInformationSections: [] as LearnedInformationSection[],
      };
    }

    const memories: EditableRelationshipSection[] = [];
    const nextGoals: EditableRelationshipSection[] = [];
    const relationshipDescriptors: EditableRelationshipSection[] = [];
    const pastConversationSummarySections: SummarySection[] = [];
    const offscreenLearnedInformationSections: LearnedInformationSection[] = [];

    const addDirectedSections = (from: Character, to: Character) => {
      if (from.id === scenario.userCharacterId) {
        return;
      }

      const relationship = relationshipByKey[relationshipKey(from.id, to.id)];
      if (!relationship) {
        return;
      }

      memories.push({
        title: `${from.firstName}'s memory of ${to.firstName}`,
        value: relationship.memory || '',
        saveKey: { fromId: from.id, toId: to.id },
      });
      nextGoals.push({
        title: `${from.firstName}'s goal in next conversation with ${to.firstName}`,
        value: relationship.nextConversationGoal || '',
        saveKey: {
          fromId: from.id,
          toId: to.id,
        },
      });
      relationshipDescriptors.push({
        title: `${from.firstName} considers ${to.firstName}`,
        value: relationship.descriptor || '',
        saveKey: { fromId: from.id, toId: to.id },
      });
      pastConversationSummarySections.push({
        title: `${from.firstName}'s past conversation summaries with ${to.firstName}`,
        fromId: from.id,
        toId: to.id,
        summaries: relationship.rollingPairwiseSummaries || [],
      });
      offscreenLearnedInformationSections.push({
        title: `${from.firstName}'s offscreen learned information about ${to.firstName}`,
        fromId: from.id,
        toId: to.id,
        learnedInformations: relationship.rollingOffscreenLearnedInformation || [],
      });
    };

    addDirectedSections(charA, charB);
    addDirectedSections(charB, charA);

    return {
      memories,
      nextGoals,
      relationshipDescriptors: relationshipDescriptors,
      pastConversationSummarySections,
      offscreenLearnedInformationSections: offscreenLearnedInformationSections,
    };
  }, [charA, charB, relationshipByKey, scenario]);

  if (!charA || !charB || !scenario) {
    return undefined;
  }

  assertNonNullish(scenario.id, 'CharacterOverviewPairData rendered without active scenario id');

  return (
    <div className="border-t pt-4 space-y-3">
      <h3 className="text-lg font-semibold">
        {charA.firstName} {charA.lastName} ↔ {charB.firstName} {charB.lastName}
      </h3>
      {relationshipLoadError && <div className="text-sm text-danger-text">{relationshipLoadError}</div>}

      <div className="space-y-2">
        <div className="border rounded-sm p-3 space-y-2">
          <div className="text-sm font-medium">Familiarity</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step={0.01}
              value={familiarityDraft}
              onChange={(event) => {
                setFamiliarityDraft(Math.round(Number(event.target.value)));
                setFamiliaritySaved(false);
                setFamiliarityError('');
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || familiaritySaving) {
                  return;
                }
                event.preventDefault();
                void savePairFamiliarity();
              }}
              className="w-32 border rounded-sm px-2 py-1 bg-inset"
            />
            <button
              type="button"
              onClick={() => {
                void savePairFamiliarity();
              }}
              disabled={familiaritySaving || !Number.isFinite(Number(familiarityDraft))}
            >
              {familiaritySaving ? 'Saving...' : 'Save'}
            </button>
            {familiaritySaved && <span className="text-sm text-success-text">Saved ✓</span>}
          </div>
          {familiarityError && <div className="text-sm text-danger-text">{familiarityError}</div>}
        </div>
        {detailSections.relationshipDescriptors.map((relationshipDescriptor) => (
          <SpoilerSection
            defaultRevealed={true}
            key={relationshipDescriptor.title}
            title={relationshipDescriptor.title}
            initialValue={relationshipDescriptor.value || ''}
            onSave={(newValue: string) =>
              saveRelationshipPatch(relationshipDescriptor.saveKey, { descriptor: newValue })
            }
          >
            {relationshipDescriptor.value || '(no tag yet)'}
          </SpoilerSection>
        ))}
        {detailSections.memories.map((memory) => (
          <SpoilerSection
            key={memory.title}
            title={memory.title}
            initialValue={memory.value || ''}
            onSave={(newValue: string) => saveRelationshipPatch(memory.saveKey, { memory: newValue })}
          >
            {memory.value || '(no memory yet)'}
          </SpoilerSection>
        ))}
        {detailSections.nextGoals.map((reason) => (
          <SpoilerSection
            key={reason.title}
            title={reason.title}
            initialValue={reason.value || ''}
            onSave={(newValue: string) =>
              saveRelationshipPatch(reason.saveKey, { nextConversationGoal: newValue })
            }
          >
            {reason.value || '(no reason yet)'}
          </SpoilerSection>
        ))}
        <SpoilerSection title="Past conversation summaries">
          {detailSections.pastConversationSummarySections.length === 0 ? (
            <div className="text-sm text-muted">No past conversation summaries yet.</div>
          ) : (
            <div className="space-y-3">
              {detailSections.pastConversationSummarySections.map((section) => (
                <div key={`${section.fromId}-${section.toId}`} className="space-y-2">
                  <div className="text-sm font-medium text-secondary-strong">{section.title}</div>
                  {section.summaries.length === 0 ? (
                    <div className="text-sm text-muted">No summaries yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {section.summaries.map((summary, index) => (
                        <SpoilerSection
                          key={`${section.fromId}-${section.toId}-${summary.conversationId}-${index}`}
                          title={`Summary ${index + 1} (Turn ${summary.turnNumber})`}
                          initialValue={summary.summary || ''}
                          onSave={(newValue: string) => {
                            const updatedSummaries = section.summaries.map((entry, entryIndex) =>
                              entryIndex === index
                                ? {
                                    ...entry,
                                    summary: newValue,
                                  }
                                : entry
                            );

                            return saveRelationshipPatch(
                              {
                                fromId: section.fromId,
                                toId: section.toId,
                              },
                              {
                                rollingPairwiseSummaries: updatedSummaries,
                              }
                            );
                          }}
                          onDelete={() => {
                            const updatedSummaries = section.summaries.filter(
                              (_, entryIndex) => entryIndex !== index
                            );

                            return saveRelationshipPatch(
                              {
                                fromId: section.fromId,
                                toId: section.toId,
                              },
                              {
                                rollingPairwiseSummaries: updatedSummaries,
                              }
                            );
                          }}
                        >
                          {summary.summary || '(none)'}
                        </SpoilerSection>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SpoilerSection>
        <SpoilerSection title="Offscreen learned information">
          {detailSections.offscreenLearnedInformationSections.length === 0 ? (
            <div className="text-sm text-muted">No offscreen learned information yet.</div>
          ) : (
            <div className="space-y-3">
              {detailSections.offscreenLearnedInformationSections.map((section) => (
                <div key={`${section.fromId}-${section.toId}`} className="space-y-2">
                  <div className="text-sm font-medium text-secondary-strong">{section.title}</div>
                  {section.learnedInformations.length === 0 ? (
                    <div className="text-sm text-muted">No learned information yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {section.learnedInformations.map((learnedInformation, index) => (
                        <SpoilerSection
                          key={learnedInformation.createdAt.toString() + index}
                          title={`Information ${index + 1} (Turn ${learnedInformation.turnNumber})`}
                          initialValue={learnedInformation.information || ''}
                          onSave={(newValue: string) => {
                            const updatedInformations = section.learnedInformations.map(
                              (entry, entryIndex) =>
                                entryIndex === index
                                  ? {
                                      ...entry,
                                      information: newValue,
                                    }
                                  : entry
                            );

                            return saveRelationshipPatch(
                              {
                                fromId: section.fromId,
                                toId: section.toId,
                              },
                              {
                                rollingOffscreenLearnedInformation: updatedInformations,
                              }
                            );
                          }}
                          onDelete={() => {
                            const updatedInformations = section.learnedInformations.filter(
                              (_, entryIndex) => entryIndex !== index
                            );

                            return saveRelationshipPatch(
                              {
                                fromId: section.fromId,
                                toId: section.toId,
                              },
                              {
                                rollingOffscreenLearnedInformation: updatedInformations,
                              }
                            );
                          }}
                        >
                          {learnedInformation.information || '(none)'}
                        </SpoilerSection>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SpoilerSection>
      </div>

      <ConversationSearchList
        open={true}
        scenarioId={scenario.id}
        participantIds={[charA.id, charB.id]}
        onSelectConversation={onShowConversationDetail}
      />
    </div>
  );
}
