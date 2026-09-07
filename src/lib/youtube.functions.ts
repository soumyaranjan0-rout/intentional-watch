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
  apiKey: z.string().max(200).optional(),
  /** Compact signal derived from the viewer's own watch history. Used to
   *  favour familiar, trusted sources and to avoid re-serving what they've
   *  already watched (deliberately non-addictive). */
  history: z
    .object({
      channels: z.array(z.string().max(120)).max(12).optional(),
      topics: z.array(z.string().max(40)).max(24).optional(),
      watched: z.array(z.string().max(40)).max(80).optional(),
    })
    .optional(),
});

type Input = z.infer<typeof SearchInput>;

const YT_BASE = "https://www.googleapis.com/youtube/v3";

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

export type ResultChannel = {
  channelId: string;
  title: string;
  description: string;
  thumbnail: string;
  subscriberCount: number;
  videoCount: number;
};

async function fetchPlaylists(apiKey: string, q: string): Promise<ResultPlaylist[]> {
  try {
    const params = new URLSearchParams({
      part: "snippet", q, maxResults: "5", type: "playlist",
      safeSearch: "moderate", key: apiKey,
    });
    const res = await fetch(`${YT_BASE}/search?${params.toString()}`);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      items: Array<{
        id: { playlistId: string };
        snippet: {
          title: string; channelTitle: string; channelId: string; description: string;
          thumbnails: { medium?: { url: string }; high?: { url: string } };
        };
      }>;
    };
    const ids = json.items.map((i) => i.id.playlistId).filter(Boolean);
    if (ids.length === 0) return [];

    const dParams = new URLSearchParams({ part: "contentDetails", id: ids.join(","), key: apiKey });
    const dRes = await fetch(`${YT_BASE}/playlists?${dParams.toString()}`);
    const dJson = dRes.ok
      ? ((await dRes.json()) as { items: Array<{ id: string; contentDetails: { itemCount: number } }> })
      : { items: [] };
    const countMap = new Map(dJson.items.map((d) => [d.id, d.contentDetails.itemCount]));

    return json.items
      .map((it) => ({
        playlistId: it.id.playlistId,
        title: it.snippet.title,
        channel: it.snippet.channelTitle,
        channelId: it.snippet.channelId,
        description: it.snippet.description,
        thumbnail: it.snippet.thumbnails.high?.url || it.snippet.thumbnails.medium?.url || "",
        itemCount: countMap.get(it.id.playlistId) || 0,
        reason: `Curated series · ${countMap.get(it.id.playlistId) || 0} videos`,
      }))
      .filter((p) => p.itemCount >= 3)
      .slice(0, 3);
  } catch {
    return [];
  }
}

/** Detect if a query strongly matches a channel name. Returns the channel
 *  if YouTube finds a confident match, else null. */
async function fetchTopChannelMatch(apiKey: string, rawQuery: string): Promise<ResultChannel | null> {
  try {
    // Strip freshness/topic noise so "mr beast new video" becomes "mr beast"
    const cleaned = rawQuery
      .replace(FRESHNESS_RX, "")
      .replace(/\b(video|videos|channel|youtube)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length < 2) return null;

    const params = new URLSearchParams({
      part: "snippet", q: cleaned, maxResults: "3", type: "channel",
      key: apiKey,
    });
    const res = await fetch(`${YT_BASE}/search?${params.toString()}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      items: Array<{
        id: { channelId: string };
        snippet: { title: string; description: string; thumbnails: { medium?: { url: string }; high?: { url: string } } };
      }>;
    };
    if (!json.items.length) return null;

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const qn = norm(cleaned);
    // Find the strongest name match
    const scored = json.items
      .map((it) => {
        const tn = norm(it.snippet.title);
        let score = 0;
        if (tn === qn) score = 100;
        else if (tn.startsWith(qn)) score = 80;
        else if (qn.startsWith(tn) && tn.length >= 4) score = 70;
        else if (tn.includes(qn) && qn.length >= 4) score = 60;
        else if (qn.includes(tn) && tn.length >= 4) score = 50;
        return { it, score };
      })
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best || best.score < 60) return null;

    // Hydrate with stats
    const cParams = new URLSearchParams({
      part: "snippet,statistics", id: best.it.id.channelId, key: apiKey,
    });
    const cRes = await fetch(`${YT_BASE}/channels?${cParams.toString()}`);
    if (!cRes.ok) return null;
    const cJson = (await cRes.json()) as {
      items: Array<{
        id: string;
        snippet: { title: string; description: string; thumbnails: { medium?: { url: string }; high?: { url: string } } };
        statistics: { subscriberCount?: string; videoCount?: string };
      }>;
    };
    const ch = cJson.items[0];
    if (!ch) return null;
    return {
      channelId: ch.id,
      title: ch.snippet.title,
      description: ch.snippet.description,
      thumbnail: ch.snippet.thumbnails.medium?.url || ch.snippet.thumbnails.high?.url || "",
      subscriberCount: parseInt(ch.statistics.subscriberCount || "0", 10),
      videoCount: parseInt(ch.statistics.videoCount || "0", 10),
    };
  } catch {
    return null;
  }
}

export const searchVideos = createServerFn({ method: "POST" })
  .inputValidator((input: Input) => SearchInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = data.apiKey?.trim() || process.env.YOUTUBE_API_KEY;
    const q = data.query.trim();
    if (!apiKey) {
      return {
        error: "YouTube API key is not configured.",
        results: [] as ResultVideo[],
        playlists: [] as ResultPlaylist[],
        channel: null as ResultChannel | null,
        effectiveQuery: q,
        hint: null as string | null,
        nextPageToken: null as string | null,
      };
    }

    // Mirror YouTube: send the query verbatim, relevance order, keep YouTube's
    // own ranking untouched. No injected keywords, no re-sorting, no filters.
    const limit = data.maxResults ?? 10;

    try {
      const sp = new URLSearchParams({
        part: "snippet", q, maxResults: String(limit), type: "video",
        safeSearch: "moderate", order: "relevance", key: apiKey,
      });
      if (data.pageToken) sp.set("pageToken", data.pageToken);

      const sRes = await fetch(`${YT_BASE}/search?${sp.toString()}`);
      if (!sRes.ok) {
        const body = await sRes.text();
        console.error("YouTube search failed", sRes.status, body);
        return {
          error: `Search failed (${sRes.status})`,
          results: [] as ResultVideo[], playlists: [] as ResultPlaylist[], channel: null,
          effectiveQuery: q, hint: null, nextPageToken: null,
        };
      }
      type SearchJson = {
        nextPageToken?: string;
        items: Array<{
          id: { videoId: string };
          snippet: {
            title: string; channelTitle: string; channelId: string; description: string;
            publishedAt: string; thumbnails: { medium?: { url: string }; high?: { url: string } };
          };
        }>;
      };
      const sJson = (await sRes.json()) as SearchJson;
      const items = sJson.items.filter((i) => i.id?.videoId);
      const ids = items.map((i) => i.id.videoId);
      if (ids.length === 0) {
        return {
          error: null, results: [] as ResultVideo[], playlists: [] as ResultPlaylist[], channel: null,
          effectiveQuery: q, hint: null, nextPageToken: sJson.nextPageToken ?? null,
        };
      }

      const dParams = new URLSearchParams({
        part: "contentDetails,statistics", id: ids.join(","), key: apiKey,
      });
      const dRes = await fetch(`${YT_BASE}/videos?${dParams.toString()}`);
      const dJson = dRes.ok
        ? ((await dRes.json()) as {
            items: Array<{ id: string; contentDetails: { duration: string }; statistics: { viewCount?: string } }>;
          })
        : { items: [] };
      const detailMap = new Map(dJson.items.map((it) => [it.id, it]));

      // Preserve YouTube's exact ordering.
      const results: ResultVideo[] = items.map((it) => {
        const d = detailMap.get(it.id.videoId);
        const durationSeconds = d ? parseISODuration(d.contentDetails.duration) : 0;
        const viewCount = d ? parseInt(d.statistics.viewCount || "0", 10) : 0;
        const v = {
          videoId: it.id.videoId,
          title: it.snippet.title,
          channel: it.snippet.channelTitle,
          channelId: it.snippet.channelId,
          description: it.snippet.description,
          thumbnail: it.snippet.thumbnails.high?.url || it.snippet.thumbnails.medium?.url || "",
          publishedAt: it.snippet.publishedAt,
          durationSeconds,
          viewCount,
          reason: "",
        } as ResultVideo;
        v.reason = reasonFor(data.mode, v);
        return v;
      });

      return {
        error: null,
        results,
        playlists: [] as ResultPlaylist[],
        channel: null as ResultChannel | null,
        effectiveQuery: q,
        hint: null as string | null,
        nextPageToken: sJson.nextPageToken ?? null,
      };
    } catch (err) {
      console.error("YouTube search error", err);
      return {
        error: "Could not reach YouTube right now.",
        results: [] as ResultVideo[], playlists: [] as ResultPlaylist[], channel: null,
        effectiveQuery: q, hint: null, nextPageToken: null,
      };
    }
  });

// --- Playlist items ---------------------------------------------------------

const PlaylistItemsInput = z.object({ playlistId: z.string().min(5).max(64), apiKey: z.string().max(200).optional() });

export const getPlaylistItems = createServerFn({ method: "POST" })
  .inputValidator((input: { playlistId: string; apiKey?: string }) => PlaylistItemsInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = data.apiKey?.trim() || process.env.YOUTUBE_API_KEY;
    if (!apiKey) return { items: [] as Array<{ videoId: string; title: string; channel: string; thumbnail: string; durationSeconds: number; position: number }>, error: "API key missing" };
    try {
      const params = new URLSearchParams({
        part: "snippet,contentDetails", playlistId: data.playlistId,
        maxResults: "50", key: apiKey,
      });
      const res = await fetch(`${YT_BASE}/playlistItems?${params.toString()}`);
      if (!res.ok) return { items: [], error: `playlistItems ${res.status}` };
      const json = (await res.json()) as {
        items: Array<{
          snippet: {
            title: string; videoOwnerChannelTitle?: string; position: number;
            thumbnails: { medium?: { url: string }; high?: { url: string } };
            resourceId: { videoId: string };
          };
        }>;
      };
      const ids = json.items.map((i) => i.snippet.resourceId.videoId).filter(Boolean);
      const dParams = new URLSearchParams({ part: "contentDetails", id: ids.join(","), key: apiKey });
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

// --- Video metadata --------------------------------------------------------

const MetaInput = z.object({ videoId: z.string().min(5).max(20), apiKey: z.string().max(200).optional() });

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
  .inputValidator((input: { videoId: string; apiKey?: string }) => MetaInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = data.apiKey?.trim() || process.env.YOUTUBE_API_KEY;
    if (!apiKey) return { meta: null as VideoMeta | null, error: "API key missing" };

    try {
      const vParams = new URLSearchParams({
        part: "snippet,contentDetails,statistics", id: data.videoId, key: apiKey,
      });
      const vRes = await fetch(`${YT_BASE}/videos?${vParams.toString()}`);
      if (!vRes.ok) return { meta: null, error: `videos ${vRes.status}` };
      const vJson = (await vRes.json()) as {
        items: Array<{
          id: string;
          snippet: { title: string; channelTitle: string; channelId: string; description: string; publishedAt: string; categoryId?: string };
          contentDetails: { duration: string };
          statistics: { viewCount?: string; likeCount?: string };
        }>;
      };
      const v = vJson.items[0];
      if (!v) return { meta: null, error: "Not found" };

      const cParams = new URLSearchParams({
        part: "snippet,statistics", id: v.snippet.channelId, key: apiKey,
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
        channelThumbnail: ch?.snippet.thumbnails.medium?.url || ch?.snippet.thumbnails.default?.url || "",
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

// --- Channel detail + latest videos ----------------------------------------

const ChannelInput = z.object({ channelId: z.string().min(5).max(64), apiKey: z.string().max(200).optional() });

export type ChannelDetail = {
  channelId: string;
  title: string;
  description: string;
  thumbnail: string;
  banner: string;
  subscriberCount: number;
  videoCount: number;
  viewCount: number;
};

export const getChannelDetail = createServerFn({ method: "POST" })
  .inputValidator((input: { channelId: string; apiKey?: string }) => ChannelInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = data.apiKey?.trim() || process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return { channel: null as ChannelDetail | null, videos: [] as ResultVideo[], error: "API key missing" };
    }
    try {
      const cParams = new URLSearchParams({
        part: "snippet,statistics,brandingSettings,contentDetails",
        id: data.channelId, key: apiKey,
      });
      const cRes = await fetch(`${YT_BASE}/channels?${cParams.toString()}`);
      if (!cRes.ok) return { channel: null, videos: [], error: `channels ${cRes.status}` };
      const cJson = (await cRes.json()) as {
        items: Array<{
          id: string;
          snippet: {
            title: string; description: string;
            thumbnails: { medium?: { url: string }; high?: { url: string } };
          };
          statistics: { subscriberCount?: string; videoCount?: string; viewCount?: string };
          brandingSettings?: { image?: { bannerExternalUrl?: string } };
          contentDetails?: { relatedPlaylists?: { uploads?: string } };
        }>;
      };
      const ch = cJson.items[0];
      if (!ch) return { channel: null, videos: [], error: "Channel not found" };

      const channel: ChannelDetail = {
        channelId: ch.id,
        title: ch.snippet.title,
        description: ch.snippet.description,
        thumbnail: ch.snippet.thumbnails.high?.url || ch.snippet.thumbnails.medium?.url || "",
        banner: ch.brandingSettings?.image?.bannerExternalUrl || "",
        subscriberCount: parseInt(ch.statistics.subscriberCount || "0", 10),
        videoCount: parseInt(ch.statistics.videoCount || "0", 10),
        viewCount: parseInt(ch.statistics.viewCount || "0", 10),
      };

      // Latest uploads via the uploads playlist
      const uploadsId = ch.contentDetails?.relatedPlaylists?.uploads;
      let videos: ResultVideo[] = [];
      if (uploadsId) {
        const pParams = new URLSearchParams({
          part: "snippet,contentDetails", playlistId: uploadsId, maxResults: "24", key: apiKey,
        });
        const pRes = await fetch(`${YT_BASE}/playlistItems?${pParams.toString()}`);
        if (pRes.ok) {
          const pJson = (await pRes.json()) as {
            items: Array<{
              snippet: {
                title: string; channelTitle: string; channelId: string;
                description: string; publishedAt: string;
                thumbnails: { medium?: { url: string }; high?: { url: string } };
                resourceId: { videoId: string };
              };
            }>;
          };
          const ids = pJson.items.map((i) => i.snippet.resourceId.videoId).filter(Boolean);
          if (ids.length) {
            const dParams = new URLSearchParams({
              part: "contentDetails,statistics", id: ids.join(","), key: apiKey,
            });
            const dRes = await fetch(`${YT_BASE}/videos?${dParams.toString()}`);
            const dJson = dRes.ok
              ? ((await dRes.json()) as { items: Array<{ id: string; contentDetails: { duration: string }; statistics: { viewCount?: string } }> })
              : { items: [] };
            const dMap = new Map(dJson.items.map((d) => [d.id, d]));
            videos = pJson.items
              .map((it) => {
                const d = dMap.get(it.snippet.resourceId.videoId);
                const durationSeconds = d ? parseISODuration(d.contentDetails.duration) : 0;
                const viewCount = d ? parseInt(d.statistics.viewCount || "0", 10) : 0;
                return {
                  videoId: it.snippet.resourceId.videoId,
                  title: it.snippet.title,
                  channel: it.snippet.channelTitle,
                  channelId: it.snippet.channelId,
                  description: it.snippet.description,
                  thumbnail: it.snippet.thumbnails.high?.url || it.snippet.thumbnails.medium?.url || "",
                  publishedAt: it.snippet.publishedAt,
                  durationSeconds,
                  viewCount,
                  reason: "",
                } as ResultVideo;
              })
              .filter((v) => v.durationSeconds > 60 && !/#shorts?\b/i.test(v.title))
              .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
          }
        }
      }
      return { channel, videos, error: null as string | null };
    } catch (err) {
      console.error("getChannelDetail error", err);
      return { channel: null as ChannelDetail | null, videos: [] as ResultVideo[], error: "Failed to fetch" };
    }
  });

// --- Channel playlists -----------------------------------------------------

export const getChannelPlaylists = createServerFn({ method: "POST" })
  .inputValidator((input: { channelId: string; apiKey?: string }) => ChannelInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = data.apiKey?.trim() || process.env.YOUTUBE_API_KEY;
    if (!apiKey) return { playlists: [] as ResultPlaylist[], error: "API key missing" };
    try {
      const params = new URLSearchParams({
        part: "snippet,contentDetails", channelId: data.channelId,
        maxResults: "25", key: apiKey,
      });
      const res = await fetch(`${YT_BASE}/playlists?${params.toString()}`);
      if (!res.ok) return { playlists: [], error: `playlists ${res.status}` };
      const json = (await res.json()) as {
        items: Array<{
          id: string;
          snippet: {
            title: string; channelTitle: string; channelId: string; description: string;
            thumbnails: { medium?: { url: string }; high?: { url: string } };
          };
          contentDetails: { itemCount: number };
        }>;
      };
      const playlists: ResultPlaylist[] = json.items.map((it) => ({
        playlistId: it.id,
        title: it.snippet.title,
        channel: it.snippet.channelTitle,
        channelId: it.snippet.channelId,
        description: it.snippet.description,
        thumbnail: it.snippet.thumbnails.high?.url || it.snippet.thumbnails.medium?.url || "",
        itemCount: it.contentDetails.itemCount,
        reason: `${it.contentDetails.itemCount} videos`,
      }));
      return { playlists, error: null as string | null };
    } catch (err) {
      console.error("getChannelPlaylists error", err);
      return { playlists: [] as ResultPlaylist[], error: "Failed to fetch" };
    }
  });
