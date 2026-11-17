"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { GridFillers } from "./ui";

export type MenuItem = { href: string; label: string };

/**
 * Hamburger menu holding every page. The panel drops below the sticky header, inside the
 * page's outlined frame, as a grid of numbered cells.
 */
export function Menu({ items, footer }: { items: MenuItem[]; footer?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  // Close on navigation.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    firstLinkRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={`grid h-10 w-10 flex-none place-items-center border border-fg ${open ? "bg-fg text-page" : "bg-page text-fg hover:bg-panel"}`}
      >
        <span className="sr-only">{open ? "Close menu" : "Menu"}</span>
        <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          {open ? <path d="M4.5 4.5l11 11M15.5 4.5l-11 11" /> : <path d="M3 5.5h14M3 10h14M3 14.5h14" />}
        </svg>
      </button>

      <div id={panelId} hidden={!open} className="absolute inset-x-0 top-full border-b border-fg bg-page">
        <nav aria-label="All pages" className="mx-auto max-w-6xl border-x border-line">
          <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
            {items.map((it, i) => {
              const active = isCurrent(pathname, it.href);
              return (
                <li key={it.href} className="bg-page">
                  <Link
                    ref={i === 0 ? firstLinkRef : undefined}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-16 items-baseline gap-4 px-4 py-4 sm:px-6 sm:py-5 ${active ? "bg-fg text-page" : "text-fg hover:bg-panel"}`}
                  >
                    <span className={`label ${active ? "text-[#c9c8c2]" : "text-faint"}`}>{String(i + 1).padStart(2, "0")}</span>
                    <span className="display text-2xl sm:text-3xl">{it.label}</span>
                  </Link>
                </li>
              );
            })}
            <GridFillers count={items.length} sm={2} lg={4} />
          </ul>
          {footer && <div className="border-t border-line px-4 py-3 sm:px-6">{footer}</div>}
        </nav>
      </div>
    </div>
  );
}

function isCurrent(pathname: string, href: string): boolean {
  if (href.includes("#")) return false;
  if (href === "/") return pathname === "/";
  if (href === "/forwarder") return pathname === "/forwarder" || pathname.startsWith("/forwarder/campaigns");
  return pathname === href || pathname.startsWith(href + "/");
}
