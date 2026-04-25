import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MODES, type Mode } from "@/lib/intent";
import { useSessionState } from "@/contexts/SessionStateContext";
import { useAuth } from "@/contexts/AuthContext";
import { Leaf, Search, ArrowRight, GraduationCap, Coffee, Sparkles } from "lucide-react";

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

const ICON_MAP: Record<Mode, React.ComponentType<{ className?: string }>> = {
  learn: GraduationCap,
  relax: Coffee,
  find: Search,
  explore: Sparkles,
};

function HomePage() {
  const { setMode, setQuery, resetSession } = useSessionState();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [selected, setSelected] = useState<Mode>("learn");
  const [q, setQ] = useState("");

  useEffect(() => {
    resetSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const v = q.trim();
    if (!v) return;
    setMode(selected);
    setQuery(v);
    // Find mode goes straight to results; others go to refine
    if (selected === "find") navigate({ to: "/results" });
    else navigate({ to: "/refine/$mode", params: { mode: selected } });
  };

  return (
    <div className="zen-hero-bg">
      <div className="zen-container py-16 sm:py-24">
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
          <p className="mt-5 text-pretty text-base text-muted-foreground sm:text-lg">
            Tell ZenTube why you're here. We'll surface a few high-quality videos —
            no infinite scroll, no autoplay, no rabbit holes.
          </p>

          {/* Central search */}
          <form onSubmit={onSearch} className="mx-auto mt-10 max-w-2xl">
            <div className="zen-card zen-search-glow flex items-center gap-2 rounded-full border bg-card p-2 pl-5">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={
                  selected === "find"
                    ? "Find an exact video…"
                    : selected === "learn"
                      ? "What do you want to learn?"
                      : selected === "relax"
                        ? "What do you want to watch?"
                        : "What should we explore?"
                }
                className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={!q.trim()}
                className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                Search <ArrowRight className="h-4 w-4" />
              </button>
            </div>

            {/* Intent picker */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {(Object.keys(MODES) as Mode[]).map((m) => {
                const cfg = MODES[m];
                const active = selected === m;
                return (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setSelected(m)}
                    aria-pressed={active}
                    className={
                      "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors " +
                      (active
                        ? "border-primary/60 bg-primary/15 text-foreground"
                        : "border-border bg-surface/60 text-muted-foreground hover:text-foreground hover:border-primary/30")
                    }
                  >
                    <span aria-hidden>{cfg.emoji}</span>
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </form>
        </div>

        {/* Use-case cards */}
        <div className="mx-auto mt-20 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2">
          {(Object.keys(MODES) as Mode[]).map((m) => {
            const cfg = MODES[m];
            const Icon = ICON_MAP[m];
            return (
              <button
                key={m}
                onClick={() => {
                  setMode(m);
                  if (m === "find") navigate({ to: "/" });
                  else setSelected(m);
                  // Scroll back up to focus the search bar
                  if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="zen-card zen-card-hover group flex items-start gap-4 p-6 text-left"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="text-base font-medium text-foreground">{cfg.label}</div>
                  <div className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {cfg.tagline}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 translate-x-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
              </button>
            );
          })}
        </div>

        {/* Principles */}
        <div className="mx-auto mt-20 grid max-w-3xl grid-cols-1 gap-6 text-center sm:grid-cols-3">
          {[
            { title: "No autoplay", body: "You decide what's next." },
            { title: "No infinite scroll", body: "5–7 picks. That's it." },
            { title: "Notes & insights", body: "See where your time goes." },
          ].map((p) => (
            <div key={p.title}>
              <div className="text-sm font-medium text-foreground">{p.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{p.body}</div>
            </div>
          ))}
        </div>

        {!user && (
          <div className="mx-auto mt-16 max-w-md text-center text-sm text-muted-foreground">
            <Link to="/login" search={{ redirect: "/" }} className="text-primary hover:underline">
              Sign in
            </Link>{" "}
            to save notes, history, and insights.
          </div>
        )}
      </div>
    </div>
  );
}
