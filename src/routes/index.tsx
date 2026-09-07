import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { modeForCategory } from "@/lib/intent";
import { useSessionState } from "@/contexts/SessionStateContext";
import { useIntentSession } from "@/contexts/IntentSessionContext";
import { ZenLogo } from "@/components/ZenLogo";
import { ResumeBanner } from "@/components/ResumeBanner";
import { SearchSuggestions, rememberSearchSuggestion } from "@/components/SearchSuggestions";
import { Search, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZenTube — Search with intent, not distraction" },
      { name: "description", content: "ZenTube is a calm, intent-driven way to use YouTube. No infinite scroll, no autoplay — just the videos you came for." },
      { property: "og:title", content: "ZenTube — Search with intent, not distraction" },
      { property: "og:description", content: "Search with intent, not distraction. A focus-first YouTube companion." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { setMode, setQuery } = useSessionState();
  const navigate = useNavigate();
  const { session, markActivity } = useIntentSession();
  const [q, setQ] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  /** Intent was already declared on the launch screen — never ask again. */
  const runSearch = (value: string) => {
    const v = value.trim();
    if (!v) return;
    rememberSearchSuggestion(v);
    setSuggestionsOpen(false);
    setMode(modeForCategory(session?.category));
    setQuery(v);
    markActivity();
    navigate({ to: "/results" });
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(q);
  };

  const pickSuggestion = (value: string) => {
    setQ(value);
    runSearch(value);
  };

  return (
    <div className="zen-hero-bg relative min-h-[calc(100vh-3.5rem)] overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-10rem] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 16%, transparent), transparent 70%)" }}
      />

      <div className="zen-container relative px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <ZenLogo size={14} />
            A calmer way to use YouTube
          </div>

          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Search with intent,
            <br />
            <span className="bg-gradient-to-r from-primary to-[oklch(0.70_0.16_295)] bg-clip-text text-transparent">
              not distraction.
            </span>
          </h1>

          <form onSubmit={onSearch} className="mx-auto mt-12 max-w-2xl">
            <div className="relative">
              <div className="zen-searchbar flex items-center gap-2 rounded-full border border-border bg-card/80 p-1.5 pl-5 backdrop-blur transition-colors">
                <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setSuggestionsOpen(true); }}
                  onFocus={() => setSuggestionsOpen(true)}
                  onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 120)}
                  placeholder="What are you looking for?"
                  aria-label="Search videos"
                  className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none ring-0 focus:outline-none focus-visible:outline-none placeholder:text-muted-foreground"
                  role="combobox"
                  aria-expanded={suggestionsOpen}
                  aria-autocomplete="list"
                  aria-controls="home-search-suggestions"
                />
                <button
                  type="submit"
                  disabled={!q.trim()}
                  className="zen-focus-ring ml-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <span className="hidden sm:inline">Search</span>
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <SearchSuggestions id="home-search-suggestions" value={q} visible={suggestionsOpen} onPick={pickSuggestion} inputRef={inputRef} />
            </div>
            <p className="mt-5 text-sm text-muted-foreground">
              We'll ask why you're here — then tune results to match.
            </p>
          </form>
        </div>

        <ResumeBanner />

      </div>

    </div>
  );
}
