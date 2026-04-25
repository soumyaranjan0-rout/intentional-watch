import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDuration } from "@/lib/intent";
import { Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({ meta: [{ title: "Library — ZenTube" }] }),
  component: LibraryPage,
});

type Saved = { id: string; video_id: string; title: string | null; channel: string | null; thumbnail: string | null; duration_seconds: number | null };

function LibraryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Saved[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("saved_videos")
      .select("id, video_id, title, channel, thumbnail, duration_seconds")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setItems((data || []) as Saved[]));
  }, [user]);

  const remove = async (id: string) => {
    setItems((it) => it.filter((x) => x.id !== id));
    await supabase.from("saved_videos").delete().eq("id", id);
  };

  return (
    <div className="zen-container py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
      <p className="mt-1 text-sm text-muted-foreground">Videos you've saved for later.</p>

      <div className="mt-8 space-y-3">
        {items.length === 0 ? (
          <div className="zen-card p-6 text-sm text-muted-foreground">Nothing saved yet.</div>
        ) : (
          items.map((it) => (
            <div key={it.id} className="zen-card zen-card-hover group flex items-center gap-4 p-3 sm:p-4">
              <Link
                to="/watch/$videoId"
                params={{ videoId: it.video_id }}
                search={{ title: it.title || "", channel: it.channel || "", duration: it.duration_seconds || 0, thumbnail: it.thumbnail || "", t: 0 }}
                className="flex flex-1 items-center gap-4"
              >
                <div className="aspect-video w-32 shrink-0 overflow-hidden rounded bg-muted sm:w-44">
                  {it.thumbnail && <img src={it.thumbnail} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm font-medium text-foreground sm:text-base">{it.title || "Untitled"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{it.channel}{it.duration_seconds ? ` · ${formatDuration(it.duration_seconds)}` : ""}</div>
                </div>
              </Link>
              <button
                onClick={() => remove(it.id)}
                aria-label="Remove"
                className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-destructive p-2"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
