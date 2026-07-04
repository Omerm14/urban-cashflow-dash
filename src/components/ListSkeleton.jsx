// Shared shimmer skeleton for row-based views (Invoices, Suppliers) —
// mirrors the pattern DashboardView established.
export default function ListSkeleton({ rows = 6, label = "Loading" }) {
  return (
    <div aria-busy="true" aria-label={label}>
      <div className="shimmer" style={{ height: 32, width: 220, marginBottom: 14 }} />
      <div className="card" style={{ overflow: "hidden" }}>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="shimmer" style={{ height: 54, margin: 1, borderRadius: 0 }} />
        ))}
      </div>
    </div>
  );
}
