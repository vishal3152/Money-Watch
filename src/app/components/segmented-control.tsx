"use client";

type SegmentOption = {
  value: string;
  label: string;
};

export function SegmentedControl({
  name,
  value,
  options,
  onChange,
  "aria-label": ariaLabel,
  disabled = false
}: {
  name?: string;
  value: string;
  options: readonly SegmentOption[];
  onChange: (value: string) => void;
  "aria-label": string;
  disabled?: boolean;
}) {
  return (
    <div
      className="pw-segmented"
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
    >
      {name ? <input name={name} type="hidden" value={value} /> : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={selected ? "pw-segmented-option is-selected" : "pw-segmented-option"}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
