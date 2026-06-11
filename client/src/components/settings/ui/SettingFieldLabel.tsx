import InfoTooltip from '../../ui/InfoTooltip.js';

type SettingFieldLabelProps = {
  text: string;
  tooltipHtml?: string | undefined;
  tooltipLabel?: string | undefined;
  htmlFor?: string | undefined;
  className?: string | undefined;
  wrapperClassName?: string | undefined;
};

export default function SettingFieldLabel({
  text,
  tooltipHtml,
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
      {tooltipHtml && <InfoTooltip label={tooltipLabel ?? `About ${text}`} html={tooltipHtml} />}
    </div>
  );
}
