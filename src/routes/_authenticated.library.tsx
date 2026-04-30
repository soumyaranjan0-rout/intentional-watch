import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ensureSystemPlaylists } from "@/lib/systemPlaylists";
import { formatDuration } from "@/lib/intent";
import { Clock, Heart, ListVideo, Plus, Trash2, BookmarkIcon } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({ meta: [{ title: "Library — ZenTube" }] }),
  component: LibraryPage,
});

type PlaylistRow = {
  id: string;
  name: string;
  kind: string;
  count: number;
  cover: string | null;
};

function LibraryPage() {
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: playlists, isLoading, refetch } = useQuery<PlaylistRow[]>({
    queryKey: ["library-playlists", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      await ensureSystemPlaylists(user.id);
      const { data: pls } = await supabase
        .from("playlists")
        .select("id, name, kind, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      const enriched = await Promise.all(
        (pls ?? []).map(async (p) => {
          const { count } = await supabase
            .from("playlist_items")
            .select("id", { count: "exact", head: true })
            .eq("playlist_id", p.id);
          const { data: first } = await supabase
            .from("playlist_items")
            .select("thumbnail")
            .eq("playlist_id", p.id)
            .order("position", { ascending: true })
            .limit(1)
            .maybeSingle();
          return {
            id: p.id,
            name: p.name,
            kind: p.kind,
            count: count ?? 0,
            cover: first?.thumbnail ?? null,
          } as PlaylistRow;
        }),
      );

      const sysOrder = ["watch_later", "liked"];
      const sys = enriched
        .filter((p) => sysOrder.includes(p.kind))
        .sort((a, b) => sysOrder.indexOf(a.kind) - sysOrder.indexOf(b.kind));
      const rest = enriched.filter((p) => !sysOrder.includes(p.kind));
      return [...sys, ...rest];
    },
  });

  const { data: savedFlat } = useQuery({
    queryKey: ["library-saved-videos", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("saved_videos")
        .select("id, video_id, title, channel, thumbnail, duration_seconds, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(24);
      return data ?? [];
    },
  });

  const createPlaylist = async () => {
    if (!user) return;
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase
      .from("playlists")
      .insert({ user_id: user.id, name, kind: "general" });
    if (error) {
      toast.error("Could not create playlist");
      return;
    }
    setNewName("");
    setCreating(false);
    toast.success(`Created "${name}"`);
    refetch();
  };

  const deletePlaylist = async (p: PlaylistRow) => {
    if (p.kind === "watch_later" || p.kind === "liked") {
      toast.error("Default libraries can't be deleted");
      return;
    }
    if (!confirm(`Delete "${p.name}" and all its items?`)) return;
    await supabase.from("playlists").delete().eq("id", p.id);
    refetch();
  };

  const removeSaved = async (id: string) => {
    await supabase.from("saved_videos").delete().eq("id", id);
    // refetch via query invalidation: simplest = refetch by query key
    refetch();
  };

  return (
    <div className="zen-container py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your collections, saves and likes — all in one place.
          </p>
        </div>
        {!creating ? (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> New playlist
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createPlaylist();
                if (e.key === "Escape") { setCreating(false); setNewName(""); }
              }}
              placeholder="Playlist name"
              maxLength={64}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
            />
            <button
              onClick={createPlaylist}
              disabled={!newName.trim()}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              Create
            </button>
            <button
              onClick={() => { setCreating(false); setNewName(""); }}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Playlists grid */}
      <section className="mt-8">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Playlists
        </h2>
        {isLoading ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="zen-card p-4">
                <div className="zen-skeleton aspect-video w-full" />
                <div className="zen-skeleton mt-3 h-4 w-2/3" />
              </div>
            ))}
          </div>
        ) : !playlists || playlists.length === 0 ? (
          <div className="zen-card mt-4 p-6 text-sm text-muted-foreground">No playlists yet.</div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {playlists.map((p) => (
              <PlaylistTile key={p.id} p={p} onDelete={() => deletePlaylist(p)} />
            ))}
          </div>
        )}
      </section>

      {/* Saved videos (legacy) */}
      <section className="mt-12">
        <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Recently saved
        </h2>
        <div className="mt-4 space-y-3">
          {!savedFlat || savedFlat.length === 0 ? (
            <div className="zen-card p-6 text-sm text-muted-foreground">
              Nothing saved yet. Use the <BookmarkIcon className="inline h-3.5 w-3.5 align-text-bottom" /> Save button on any video.
            </div>
          ) : (
            savedFlat.map((it) => (
              <div key={it.id} className="zen-card zen-card-hover group flex items-center gap-4 p-3 sm:p-4">
                <Link
                  to="/watch/$videoId"
                  params={{ videoId: it.video_id }}
                  search={{ title: it.title || "", channel: it.channel || "", duration: it.duration_seconds || 0, thumbnail: it.thumbnail || "", t: 0, intent: "" }}
                  className="flex flex-1 items-center gap-4"
                >
                  <div className="aspect-video w-32 shrink-0 overflow-hidden rounded bg-muted sm:w-44">
                    {it.thumbnail && <img src={it.thumbnail} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-sm font-medium text-foreground sm:text-base">{it.title || "Untitled"}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {it.channel}{it.duration_seconds ? ` · ${formatDuration(it.duration_seconds)}` : ""}
                    </div>
                  </div>
                </Link>
                <button
                  onClick={() => removeSaved(it.id)}
                  aria-label="Remove"
                  className="p-2 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function PlaylistTile({ p, onDelete }: { p: PlaylistRow; onDelete: () => void }) {
  const isSystem = p.kind === "watch_later" || p.kind === "liked";
  const Icon = p.kind === "watch_later" ? Clock : p.kind === "liked" ? Heart : ListVideo;
  return (
    <div className="zen-card zen-card-hover group relative overflow-hidden">
      <Link
        to="/library/$playlistId"
        params={{ playlistId: p.id }}
        className="block"
      >
        <div className="relative aspect-video w-full bg-gradient-to-br from-primary/15 to-surface">
          {p.cover ? (
            <img src={p.cover} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon className="h-10 w-10 text-primary/60" />
            </div>
          )}
          <div className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-background/85 px-1.5 py-0.5 text-xs text-foreground">
            <ListVideo className="h-3 w-3" /> {p.count}
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <div className="truncate text-sm font-medium text-foreground">{p.name}</div>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {p.count} {p.count === 1 ? "video" : "videos"}
            {isSystem && " · default"}
          </div>
        </div>
      </Link>
      {!isSystem && (
        <button
          onClick={onDelete}
          aria-label="Delete playlist"
          className="absolute right-2 top-2 rounded-full bg-background/80 p-1.5 text-muted-foreground opacity-0 backdrop-blur transition-opacity hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
