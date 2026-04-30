import { supabase } from "@/integrations/supabase/client";

export const SYSTEM_KINDS = {
  watch_later: { kind: "watch_later", name: "Watch Later" },
  liked: { kind: "liked", name: "Liked Videos" },
} as const;

export type SystemKind = keyof typeof SYSTEM_KINDS;

/** Ensure the two default system playlists exist for the user. Returns a map kind -> id. */
export async function ensureSystemPlaylists(userId: string): Promise<Record<SystemKind, string>> {
  const { data: existing } = await supabase
    .from("playlists")
    .select("id, kind")
    .eq("user_id", userId)
    .in("kind", ["watch_later", "liked"]);

  const out: Partial<Record<SystemKind, string>> = {};
  for (const row of existing ?? []) {
    if (row.kind === "watch_later" || row.kind === "liked") {
      out[row.kind as SystemKind] = row.id;
    }
  }

  const toCreate = (Object.keys(SYSTEM_KINDS) as SystemKind[]).filter((k) => !out[k]);
  if (toCreate.length) {
    const { data: created } = await supabase
      .from("playlists")
      .insert(
        toCreate.map((k) => ({
          user_id: userId,
          kind: SYSTEM_KINDS[k].kind,
          name: SYSTEM_KINDS[k].name,
        })),
      )
      .select("id, kind");
    for (const row of created ?? []) {
      if (row.kind === "watch_later" || row.kind === "liked") {
        out[row.kind as SystemKind] = row.id;
      }
    }
  }

  return out as Record<SystemKind, string>;
}

export type SaveTarget = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  durationSeconds: number;
};

/** Add a video to a system playlist (idempotent — returns true if newly added). */
export async function addToSystemPlaylist(
  userId: string,
  kind: SystemKind,
  v: SaveTarget,
): Promise<boolean> {
  const ids = await ensureSystemPlaylists(userId);
  const playlistId = ids[kind];

  // Already there?
  const { data: existing } = await supabase
    .from("playlist_items")
    .select("id")
    .eq("playlist_id", playlistId)
    .eq("video_id", v.videoId)
    .maybeSingle();
  if (existing) return false;

  const { data: last } = await supabase
    .from("playlist_items")
    .select("position")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPos = (last?.position ?? -1) + 1;

  await supabase.from("playlist_items").insert({
    user_id: userId,
    playlist_id: playlistId,
    video_id: v.videoId,
    title: v.title,
    channel: v.channel,
    thumbnail: v.thumbnail,
    duration_seconds: v.durationSeconds,
    position: nextPos,
  });
  return true;
}

export async function removeFromSystemPlaylist(
  userId: string,
  kind: SystemKind,
  videoId: string,
): Promise<void> {
  const ids = await ensureSystemPlaylists(userId);
  await supabase
    .from("playlist_items")
    .delete()
    .eq("playlist_id", ids[kind])
    .eq("video_id", videoId);
}

export async function isInSystemPlaylist(
  userId: string,
  kind: SystemKind,
  videoId: string,
): Promise<boolean> {
  const ids = await ensureSystemPlaylists(userId);
  const { data } = await supabase
    .from("playlist_items")
    .select("id")
    .eq("playlist_id", ids[kind])
    .eq("video_id", videoId)
    .maybeSingle();
  return !!data;
}
