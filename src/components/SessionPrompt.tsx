import { Sparkles } from "lucide-react";

export function SessionPrompt({ onContinue, onExit }: { onContinue: () => void; onExit: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="zen-card w-full max-w-md p-6 zen-fade-in">
        <div className="flex items-center gap-2 text-primary">
          <Sparkles className="h-5 w-5" />
          <span className="text-xs font-medium uppercase tracking-wider">Quick check-in</span>
        </div>
        <h2 className="mt-3 text-lg font-semibold text-foreground">Still intentional, or just browsing?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You've watched a couple of videos. Take a breath — does the next one really match what you came for?
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            onClick={onExit}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            I'll stop here
          </button>
          <button
            onClick={onContinue}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Still on purpose — continue
          </button>
        </div>
      </div>
    </div>
  );
}
