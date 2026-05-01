import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDuration } from "@/lib/intent";
import { ArrowLeft, Clock, Heart, ListVideo, Loader2, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/library/$playlistId")({
  head: () => ({ meta: [{ title: "Playlist — ZenTube" }] }),
  component: UserPlaylistPage,
  errorComponent: ({ error }) => (
    <div className="zen-container py-16 text-center">
      <h2 className="text-xl font-semibold">Couldn't open this library</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      <Link to="/library" className="mt-6 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
        Back to library
      </Link>
    </div>
  ),
});

function UserPlaylistPage() {
  const { playlistId } = Route.useParams();
  const { user } = useAuth();
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["user-playlist", playlistId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data: pl, error } = await supabase
        .from("playlists")
        .select("id, name, kind")
        .eq("id", playlistId)
        .maybeSingle();
      if (error) throw error;
      if (!pl) throw new Error("Playlist not found");

      const { data: items } = await supabase
        .from("playlist_items")
        .select("id, video_id, title, channel, thumbnail, duration_seconds, position")
        .eq("playlist_id", playlistId)
        .order("position", { ascending: true });

      return { playlist: pl, items: items ?? [] };
    },
  });

  const removeItem = async (id: string) => {
    setRemoving(id);
    const { error } = await supabase.from("playlist_items").delete().eq("id", id);
    setRemoving(null);
    if (error) toast.error("Could not remove");
    else { toast.success("Removed"); refetch(); }
  };

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="zen-container py-16 text-center">
        <p className="text-sm text-muted-foreground">This playlist could not be loaded.</p>
        <Link to="/library" className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          Back to library
        </Link>
      </div>
    );
  }
  const { playlist, items } = data;
  const Icon = playlist.kind === "watch_later" ? Clock : playlist.kind === "liked" ? Heart : ListVideo;

  return (
    <div className="zen-container py-8 sm:py-10">
      <button
        onClick={() => router.history.back()}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{playlist.name}</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? "video" : "videos"}
          </p>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {items.length === 0 ? (
          <div className="zen-card p-6 text-sm text-muted-foreground">
            This playlist is empty.
          </div>
        ) : (
          items.map((it, i) => (
            <div key={it.id} className="zen-card zen-card-hover group flex items-center gap-4 p-3 sm:p-4">
              <div className="w-6 shrink-0 text-center text-sm tabular-nums text-muted-foreground">
                {i + 1}
              </div>
              <Link
                to="/watch/$videoId"
                params={{ videoId: it.video_id }}
                search={{ title: it.title || "", channel: it.channel || "", duration: it.duration_seconds || 0, thumbnail: it.thumbnail || "", t: 0, intent: "" }}
                className="flex flex-1 items-center gap-4"
              >
                <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded bg-muted sm:w-44">
                  {it.thumbnail && <img src={it.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                    <Play className="h-7 w-7 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-2 text-sm font-medium text-foreground sm:text-base">{it.title || "Untitled"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {it.channel}{it.duration_seconds ? ` · ${formatDuration(it.duration_seconds)}` : ""}
                  </div>
                </div>
              </Link>
              <button
                onClick={() => removeItem(it.id)}
                disabled={removing === it.id}
                aria-label="Remove from playlist"
                className="p-2 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              >
                {removing === it.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
