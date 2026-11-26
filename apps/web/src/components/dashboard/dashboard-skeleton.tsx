export default function DashboardSkeleton() {
  return (
    <div
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      aria-hidden="true"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="overview-card h-24 animate-pulse rounded-xl border"
        />
      ))}
      <div className="overview-card h-40 animate-pulse rounded-xl border sm:col-span-2 xl:col-span-2" />
      <div className="overview-card h-40 animate-pulse rounded-xl border sm:col-span-2 xl:col-span-2" />
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={`chart-${index}`}
          className="overview-card h-56 animate-pulse rounded-xl border"
        />
      ))}
      <div className="overview-card h-48 animate-pulse rounded-xl border sm:col-span-2 xl:col-span-4" />
    </div>
  );
}
