export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
        <circle cx="16" cy="16" r="14" fill="none" stroke="#b45309" strokeWidth="2.5" />
        <circle cx="16" cy="16" r="7" fill="#b45309" />
      </svg>
      <span className={`text-lg font-semibold tracking-tight ${inverted ? "text-white" : "text-ink"}`}>Summertime</span>
    </span>
  );
}
