import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useSessionState } from "@/contexts/SessionStateContext";
import { IntentSearchModal } from "./IntentSearchModal";
import type { Mode } from "@/lib/intent";

/** Persistent search bar shown in the navbar on every page (except login & home).
 *  Uses the same intent-modal flow as the homepage search. */
export function NavSearch() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { mode: sessionMode, setMode, setQuery } = useSessionState();
  const navigate = useNavigate();
  const { location } = useRouterState();

  // Don't render on login or home page (home has its own hero search)
  const hide = location.pathname === "/" || location.pathname.startsWith("/login");

  // Cmd/Ctrl + K shortcut
  useEffect(() => {
    if (hide) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hide]);

  if (hide) return null;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setOpen(true);
  };

  const onConfirm = (mode: Mode) => {
    const v = q.trim();
    if (!v) return;
    setMode(mode);
    setQuery(v);
    setOpen(false);
    setQ("");
    if (mode === "find") navigate({ to: "/results" });
    else navigate({ to: "/refine/$mode", params: { mode } });
  };

  return (
    <>
      <form onSubmit={onSubmit} className="hidden flex-1 px-4 md:flex md:max-w-md">
        <div className="zen-search-glow flex w-full items-center gap-2 rounded-full border border-border bg-surface/70 pl-4 pr-1 backdrop-blur transition-colors focus-within:border-primary/50">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search videos…"
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
            aria-label="Search"
          />
          <kbd className="hidden rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">⌘K</kbd>
          <button
            type="submit"
            disabled={!q.trim()}
            className="ml-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Search
          </button>
        </div>
      </form>
      {open && (
        <IntentSearchModal
          query={q.trim()}
          initial={(sessionMode as Mode) || "learn"}
          onClose={() => setOpen(false)}
          onConfirm={onConfirm}
        />
      )}
    </>
  );
}
