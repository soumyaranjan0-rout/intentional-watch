import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { MODES, type Mode, formatDuration } from "@/lib/intent";
import { Skeleton } from "@/components/ui/skeleton";

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
  watched_at: string;
  watch_seconds: number;
};

function HistoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<H[] | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("watch_history")
      .select("id, video_id, title, channel, thumbnail, mode, watched_at, watch_seconds")
      .eq("user_id", user.id)
      .order("watched_at", { ascending: false })
      .limit(100)
      .then(({ data }) => setItems((data || []) as H[]));
  }, [user]);

  return (
    <div className="zen-container py-10">
      <h1 className="text-3xl font-semibold tracking-tight">History</h1>
      <p className="mt-1 text-sm text-muted-foreground">Your last 100 watched videos.</p>

      <div className="mt-8 space-y-3">
        {items === null ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))
        ) : items.length === 0 ? (
          <div className="zen-card p-6 text-sm text-muted-foreground">No history yet.</div>
        ) : (
          items.map((it) => {
            const m = MODES[it.mode as Mode];
            return (
              <Link
                key={it.id}
                to="/watch/$videoId"
                params={{ videoId: it.video_id }}
                search={{
                  title: it.title || "",
                  channel: it.channel || "",
                  duration: 0,
                  thumbnail: it.thumbnail || "",
                }}
                className="zen-card zen-card-hover flex items-center gap-4 p-3 sm:p-4"
              >
                <div className="aspect-video w-32 shrink-0 overflow-hidden rounded bg-muted sm:w-44">
                  {it.thumbnail && (
                    <img
                      src={it.thumbnail}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm font-medium text-foreground sm:text-base">
                    {it.title || "Untitled"}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{it.channel}</span>
                    <span>·</span>
                    <span>{m ? `${m.emoji} ${m.label}` : it.mode}</span>
                    <span>·</span>
                    <span>{formatDuration(it.watch_seconds)} watched</span>
                    <span>·</span>
                    <span>{new Date(it.watched_at).toLocaleString()}</span>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
