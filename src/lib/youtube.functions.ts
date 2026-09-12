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
    if (c.rx.test(q)) {
      contentHint = c.add;
      break;
    }
  }
  const cleaned = q.replace(FRESHNESS_RX, "").replace(/\s+/g, " ").trim() || q;
  let hint: string | null = null;
  if (freshness) hint = `Sorted by recently uploaded`;
  else if (contentHint) hint = `Filtered for ${contentHint}`;
  return { cleaned, freshness, contentHint, hint };
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

    // Request extra candidates because Shorts are removed after duration data
    // arrives. ZenTube deliberately serves only deliberate, long-form viewing.
    const limit = data.maxResults ?? 10;

    try {
      const sp = new URLSearchParams({
        part: "snippet",
        q,
        maxResults: String(Math.min(50, Math.max(limit * 4, 20))),
        type: "video",
        safeSearch: "moderate",
        order: "relevance",
        key: apiKey,
      });
      if (data.pageToken) sp.set("pageToken", data.pageToken);

      const sRes = await fetch(`${YT_BASE}/search?${sp.toString()}`);
      if (!sRes.ok) {
        const body = await sRes.text();
        console.error("YouTube search failed", sRes.status, body);
        return {
          error: `Search failed (${sRes.status})`,
          results: [] as ResultVideo[],
          playlists: [] as ResultPlaylist[],
          channel: null,
          effectiveQuery: q,
          hint: null,
          nextPageToken: null,
        };
      }
      type SearchJson = {
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
      const sJson = (await sRes.json()) as SearchJson;
      const items = sJson.items.filter((i) => i.id?.videoId);
      const ids = items.map((i) => i.id.videoId);
      if (ids.length === 0) {
        return {
          error: null,
          results: [] as ResultVideo[],
          playlists: [] as ResultPlaylist[],
          channel: null,
          effectiveQuery: q,
          hint: null,
          nextPageToken: sJson.nextPageToken ?? null,
        };
      }

      const dParams = new URLSearchParams({
        part: "contentDetails,statistics",
        id: ids.join(","),
        key: apiKey,
      });
      const dRes = await fetch(`${YT_BASE}/videos?${dParams.toString()}`);
      const dJson = dRes.ok
        ? ((await dRes.json()) as {
            items: Array<{
              id: string;
              contentDetails: { duration: string };
              statistics: { viewCount?: string };
            }>;
          })
        : { items: [] };
      const detailMap = new Map(dJson.items.map((it) => [it.id, it]));

      // Preserve YouTube's ordering, but never surface Shorts. YouTube does not
      // expose a reliable Shorts flag, so duration plus explicit metadata is
      // the safest strict boundary for a non-addictive product.
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
      }).filter((v) =>
        v.durationSeconds > 180 &&
        !/(?:#|\b)shorts?\b/i.test(`${v.title} ${v.description}`),
      ).slice(0, limit);

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
        results: [] as ResultVideo[],
        playlists: [] as ResultPlaylist[],
        channel: null,
        effectiveQuery: q,
        hint: null,
        nextPageToken: null,
      };
    }
  });

// --- Playlist items ---------------------------------------------------------

const PlaylistItemsInput = z.object({
  playlistId: z.string().min(5).max(64),
  apiKey: z.string().max(200).optional(),
});

export const getPlaylistItems = createServerFn({ method: "POST" })
  .inputValidator((input: { playlistId: string; apiKey?: string }) =>
    PlaylistItemsInput.parse(input),
  )
  .handler(async ({ data }) => {
    const apiKey = data.apiKey?.trim() || process.env.YOUTUBE_API_KEY;
    if (!apiKey)
      return {
        items: [] as Array<{
          videoId: string;
          title: string;
          channel: string;
          thumbnail: string;
          durationSeconds: number;
          position: number;
        }>,
        error: "API key missing",
      };
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
        ? ((await dRes.json()) as {
            items: Array<{ id: string; contentDetails: { duration: string } }>;
          })
        : { items: [] };
      const durMap = new Map(
        dJson.items.map((d) => [d.id, parseISODuration(d.contentDetails.duration)]),
      );

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

const MetaInput = z.object({
  videoId: z.string().min(5).max(20),
  apiKey: z.string().max(200).optional(),
});

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

// --- Channel detail + latest videos ----------------------------------------

const ChannelInput = z.object({
  channelId: z.string().min(5).max(64),
  apiKey: z.string().max(200).optional(),
});

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
      return {
        channel: null as ChannelDetail | null,
        videos: [] as ResultVideo[],
        error: "API key missing",
      };
    }
    try {
      const cParams = new URLSearchParams({
        part: "snippet,statistics,brandingSettings,contentDetails",
        id: data.channelId,
        key: apiKey,
      });
      const cRes = await fetch(`${YT_BASE}/channels?${cParams.toString()}`);
      if (!cRes.ok) return { channel: null, videos: [], error: `channels ${cRes.status}` };
      const cJson = (await cRes.json()) as {
        items: Array<{
          id: string;
          snippet: {
            title: string;
            description: string;
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
          part: "snippet,contentDetails",
          playlistId: uploadsId,
          maxResults: "24",
          key: apiKey,
        });
        const pRes = await fetch(`${YT_BASE}/playlistItems?${pParams.toString()}`);
        if (pRes.ok) {
          const pJson = (await pRes.json()) as {
            items: Array<{
              snippet: {
                title: string;
                channelTitle: string;
                channelId: string;
                description: string;
                publishedAt: string;
                thumbnails: { medium?: { url: string }; high?: { url: string } };
                resourceId: { videoId: string };
              };
            }>;
          };
          const ids = pJson.items.map((i) => i.snippet.resourceId.videoId).filter(Boolean);
          if (ids.length) {
            const dParams = new URLSearchParams({
              part: "contentDetails,statistics",
              id: ids.join(","),
              key: apiKey,
            });
            const dRes = await fetch(`${YT_BASE}/videos?${dParams.toString()}`);
            const dJson = dRes.ok
              ? ((await dRes.json()) as {
                  items: Array<{
                    id: string;
                    contentDetails: { duration: string };
                    statistics: { viewCount?: string };
                  }>;
                })
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
                  thumbnail:
                    it.snippet.thumbnails.high?.url || it.snippet.thumbnails.medium?.url || "",
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
      return {
        channel: null as ChannelDetail | null,
        videos: [] as ResultVideo[],
        error: "Failed to fetch",
      };
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
        part: "snippet,contentDetails",
        channelId: data.channelId,
        maxResults: "25",
        key: apiKey,
      });
      const res = await fetch(`${YT_BASE}/playlists?${params.toString()}`);
      if (!res.ok) return { playlists: [], error: `playlists ${res.status}` };
      const json = (await res.json()) as {
        items: Array<{
          id: string;
          snippet: {
            title: string;
            channelTitle: string;
            channelId: string;
            description: string;
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
