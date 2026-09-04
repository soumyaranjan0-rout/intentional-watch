import { supabase } from "@/integrations/supabase/client";

/** Compact, privacy-light summary of what the person actually watched.
 *  Used only to nudge ranking towards familiar, trusted sources — never to
 *  create feedback loops: already-watched videos are demoted, not repeated. */
export type WatchAffinity = {
  channels: string[];
  topics: string[];
  watched: string[];
};

export const EMPTY_AFFINITY: WatchAffinity = { channels: [], topics: [], watched: [] };

const CACHE_KEY = "zentube.affinity.v1";
const CACHE_TTL = 10 * 60 * 1000;

const STOP = new Set([
  "the", "and", "for", "with", "video", "videos", "new", "latest", "best", "top", "you",
  "your", "this", "that", "from", "into", "what", "how", "why", "full", "part", "official",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOP.has(t));
}

function readCache(): WatchAffinity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: WatchAffinity };
    if (!parsed?.at || Date.now() - parsed.at > CACHE_TTL) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function loadWatchAffinity(): Promise<WatchAffinity> {
  if (typeof window === "undefined") return EMPTY_AFFINITY;
  const cached = readCache();
  if (cached) return cached;

  try {
    const { data, error } = await supabase
      .from("watch_history")
      .select("video_id, channel, title, effective_seconds")
      .order("watched_at", { ascending: false })
      .limit(120);
    if (error || !data) return EMPTY_AFFINITY;

    const channelSeconds = new Map<string, number>();
    const topicCount = new Map<string, number>();
    const watched: string[] = [];

    for (const row of data) {
      if (row.video_id) watched.push(row.video_id);
      const seconds = row.effective_seconds ?? 0;
      // Only meaningful viewing counts as a signal.
      if (seconds < 60) continue;
      if (row.channel) {
        const key = row.channel.toLowerCase();
        channelSeconds.set(key, (channelSeconds.get(key) ?? 0) + seconds);
      }
      for (const token of tokenize(row.title ?? "")) {
        topicCount.set(token, (topicCount.get(token) ?? 0) + 1);
      }
    }

    const affinity: WatchAffinity = {
      channels: [...channelSeconds.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([name]) => name),
      topics: [...topicCount.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 24)
        .map(([token]) => token),
      watched: watched.slice(0, 80),
    };

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: affinity }));
    } catch { /* private mode */ }
    return affinity;
  } catch {
    return EMPTY_AFFINITY;
  }
}
