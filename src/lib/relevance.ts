/**
 * ZenTube deterministic intent-relevance engine.
 *
 * NO AI / LLM is used anywhere in this file. Every score is produced by
 * transparent, reproducible rules: the same input always yields the same
 * output, and every point awarded is reported back as an explainable factor.
 */

export type IntentCategory =
  | "learning"
  | "work"
  | "skill"
  | "news"
  | "music"
  | "entertainment"
  | "fitness"
  | "relaxation"
  | "specific"
  | "other";

export const INTENT_CATEGORIES: Array<{
  id: IntentCategory;
  label: string;
  emoji: string;
  hint: string;
  /** Words that content in this category typically contains. */
  lexicon: string[];
}> = [
  { id: "learning", label: "Learning / Education", emoji: "📚", hint: "Courses, tutorials, explainers", lexicon: ["tutorial", "course", "learn", "lesson", "explained", "basics", "beginner", "guide", "lecture", "introduction", "crash", "study", "education", "concept", "example", "exercise", "chapter"] },
  { id: "work", label: "Work / Professional", emoji: "💼", hint: "Job, tools, productivity", lexicon: ["work", "career", "job", "interview", "resume", "productivity", "business", "meeting", "office", "excel", "project", "management", "professional", "client", "workflow"] },
  { id: "skill", label: "Skill Development", emoji: "🛠️", hint: "Practice and hands-on building", lexicon: ["build", "project", "practice", "hands", "howto", "how", "diy", "step", "make", "create", "workshop", "craft", "coding", "exercise", "drill"] },
  { id: "news", label: "News / Current Affairs", emoji: "📰", hint: "Headlines, analysis, updates", lexicon: ["news", "breaking", "update", "report", "headline", "today", "live", "politics", "election", "analysis", "coverage", "briefing", "market", "economy"] },
  { id: "music", label: "Music", emoji: "🎵", hint: "Songs, albums, live sets", lexicon: ["song", "music", "audio", "album", "lyrics", "official", "live", "cover", "remix", "playlist", "concert", "soundtrack", "beat", "instrumental"] },
  { id: "entertainment", label: "Entertainment", emoji: "🎬", hint: "Comedy, shows, gaming, vlogs", lexicon: ["funny", "comedy", "prank", "vlog", "movie", "trailer", "show", "episode", "gaming", "gameplay", "reaction", "sketch", "standup", "highlights", "meme", "entertainment", "roast"] },
  { id: "fitness", label: "Fitness / Health", emoji: "🏃", hint: "Workouts, nutrition, wellbeing", lexicon: ["workout", "fitness", "exercise", "gym", "yoga", "training", "health", "diet", "nutrition", "cardio", "stretch", "weight", "running", "wellness"] },
  { id: "relaxation", label: "Relaxation", emoji: "🧘", hint: "Calm down, unwind, rest", lexicon: ["relax", "calm", "chill", "lofi", "ambient", "asmr", "meditation", "sleep", "soothing", "peaceful", "nature", "rain", "unwind", "mindfulness"] },
  { id: "specific", label: "Looking for something specific", emoji: "🔎", hint: "One particular video or answer", lexicon: ["official", "full", "review", "fix", "solution", "answer", "demo", "walkthrough"] },
  { id: "other", label: "Other", emoji: "✏️", hint: "Describe it yourself", lexicon: [] },
];

const SHORT_LABELS: Record<IntentCategory, string> = {
  learning: "Learning",
  work: "Work",
  skill: "Skill",
  news: "News",
  music: "Music",
  entertainment: "Entertainment",
  fitness: "Fitness",
  relaxation: "Relaxation",
  specific: "Specific",
  other: "Other",
};

/** One-word label for compact UI (nav chip, tables). */
export function categoryShortLabel(id: IntentCategory): string {
  return SHORT_LABELS[id] ?? "Other";
}

export function categoryMeta(id: IntentCategory) {
  return INTENT_CATEGORIES.find((c) => c.id === id) ?? INTENT_CATEGORIES[INTENT_CATEGORIES.length - 1];
}

/** Local stop-word dictionary — never treated as meaningful intent keywords. */
export const STOP_WORDS = new Set<string>([
  "a", "an", "the", "and", "or", "but", "if", "then", "than", "so", "because",
  "i", "im", "me", "my", "mine", "myself", "we", "our", "you", "your", "it", "its",
  "is", "am", "are", "was", "were", "be", "been", "being", "do", "does", "did",
  "have", "has", "had", "will", "would", "shall", "should", "can", "could", "may",
  "might", "must", "just", "want", "wanna", "wanted", "need", "needed", "like",
  "watch", "watching", "see", "seeing", "look", "looking", "get", "getting",
  "go", "going", "some", "something", "anything", "stuff", "thing", "things",
  "to", "of", "in", "on", "for", "with", "about", "from", "into", "at", "by",
  "up", "out", "over", "again", "more", "most", "very", "really", "now", "today",
  "tonight", "time", "bit", "little", "few", "this", "that", "these", "those",
  "there", "here", "how", "what", "when", "where", "why", "who", "which",
  "video", "videos", "youtube", "zentube", "content", "channel", "please",
]);

/** Words that carry intention but are too broad to be a topic on their own. */
const WEAK_TOPIC_WORDS = new Set(["learn", "learning", "study", "relax", "relaxing", "fun", "good", "nice", "new", "best", "top"]);

const SYNONYMS: Record<string, string[]> = {
  powerbi: ["power", "bi", "pbi"],
  bi: ["powerbi"],
  js: ["javascript"],
  javascript: ["js"],
  ts: ["typescript"],
  typescript: ["ts"],
  py: ["python"],
  python: ["py"],
  ml: ["machine", "learning"],
  ai: ["artificial", "intelligence"],
  db: ["database"],
  sql: ["query", "queries", "database"],
  workout: ["exercise", "training", "gym"],
  comedy: ["funny", "standup", "humour", "humor"],
  song: ["music", "audio", "track"],
  music: ["song", "audio", "track"],
  movie: ["film", "cinema"],
  news: ["headlines", "update", "report"],
  dax: ["measure", "measures", "formula"],
  interview: ["questions", "hiring"],
  yoga: ["stretch", "meditation"],
  meditation: ["mindfulness", "calm"],
};

const PLURAL_RX = /(ies|es|s)$/;

function singular(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith("ies")) return token.slice(0, -3) + "y";
  if (token.endsWith("ses") || token.endsWith("xes") || token.endsWith("zes")) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token.replace(PLURAL_RX, "");
}

export function normalizeText(value: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/&amp;/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  return normalizeText(value).split(" ").filter(Boolean);
}

/** Meaningful keywords from a free-form intention, in a stable order. */
export function extractKeywords(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tokenize(text)) {
    if (raw.length < 2) continue;
    if (STOP_WORDS.has(raw)) continue;
    const key = singular(raw);
    if (!key || key.length < 2) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** A keyword is "strong" when it names an actual topic, not just an attitude. */
export function strongKeywords(keywords: string[]): string[] {
  return keywords.filter((k) => !WEAK_TOPIC_WORDS.has(k) && k.length >= 2);
}

export type IntentValidation = { ok: boolean; message?: string; keywords: string[] };

/** Rejects intentions like "I just want to watch YouTube." */
export function validateIntent(text: string, category: IntentCategory | null): IntentValidation {
  const trimmed = (text || "").trim();
  const keywords = extractKeywords(trimmed);
  const strong = strongKeywords(keywords);
  if (!category) return { ok: false, message: "Pick the category that best fits this visit.", keywords };
  if (trimmed.length < 8) {
    return { ok: false, message: "Add a little more detail — what do you actually want to watch or accomplish?", keywords };
  }
  if (strong.length < 1) {
    return {
      ok: false,
      message: "That's too general. Name the topic, skill or mood you're after — for example “learn Power BI DAX basics” or “relax with 20 minutes of stand-up comedy”.",
      keywords,
    };
  }
  return { ok: true, keywords };
}

// --- Relevance scoring -----------------------------------------------------

export type RelevanceClass = "highly_relevant" | "relevant" | "partially_relevant" | "mostly_unrelated" | "unrelated";

export const RELEVANCE_LABELS: Record<RelevanceClass, string> = {
  highly_relevant: "Highly Relevant",
  relevant: "Relevant",
  partially_relevant: "Partially Relevant",
  mostly_unrelated: "Mostly Unrelated",
  unrelated: "Unrelated",
};

export type RelevanceFactor = { label: string; points: number };

export type RelevanceResult = {
  score: number;
  classification: RelevanceClass;
  factors: RelevanceFactor[];
};

export type VideoMetadata = {
  title?: string | null;
  description?: string | null;
  channel?: string | null;
  category?: string | null;
  tags?: string[] | null;
  searchQuery?: string | null;
};

export type IntentContext = {
  category: IntentCategory;
  keywords: string[];
};

function expand(keyword: string): string[] {
  const extra = SYNONYMS[keyword] ?? [];
  return [keyword, ...extra];
}

/** Coverage of intent keywords inside a haystack: 1 = every keyword present. */
function coverage(keywords: string[], haystackTokens: Set<string>, haystack: string): { exact: number; partial: number } {
  let exact = 0;
  let partial = 0;
  for (const keyword of keywords) {
    const variants = expand(keyword);
    if (variants.some((v) => haystackTokens.has(v) || haystackTokens.has(singular(v)))) {
      exact += 1;
      continue;
    }
    if (keyword.length >= 4 && variants.some((v) => haystack.includes(v))) partial += 1;
  }
  return { exact, partial };
}

export function classify(score: number): RelevanceClass {
  if (score >= 81) return "highly_relevant";
  if (score >= 61) return "relevant";
  if (score >= 41) return "partially_relevant";
  if (score >= 21) return "mostly_unrelated";
  return "unrelated";
}

/**
 * Content relevance only — how well the video matches the declared intention.
 * Engagement (how much was actually watched) is scored separately, on purpose.
 */
export function scoreRelevance(intent: IntentContext, video: VideoMetadata): RelevanceResult {
  const factors: RelevanceFactor[] = [];
  const keywords = strongKeywords(intent.keywords.map(singular));
  const meta = categoryMeta(intent.category);

  const titleNorm = normalizeText(video.title || "");
  const descNorm = normalizeText(video.description || "").slice(0, 1200);
  const tagsNorm = normalizeText((video.tags || []).join(" "));
  const channelNorm = normalizeText(video.channel || "");
  const queryNorm = normalizeText(video.searchQuery || "");
  const catNorm = normalizeText(video.category || "");

  const titleTokens = new Set(titleNorm.split(" ").map(singular));
  const descTokens = new Set(descNorm.split(" ").map(singular));
  const tagTokens = new Set(tagsNorm.split(" ").map(singular));
  const channelTokens = new Set(channelNorm.split(" ").map(singular));
  const queryTokens = new Set(queryNorm.split(" ").map(singular));

  let score = 0;
  const hasMetadata = !!(titleNorm || descNorm || tagsNorm);

  // 1. Title match — the single strongest signal (max 45)
  if (keywords.length) {
    const { exact, partial } = coverage(keywords, titleTokens, titleNorm);
    const ratio = Math.min(1, (exact + partial * 0.5) / keywords.length);
    const points = Math.round(ratio * 45);
    score += points;
    if (exact > 0 || partial > 0) {
      const matched = keywords.filter((k) => expand(k).some((v) => titleTokens.has(singular(v)) || titleNorm.includes(v)));
      factors.push({ label: `Title matched intent keyword${matched.length > 1 ? "s" : ""}: ${matched.join(", ")}`, points });
    } else {
      factors.push({ label: "No intent keyword found in the title", points: 0 });
    }
  }

  // 2. Description match (max 15)
  if (keywords.length && descNorm) {
    const { exact, partial } = coverage(keywords, descTokens, descNorm);
    const ratio = Math.min(1, (exact + partial * 0.5) / keywords.length);
    const points = Math.round(ratio * 15);
    if (points > 0) factors.push({ label: "Description mentions your intent keywords", points });
    score += points;
  }

  // 3. Tags (max 10)
  if (keywords.length && tagsNorm) {
    const { exact } = coverage(keywords, tagTokens, tagsNorm);
    const points = Math.round(Math.min(1, exact / keywords.length) * 10);
    if (points > 0) factors.push({ label: "Video tags match your intent", points });
    score += points;
  }

  // 4. Channel name (max 5)
  if (keywords.length && channelNorm) {
    const { exact } = coverage(keywords, channelTokens, channelNorm);
    if (exact > 0) {
      factors.push({ label: "Channel name relates to your intent", points: 5 });
      score += 5;
    }
  }

  // 5. Search query that led here (max 15)
  if (keywords.length && queryNorm) {
    const { exact, partial } = coverage(keywords, queryTokens, queryNorm);
    const ratio = Math.min(1, (exact + partial * 0.5) / keywords.length);
    const points = Math.round(ratio * 15);
    if (points > 0) factors.push({ label: `Your search “${(video.searchQuery || "").trim()}” matches the declared objective`, points });
    else factors.push({ label: "The search that led here was unrelated to your objective", points: 0 });
    score += points;
  }

  // 6. Category compatibility (max 20)
  const lexicon = meta.lexicon;
  const haystack = `${titleNorm} ${descNorm.slice(0, 400)} ${tagsNorm} ${catNorm}`;
  const hits = lexicon.filter((word) => haystack.includes(word)).length;
  if (hits > 0) {
    const points = Math.min(20, 8 + hits * 4);
    factors.push({ label: `Content type matches your “${meta.label}” intention`, points });
    score += points;
  } else if (hasMetadata) {
    factors.push({ label: `Content type does not look like “${meta.label}”`, points: 0 });
  }

  // 7. A well-matched title on its own should never be capped too low.
  if (!hasMetadata) {
    factors.push({ label: "Video metadata was unavailable — scored from watch context only", points: 10 });
    score += 10;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, classification: classify(score), factors };
}

// --- Engagement ------------------------------------------------------------

export type EngagementInput = {
  effectiveSeconds: number;
  videoDurationSeconds?: number | null;
  replayed?: boolean;
};

export type Engagement = {
  completionPercent: number;
  skipped: boolean;
  meaningful: boolean;
};

export function evaluateEngagement(input: EngagementInput): Engagement {
  const watched = Math.max(0, Math.round(input.effectiveSeconds || 0));
  const duration = Math.max(0, Math.round(input.videoDurationSeconds || 0));
  const completionPercent = duration > 0 ? Math.max(0, Math.min(100, Math.round((watched / duration) * 100))) : 0;
  const skipped = watched < 30 && completionPercent < 10;
  const meaningful = watched >= 60 || completionPercent >= 25 || !!input.replayed;
  return { completionPercent, skipped, meaningful };
}

// --- Session alignment -----------------------------------------------------

export type ScoredInteraction = {
  relevanceScore: number;
  effectiveSeconds: number;
  completionPercent: number;
};

export type SessionAlignment = {
  alignment: number;
  relevantSeconds: number;
  unrelatedSeconds: number;
  relevantVideos: number;
  unrelatedVideos: number;
  averageRelevance: number;
  summary: string;
};

const RELEVANT_THRESHOLD = 61;

export function scoreSession(interactions: ScoredInteraction[]): SessionAlignment {
  const watched = interactions.filter((i) => i.effectiveSeconds > 0);
  if (watched.length === 0) {
    return {
      alignment: 0, relevantSeconds: 0, unrelatedSeconds: 0,
      relevantVideos: 0, unrelatedVideos: 0, averageRelevance: 0,
      summary: "No watch time recorded for this session yet.",
    };
  }

  const totalSeconds = watched.reduce((sum, i) => sum + i.effectiveSeconds, 0);
  const relevantSeconds = watched.filter((i) => i.relevanceScore >= RELEVANT_THRESHOLD).reduce((s, i) => s + i.effectiveSeconds, 0);
  const partialSeconds = watched.filter((i) => i.relevanceScore >= 41 && i.relevanceScore < RELEVANT_THRESHOLD).reduce((s, i) => s + i.effectiveSeconds, 0);
  const unrelatedSeconds = Math.max(0, totalSeconds - relevantSeconds - partialSeconds);

  // 1. Share of watch time on aligned content (weight 55) — partial counts half.
  const timeShare = (relevantSeconds + partialSeconds * 0.5) / totalSeconds;
  // 2. Watch-time weighted average relevance (weight 30).
  const weightedRelevance = watched.reduce((sum, i) => sum + i.relevanceScore * i.effectiveSeconds, 0) / totalSeconds / 100;
  // 3. Share of videos that were aligned (weight 15).
  const videoShare = watched.filter((i) => i.relevanceScore >= 41).length / watched.length;

  let alignment = timeShare * 55 + weightedRelevance * 30 + videoShare * 15;

  // Gentle penalty for repeatedly jumping onto unrelated content.
  const unrelatedTransitions = watched.filter((i) => i.relevanceScore < 41 && i.effectiveSeconds >= 60).length;
  alignment -= Math.min(8, unrelatedTransitions * 2);

  alignment = Math.max(0, Math.min(100, Math.round(alignment)));
  const averageRelevance = Math.round(watched.reduce((s, i) => s + i.relevanceScore, 0) / watched.length);

  return {
    alignment,
    relevantSeconds: Math.round(relevantSeconds + partialSeconds),
    unrelatedSeconds: Math.round(unrelatedSeconds),
    relevantVideos: watched.filter((i) => i.relevanceScore >= 41).length,
    unrelatedVideos: watched.filter((i) => i.relevanceScore < 41).length,
    averageRelevance,
    summary: alignmentSummary(alignment),
  };
}

export function alignmentSummary(alignment: number): string {
  if (alignment >= 80) return "You stayed highly aligned with your original goal.";
  if (alignment >= 60) return "Most of your watch time matched what you set out to do.";
  if (alignment >= 40) return "Roughly half of your watch time matched your original goal.";
  if (alignment >= 20) return "Less than half of your watch time was aligned with your original goal.";
  return "Most of your watch time went to content unrelated to your declared intention.";
}

export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.round(total));
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m`;
  return `${s}s`;
}
