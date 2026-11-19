export function AccountantAccessNotice({ demo = false }: { demo?: boolean }) {
  return (
    <aside className="accountant-access-notice" aria-label="Accountant access">
      <strong>Accountant · Review access</strong>
      <p>
        Review and process records, add comments, reconcile income, and adjust
        insurance allocations.
      </p>
      <p>
        {demo
          ? 'Demo review changes stay in this browser. Server downloads and exports are disabled.'
          : 'Supporting evidence downloads and CSV reports are available. Full archives are owner-only.'}
      </p>
      <p>
        Source records, uploads and account administration are managed by the
        owner.
      </p>
    </aside>
  );
}
