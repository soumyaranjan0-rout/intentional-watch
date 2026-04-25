import { createFileRoute, useNavigate, redirect, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useSessionState } from "@/contexts/SessionStateContext";
import { MODES, type Mode, getSmartChips } from "@/lib/intent";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";

const VALID: Mode[] = ["learn", "relax", "explore"];

export const Route = createFileRoute("/refine/$mode")({
  head: () => ({ meta: [{ title: "Refine — ZenTube" }] }),
  beforeLoad: ({ params }) => {
    if (!VALID.includes(params.mode as Mode)) {
      throw redirect({ to: "/" });
    }
  },
  component: RefinePage,
});

function RefinePage() {
  const { mode: paramMode } = Route.useParams();
  const m = paramMode as Mode;
  const cfg = MODES[m];
  const navigate = useNavigate();
  const { query, setRefinement, setMode } = useSessionState();

  const [chips, setChips] = useState<string[]>([]);
  const [freeform, setFreeform] = useState("");

  useEffect(() => {
    // If user landed here without a query, send back to home
    if (!query) navigate({ to: "/" });
  }, [query, navigate]);

  const groups = useMemo(() => getSmartChips(m, query), [m, query]);

  if (!query) return null;

  const toggleChip = (label: string) => {
    setChips((cs) => (cs.includes(label) ? cs.filter((c) => c !== label) : [...cs, label]));
  };

  const submit = () => {
    setMode(m);
    setRefinement({ mode: m, freeform: freeform.trim(), chips });
    navigate({ to: "/results" });
  };

  const skip = () => {
    setMode(m);
    setRefinement({ mode: m, freeform: "", chips: [] });
    navigate({ to: "/results" });
  };

  return (
    <div className="zen-container py-12 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Change intent
        </Link>

        <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-3 py-1 text-xs text-muted-foreground">
          <span aria-hidden>{cfg.emoji}</span>
          {cfg.label}
        </div>
        <h1 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Anything specific you're looking for?
        </h1>
        <p className="mt-2 text-muted-foreground">
          For <span className="text-foreground">"{query}"</span> — pick a few hints, or type
          your own. You can also skip this.
        </p>

        <div className="mt-8 zen-card p-5 sm:p-6">
          {/* Free-form input first — primary control */}
          <label className="block text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Describe what you want
          </label>
          <div className="mt-2 flex items-start gap-2 rounded-md border border-border bg-input px-3 py-2 focus-within:border-primary/60">
            <Sparkles className="mt-1 h-4 w-4 shrink-0 text-primary/80" />
            <textarea
              value={freeform}
              onChange={(e) => setFreeform(e.target.value)}
              placeholder={
                m === "learn"
                  ? "e.g. hands-on project, no math, beginner friendly"
                  : m === "relax"
                    ? "e.g. romantic, sad, lofi, old version"
                    : "e.g. 3 best videos, different angles"
              }
              rows={2}
              className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {groups.length > 0 && (
            <div className="mt-6 space-y-5">
              {groups.map((g) => (
                <div key={g.label}>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {g.label}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.chips.map((c) => {
                      const active = chips.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleChip(c)}
                          className={
                            "rounded-full border px-3.5 py-1.5 text-sm transition-colors " +
                            (active
                              ? "border-primary/60 bg-primary/15 text-foreground"
                              : "border-border bg-surface text-muted-foreground hover:text-foreground hover:border-primary/30")
                          }
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-7 flex items-center justify-between gap-3">
            <button
              onClick={skip}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Skip
            </button>
            <button
              onClick={submit}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Show results <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
