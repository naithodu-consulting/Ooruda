/**
 * Loading placeholder for the Reports content area.
 *
 * Extracted from reports-client-page so reports-tabs can render it inside the
 * panel region without importing its own parent (circular import).
 */
export function ReportsSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-muted h-24 rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="bg-muted h-72 rounded-xl lg:col-span-2" />
        <div className="bg-muted h-72 rounded-xl" />
      </div>
    </div>
  );
}
