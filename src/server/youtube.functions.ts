import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseISODuration, type Mode, type ResultVideo } from "@/lib/intent";

const SearchInput = z.object({
  query: z.string().min(1).max(300),
  mode: z.enum(["learn", "relax", "find", "explore"]),
  freeform: z.string().max(300).optional(),
  chips: z.array(z.string()).max(20).optional(),
  maxResults: z.number().int().min(3).max(15).optional(),
  variation: z.number().int().min(0).max(20).optional(),
  pageToken: z.string().max(200).optional(),
});

type Input = z.infer<typeof SearchInput>;

const YT_BASE = "https://www.googleapis.com/youtube/v3";

// Variation tweaks let the "Refresh" button surface different relevant videos
const VARIATION_SUFFIX = [
  "",
  "best",
  "explained",
  "complete",
  "popular",
  "recommended",
  "in depth",
  "top",
];

// --- Smart query intent detection ----------------------------------------
// Inspects the raw query for freshness/creator/content hints and rewrites
// the YouTube query + sort order accordingly.
const FRESHNESS_RX = /\b(new|latest|recent|today|just\s+uploaded|upload|this\s+week)\b/i;
const CONTENT_TYPE_RX: Array<{ rx: RegExp; add: string }> = [
  { rx: /\bsong\b|\bmusic\b/i, add: "official audio" },
  { rx: /\btrailer\b/i, add: "official trailer" },
  { rx: /\binterview\b/i, add: "interview" },
  { rx: /\bfull\s+movie\b/i, add: "full movie" },
];

export function detectQueryIntent(raw: string): {
  cleaned: string;
  freshness: boolean;
  contentHint: string | null;
  hint: string | null;
} {
  const q = raw.trim();
  const freshness = FRESHNESS_RX.test(q);
  let contentHint: string | null = null;
  for (const c of CONTENT_TYPE_RX) {
    if (c.rx.test(q)) { contentHint = c.add; break; }
  }
  // Strip freshness keywords from the channel/topic phrase so the search
  // matches the actual creator/topic instead of fighting the keyword.
  const cleaned = q.replace(FRESHNESS_RX, "").replace(/\s+/g, " ").trim() || q;

  let hint: string | null = null;
  if (freshness) hint = `Sorted by recently uploaded`;
  else if (contentHint) hint = `Filtered for ${contentHint}`;
  return { cleaned, freshness, contentHint, hint };
}

function buildSearchQuery(input: Input): {
  q: string;
  videoDuration?: "short" | "medium" | "long" | "any";
  order: "relevance" | "viewCount" | "date";
  hint: string | null;
} {
  const { query, mode, freeform, chips = [], variation = 0 } = input;
  const intent = detectQueryIntent(query);
  const parts: string[] = [intent.cleaned];
  if (intent.contentHint) parts.push(intent.contentHint);

  let videoDuration: "short" | "medium" | "long" | "any" = "any";
  let order: "relevance" | "viewCount" | "date" = intent.freshness ? "date" : "relevance";

  const chipText = chips.join(" ").toLowerCase();
  if (/under 15|\bshort\b|5 min/.test(chipText)) videoDuration = "short";
  else if (/around 1 hour|\bmedium\b/.test(chipText)) videoDuration = "medium";
  else if (/full course|\blong\b/.test(chipText)) videoDuration = "long";

  if (mode === "learn") {
    if (/beginner/.test(chipText)) parts.push("for beginners");
    if (/advanced/.test(chipText)) parts.push("advanced");
    if (/step-by-step|crash course/.test(chipText)) parts.push("tutorial");
    if (/deep dive/.test(chipText)) parts.push("in depth");
    if (/overview/.test(chipText)) parts.push("explained");
    for (const c of chips) {
      if (!/beginner|intermediate|advanced|step-by-step|overview|deep dive|crash course|under 15|around 1 hour|full course|short|medium|long/i.test(c)) {
        parts.push(c);
      }
    }
  } else if (mode === "relax") {
    for (const c of chips) {
      if (!/short|medium|long/i.test(c)) parts.push(c);
    }
  } else if (mode === "explore") {
    if (/playlist/.test(chipText)) parts.push("series guide");
    else if (!intent.freshness) parts.push("best");
    for (const c of chips) {
      if (!/intro|intermediate|expert|3 best picks|structured playlist|different angles/i.test(c)) {
        parts.push(c);
      }
    }
  } else if (mode === "find") {
    if (/official/.test(chipText)) parts.push("official");
    if (/latest/.test(chipText)) { parts.push("latest"); order = "date"; }
  }

  if (freeform && freeform.trim()) parts.push(freeform.trim());

  const v = variation % VARIATION_SUFFIX.length;
  if (v > 0 && !intent.freshness) {
    parts.push(VARIATION_SUFFIX[v]);
    if (v % 3 === 0) order = "viewCount";
    else if (v % 3 === 2) order = "date";
  }

  return { q: parts.filter(Boolean).join(" "), videoDuration, order, hint: intent.hint };
}

function reasonFor(
  mode: Mode,
  v: { channel: string; durationSeconds: number; viewCount: number; title: string },
): string {
  const popular = v.viewCount > 500_000;
  if (mode === "learn") {
    if (/course|tutorial|lesson|crash|guide/i.test(v.title))
      return "Structured tutorial format from a credible channel";
    if (popular) return `Highly watched explanation by ${v.channel}`;
    return `Focused explainer from ${v.channel}`;
  }
  if (mode === "find") {
    if (/official/i.test(v.title)) return "Looks like the official version";
    if (popular) return "Most likely the version you're looking for";
    return "Best match for your query";
  }
  if (mode === "relax") {
    if (/relax|chill|ambient|lo[- ]?fi/i.test(v.title)) return "Calm, low-stimulation pick";
    return `Easy listening from ${v.channel}`;
  }
  if (popular) return "High-quality, widely watched pick";
  return `Curated from ${v.channel}`;
}

function fitScore(
  durationBucket: "short" | "medium" | "long" | "any",
  durationSeconds: number,
  views: number,
): number {
  const viewScore = Math.log10(Math.max(views, 1)) * 2;
  let durationFit = 1;
  if (durationBucket === "short") durationFit = durationSeconds <= 15 * 60 ? 1.5 : 0.6;
  else if (durationBucket === "medium")
    durationFit = durationSeconds >= 5 * 60 && durationSeconds <= 70 * 60 ? 1.5 : 0.7;
  else if (durationBucket === "long") durationFit = durationSeconds >= 30 * 60 ? 1.5 : 0.6;
  return viewScore * durationFit;
}

export type ResultPlaylist = {
  playlistId: string;
  title: string;
  channel: string;
  channelId: string;
  description: string;
  thumbnail: string;
  itemCount: number;
  reason: string;
};

async function fetchPlaylists(apiKey: string, q: string): Promise<ResultPlaylist[]> {
  try {
    const params = new URLSearchParams({
      part: "snippet",
      q,
      maxResults: "5",
      type: "playlist",
      safeSearch: "moderate",
      key: apiKey,
    });
    const res = await fetch(`${YT_BASE}/search?${params.toString()}`);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      items: Array<{
        id: { playlistId: string };
        snippet: {
          title: string;
          channelTitle: string;
          channelId: string;
          description: string;
          thumbnails: { medium?: { url: string }; high?: { url: string } };
        };
      }>;
    };
    const ids = json.items.map((i) => i.id.playlistId).filter(Boolean);
    if (ids.length === 0) return [];

    // Fetch item counts
    const dParams = new URLSearchParams({
      part: "contentDetails",
      id: ids.join(","),
      key: apiKey,
    });
    const dRes = await fetch(`${YT_BASE}/playlists?${dParams.toString()}`);
    const dJson = dRes.ok
      ? ((await dRes.json()) as {
          items: Array<{ id: string; contentDetails: { itemCount: number } }>;
        })
      : { items: [] };
    const countMap = new Map(dJson.items.map((d) => [d.id, d.contentDetails.itemCount]));

    return json.items
      .map((it) => ({
        playlistId: it.id.playlistId,
        title: it.snippet.title,
        channel: it.snippet.channelTitle,
        channelId: it.snippet.channelId,
        description: it.snippet.description,
        thumbnail:
          it.snippet.thumbnails.high?.url || it.snippet.thumbnails.medium?.url || "",
        itemCount: countMap.get(it.id.playlistId) || 0,
        reason: `Curated series · ${countMap.get(it.id.playlistId) || 0} videos`,
      }))
      .filter((p) => p.itemCount >= 3)
      .slice(0, 3);
  } catch {
    return [];
  }
}

export const searchVideos = createServerFn({ method: "POST" })
  .inputValidator((input: Input) => SearchInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return {
        error: "YouTube API key is not configured.",
        results: [] as ResultVideo[],
        playlists: [] as ResultPlaylist[],
        effectiveQuery: "",
        hint: null as string | null,
        nextPageToken: null as string | null,
      };
    }

    const { q, videoDuration, order, hint } = buildSearchQuery(data);
    const limit = data.maxResults ?? (data.mode === "find" ? 5 : data.mode === "explore" ? 5 : 7);

    const searchParams = new URLSearchParams({
      part: "snippet",
      q,
      maxResults: "20",
      type: "video",
      safeSearch: "moderate",
      order,
      key: apiKey,
    });
    if (videoDuration && videoDuration !== "any") searchParams.set("videoDuration", videoDuration);
    if (data.pageToken) searchParams.set("pageToken", data.pageToken);

    try {
      // Run video + playlist searches in parallel for speed
      const includePlaylists = (data.mode === "learn" || data.mode === "explore") && !data.pageToken;
      const [sRes, playlists] = await Promise.all([
        fetch(`${YT_BASE}/search?${searchParams.toString()}`),
        includePlaylists ? fetchPlaylists(apiKey, q) : Promise.resolve([]),
      ]);

      if (!sRes.ok) {
        const body = await sRes.text();
        console.error("YouTube search failed", sRes.status, body);
        return { error: `Search failed (${sRes.status})`, results: [] as ResultVideo[], playlists: [] as ResultPlaylist[], effectiveQuery: q, hint, nextPageToken: null };
      }
      const sJson = (await sRes.json()) as {
        nextPageToken?: string;
        items: Array<{
          id: { videoId: string };
          snippet: {
            title: string;
            channelTitle: string;
            channelId: string;
            description: string;
            publishedAt: string;
            thumbnails: { medium?: { url: string }; high?: { url: string } };
          };
        }>;
      };

      const ids = sJson.items.map((i) => i.id.videoId).filter(Boolean);
      if (ids.length === 0) return { error: null, results: [] as ResultVideo[], playlists, effectiveQuery: q, hint, nextPageToken: sJson.nextPageToken ?? null };

      const dParams = new URLSearchParams({
        part: "contentDetails,statistics",
        id: ids.join(","),
        key: apiKey,
      });
      const dRes = await fetch(`${YT_BASE}/videos?${dParams.toString()}`);
      if (!dRes.ok) {
        const body = await dRes.text();
        console.error("YouTube videos failed", dRes.status, body);
        return { error: `Details failed (${dRes.status})`, results: [] as ResultVideo[], playlists, effectiveQuery: q, hint, nextPageToken: null };
      }
      const dJson = (await dRes.json()) as {
        items: Array<{
          id: string;
          contentDetails: { duration: string };
          statistics: { viewCount?: string };
        }>;
      };
      const detailMap = new Map(dJson.items.map((it) => [it.id, it]));

      const results: ResultVideo[] = sJson.items
        .map((it) => {
          const d = detailMap.get(it.id.videoId);
          const durationSeconds = d ? parseISODuration(d.contentDetails.duration) : 0;
          const viewCount = d ? parseInt(d.statistics.viewCount || "0", 10) : 0;
          const v = {
            videoId: it.id.videoId,
            title: it.snippet.title,
            channel: it.snippet.channelTitle,
            channelId: it.snippet.channelId,
            description: it.snippet.description,
            thumbnail:
              it.snippet.thumbnails.high?.url || it.snippet.thumbnails.medium?.url || "",
            publishedAt: it.snippet.publishedAt,
            durationSeconds,
            viewCount,
            reason: "",
          } as ResultVideo;
          v.reason = reasonFor(data.mode, v);
          return v;
        })
        .filter((v) => {
          if (v.durationSeconds <= 65) return false;
          if (/#shorts?\b/i.test(v.title)) return false;
          if (data.mode === "learn" && v.durationSeconds < 90) return false;
          return v.durationSeconds > 0;
        });

      const bucket = videoDuration ?? "any";
      results.sort(
        (a, b) =>
          fitScore(bucket, b.durationSeconds, b.viewCount) -
          fitScore(bucket, a.durationSeconds, a.viewCount),
      );

      const trimmed = results.slice(0, limit);
      if (trimmed[0] && !data.pageToken) trimmed[0].primary = true;

      return { error: null, results: trimmed, playlists, effectiveQuery: q, hint, nextPageToken: sJson.nextPageToken ?? null };
    } catch (err) {
      console.error("YouTube search error", err);
      return { error: "Could not reach YouTube right now.", results: [] as ResultVideo[], playlists: [] as ResultPlaylist[], effectiveQuery: q, hint, nextPageToken: null };
    }
  });

// --- Playlist items: load videos in a playlist on demand --------------------

const PlaylistItemsInput = z.object({ playlistId: z.string().min(5).max(64) });

export const getPlaylistItems = createServerFn({ method: "POST" })
  .inputValidator((input: { playlistId: string }) => PlaylistItemsInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return { items: [] as Array<{ videoId: string; title: string; channel: string; thumbnail: string; durationSeconds: number; position: number }>, error: "API key missing" };
    try {
      const params = new URLSearchParams({
        part: "snippet,contentDetails",
        playlistId: data.playlistId,
        maxResults: "50",
        key: apiKey,
      });
      const res = await fetch(`${YT_BASE}/playlistItems?${params.toString()}`);
      if (!res.ok) return { items: [], error: `playlistItems ${res.status}` };
      const json = (await res.json()) as {
        items: Array<{
          snippet: {
            title: string;
            videoOwnerChannelTitle?: string;
            position: number;
            thumbnails: { medium?: { url: string }; high?: { url: string } };
            resourceId: { videoId: string };
          };
        }>;
      };
      const ids = json.items.map((i) => i.snippet.resourceId.videoId).filter(Boolean);
      const dParams = new URLSearchParams({
        part: "contentDetails",
        id: ids.join(","),
        key: apiKey,
      });
      const dRes = await fetch(`${YT_BASE}/videos?${dParams.toString()}`);
      const dJson = dRes.ok
        ? ((await dRes.json()) as { items: Array<{ id: string; contentDetails: { duration: string } }> })
        : { items: [] };
      const durMap = new Map(dJson.items.map((d) => [d.id, parseISODuration(d.contentDetails.duration)]));

      const items = json.items
        .map((it) => ({
          videoId: it.snippet.resourceId.videoId,
          title: it.snippet.title,
          channel: it.snippet.videoOwnerChannelTitle || "",
          thumbnail: it.snippet.thumbnails.high?.url || it.snippet.thumbnails.medium?.url || "",
          durationSeconds: durMap.get(it.snippet.resourceId.videoId) || 0,
          position: it.snippet.position,
        }))
        .filter((v) => v.title !== "Deleted video" && v.title !== "Private video");
      return { items, error: null as string | null };
    } catch (err) {
      console.error("getPlaylistItems error", err);
      return { items: [], error: "Failed to fetch" };
    }
  });

// --- Video metadata: stats + channel info -----------------------------------

const MetaInput = z.object({ videoId: z.string().min(5).max(20) });

export type VideoMeta = {
  videoId: string;
  title: string;
  channel: string;
  channelId: string;
  channelThumbnail: string;
  subscriberCount: number;
  viewCount: number;
  likeCount: number;
  publishedAt: string;
  description: string;
  durationSeconds: number;
  categoryId: string;
};

export const getVideoMeta = createServerFn({ method: "POST" })
  .inputValidator((input: { videoId: string }) => MetaInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) return { meta: null as VideoMeta | null, error: "API key missing" };

    try {
      const vParams = new URLSearchParams({
        part: "snippet,contentDetails,statistics",
        id: data.videoId,
        key: apiKey,
      });
      const vRes = await fetch(`${YT_BASE}/videos?${vParams.toString()}`);
      if (!vRes.ok) return { meta: null, error: `videos ${vRes.status}` };
      const vJson = (await vRes.json()) as {
        items: Array<{
          id: string;
          snippet: {
            title: string;
            channelTitle: string;
            channelId: string;
            description: string;
            publishedAt: string;
            categoryId?: string;
          };
          contentDetails: { duration: string };
          statistics: { viewCount?: string; likeCount?: string };
        }>;
      };
      const v = vJson.items[0];
      if (!v) return { meta: null, error: "Not found" };

      // Channel: subscribers + thumbnail
      const cParams = new URLSearchParams({
        part: "snippet,statistics",
        id: v.snippet.channelId,
        key: apiKey,
      });
      const cRes = await fetch(`${YT_BASE}/channels?${cParams.toString()}`);
      const cJson = cRes.ok
        ? ((await cRes.json()) as {
            items: Array<{
              snippet: { thumbnails: { default?: { url: string }; medium?: { url: string } } };
              statistics: { subscriberCount?: string };
            }>;
          })
        : { items: [] };
      const ch = cJson.items[0];

      const meta: VideoMeta = {
        videoId: v.id,
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        channelId: v.snippet.channelId,
        channelThumbnail:
          ch?.snippet.thumbnails.medium?.url || ch?.snippet.thumbnails.default?.url || "",
        subscriberCount: parseInt(ch?.statistics.subscriberCount || "0", 10),
        viewCount: parseInt(v.statistics.viewCount || "0", 10),
        likeCount: parseInt(v.statistics.likeCount || "0", 10),
        publishedAt: v.snippet.publishedAt,
        description: v.snippet.description,
        durationSeconds: parseISODuration(v.contentDetails.duration),
        categoryId: v.snippet.categoryId || "",
      };
      return { meta, error: null as string | null };
    } catch (err) {
      console.error("getVideoMeta error", err);
      return { meta: null as VideoMeta | null, error: "Failed to fetch" };
    }
  });
