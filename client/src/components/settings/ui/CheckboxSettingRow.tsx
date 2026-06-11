import SettingFieldLabel from './SettingFieldLabel.js';

type CheckboxSettingRowProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: (nextChecked: boolean) => void;
  tooltipHtml?: string;
};

export default function CheckboxSettingRow({
  id,
  label,
  checked,
  onChange,
  tooltipHtml,
}: CheckboxSettingRowProps) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <SettingFieldLabel text={label} htmlFor={id} tooltipHtml={tooltipHtml} />
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4"
      />
    </label>
  );
}
