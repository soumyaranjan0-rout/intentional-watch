import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Clock, TrendingUp } from "lucide-react";

const RECENT_KEY = "zen:recentSearches";

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = normalize(value);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function recentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function rememberSearchSuggestion(query: string) {
  if (typeof window === "undefined") return;
  const clean = normalize(query);
  if (!clean) return;
  try {
    const next = unique([clean, ...recentSearches()]).slice(0, 8);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage may be unavailable */
  }
}

// In-memory cache so repeated keystrokes don't re-fetch.
const cache = new Map<string, string[]>();

async function fetchYouTubeSuggestions(query: string, signal: AbortSignal): Promise<string[]> {
  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const res = await fetch(`/api/public/yt-suggest?q=${encodeURIComponent(query)}`, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { suggestions?: string[] };
    const list = Array.isArray(data?.suggestions) ? data.suggestions : [];
    cache.set(key, list);
    return list;
  } catch {
    return [];
  }
}

/**
 * Autocomplete dropdown that mirrors YouTube's behaviour:
 *  - debounced upstream suggestions (140 ms)
 *  - recent-search history shown when empty / merged when typing
 *  - full keyboard control: ArrowDown / ArrowUp, Enter to pick, Esc to close
 *  - mouse hover updates the active row, click commits
 *
 * The parent owns the <input>; we attach a key listener to it via `inputRef`
 * so Enter on a highlighted suggestion picks it (instead of submitting the form).
 */
export function SearchSuggestions({
  value,
  visible,
  onPick,
  inputRef,
  id = "search-suggestions",
}: {
  value: string;
  visible: boolean;
  onPick: (query: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  id?: string;
}) {
  const [remote, setRemote] = useState<string[]>([]);
  const [active, setActive] = useState<number>(-1);
  const lastQuery = useRef<string>("");

  // Debounced fetch of YouTube suggestions.
  useEffect(() => {
    const clean = normalize(value);
    if (!clean) {
      setRemote([]);
      lastQuery.current = "";
      return;
    }
    if (clean.toLowerCase() === lastQuery.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const list = await fetchYouTubeSuggestions(clean, controller.signal);
      lastQuery.current = clean.toLowerCase();
      setRemote(list);
    }, 140);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [value]);

  const items = useMemo(() => {
    const clean = normalize(value).toLowerCase();
    const recents = recentSearches();
    if (!clean) return unique(recents).slice(0, 6);
    return unique([...remote, ...recents.filter((r) => r.toLowerCase().includes(clean))]).slice(0, 8);
  }, [value, remote]);

  // Reset highlight whenever the visible list changes shape.
  useEffect(() => {
    setActive(-1);
  }, [items.length, value]);

  // Attach keyboard navigation to the parent input.
  useEffect(() => {
    const el = inputRef?.current;
    if (!el || !visible || items.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
      } else if (e.key === "Enter") {
        if (active >= 0 && active < items.length) {
          e.preventDefault();
          e.stopPropagation();
          onPick(items[active]);
        }
      } else if (e.key === "Escape") {
        setActive(-1);
        el.blur();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [inputRef, visible, items, active, onPick]);

  if (!visible || items.length === 0) return null;

  const recentSet = new Set(recentSearches().map((r) => r.toLowerCase()));
  const clean = normalize(value).toLowerCase();

  return (
    <div
      className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-sm border border-border bg-popover text-left shadow-[0_2px_5px_rgba(0,0,0,0.18)]"
      role="listbox"
    >
      {items.map((suggestion, i) => {
        const isActive = i === active;
        const Icon = recentSet.has(suggestion.toLowerCase()) ? Clock : clean ? Search : TrendingUp;
        return (
          <button
            key={suggestion}
            type="button"
            role="option"
            aria-selected={isActive}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(i)}
            onClick={() => onPick(suggestion)}
            className={
              "flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left text-sm last:border-b-0 " +
              (isActive ? "bg-accent text-foreground" : "text-foreground hover:bg-accent")
            }
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{suggestion}</span>
          </button>
        );
      })}
    </div>
  );
}
