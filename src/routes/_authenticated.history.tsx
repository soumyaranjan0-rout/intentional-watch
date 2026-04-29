import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MODES, type Mode, formatDuration } from "@/lib/intent";
import { Skeleton } from "@/components/ui/skeleton";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "History — ZenTube" }] }),
  component: HistoryPage,
});

type H = {
  id: string;
  video_id: string;
  title: string | null;
  channel: string | null;
  thumbnail: string | null;
  mode: string;
  final_intent: string | null;
  watched_at: string;
  watch_seconds: number;
  effective_seconds: number;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayLabel(date: Date) {
  const today = startOfDay(new Date());
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const d = startOfDay(date);
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yest.getTime()) return "Yesterday";
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

function HistoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<H[] | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<null | {
    title: string;
    body: string;
    run: () => Promise<void>;
  }>(null);

  const load = () => {
    if (!user) return;
    supabase
      .from("watch_history")
      .select("id, video_id, title, channel, thumbnail, mode, final_intent, watched_at, watch_seconds, effective_seconds")
      .eq("user_id", user.id)
      .order("watched_at", { ascending: false })
      .limit(500)
      .then(({ data }) => setItems((data || []) as H[]));
  };

  useEffect(load, [user]);

  // Group by day
  const groups = useMemo(() => {
    if (!items) return null;
    const map = new Map<number, { date: Date; rows: H[] }>();
    for (const r of items) {
      const day = startOfDay(new Date(r.watched_at));
      const k = day.getTime();
      if (!map.has(k)) map.set(k, { date: day, rows: [] });
      map.get(k)!.rows.push(r);
    }
    return Array.from(map.values()).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [items]);

  const removeOne = async (id: string) => {
    setItems((cur) => (cur ?? []).filter((x) => x.id !== id));
    await supabase.from("watch_history").delete().eq("id", id);
  };

  const clearDay = (date: Date) => {
    if (!user) return;
    setConfirmOpen({
      title: `Clear history from ${dayLabel(date)}?`,
      body: "This will remove every video you watched on this day from your history. This can't be undone.",
      run: async () => {
        const start = startOfDay(date).toISOString();
        const end = new Date(startOfDay(date).getTime() + 24 * 60 * 60 * 1000).toISOString();
        await supabase.from("watch_history").delete()
          .eq("user_id", user.id)
          .gte("watched_at", start)
          .lt("watched_at", end);
        toast.success(`Cleared ${dayLabel(date)}`);
        load();
      },
    });
  };

  const clearAll = () => {
    if (!user) return;
    setConfirmOpen({
      title: "Clear all watch history?",
      body: "Every video in your history will be removed permanently. Insights based on history will reset too.",
      run: async () => {
        await supabase.from("watch_history").delete().eq("user_id", user.id);
        toast.success("Cleared all history");
        load();
      },
    });
  };

  const clearLastDays = (days: number, label: string) => {
    if (!user) return;
    setConfirmOpen({
      title: `Clear history from ${label}?`,
      body: `Every video watched in ${label} will be removed permanently.`,
      run: async () => {
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        await supabase.from("watch_history").delete()
          .eq("user_id", user.id)
          .gte("watched_at", since);
        toast.success(`Cleared ${label}`);
        load();
      },
    });
  };

  return (
    <div className="zen-container py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">History</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your most recent {items?.length ?? 0} watched videos. Time shown is what you actually watched.
          </p>
        </div>

        {/* Clear-history menu (YouTube-style) */}
        <details className="group relative">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-1.5 text-sm text-foreground hover:border-primary/40 hover:bg-accent">
            <Trash2 className="h-3.5 w-3.5" /> Clear history
          </summary>
          <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-popover/95 p-1 shadow-2xl backdrop-blur-xl zen-fade-in">
            <ClearOption onClick={() => clearLastDays(1, "the last 24 hours")}>Last 24 hours</ClearOption>
            <ClearOption onClick={() => clearLastDays(7, "the last 7 days")}>Last 7 days</ClearOption>
            <ClearOption onClick={() => clearLastDays(30, "the last 30 days")}>Last 30 days</ClearOption>
            <div className="my-1 h-px bg-border/60" />
            <ClearOption danger onClick={clearAll}>All time</ClearOption>
          </div>
        </details>
      </div>

      <div className="mt-8 space-y-8">
        {groups === null ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : groups.length === 0 ? (
          <div className="zen-card p-6 text-sm text-muted-foreground">No history yet.</div>
        ) : (
          groups.map((g) => (
            <section key={g.date.getTime()}>
              {/* Date header — top-left, YouTube-style */}
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-semibold tracking-tight text-foreground">
                  {dayLabel(g.date)}
                </h2>
                <button
                  onClick={() => clearDay(g.date)}
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Trash2 className="h-3 w-3" /> Clear day
                </button>
              </div>
              <div className="space-y-3">
                {g.rows.map((it) => {
                  const intent = (it.final_intent || it.mode) as Mode;
                  const m = MODES[intent];
                  return (
                    <div key={it.id} className="zen-card zen-card-hover group flex items-center gap-4 p-3 sm:p-4">
                      <Link
                        to="/watch/$videoId"
                        params={{ videoId: it.video_id }}
                        search={{
                          title: it.title || "",
                          channel: it.channel || "",
                          duration: 0,
                          thumbnail: it.thumbnail || "",
                          t: 0,
                          intent,
                        }}
                        className="flex flex-1 items-center gap-4"
                      >
                        <div className="aspect-video w-32 shrink-0 overflow-hidden rounded bg-muted sm:w-44">
                          {it.thumbnail && (
                            <img src={it.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-sm font-medium text-foreground sm:text-base">
                            {it.title || "Untitled"}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{it.channel}</span>
                            <span>·</span>
                            <span>{m ? `${m.emoji} ${m.label}` : intent}</span>
                            <span>·</span>
                            <span>{formatDuration(it.effective_seconds || it.watch_seconds)} watched</span>
                            <span>·</span>
                            <span>{new Date(it.watched_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                          </div>
                        </div>
                      </Link>
                      <button
                        onClick={() => removeOne(it.id)}
                        aria-label="Remove from history"
                        className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive p-2"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setConfirmOpen(null)}>
          <div className="zen-card zen-fade-in w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{confirmOpen.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{confirmOpen.body}</p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(null)}
                className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={async () => { const fn = confirmOpen.run; setConfirmOpen(null); await fn(); }}
                className="rounded-full bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ClearOption({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={(e) => { (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open"); onClick(); }}
      className={
        "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors " +
        (danger ? "text-destructive hover:bg-destructive/10" : "text-foreground hover:bg-accent")
      }
    >
      {children}
    </button>
  );
}
