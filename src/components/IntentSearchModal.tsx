import { useEffect, useState } from "react";
import { ArrowRight, X, Brain, Coffee, Search as SearchIcon, Sparkles } from "lucide-react";
import { MODES, type Mode } from "@/lib/intent";

const DESCRIPTIONS: Record<Mode, { title: string; body: string }> = {
  learn: {
    title: "Tutorials, courses & explainers",
    body: "Tuned for structured, in-depth content. Notes panel and focus tools enabled.",
  },
  relax: {
    title: "Wind down without the rabbit hole",
    body: "Music, comedy, easy watching. Minimal UI, gentle nudges so you don't lose track of time.",
  },
  find: {
    title: "Get to the right video, fast",
    body: "Best-match first. We'll surface the official or most relevant single video.",
  },
  explore: {
    title: "A few high-quality picks",
    body: "Curated set around a topic — different angles, no infinite list.",
  },
};

const ICONS: Record<Mode, React.ComponentType<{ className?: string }>> = {
  learn: Brain,
  relax: Coffee,
  find: SearchIcon,
  explore: Sparkles,
};

export function IntentSearchModal({
  query,
  initial = "learn",
  onClose,
  onConfirm,
}: {
  query: string;
  initial?: Mode;
  onClose: () => void;
  onConfirm: (mode: Mode) => void;
}) {
  const [selected, setSelected] = useState<Mode>(initial);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter") onConfirm(selected);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onConfirm, selected]);

  const order: Mode[] = ["learn", "relax", "find", "explore"];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="zen-card zen-fade-in relative my-auto w-full max-w-2xl overflow-hidden p-0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Choose intent"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Why are you here?
            </div>
            <div className="mt-1 truncate text-base font-medium text-foreground">
              <span className="text-muted-foreground">Searching:</span> "{query}"
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-2 gap-2 px-5 pt-4 sm:grid-cols-4">
          {order.map((m) => {
            const Icon = ICONS[m];
            const active = selected === m;
            return (
              <button
                key={m}
                onClick={() => setSelected(m)}
                className={
                  "group relative flex flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition-all " +
                  (active
                    ? "border-primary/60 bg-primary/10 shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_15%,transparent)]"
                    : "border-border bg-surface/50 hover:border-primary/30 hover:bg-surface")
                }
              >
                <Icon className={"h-4 w-4 " + (active ? "text-primary" : "text-muted-foreground")} />
                <div className={"text-sm font-medium " + (active ? "text-foreground" : "text-foreground/90")}>
                  {MODES[m].label.replace(" / Entertainment", "").replace(" / Discover", "")}
                </div>
              </button>
            );
          })}
        </div>

        {/* Description of selected */}
        <div className="px-5 pb-2 pt-4">
          <div className="rounded-lg bg-surface/60 p-4">
            <div className="text-sm font-medium text-foreground">{DESCRIPTIONS[selected].title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{DESCRIPTIONS[selected].body}</p>
          </div>
        </div>

        {/* Action */}
        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-4">
          <p className="text-xs text-muted-foreground">Press <kbd className="rounded bg-surface px-1.5 py-0.5 text-[10px] text-foreground">Enter</kbd> to continue</p>
          <button
            onClick={() => onConfirm(selected)}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Continue with {MODES[selected].label.split(" /")[0]} <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
