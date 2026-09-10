/**
 * Weekly intent report.
 *
 * Turns raw sessions / segments / video interactions into a human readable
 * weekly digest: how much of the week's watching actually served the stated
 * intention, where it drifted, and one honest verdict line.
 *
 * `demoWeeklyReport()` returns a plausible, fully populated report so the
 * layout can be previewed before enough real data exists.
 */

import { categoryMeta, categoryShortLabel, type IntentCategory } from "@/lib/relevance";

export type ReportDay = {
  /** Mon, Tue, … */
  label: string;
  date: string;
  watched: number; // seconds
  onIntent: number; // seconds
  sessions: number;
};

export type ReportCategory = {
  id: IntentCategory;
  label: string;
  emoji: string;
  seconds: number;
  alignment: number;
};

export type WeeklyReport = {
  demo: boolean;
  rangeLabel: string;
  alignment: number;
  previousAlignment: number | null;
  totals: {
    watched: number;
    onIntent: number;
    drifted: number;
    sessions: number;
    videos: number;
    avgSession: number;
    intentionDays: number;
  };
  days: ReportDay[];
  categories: ReportCategory[];
  best: { intent: string; alignment: number; seconds: number; category: IntentCategory } | null;
  drift: { title: string; channel: string; seconds: number; score: number } | null;
  verdict: string;
  highlights: Array<{ tone: "good" | "watch" | "info"; text: string }>;
};

const DAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const RANGE_FMT = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

export type ReportSession = {
  id: string;
  started_at: string;
  active_seconds: number;
  primary_category: string;
  primary_intent: string;
};

export type ReportInteraction = {
  session_id: string;
  title: string | null;
  channel: string | null;
  started_at: string;
  effective_seconds: number;
  relevance_score: number;
};

const ALIGNED_AT = 61;

function verdictFor(alignment: number, watched: number): string {
  if (watched < 300) return "Too little watching this week to judge — the record is basically empty.";
  if (alignment >= 85) return "An unusually disciplined week. Nearly everything you watched served what you came for.";
  if (alignment >= 70) return "A solid week. Most of your time matched your intention, with a few honest detours.";
  if (alignment >= 50) return "Half-and-half. Your intentions were clear, but the second half of sessions tended to wander.";
  return "This week drifted. You set intentions, then watched something else — worth noticing, not punishing.";
}

export function buildWeeklyReport(
  sessions: ReportSession[],
  interactions: ReportInteraction[],
  now = new Date(),
): WeeklyReport {
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  const days: ReportDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push({
      label: DAY_FMT.format(d),
      date: d.toDateString(),
      watched: 0,
      onIntent: 0,
      sessions: 0,
    });
  }
  const byDate = new Map(days.map((d) => [d.date, d]));

  let watched = 0;
  let onIntent = 0;
  for (const i of interactions) {
    const secs = i.effective_seconds || 0;
    const aligned = i.relevance_score >= ALIGNED_AT ? secs : 0;
    watched += secs;
    onIntent += aligned;
    const day = byDate.get(new Date(i.started_at).toDateString());
    if (day) {
      day.watched += secs;
      day.onIntent += aligned;
    }
  }
  for (const s of sessions) {
    const day = byDate.get(new Date(s.started_at).toDateString());
    if (day) day.sessions += 1;
  }

  // Category split, weighted by watched time in each session.
  const catMap = new Map<IntentCategory, { seconds: number; aligned: number }>();
  const sessionSeconds = new Map<string, { total: number; aligned: number }>();
  for (const i of interactions) {
    const cur = sessionSeconds.get(i.session_id) ?? { total: 0, aligned: 0 };
    cur.total += i.effective_seconds || 0;
    if (i.relevance_score >= ALIGNED_AT) cur.aligned += i.effective_seconds || 0;
    sessionSeconds.set(i.session_id, cur);
  }
  for (const s of sessions) {
    const agg = sessionSeconds.get(s.id);
    if (!agg || agg.total <= 0) continue;
    const key = s.primary_category as IntentCategory;
    const cur = catMap.get(key) ?? { seconds: 0, aligned: 0 };
    cur.seconds += agg.total;
    cur.aligned += agg.aligned;
    catMap.set(key, cur);
  }
  const categories: ReportCategory[] = [...catMap.entries()]
    .map(([id, v]) => ({
      id,
      label: categoryShortLabel(id),
      emoji: categoryMeta(id).emoji,
      seconds: v.seconds,
      alignment: v.seconds > 0 ? Math.round((v.aligned / v.seconds) * 100) : 0,
    }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 5);

  // Best session and biggest drift.
  let best: WeeklyReport["best"] = null;
  for (const s of sessions) {
    const agg = sessionSeconds.get(s.id);
    if (!agg || agg.total < 120) continue;
    const pct = Math.round((agg.aligned / agg.total) * 100);
    if (!best || pct > best.alignment) {
      best = {
        intent: s.primary_intent,
        alignment: pct,
        seconds: agg.total,
        category: s.primary_category as IntentCategory,
      };
    }
  }

  let drift: WeeklyReport["drift"] = null;
  for (const i of interactions) {
    if (i.relevance_score >= ALIGNED_AT) continue;
    if (!drift || (i.effective_seconds || 0) > drift.seconds) {
      drift = {
        title: i.title || "Untitled video",
        channel: i.channel || "Unknown channel",
        seconds: i.effective_seconds || 0,
        score: i.relevance_score,
      };
    }
  }

  const alignment = watched > 0 ? Math.round((onIntent / watched) * 100) : 0;
  const intentionDays = days.filter((d) => d.sessions > 0).length;
  const activeDays = days.filter((d) => d.watched > 0);
  const busiest = [...days].sort((a, b) => b.watched - a.watched)[0];

  const highlights: WeeklyReport["highlights"] = [];
  if (best) {
    highlights.push({
      tone: "good",
      text: `Your sharpest session was “${best.intent}” — ${best.alignment}% of it stayed on purpose.`,
    });
  }
  if (drift && drift.seconds > 120) {
    highlights.push({
      tone: "watch",
      text: `${Math.round(drift.seconds / 60)} minutes went to “${drift.title}”, which barely matched what you came for.`,
    });
  }
  if (busiest && busiest.watched > 0) {
    highlights.push({
      tone: "info",
      text: `${busiest.label} was your heaviest day with ${Math.round(busiest.watched / 60)} minutes watched.`,
    });
  }
  if (activeDays.length > 0) {
    highlights.push({
      tone: "info",
      text: `You declared an intention on ${intentionDays} of 7 days.`,
    });
  }

  return {
    demo: false,
    rangeLabel: `${RANGE_FMT.format(start)} – ${RANGE_FMT.format(now)}`,
    alignment,
    previousAlignment: null,
    totals: {
      watched,
      onIntent,
      drifted: Math.max(0, watched - onIntent),
      sessions: sessions.length,
      videos: interactions.length,
      avgSession: sessions.length > 0 ? Math.round(watched / sessions.length) : 0,
      intentionDays,
    },
    days,
    categories,
    best,
    drift,
    verdict: verdictFor(alignment, watched),
    highlights,
  };
}

/** A realistic, hand-built week used to preview the report layout. */
export function demoWeeklyReport(now = new Date()): WeeklyReport {
  const start = new Date(now);
  start.setDate(start.getDate() - 6);

  const shape = [
    { watched: 42, onIntent: 36, sessions: 2 },
    { watched: 28, onIntent: 25, sessions: 1 },
    { watched: 66, onIntent: 39, sessions: 3 },
    { watched: 18, onIntent: 17, sessions: 1 },
    { watched: 54, onIntent: 44, sessions: 2 },
    { watched: 91, onIntent: 41, sessions: 3 },
    { watched: 35, onIntent: 30, sessions: 1 },
  ];

  const days: ReportDay[] = shape.map((s, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return {
      label: DAY_FMT.format(d),
      date: d.toDateString(),
      watched: s.watched * 60,
      onIntent: s.onIntent * 60,
      sessions: s.sessions,
    };
  });

  const watched = days.reduce((n, d) => n + d.watched, 0);
  const onIntent = days.reduce((n, d) => n + d.onIntent, 0);
  const sessions = days.reduce((n, d) => n + d.sessions, 0);
  const alignment = Math.round((onIntent / watched) * 100);

  const cats: Array<[IntentCategory, number, number]> = [
    ["learning", 148 * 60, 86],
    ["skill", 74 * 60, 79],
    ["entertainment", 61 * 60, 34],
    ["music", 33 * 60, 71],
    ["news", 18 * 60, 52],
  ];

  return {
    demo: true,
    rangeLabel: `${RANGE_FMT.format(start)} – ${RANGE_FMT.format(now)}`,
    alignment,
    previousAlignment: alignment - 9,
    totals: {
      watched,
      onIntent,
      drifted: watched - onIntent,
      sessions,
      videos: 37,
      avgSession: Math.round(watched / sessions),
      intentionDays: 7,
    },
    days,
    categories: cats.map(([id, seconds, a]) => ({
      id,
      label: categoryShortLabel(id),
      emoji: categoryMeta(id).emoji,
      seconds,
      alignment: a,
    })),
    best: {
      intent: "Learn Power BI DAX basics with worked examples",
      alignment: 94,
      seconds: 63 * 60,
      category: "learning",
    },
    drift: {
      title: "Top 20 most satisfying factory machines",
      channel: "MegaClipsDaily",
      seconds: 27 * 60,
      score: 18,
    },
    verdict: verdictFor(alignment, watched),
    highlights: [
      {
        tone: "good",
        text: "Your sharpest session was “Learn Power BI DAX basics with worked examples” — 94% of it stayed on purpose.",
      },
      {
        tone: "watch",
        text: "Friday evening is where the week slips: 50 of 91 minutes drifted after 9pm.",
      },
      {
        tone: "info",
        text: "Sessions that began with a specific sentence stayed on intention 2.3× longer than vague ones.",
      },
      { tone: "info", text: "You declared an intention on all 7 days — the habit is holding." },
    ],
  };
}
