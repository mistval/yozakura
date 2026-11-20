import InfoTooltip from '../../ui/InfoTooltip.js';

type SettingFieldLabelProps = {
  text: string;
  tooltip?: string | undefined;
  tooltipDangerousHtml?: string | undefined;
  tooltipLabel?: string | undefined;
  htmlFor?: string | undefined;
  className?: string | undefined;
  wrapperClassName?: string | undefined;
};

export default function SettingFieldLabel({
  text,
  tooltip,
  tooltipDangerousHtml,
  tooltipLabel,
  htmlFor,
  className,
  wrapperClassName,
}: SettingFieldLabelProps) {
  const labelClassName = className ?? 'text-xs text-muted';

  const label = htmlFor ? (
    <label htmlFor={htmlFor} className={labelClassName}>
      {text}
    </label>
  ) : (
    <span className={labelClassName}>{text}</span>
  );

  return (
    <div className={['flex items-center gap-1', wrapperClassName ?? ''].join(' ').trim()}>
      {label}
      {tooltipDangerousHtml ? (
        <InfoTooltip label={tooltipLabel ?? `About ${text}`} dangerouslySetHtml={tooltipDangerousHtml} />
      ) : (
        tooltip && <InfoTooltip label={tooltipLabel ?? `About ${text}`} value={tooltip} />
      )}
    </div>
  );
}
