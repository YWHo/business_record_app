import type { DemoRole } from './AuthContext';

export function DemoRoleChooser({
  onSelect,
}: {
  onSelect: (role: DemoRole) => void;
}) {
  return (
    <div className="local-auth">
      <h2>Public demonstration</h2>
      <button type="button" onClick={() => onSelect('OWNER')}>
        Continue as Demo Owner
      </button>
      <button
        type="button"
        className="secondary-button"
        onClick={() => onSelect('ACCOUNTANT')}
      >
        Continue as Demo Accountant
      </button>
      <button
        type="button"
        className="secondary-button"
        onClick={() => onSelect('AUDITOR')}
      >
        Continue as Demo Auditor
      </button>
      <small>All identities, businesses, and amounts are synthetic.</small>
    </div>
  );
}
