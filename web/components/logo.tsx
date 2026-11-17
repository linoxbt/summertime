/** Summertime mark: a sun rising over the sea lane. */
export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
        <path d="M7 19a9 9 0 0 1 18 0" fill="#ffb547" />
        <path d="M4 22.5h24" stroke="#8aa9ff" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M8 27h16" stroke="#8aa9ff" strokeWidth="2.2" strokeLinecap="round" opacity="0.55" />
      </svg>
      <span className={`text-lg font-semibold tracking-tight ${inverted ? "text-white" : "text-fg"}`}>Summertime</span>
    </span>
  );
}
