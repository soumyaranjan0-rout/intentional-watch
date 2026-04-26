// Intent / use-case definitions for ZenTube.

export type Mode = "learn" | "relax" | "find" | "explore";

export const MODES: Record<Mode, { label: string; emoji: string; tagline: string }> = {
  learn: { label: "Learn something", emoji: "🎓", tagline: "Focused study sessions with notes" },
  relax: { label: "Relax / Entertainment", emoji: "😌", tagline: "Wind down without the rabbit hole" },
  find: { label: "Find something specific", emoji: "🔍", tagline: "Get to the right video, fast" },
  explore: { label: "Explore / Discover", emoji: "🌱", tagline: "A few high-quality picks, nothing more" },
};

export type Refinement = {
  mode: Mode;
  freeform: string;
  chips: string[];
};

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
  if (!seconds || !Number.isFinite(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatCount(n: number): string {
  if (!n || !Number.isFinite(n)) return "0";
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

// --- Smart suggestion engine ---

type ChipGroup = { label: string; chips: string[] };

const LEARN_TOPIC_HINTS: Array<{ match: RegExp; chips: string[] }> = [
  { match: /\b(react|next|vue|svelte|angular|frontend)\b/i, chips: ["with project", "hooks", "typescript", "from scratch"] },
  { match: /\b(python|django|flask|fastapi)\b/i, chips: ["with project", "data science", "automation", "for beginners"] },
  { match: /\b(kafka|kubernetes|docker|devops|aws|azure|gcp)\b/i, chips: ["hands-on", "in production", "real-world", "architecture"] },
  { match: /\b(ml|machine learning|ai|deep learning|llm|transformer)\b/i, chips: ["math intuition", "code along", "no math", "paper walkthrough"] },
  { match: /\b(sql|database|postgres|mysql)\b/i, chips: ["query practice", "design", "performance"] },
];

const RELAX_TOPIC_HINTS: Array<{ match: RegExp; chips: string[] }> = [
  { match: /\b(song|music|track|playlist|album|hindi|tamil|telugu|odia|bhojpuri|punjabi|english)\b/i, chips: ["romantic", "sad", "lofi", "old version", "live", "remix"] },
  { match: /\b(comedy|standup|stand-up|funny|jokes?)\b/i, chips: ["clean", "5 min", "Indian", "Hindi"] },
  { match: /\b(gameplay|game|gaming|walkthrough)\b/i, chips: ["highlights", "no commentary", "speedrun"] },
  { match: /\b(movie|trailer|teaser|scene)\b/i, chips: ["official", "review", "breakdown"] },
];

export function getSmartChips(mode: Mode, query: string): ChipGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  if (mode === "learn") {
    const groups: ChipGroup[] = [
      { label: "Skill level", chips: ["beginner", "intermediate", "advanced"] },
      { label: "Format", chips: ["step-by-step", "overview", "deep dive", "crash course"] },
      { label: "Length", chips: ["under 15 min", "around 1 hour", "full course"] },
    ];
    for (const hint of LEARN_TOPIC_HINTS) {
      if (hint.match.test(q)) {
        groups.push({ label: "Topic angle", chips: hint.chips });
        break;
      }
    }
    return groups;
  }

  if (mode === "relax") {
    const groups: ChipGroup[] = [
      { label: "Mood", chips: ["chill", "emotional", "energetic", "nostalgic"] },
      { label: "Length", chips: ["short", "medium", "long"] },
    ];
    for (const hint of RELAX_TOPIC_HINTS) {
      if (hint.match.test(q)) {
        groups.unshift({ label: "Style", chips: hint.chips });
        break;
      }
    }
    return groups;
  }

  if (mode === "explore") {
    return [
      { label: "Format", chips: ["3 best picks", "structured playlist", "different angles"] },
      { label: "Depth", chips: ["intro", "intermediate", "expert"] },
    ];
  }

  return [
    { label: "Filter", chips: ["official", "latest", "high quality", "exact match"] },
  ];
}

export function inferDurationFromChips(chips: string[]): "short" | "medium" | "long" | undefined {
  const c = chips.join(" ").toLowerCase();
  if (/under 15|short|5 min/.test(c)) return "short";
  if (/around 1 hour|medium/.test(c)) return "medium";
  if (/full course|long/.test(c)) return "long";
  return undefined;
}

// --- Context awareness: detect category mismatch ---

const LEARN_PATTERNS = /\b(learn|tutorial|how to|course|guide|explain|build|create|introduction|intro|basics|beginner|advanced|programming|code|coding|algorithm|math|science|data|analysis|kafka|react|python|sql|java|javascript|typescript|aws|kubernetes|docker|devops|ml|ai|machine learning|deep learning|nlp)\b/i;
const RELAX_PATTERNS = /\b(song|music|playlist|relax|chill|lofi|lo-fi|comedy|funny|standup|stand-up|movie|trailer|gaming|gameplay|asmr|meditation|bollywood|hollywood|odia|tamil|telugu|bhojpuri|hindi|punjabi|romantic|sad|dance|party|vlog)\b/i;

export type CategoryGuess = "learn" | "relax" | "neutral";

export function guessCategory(query: string): CategoryGuess {
  const q = query.toLowerCase();
  const learn = LEARN_PATTERNS.test(q);
  const relax = RELAX_PATTERNS.test(q);
  if (learn && !relax) return "learn";
  if (relax && !learn) return "relax";
  return "neutral";
}

// --- Inferred intent from video metadata (content-tied) ---
// Maps to two main intents: "learn" or "relax". Returns null if uncertain.
export function inferIntentFromVideo(input: {
  title?: string;
  channel?: string;
  durationSeconds?: number;
  category?: string;
}): Mode | null {
  const title = (input.title || "").toLowerCase();
  const channel = (input.channel || "").toLowerCase();
  const dur = input.durationSeconds || 0;
  const cat = (input.category || "").toLowerCase();

  // Strong learning signals
  if (LEARN_PATTERNS.test(title) || LEARN_PATTERNS.test(channel)) return "learn";
  if (/education|science & technology|howto|tech/.test(cat)) return "learn";

  // Strong entertainment signals
  if (RELAX_PATTERNS.test(title) || RELAX_PATTERNS.test(channel)) return "relax";
  if (/music|comedy|gaming|entertainment|film|sport/.test(cat)) return "relax";

  // Duration heuristic — short videos are usually entertainment, long ones learning
  if (dur > 0 && dur < 5 * 60) return "relax";
  if (dur >= 20 * 60) return "learn";

  return null;
}

// Resolve final intent: explicit override wins, then inferred, then session fallback.
export function resolveFinalIntent(
  override: Mode | null | undefined,
  inferred: Mode | null | undefined,
  sessionFallback: Mode | null | undefined,
): Mode {
  return (override || inferred || sessionFallback || "find") as Mode;
}

export function detectMismatch(
  mode: Mode,
  query: string,
): { mismatched: boolean; suggested: Mode | null; reason: string } {
  const guess = guessCategory(query);
  if (guess === "neutral") return { mismatched: false, suggested: null, reason: "" };
  if (mode === "learn" && guess === "relax") {
    return {
      mismatched: true,
      suggested: "relax",
      reason: "This looks like an entertainment query — switch to Relax mode for better picks?",
    };
  }
  if (mode === "relax" && guess === "learn") {
    return {
      mismatched: true,
      suggested: "learn",
      reason: "This looks like a learning query — switch to Learn mode for tutorials and notes?",
    };
  }
  return { mismatched: false, suggested: null, reason: "" };
}
