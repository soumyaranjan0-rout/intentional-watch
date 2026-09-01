import { useState } from "react";
import { ArrowRight, Brain, Coffee, Search as SearchIcon, Sparkles } from "lucide-react";
import { MODES, type Mode } from "@/lib/intent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

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

  const order: Mode[] = ["learn", "relax", "find", "explore"];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="intent-dialog max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto border-border/70 bg-popover/95 p-0 shadow-2xl sm:rounded-2xl">
        <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-5 pr-12 text-left sm:px-6">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Choose your intention</div>
          <DialogTitle className="mt-1 text-xl sm:text-2xl">What would make this visit worthwhile?</DialogTitle>
          <DialogDescription className="mt-1 line-clamp-2">We’ll shape a small, focused set of results for “{query}”.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-2.5 px-4 pt-4 sm:grid-cols-2 sm:px-6">
          {order.map((m) => {
            const Icon = ICONS[m];
            const active = selected === m;
            return (
              <Button
                key={m}
                type="button"
                variant="outline"
                onClick={() => setSelected(m)}
                aria-pressed={active}
                className={
                  "intent-option h-auto min-h-20 w-full justify-start gap-3 whitespace-normal rounded-xl px-4 py-3 text-left " +
                  (active
                    ? "border-primary/60 bg-primary/15 text-foreground ring-2 ring-primary/20"
                    : "border-border bg-surface/50 text-foreground hover:border-primary/35 hover:bg-accent")
                }
              >
                <span className={"grid h-10 w-10 shrink-0 place-items-center rounded-full " + (active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{MODES[m].label.replace(" / Entertainment", "").replace(" / Discover", "")}</div>
                  <div className="mt-0.5 text-xs font-normal leading-relaxed text-muted-foreground">{DESCRIPTIONS[m].title}</div>
                </div>
              </Button>
            );
          })}
        </div>

        <div className="mx-4 mt-4 rounded-xl border border-border/60 bg-surface/60 p-4 sm:mx-6" aria-live="polite">
          <div className="text-sm font-semibold text-foreground">{DESCRIPTIONS[selected].title}</div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{DESCRIPTIONS[selected].body}</p>
        </div>

        <div className="mt-4 grid gap-3 border-t border-border/60 px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6">
          <p className="text-xs text-muted-foreground">A deliberate choice now keeps the rest of your session focused.</p>
          <Button
            onClick={() => onConfirm(selected)}
            className="min-h-11 w-full rounded-full px-5 sm:w-auto"
          >
            Continue with {MODES[selected].label.split(" /")[0]} <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
