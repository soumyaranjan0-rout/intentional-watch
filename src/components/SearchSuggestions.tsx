import { Search, Clock, TrendingUp } from "lucide-react";

const RECENT_KEY = "zen:recentSearches";

const DEFAULT_SUGGESTIONS = [
  "python tutorial for beginners",
  "javascript project tutorial",
  "data structures explained",
  "machine learning basics",
  "public speaking tips",
  "how to focus while studying",
  "mindfulness meditation guided",
  "productivity system for students",
  "personal finance basics",
  "calisthenics beginner workout",
  "english speaking practice",
  "history documentary",
];

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

function recentSearches() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
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
    /* storage can be unavailable in private/webview modes */
  }
}

export function buildSearchSuggestions(query: string, limit = 6) {
  const clean = normalize(query).toLowerCase();
  const recent = recentSearches();
  if (!clean) return unique([...recent, ...DEFAULT_SUGGESTIONS]).slice(0, limit);

  const generated = [
    `${clean} tutorial`,
    `${clean} explained simply`,
    `${clean} beginner course`,
    `${clean} documentary`,
    `${clean} tips`,
  ];
  const matches = [...recent, ...DEFAULT_SUGGESTIONS].filter((item) => item.toLowerCase().includes(clean));
  return unique([...matches, ...generated]).slice(0, limit);
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
  const suggestions = buildSearchSuggestions(value);
  if (!visible || suggestions.length === 0) return null;

  const recents = new Set(recentSearches().map((item) => item.toLowerCase()));

  return (
    <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-sm border border-border bg-popover text-left shadow-[0_2px_5px_rgba(0,0,0,0.18)]" role="listbox">
      {suggestions.map((suggestion) => {
        const Icon = recents.has(suggestion.toLowerCase()) ? Clock : value.trim() ? Search : TrendingUp;
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