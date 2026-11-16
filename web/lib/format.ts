import { formatCbm } from "@summertime/ledger";

// Display helpers. Money and capacity formatting comes from @summertime/ledger.

export function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "in 4 min", "2 h ago" */
export function relativeTime(iso: string | undefined | null, now: number = Date.now()): string {
  if (!iso) return "";
  const diff = Date.parse(iso) - now;
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [86_400_000, "day"],
    [3_600_000, "h"],
    [60_000, "min"],
    [1000, "s"],
  ];
  for (const [ms, label] of units) {
    if (abs >= ms) {
      const n = Math.floor(abs / ms);
      const unit = label === "day" ? (n === 1 ? "day" : "days") : label;
      return diff >= 0 ? `in ${n} ${unit}` : `${n} ${unit} ago`;
    }
  }
  return diff >= 0 ? "in a moment" : "just now";
}

/** Shorten a Canton party ID ("Name::1220abcd…") for display. */
export function shortParty(party: string): string {
  const [name, fp] = party.split("::");
  if (!fp) return party.length > 16 ? `${party.slice(0, 12)}…` : party;
  return `${name}::${fp.slice(0, 6)}…`;
}

export function shortId(id: string | undefined, n = 10): string {
  if (!id) return "—";
  return id.length > n * 2 ? `${id.slice(0, n)}…${id.slice(-6)}` : id;
}

/** Value for a datetime-local input from a Date (local time). */
export function toLocalInput(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function percent(part: number, whole: number): number {
  if (!whole || whole <= 0) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/** Capacity as a bare number ("4.000"); callers add the unit. Independent of the API's display string. */
export function cbm(c: { milliCbm: string }): string {
  return formatCbm(c.milliCbm);
}
