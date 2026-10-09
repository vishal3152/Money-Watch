"use client";

export function ToggleField({
  id,
  name,
  label,
  help,
  defaultChecked = false
}: {
  id: string;
  name: string;
  label: string;
  help?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="pw-toggle-field" htmlFor={id}>
      <span className="pw-toggle-field-text">
        <span className="pw-toggle-field-label">{label}</span>
        {help ? <span className="pw-field-help">{help}</span> : null}
      </span>
      <input
        id={id}
        name={name}
        type="checkbox"
        className="pw-toggle-input"
        defaultChecked={defaultChecked}
      />
      <span className="pw-toggle-track" aria-hidden="true">
        <span className="pw-toggle-thumb" />
      </span>
    </label>
  );
}
