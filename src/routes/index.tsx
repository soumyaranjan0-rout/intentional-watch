import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { MODES, type Mode } from "@/lib/intent";
import { useSessionState } from "@/contexts/SessionStateContext";
import { useAuth } from "@/contexts/AuthContext";
import { Leaf, Search, ArrowRight, ChevronDown, Check, X } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZenTube — Search with intent, not distraction" },
      {
        name: "description",
        content:
          "ZenTube is a calm, intent-driven way to use YouTube. No infinite scroll, no autoplay — just the videos you came for.",
      },
      { property: "og:title", content: "ZenTube — Search with intent, not distraction" },
      {
        property: "og:description",
        content: "Search with intent, not distraction. A focus-first YouTube companion.",
      },
    ],
  }),
  component: HomePage,
});

const PLACEHOLDERS: Record<Mode, string> = {
  learn: "What do you want to learn today?",
  relax: "What would you like to unwind with?",
  find: "Find an exact video…",
  explore: "What should we explore together?",
};

const INTENT_DESCRIPTIONS: Record<Mode, string> = {
  learn: "Tutorials, courses, and explainers — with notes and focus tools.",
  relax: "Music, comedy, and easy watching — minimal UI, gentle nudges.",
  find: "Locate a specific known video as quickly as possible.",
  explore: "A short, curated set of high-quality picks around a topic.",
};

function HomePage() {
  const { setMode, setQuery, resetSession } = useSessionState();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selected, setSelected] = useState<Mode>("learn");
  const [q, setQ] = useState("");
  const [intentOpen, setIntentOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const intentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    resetSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click-outside for the intent dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!intentOpen) return;
      if (intentRef.current && !intentRef.current.contains(e.target as Node)) {
        setIntentOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [intentOpen]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) return;
    setConfirming(true);
  };

  const proceed = () => {
    const v = q.trim();
    if (!v) return;
    setMode(selected);
    setQuery(v);
    setConfirming(false);
    if (selected === "find") navigate({ to: "/results" });
    else navigate({ to: "/refine/$mode", params: { mode: selected } });
  };

  return (
    <div className="zen-hero-bg relative overflow-hidden">
      {/* Soft ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-10rem] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 14%, transparent), transparent 70%)",
        }}
      />

      <div className="zen-container relative py-24 sm:py-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <Leaf className="h-3.5 w-3.5 text-primary" />
            A calmer way to use YouTube
          </div>

          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Search with intent,
            <br />
            <span className="bg-gradient-to-r from-primary to-[oklch(0.78_0.065_158)] bg-clip-text text-transparent">
              not distraction.
            </span>
          </h1>

          {/* The hero search */}
          <form onSubmit={onSearch} className="mx-auto mt-12 max-w-2xl">
            <div className="zen-card zen-search-glow flex items-center gap-1 rounded-full border bg-card/80 p-1.5 pl-5 backdrop-blur">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={PLACEHOLDERS[selected]}
                className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-muted-foreground"
                autoFocus
              />

              {/* Intent dropdown */}
              <div ref={intentRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIntentOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/80 px-3 py-2 text-sm text-foreground hover:border-primary/40"
                >
                  <span aria-hidden>{MODES[selected].emoji}</span>
                  <span className="hidden sm:inline">{MODES[selected].label}</span>
                  <ChevronDown className={"h-3.5 w-3.5 text-muted-foreground transition-transform " + (intentOpen ? "rotate-180" : "")} />
                </button>
                {intentOpen && (
                  <div className="absolute right-0 top-full z-30 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-popover/95 shadow-2xl backdrop-blur">
                    {(Object.keys(MODES) as Mode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { setSelected(m); setIntentOpen(false); }}
                        className={
                          "flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-accent " +
                          (selected === m ? "bg-accent/50" : "")
                        }
                      >
                        <span className="mt-0.5 text-base" aria-hidden>{MODES[m].emoji}</span>
                        <span className="flex-1">
                          <span className="flex items-center gap-2 text-sm text-foreground">
                            {MODES[m].label}
                            {selected === m && <Check className="h-3.5 w-3.5 text-primary" />}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {INTENT_DESCRIPTIONS[m]}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!q.trim()}
                className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                <span className="hidden sm:inline">Search</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-5 text-sm text-muted-foreground">
              Pick why you're here — we'll tune the results to your intent.
            </p>
          </form>
        </div>

        {!user && (
          <div className="mx-auto mt-20 max-w-md text-center text-sm text-muted-foreground">
            <Link to="/login" search={{ redirect: "/" }} className="text-primary hover:underline">
              Sign in
            </Link>{" "}
            to save notes, history, and insights.
          </div>
        )}
      </div>

      {confirming && (
        <ConfirmIntent
          mode={selected}
          query={q.trim()}
          onCancel={() => setConfirming(false)}
          onChangeIntent={() => { setConfirming(false); setIntentOpen(true); }}
          onProceed={proceed}
        />
      )}
    </div>
  );
}

function ConfirmIntent({
  mode, query, onCancel, onChangeIntent, onProceed,
}: {
  mode: Mode; query: string;
  onCancel: () => void; onChangeIntent: () => void; onProceed: () => void;
}) {
  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") onProceed();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onProceed]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="zen-card w-full max-w-md p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>{MODES[mode].emoji}</span>
            <div>
              <div className="text-sm uppercase tracking-wider text-muted-foreground">Searching with intent</div>
              <div className="text-lg font-semibold text-foreground">{MODES[mode].label}</div>
            </div>
          </div>
          <button onClick={onCancel} className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">{INTENT_DESCRIPTIONS[mode]}</p>

        <div className="mt-4 rounded-md bg-surface/60 px-3 py-2 text-sm">
          <span className="text-muted-foreground">You'll search for: </span>
          <span className="text-foreground">"{query}"</span>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onChangeIntent}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-foreground hover:bg-accent"
          >
            Change intent
          </button>
          <button
            onClick={onProceed}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Continue <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
