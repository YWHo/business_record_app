const metrics = [
  { label: 'Income', value: '$0.00', note: 'No records yet' },
  { label: 'Recorded expenses', value: '$0.00', note: 'No records yet' },
  { label: 'Net cash movement', value: '$0.00', note: 'Current period' },
];

export function DashboardPage() {
  return (
    <section aria-labelledby="dashboard-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Overview</span>
          <h1 id="dashboard-heading">Your business at a glance</h1>
          <p>Income less recorded expenses across your activities.</p>
        </div>
        <button type="button">Add record</button>
      </div>

      <div className="metric-grid">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </article>
        ))}
      </div>

      <section
        className="empty-state"
        aria-labelledby="getting-started-heading"
      >
        <div className="empty-state-icon" aria-hidden="true">
          ✓
        </div>
        <div>
          <h2 id="getting-started-heading">Ready for your first record</h2>
          <p>
            Use the workspace sections to add records. Supporting documents stay
            private and retain their complete replacement history.
          </p>
        </div>
      </section>
    </section>
  );
}
