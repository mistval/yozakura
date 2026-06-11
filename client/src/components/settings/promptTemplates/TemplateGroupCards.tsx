import type { TemplateGroup } from '../../../engine/prompt_templates/template_group.js';

type TemplateGroupCardsProps = {
  groups: TemplateGroup[];
  onOpenGroup: (groupId: string) => void;
};

export default function TemplateGroupCards({ groups, onOpenGroup }: TemplateGroupCardsProps) {
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <button
          key={group.groupId}
          type="button"
          className="card-button"
          onClick={() => onOpenGroup(group.groupId)}
        >
          <p className="text-base font-semibold">{group.title}</p>
          <p className="text-sm text-secondary">{group.description}</p>
        </button>
      ))}
    </div>
  );
}
