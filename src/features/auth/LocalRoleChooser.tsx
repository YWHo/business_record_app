export function LocalRoleChooser({
  onSelect,
}: {
  onSelect: (email: string) => void;
}) {
  return (
    <div className="local-auth">
      <h2>Local development</h2>
      <button type="button" onClick={() => onSelect('owner@local.test')}>
        Continue as local owner
      </button>
      <button
        type="button"
        className="secondary-button"
        onClick={() => onSelect('accountant@local.test')}
      >
        Continue as local accountant
      </button>
      <button
        type="button"
        className="secondary-button"
        onClick={() => onSelect('auditor@local.test')}
      >
        Continue as local auditor
      </button>
      <small>The local auditor uses a scoped, expiring membership.</small>
    </div>
  );
}
