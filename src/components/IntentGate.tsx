import { useEffect, useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Clock, Repeat, Sparkles, X, ArrowRight } from "lucide-react";
import { useIntentSession } from "@/contexts/IntentSessionContext";
import {
  INTENT_CATEGORIES, categoryMeta, categoryShortLabel, validateIntent, type IntentCategory,
} from "@/lib/relevance";

const SUGGESTIONS: Partial<Record<IntentCategory, string>> = {
  learning: "Learn Power BI DAX basics with worked examples",
  work: "Prepare answers for a product manager interview",
  skill: "Build a small React app step by step",
  news: "Catch up on this week's technology headlines",
  music: "Listen to one calm acoustic album while I work",
  entertainment: "Watch 20 minutes of stand-up comedy and stop",
  fitness: "Follow a 20 minute beginner yoga routine",
  relaxation: "Unwind with rain sounds before sleeping",
  specific: "Find the official trailer for a specific film",
  other: "",
};

/** The declaration form — used both for the launch screen and "Change intent". */
export function IntentForm({
  mode, initialCategory, initialIntent, onSubmit, onCancel,
}: {
  mode: "start" | "change";
  initialCategory?: IntentCategory | null;
  initialIntent?: string;
  onSubmit: (category: IntentCategory, intent: string) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const [category, setCategory] = useState<IntentCategory | null>(initialCategory ?? null);
  const [text, setText] = useState(initialIntent ?? "");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const validation = useMemo(() => validateIntent(text, category), [text, category]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!validation.ok || !category) return;
    setBusy(true);
    try {
      await onSubmit(category, text.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full">
      {/* Compact pill picker — one calm row of choices instead of a wall of cards */}
      <div className="zen-stagger flex flex-wrap gap-1.5">
        {INTENT_CATEGORIES.map((c) => {
          const active = category === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCategory(c.id);
                if (!text.trim() && SUGGESTIONS[c.id]) setText(SUGGESTIONS[c.id] as string);
              }}
              aria-pressed={active}
              className={
                "zen-press inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-all duration-200 " +
                (active
                  ? "border-primary/60 bg-primary/15 text-foreground shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_14%,transparent)]"
                  : "border-border/70 bg-surface/40 text-muted-foreground hover:-translate-y-px hover:border-primary/35 hover:text-foreground")
              }
            >
              <span aria-hidden>{c.emoji}</span>
              <span>{categoryShortLabel(c.id)}</span>
            </button>
          );
        })}
      </div>

      <p className="zen-fade-in mt-2 min-h-[1.1rem] text-xs text-muted-foreground">
        {category ? categoryMeta(category).hint : "Pick the closest fit — you can switch any time."}
      </p>

      <label htmlFor="intent-text" className="mt-5 block text-sm font-medium text-foreground">
        In one sentence, what do you want out of this visit?
      </label>
      <textarea
        id="intent-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => setTouched(true)}
        rows={2}
        placeholder="e.g. Learn Power BI DAX basics with worked examples"
        className="mt-2 w-full resize-none rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm outline-none transition-[border-color,box-shadow] duration-200 focus:border-primary/60 focus:shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_10%,transparent)]"
      />

      <div className="mt-2 min-h-[1.25rem] text-xs" aria-live="polite">
        {touched && !validation.ok ? (
          <span className="text-destructive">{validation.message}</span>
        ) : validation.keywords.length > 0 ? (
          <span className="text-muted-foreground">
            Tracking against: {validation.keywords.slice(0, 6).join(", ")}
          </span>
        ) : (
          <span className="text-muted-foreground">Be specific — vague intentions can't be measured.</span>
        )}
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-medium hover:bg-accent"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !validation.ok}
          className="zen-press inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {mode === "start" ? "Begin" : "Switch intention"}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </form>
  );
}

/** Mandatory launch screen: nothing else is usable until an intention exists. */
export function IntentGate() {
  const { session, ready, declare, idleWarning } = useIntentSession();
  const { location } = useRouterState();
  const exempt = location.pathname.startsWith("/login");

  useEffect(() => {
    if (typeof document === "undefined") return;
    const block = ready && !session && !exempt;
    document.body.style.overflow = block ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [ready, session, exempt]);

  if (!ready || session || exempt) return null;

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-background/90 p-4 backdrop-blur-md">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-8rem] h-[30rem] w-[30rem] -translate-x-1/2 rounded-full"
        style={{ background: "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 18%, transparent), transparent 70%)" }}
      />
      <div className="zen-card zen-fade-in relative mx-auto my-10 w-full max-w-xl overflow-hidden p-6 sm:p-8">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Before you start</span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-[28px]">
          Why are you opening ZenTube?
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          {idleWarning
            ? "Your last session timed out after 15 quiet minutes. Set a fresh intention to continue."
            : "One line is enough. Everything you watch is measured against it — honestly, no judgement."}
        </p>

        <div className="mt-6">
          <IntentForm mode="start" onSubmit={(c, t) => declare(c, t)} />
        </div>
      </div>
    </div>
  );
}

/** Small always-visible chip: current intention category, elapsed time, change / end. */
export function IntentSessionChip() {
  const { session, elapsedSeconds, changeIntent, finish } = useIntentSession();
  const [open, setOpen] = useState(false);
  if (!session) return null;

  const mins = Math.floor(elapsedSeconds / 60);
  const meta = categoryMeta(session.category);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs text-primary transition-colors hover:bg-primary/20 lg:inline-flex"
        title={session.intent}
        aria-label={`Current intention: ${session.intent}`}
      >
        <Clock className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">{categoryShortLabel(session.category)}</span>
        <span className="shrink-0 tabular-nums text-primary/70">{mins}m</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="zen-card zen-fade-in relative my-8 w-full max-w-xl p-6 sm:p-8">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-accent"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 text-primary">
              <Repeat className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em]">
                Current session · {meta.emoji} {categoryShortLabel(session.category)}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">{session.intent}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Active for {mins} minute{mins === 1 ? "" : "s"}. Changing your intention starts a new
              chapter — the earlier one stays on the record.
            </p>
            <div className="mt-6">
              <IntentForm
                mode="change"
                initialCategory={session.category}
                onSubmit={async (c, t) => { await changeIntent(c, t); setOpen(false); }}
                onCancel={() => setOpen(false)}
              />
            </div>
            <button
              onClick={async () => { setOpen(false); await finish(); }}
              className="mt-4 text-xs text-muted-foreground underline hover:text-foreground"
            >
              End this session
            </button>
          </div>
        </div>
      )}
    </>
  );
}
