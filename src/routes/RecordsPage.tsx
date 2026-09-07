export function RecordsPage() {
  return (
    <section aria-labelledby="records-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Transaction log</span>
          <h1 id="records-heading">Records</h1>
          <p>Search and review income, expenses, and supporting documents.</p>
        </div>
      </div>
      <div className="empty-state">
        <div>
          <h2>No records yet</h2>
          <p>Your income and expense records will appear here.</p>
        </div>
      </div>
    </section>
  );
}
