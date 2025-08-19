import { ClassKey } from "../modules/templates";

export function SelectSlot({
  value,
  onChange,
  disabled,
  options,
  label,
}: {
  value: "" | ClassKey;
  onChange: (v: "" | ClassKey) => void;
  disabled?: boolean;
  options: ClassKey[];
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm w-12 text-slate-600">{label}</span>
      <select
        className="border rounded px-2 py-1"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as any)}
      >
        <option value="">—</option>
        {options.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    </div>
  );
}
