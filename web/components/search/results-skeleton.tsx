export function ResultsSkeleton() {
  return (
    <ul className="space-y-2" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="flex items-center gap-6 rounded-2xl border border-border bg-card p-5" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-6 w-14" />
          <div className="skeleton h-px flex-1" />
          <div className="skeleton h-6 w-14" />
          <div className="skeleton ml-6 h-6 w-20" />
        </li>
      ))}
    </ul>
  );
}
