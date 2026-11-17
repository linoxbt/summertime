"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type MenuItem = { href: string; label: string };

/**
 * Hamburger menu holding every page. The panel slides down below the sticky header, inside
 * the page's outlined frame, as a grid of numbered tiles.
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
    firstLinkRef.current?.focus({ preventScroll: true });
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
        className={`grid h-10 w-10 flex-none place-items-center rounded-full border ${
          open ? "border-fg bg-fg text-page shadow-soft" : "border-line-strong bg-panel text-fg hover:border-fg hover:bg-white"
        }`}
      >
        <span className="sr-only">{open ? "Close menu" : "Menu"}</span>
        <svg viewBox="0 0 20 20" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          {open ? <path d="M5 5l10 10M15 5L5 15" /> : <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />}
        </svg>
      </button>

      <div id={panelId} hidden={!open} className="absolute inset-x-0 top-full">
        <nav aria-label="All pages" className="rise-in mx-auto max-w-6xl border-x border-line bg-page/95 px-3 pb-3 pt-3 backdrop-blur sm:px-4 sm:pb-4">
          <div className="overflow-hidden rounded-3xl border border-line bg-panel shadow-lift">
            <ul className="grid gap-1.5 p-1.5 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((it, i) => {
                const active = isCurrent(pathname, it.href);
                return (
                  <li key={it.href}>
                    <Link
                      ref={i === 0 ? firstLinkRef : undefined}
                      href={it.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={`group flex min-h-16 items-center justify-between gap-4 rounded-2xl px-4 py-4 sm:px-5 ${
                        active ? "bg-fg text-page" : "text-fg hover:bg-page"
                      }`}
                    >
                      <span className="flex items-baseline gap-3">
                        <span className={`label ${active ? "text-[#c9c8c2]" : "text-faint"}`}>{String(i + 1).padStart(2, "0")}</span>
                        <span className="display text-2xl sm:text-[1.7rem]">{it.label}</span>
                      </span>
                      <span aria-hidden="true" className={`text-lg transition-transform duration-300 group-hover:translate-x-1 ${active ? "text-page" : "text-faint group-hover:text-fg"}`}>
                        →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {footer && <div className="border-t border-line px-4 py-3 sm:px-5">{footer}</div>}
          </div>
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
