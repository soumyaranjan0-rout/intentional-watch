import { useEffect, useRef, useState } from "react";
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

export function SearchSuggestions({
  value,
  visible,
  onPick,
}: {
  value: string;
  visible: boolean;
  onPick: (query: string) => void;
}) {
  const [remote, setRemote] = useState<string[]>([]);
  const lastQuery = useRef<string>("");

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

  if (!visible) return null;

  const clean = normalize(value).toLowerCase();
  const recents = recentSearches();
  const items = clean
    ? unique([...remote, ...recents.filter((r) => r.toLowerCase().includes(clean))]).slice(0, 8)
    : unique(recents).slice(0, 6);

  if (items.length === 0) return null;

  const recentSet = new Set(recents.map((r) => r.toLowerCase()));

  return (
    <div
      className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-sm border border-border bg-popover text-left shadow-[0_2px_5px_rgba(0,0,0,0.18)]"
      role="listbox"
    >
      {items.map((suggestion) => {
        const Icon = recentSet.has(suggestion.toLowerCase()) ? Clock : clean ? Search : TrendingUp;
        return (
          <button
            key={suggestion}
            type="button"
            role="option"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(suggestion)}
            className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left text-sm text-foreground last:border-b-0 hover:bg-accent"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{suggestion}</span>
          </button>
        );
      })}
    </div>
  );
}
