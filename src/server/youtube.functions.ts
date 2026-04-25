import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { parseISODuration, type Mode, type ResultVideo } from "@/lib/intent";

const SearchInput = z.object({
  query: z.string().min(1).max(300),
  mode: z.enum(["learn", "relax", "find", "explore"]),
  freeform: z.string().max(300).optional(),
  chips: z.array(z.string()).max(20).optional(),
  maxResults: z.number().int().min(3).max(15).optional(),
});

type Input = z.infer<typeof SearchInput>;

const YT_BASE = "https://www.googleapis.com/youtube/v3";

function buildSearchQuery(input: Input): {
  q: string;
  videoDuration?: "short" | "medium" | "long" | "any";
} {
  const { query, mode, freeform, chips = [] } = input;
  const parts: string[] = [query.trim()];
  let videoDuration: "short" | "medium" | "long" | "any" = "any";

  // Add chip-derived keywords directly (they're already natural-language)
  const chipText = chips.join(" ").toLowerCase();

  // Duration inference from chips
  if (/under 15|\bshort\b|5 min/.test(chipText)) videoDuration = "short";
  else if (/around 1 hour|\bmedium\b/.test(chipText)) videoDuration = "medium";
  else if (/full course|\blong\b/.test(chipText)) videoDuration = "long";

  // Mode-specific phrasing on top of chips
  if (mode === "learn") {
    if (/beginner/.test(chipText)) parts.push("for beginners");
    if (/advanced/.test(chipText)) parts.push("advanced");
    if (/step-by-step|crash course/.test(chipText)) parts.push("tutorial");
    if (/deep dive/.test(chipText)) parts.push("in depth");
    if (/overview/.test(chipText)) parts.push("explained");
    // pass through other chips (topic angle)
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
    else parts.push("best");
    for (const c of chips) {
      if (!/intro|intermediate|expert|3 best picks|structured playlist|different angles/i.test(c)) {
        parts.push(c);
      }
    }
  } else if (mode === "find") {
    if (/official/.test(chipText)) parts.push("official");
    if (/latest/.test(chipText)) parts.push("latest");
  }

  // Freeform user note — append last; YouTube handles natural language fine
  if (freeform && freeform.trim()) parts.push(freeform.trim());

  return { q: parts.join(" "), videoDuration };
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

export const searchVideos = createServerFn({ method: "POST" })
  .inputValidator((input: Input) => SearchInput.parse(input))
  .handler(async ({ data }) => {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      return { error: "YouTube API key is not configured.", results: [] as ResultVideo[] };
    }

    const { q, videoDuration } = buildSearchQuery(data);
    const limit = data.maxResults ?? (data.mode === "find" ? 5 : data.mode === "explore" ? 5 : 7);

    const searchParams = new URLSearchParams({
      part: "snippet",
      q,
      maxResults: String(Math.min(limit + 5, 15)),
      type: "video",
      safeSearch: "moderate",
      order: "relevance",
      key: apiKey,
    });
    if (videoDuration && videoDuration !== "any") searchParams.set("videoDuration", videoDuration);

    try {
      const sRes = await fetch(`${YT_BASE}/search?${searchParams.toString()}`);
      if (!sRes.ok) {
        const body = await sRes.text();
        console.error("YouTube search failed", sRes.status, body);
        return { error: `Search failed (${sRes.status})`, results: [] as ResultVideo[] };
      }
      const sJson = (await sRes.json()) as {
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
      if (ids.length === 0) return { error: null, results: [] as ResultVideo[] };

      const dParams = new URLSearchParams({
        part: "contentDetails,statistics",
        id: ids.join(","),
        key: apiKey,
      });
      const dRes = await fetch(`${YT_BASE}/videos?${dParams.toString()}`);
      if (!dRes.ok) {
        const body = await dRes.text();
        console.error("YouTube videos failed", dRes.status, body);
        return { error: `Details failed (${dRes.status})`, results: [] as ResultVideo[] };
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
          if (data.mode === "learn" && v.durationSeconds < 60) return false;
          return v.durationSeconds > 0;
        });

      const bucket = videoDuration ?? "any";
      results.sort(
        (a, b) =>
          fitScore(bucket, b.durationSeconds, b.viewCount) -
          fitScore(bucket, a.durationSeconds, a.viewCount),
      );

      const trimmed = results.slice(0, limit);
      if (trimmed[0]) trimmed[0].primary = true;

      return { error: null, results: trimmed };
    } catch (err) {
      console.error("YouTube search error", err);
      return { error: "Could not reach YouTube right now.", results: [] as ResultVideo[] };
    }
  });
