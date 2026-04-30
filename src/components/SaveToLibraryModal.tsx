import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ensureSystemPlaylists } from "@/lib/systemPlaylists";
import { toast } from "sonner";
import { BookmarkIcon, Check, Clock, Heart, ListVideo, Loader2, Plus, X } from "lucide-react";

type SaveTarget = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationSeconds: number;
};

export function SaveToLibraryModal({
  target,
  onClose,
  onSaved,
}: {
  target: SaveTarget;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { data: playlists, isLoading } = useQuery({
    queryKey: ["my-playlists", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      // Make sure the two system playlists exist before listing
      await ensureSystemPlaylists(user.id);
      const { data, error } = await supabase
        .from("playlists")
        .select("id, name, kind, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      // System playlists first, then user-created
      const sys = (data ?? []).filter((p) => p.kind === "watch_later" || p.kind === "liked");
      const rest = (data ?? []).filter((p) => p.kind !== "watch_later" && p.kind !== "liked");
      const sysOrder = ["watch_later", "liked"];
      sys.sort((a, b) => sysOrder.indexOf(a.kind) - sysOrder.indexOf(b.kind));
      return [...sys, ...rest];
    },
  });

  // Which playlists already contain this video
  const { data: existingIn } = useQuery({
    queryKey: ["video-in-playlists", user?.id, target.videoId],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return new Set<string>();
      const { data, error } = await supabase
        .from("playlist_items")
        .select("playlist_id")
        .eq("user_id", user.id)
        .eq("video_id", target.videoId);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.playlist_id));
    },
  });

  const saveTo = async (playlistId: string) => {
    if (!user) return;
    setSavingId(playlistId);
    try {
      // Get next position in the playlist
      const { data: last } = await supabase
        .from("playlist_items")
        .select("position")
        .eq("playlist_id", playlistId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextPos = (last?.position ?? -1) + 1;

      const { error } = await supabase.from("playlist_items").insert({
        user_id: user.id,
        playlist_id: playlistId,
        video_id: target.videoId,
        title: target.title,
        channel: target.channel,
        thumbnail: target.thumbnail,
        duration_seconds: target.durationSeconds,
        position: nextPos,
      });
      if (error) throw error;

      // Also mirror into saved_videos so the legacy Library page shows it
      await supabase.from("saved_videos").upsert(
        {
          user_id: user.id,
          video_id: target.videoId,
          title: target.title,
          channel: target.channel,
          thumbnail: target.thumbnail,
          duration_seconds: target.durationSeconds,
        },
        { onConflict: "user_id,video_id", ignoreDuplicates: true } as never,
      );

      toast.success("Saved to library");
      qc.invalidateQueries({ queryKey: ["video-in-playlists"] });
      qc.invalidateQueries({ queryKey: ["my-playlists"] });
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSavingId(null);
    }
  };

  const createAndSave = async () => {
    if (!user) return;
    const name = newName.trim();
    if (!name) return;
    setSavingId("__new__");
    try {
      const { data: pl, error } = await supabase
        .from("playlists")
        .insert({ user_id: user.id, name, kind: "general" })
        .select("id")
        .single();
      if (error || !pl) throw error || new Error("Failed to create");
      await saveTo(pl.id);
      setCreating(false);
      setNewName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create");
      setSavingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="zen-card zen-fade-in w-full max-w-md overflow-hidden p-0 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Save to library"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <BookmarkIcon className="h-4 w-4 text-primary" />
            <div className="text-base font-medium text-foreground">Save to library</div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-3 py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !playlists || playlists.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              No libraries yet. Create your first one below.
            </div>
          ) : (
            <ul className="space-y-1">
              {playlists.map((p) => {
                const already = existingIn?.has(p.id);
                const busy = savingId === p.id;
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => !already && saveTo(p.id)}
                      disabled={!!already || !!savingId}
                      className={
                        "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm transition-colors " +
                        (already
                          ? "cursor-default bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent")
                      }
                    >
                      <span className="min-w-0 truncate">{p.name}</span>
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : already ? (
                        <span className="inline-flex items-center gap-1 text-xs">
                          <Check className="h-3.5 w-3.5" /> Saved
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Save here</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border/60 bg-surface/40 p-3">
          {creating ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createAndSave();
                  if (e.key === "Escape") setCreating(false);
                }}
                placeholder="Library name"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                maxLength={64}
              />
              <button
                onClick={createAndSave}
                disabled={!newName.trim() || savingId === "__new__"}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {savingId === "__new__" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                Create
              </button>
              <button
                onClick={() => { setCreating(false); setNewName(""); }}
                className="rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background/60 py-2.5 text-sm text-foreground hover:border-primary/50 hover:text-primary"
            >
              <Plus className="h-4 w-4" /> Create new library
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
