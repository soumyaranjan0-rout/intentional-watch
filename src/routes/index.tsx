import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { Mode } from "@/lib/intent";
import { useSessionState } from "@/contexts/SessionStateContext";
import { useAuth } from "@/contexts/AuthContext";
import { ZenLogo } from "@/components/ZenLogo";
import { IntentSearchModal } from "@/components/IntentSearchModal";
import { ResumeBanner } from "@/components/ResumeBanner";
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
  const { setMode, setQuery, resetSession } = useSessionState();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => { resetSession(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const onSearch = (e: React.FormEvent) => {
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
    if (mode === "find") navigate({ to: "/results" });
    else navigate({ to: "/refine/$mode", params: { mode } });
  };

  return (
    <div className="zen-hero-bg relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-10rem] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 16%, transparent), transparent 70%)" }}
      />

      <div className="zen-container relative py-20 sm:py-28">
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
            <div className="zen-card zen-search-glow flex items-center gap-1 rounded-full border bg-card/80 p-1.5 pl-5 backdrop-blur">
              <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="What are you looking for?"
                className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-muted-foreground"
                autoFocus
              />
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
              We'll ask why you're here — then tune results to match.
            </p>
          </form>
        </div>

        <ResumeBanner />

        {!user && (
          <div className="mx-auto mt-16 max-w-md text-center text-sm text-muted-foreground">
            <Link to="/login" search={{ redirect: "/" }} className="text-primary hover:underline">Sign in</Link>{" "}
            to save notes, history, and insights.
          </div>
        )}
      </div>

      {open && (
        <IntentSearchModal
          query={q.trim()}
          initial="learn"
          onClose={() => setOpen(false)}
          onConfirm={onConfirm}
        />
      )}
    </div>
  );
}
