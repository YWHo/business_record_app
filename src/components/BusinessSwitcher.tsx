export interface BusinessSwitcherOption {
  id: string;
  name: string;
}

export function BusinessSwitcher({
  businesses,
  value,
  onChange,
}: {
  businesses: BusinessSwitcherOption[];
  value: string;
  onChange: (businessId: string) => void;
}) {
  return (
    <label className="business-switcher">
      <span className="sr-only">Current business</span>
      <select
        aria-label="Current business"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {businesses.map((business) => (
          <option key={business.id} value={business.id}>
            {business.name}
          </option>
        ))}
      </select>
    </label>
  );
}
