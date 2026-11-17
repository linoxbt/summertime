/** Summertime mark: a sun setting into the sea lane, on an ink tile. */
export function Logo({ inverted = false }: { inverted?: boolean }) {
  const tile = inverted ? "#f3f2ee" : "#0b0a09";
  const ink = inverted ? "#0b0a09" : "#f3f2ee";
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-8 w-8 flex-none" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill={tile} />
        <path d="M9 18a7 7 0 0 1 14 0Z" fill={ink} />
        <path d="M6 21.5h20M9 25h14" stroke={ink} strokeWidth="1.8" />
      </svg>
      <span className="leading-none">
        <span className={`block text-[15px] font-semibold tracking-tight ${inverted ? "text-page" : "text-fg"}`}>Summertime</span>
        <span className={`label mt-0.5 block text-[9px] ${inverted ? "text-[#a6a59f]" : "text-faint"}`}>Shared containers</span>
      </span>
    </span>
  );
}
