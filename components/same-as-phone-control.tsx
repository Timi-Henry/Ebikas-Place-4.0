"use client";

type SameAsPhoneControlProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function SameAsPhoneControl({ checked, onChange }: SameAsPhoneControlProps) {
  return (
    <label className="form-toggle form-toggle-compact same-as-phone">
      <input checked={checked} type="checkbox" onChange={(event) => onChange(event.target.checked)} />
      <span>Same as phone number</span>
      <span className="form-toggle-switch" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}
