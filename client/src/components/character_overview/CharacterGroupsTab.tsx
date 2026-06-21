import { useEffect, useMemo, useState } from 'react';
import type { Character } from '../../engine/types.js';
import { useCharacterGroupStore } from '../../state/character_group_store.js';
import { useScenarioCharacterStore } from '../../state/scenario_character_store.js';
import ConfirmDialog from '../ui/ConfirmDialog.js';
import ScheduleEditor from './ScheduleEditor.js';

export default function CharacterGroupsTab() {
  const groups = useCharacterGroupStore((state) => state.groups);
  const characters = useScenarioCharacterStore((state) => state.scenarioCharacters);

  const [selectedGroupId, setSelectedGroupId] = useState<string | undefined>(groups[0]?.id);
  const [subTab, setSubTab] = useState<'members' | 'schedule'>('members');
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState<string | undefined>(undefined);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId);

  useEffect(() => {
    if (!selectedGroup && groups.length > 0) {
      setSelectedGroupId(groups[0]?.id);
    }
  }, [groups, selectedGroup]);

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

  const pendingDeleteGroup = groups.find((group) => group.id === pendingDeleteGroupId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className={group.id === selectedGroupId ? 'button-emphasized' : ''}
            onClick={() => setSelectedGroupId(group.id)}
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
        <div className="text-sm text-muted">Create a group to assign characters and a schedule.</div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <input
              className="w-64 border rounded-sm px-3 py-2 bg-inset"
              value={selectedGroup.name}
              onChange={(event) =>
                useCharacterGroupStore.getState().renameGroup(selectedGroup.id, event.target.value)
              }
              placeholder="Group name"
            />
            <button type="button" onClick={() => setPendingDeleteGroupId(selectedGroup.id)}>
              Delete Group
            </button>
          </div>

          <div className="inline-flex gap-2 rounded-sm border border-border-default p-1">
            <button
              type="button"
              className={subTab === 'members' ? 'button-emphasized' : ''}
              onClick={() => setSubTab('members')}
            >
              Group members
            </button>
            <button
              type="button"
              className={subTab === 'schedule' ? 'button-emphasized' : ''}
              onClick={() => setSubTab('schedule')}
            >
              Schedule
            </button>
          </div>

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
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeleteGroupId)}
        onClose={() => setPendingDeleteGroupId(undefined)}
        title="Delete Group"
        message={`Delete group "${pendingDeleteGroup?.name || 'Untitled Group'}"? Its schedule will be removed and members will be unassigned.`}
        confirmLabel="Delete Group"
        onConfirm={() => {
          if (pendingDeleteGroupId) {
            useCharacterGroupStore.getState().deleteGroup(pendingDeleteGroupId);
            if (selectedGroupId === pendingDeleteGroupId) {
              setSelectedGroupId(groups.find((group) => group.id !== pendingDeleteGroupId)?.id);
            }
          }
          setPendingDeleteGroupId(undefined);
        }}
      />
    </div>
  );
}
