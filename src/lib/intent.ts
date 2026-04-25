// Intent / use-case definitions for ZenTube.

export type Mode = "learn" | "relax" | "find" | "explore";

export const MODES: Record<Mode, { label: string; emoji: string; tagline: string }> = {
  learn: { label: "Learn something", emoji: "🎓", tagline: "Focused study sessions with notes" },
  relax: { label: "Relax / Entertainment", emoji: "😌", tagline: "Wind down without the rabbit hole" },
  find: { label: "Find something specific", emoji: "🔍", tagline: "Get to the right video, fast" },
  explore: { label: "Explore / Discover", emoji: "🌱", tagline: "A few high-quality picks, nothing more" },
};

export type LearnRefine = {
  level: "beginner" | "intermediate" | "advanced";
  depth: "overview" | "stepbystep" | "deep";
  duration: "short" | "medium" | "long";
};
export type RelaxRefine = {
  mood: "chill" | "emotional" | "energetic";
  length: "short" | "medium" | "long";
  type: "official" | "remix" | "clips";
};
export type ExploreRefine = {
  shape: "picks" | "playlist";
};

export type Refinement =
  | { mode: "learn"; data: LearnRefine }
  | { mode: "relax"; data: RelaxRefine }
  | { mode: "find"; data: Record<string, never> }
  | { mode: "explore"; data: ExploreRefine };

export type ResultVideo = {
  videoId: string;
  title: string;
  channel: string;
  channelId: string;
  description: string;
  thumbnail: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: number;
  reason: string;
  primary?: boolean;
};

// ISO 8601 duration → seconds
export function parseISODuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || "0", 10);
  const min = parseInt(m[2] || "0", 10);
  const s = parseInt(m[3] || "0", 10);
  return h * 3600 + min * 60 + s;
}

export function formatDuration(seconds: number): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function durationBucket(mode: Mode, refine: unknown): [number, number] {
  if (mode === "learn") {
    const d = (refine as LearnRefine)?.duration;
    if (d === "short") return [60, 15 * 60];
    if (d === "medium") return [10 * 60, 70 * 60];
    if (d === "long") return [40 * 60, 60 * 60 * 6];
  }
  if (mode === "relax") {
    const l = (refine as RelaxRefine)?.length;
    if (l === "short") return [30, 5 * 60];
    if (l === "medium") return [4 * 60, 20 * 60];
    if (l === "long") return [15 * 60, 60 * 60 * 3];
  }
  return [0, 60 * 60 * 6];
}
