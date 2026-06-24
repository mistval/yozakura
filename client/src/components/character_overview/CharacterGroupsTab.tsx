import { useMemo, useState } from 'react';
import { StringParam, useQueryParam } from 'use-query-params';
import type { Character } from '../../engine/types.js';
import { useCharacterGroupStore } from '../../state/character_group_store.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import DeleteButton from '../ui/DeleteButton.js';
import Tabs from '../ui/Tabs.js';
import ScheduleEditor from './ScheduleEditor.js';

export default function CharacterGroupsTab() {
  const groups = useCharacterGroupStore((state) => state.groups);
  const characters = useScenarioCharacterStore((state) => state.scenarioCharacters);

  const [selectedGroupId, setSelectedGroupId] = useQueryParam('cogroup', StringParam);
  const [subTab, setSubTab] = useState<'members' | 'schedule'>('members');

  const selectedGroup = groups.find((group) => group.id === selectedGroupId);

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroupId(selectedGroupId === groupId ? undefined : groupId);
  };

  const orderedCharacters = useMemo(() => {
    return [...characters].sort((a, b) => {
      const aIn = selectedGroup && a.groupIds.includes(selectedGroup.id) ? 0 : 1;
      const bIn = selectedGroup && b.groupIds.includes(selectedGroup.id) ? 0 : 1;
      return aIn - bIn || `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });
  }, [characters, selectedGroup]);

  const toggleMembership = (character: Character) => {
    if (!selectedGroup) {
      return;
    }
    const next = character.groupIds.includes(selectedGroup.id)
      ? character.groupIds.filter((id) => id !== selectedGroup.id)
      : character.groupIds.concat(selectedGroup.id);
    useCharacterGroupStore.getState().setCharacterGroups(character.id, next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className={group.id === selectedGroupId ? 'button-emphasized' : ''}
            onClick={() => toggleGroupSelection(group.id)}
          >
            {group.name || 'Untitled Group'}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setSelectedGroupId(useCharacterGroupStore.getState().createGroup('New Group').id)}
        >
          + Add Group
        </button>
      </div>

      {!selectedGroup ? (
        <div className="text-sm text-muted">
          {groups.length === 0
            ? 'Create a group to assign characters and a schedule.'
            : 'Select a group to view its members and schedule.'}
        </div>
      ) : (
        <div className="bordered-section space-y-4">
          <div className="flex items-center gap-2">
            <input
              className="w-64 border rounded-sm px-3 py-2 bg-inset"
              value={selectedGroup.name}
              onChange={(event) =>
                useCharacterGroupStore.getState().renameGroup(selectedGroup.id, event.target.value)
              }
              placeholder="Group name"
            />
            <DeleteButton
              label="Delete group"
              confirmTitle="Delete Group"
              confirmLabel="Delete Group"
              confirmMessage={`Delete group "${selectedGroup.name || 'Untitled Group'}"? Its schedule will be removed and members will be unassigned.`}
              onConfirm={() => {
                useCharacterGroupStore.getState().deleteGroup(selectedGroup.id);
                setSelectedGroupId(groups.find((group) => group.id !== selectedGroup.id)?.id);
              }}
            />
          </div>

          <Tabs
            tabs={[
              { id: 'members', label: 'Group members' },
              { id: 'schedule', label: 'Schedule' },
            ]}
            activeId={subTab}
            onChange={(id) => setSubTab(id === 'schedule' ? 'schedule' : 'members')}
          >
            {subTab === 'members' ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {orderedCharacters.map((character) => {
                  const isMember = character.groupIds.includes(selectedGroup.id);
                  return (
                    <button
                      key={character.id}
                      type="button"
                      onClick={() => toggleMembership(character)}
                      className={`flex items-center gap-2 rounded-sm border p-2 text-left ${
                        isMember ? 'border-success-ring ring-2 ring-success-ring' : 'border-border-default'
                      }`}
                    >
                      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border-default bg-emphasized">
                        <img
                          src={character.imagePath}
                          alt={`${character.firstName} ${character.lastName}`}
                          className="h-full w-full object-cover object-top"
                        />
                      </div>
                      <div className="min-w-0 truncate text-sm">
                        {character.firstName} {character.lastName}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <ScheduleEditor groupId={selectedGroup.id} />
            )}
          </Tabs>
        </div>
      )}
    </div>
  );
}
