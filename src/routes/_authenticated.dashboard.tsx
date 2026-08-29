import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip as UITooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { inferIntentFromVideo, guessCategory } from "@/lib/intent";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Insights — ZenTube" }] }),
  component: Dashboard,
});

type Row = {
  mode: string;
  final_intent: string | null;
  watch_seconds: number;
  effective_seconds: number;
  seek_count: number;
  duration_seconds: number | null;
  watched_at: string;
  title: string | null;
  channel: string | null;
  category: string | null;
};

const COLORS = {
  learn: "#1D9E75",
  ent: "#D4537E",
  other: "#B4B2A9",
  warn: "#E24B4A",
  amber: "#EF9F27",
  mint: "#5DCAA5",
  goal: "#B4B2A9",
};

const HMAP = ["#f1efeb", "#e1f5ee", "#9FE1CB", "#5DCAA5", "#1D9E75", "#0F6E56", "#085041"];
function heatColor(v: number) {
  if (!v) return HMAP[0];
  if (v < 12) return HMAP[1];
  if (v < 30) return HMAP[2];
  if (v < 50) return HMAP[3];
  if (v < 70) return HMAP[4];
  if (v < 88) return HMAP[5];
  return HMAP[6];
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function fmtMin(sec: number) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = (m / 60).toFixed(1);
  return `${h} hrs`;
}

// Second-level accurate duration: "1h 23m 45s" / "12m 04s" / "47s"
function fmtTime(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${m}m ${ss}s`;
  if (m > 0) return `${m}m ${String(ss).padStart(2, "0")}s`;
  return `${ss}s`;
}

function intentOf(r: Row): "learn" | "relax" | "find" | "explore" | "other" {
  const explicit = (r.final_intent || r.mode || "").toLowerCase();
  if (explicit === "learn" || explicit === "relax" || explicit === "find" || explicit === "explore") {
    return explicit as "learn" | "relax" | "find" | "explore";
  }
  const inferred = inferIntentFromVideo({ title: r.title || "", channel: r.channel || "" });
  if (inferred === "learn" || inferred === "relax") return inferred;
  const g = guessCategory(`${r.title || ""} ${r.channel || ""}`);
  if (g === "learn" || g === "relax") return g;
  return "other";
}

function Dashboard() {
  const { user } = useAuth();
  const now = new Date();
  const [cur, setCur] = useState({ y: now.getFullYear(), m: now.getMonth() });

  // Cached across navigation so going back to Insights feels instant.
  const { data: rows = null } = useQuery({
    queryKey: ["watch-history-insights", user?.id ?? "anon"],
    enabled: !!user,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data } = await supabase
        .from("watch_history")
        .select("mode, final_intent, watch_seconds, effective_seconds, seek_count, duration_seconds, watched_at, title, channel, category")
        .eq("user_id", user!.id)
        .order("watched_at", { ascending: false })
        .limit(1000);
      return (data || []) as Row[];
    },
  });

  const data = useMemo(() => {
    if (!rows) return null;
    const monthStart = new Date(cur.y, cur.m, 1);
    const monthEnd = new Date(cur.y, cur.m + 1, 1);
    const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
    const inMonth = rows.filter((r) => {
      const d = new Date(r.watched_at);
      return d >= monthStart && d < monthEnd;
    });
    const periodAnchor = (() => {
      if (inMonth.length === 0) {
        const d = new Date(monthEnd); d.setDate(d.getDate() - 1); d.setHours(0,0,0,0); return d;
      }
      const latest = inMonth.reduce((acc, r) => {
        const t = new Date(r.watched_at).getTime();
        return t > acc ? t : acc;
      }, 0);
      const d = new Date(latest); d.setHours(0,0,0,0); return d;
    })();
    const periodAnchorEnd = new Date(periodAnchor);
    periodAnchorEnd.setDate(periodAnchorEnd.getDate() + 1);

    // All-time totals by intent (drives top strip)
    let allLearn = 0, allEnt = 0, allFind = 0, allExplore = 0, allOther = 0;
    for (const r of rows) {
      const sec = r.effective_seconds || 0;
      const i = intentOf(r);
      if (i === "learn") allLearn += sec;
      else if (i === "relax") allEnt += sec;
      else if (i === "find") allFind += sec;
      else if (i === "explore") allExplore += sec;
      else allOther += sec;
    }
    const totalAll = allLearn + allEnt + allFind + allExplore + allOther;

    // Today (real-world) totals — drives the second strip row
    const today0 = new Date(); today0.setHours(0, 0, 0, 0);
    const today1 = new Date(today0); today1.setDate(today0.getDate() + 1);
    let tdLearn = 0, tdEnt = 0, tdFind = 0, tdOther = 0, tdVideos = 0;
    for (const r of rows) {
      const t = new Date(r.watched_at).getTime();
      if (t < today0.getTime() || t >= today1.getTime()) continue;
      tdVideos++;
      const sec = r.effective_seconds || 0;
      const i = intentOf(r);
      if (i === "learn") tdLearn += sec;
      else if (i === "relax") tdEnt += sec;
      else if (i === "find") tdFind += sec;
      else tdOther += sec;
    }
    const tdTotal = tdLearn + tdEnt + tdFind + tdOther;

    let learn = 0, ent = 0, find = 0, explore = 0, other = 0;
    for (const r of inMonth) {
      const sec = r.effective_seconds || 0;
      const i = intentOf(r);
      if (i === "learn") learn += sec;
      else if (i === "relax") ent += sec;
      else if (i === "find") find += sec;
      else if (i === "explore") explore += sec;
      else other += sec;
    }
    const monthEff = learn + ent + find + explore + other;
    const monthRaw = inMonth.reduce((s, r) => s + Math.max(r.watch_seconds || 0, r.effective_seconds || 0), 0);
    const monthVideos = inMonth.length;
    const totalSeeks = inMonth.reduce((s, r) => s + (r.seek_count || 0), 0);

    const withDur = inMonth.filter((r) => (r.duration_seconds || 0) > 60);
    const finished = withDur.filter((r) => (r.effective_seconds || 0) / (r.duration_seconds || 1) >= 0.85).length;
    const completionPct = withDur.length ? Math.round((finished / withDur.length) * 100) : 0;
    const avgCompletion = withDur.length
      ? withDur.reduce((s, r) => s + Math.min(1, (r.effective_seconds || 0) / (r.duration_seconds || 1)), 0) / withDur.length
      : 0;

    const seeksPerVideo = inMonth.length ? totalSeeks / inMonth.length : 0;
    const focus = Math.round(
      Math.max(0, Math.min(1, avgCompletion * 0.7 + Math.max(0, 1 - seeksPerVideo / 10) * 0.3)) * 100,
    );
    const focusLabel = focus > 70 ? "focused" : focus > 40 ? "drifting" : "scattered";

    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const d = new Date(periodAnchor);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const has = rows.some((r) => {
        if (intentOf(r) !== "learn") return false;
        const t = new Date(r.watched_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      });
      if (has) streak++;
      else if (i > 0) break;
      else break;
    }
    const todayHasLearn = streak > 0 && (() => {
      const d = new Date(periodAnchor); d.setHours(0, 0, 0, 0);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      return rows.some((r) => {
        if (intentOf(r) !== "learn") return false;
        const t = new Date(r.watched_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      });
    })();

    // Full selected month — every day, labelled by day number.
    const daysMonth: { day: string; dayNum: number; learn: number; ent: number; other: number }[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(cur.y, cur.m, i); d.setHours(0, 0, 0, 0);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      let l = 0, e = 0, o = 0;
      for (const r of inMonth) {
        const t = new Date(r.watched_at).getTime();
        if (t < d.getTime() || t >= next.getTime()) continue;
        const sec = (r.effective_seconds || 0);
        const min = sec / 60;
        const i2 = intentOf(r);
        if (i2 === "learn") l += min;
        else if (i2 === "relax") e += min;
        else o += min;
      }
      daysMonth.push({
        day: String(i), dayNum: i,
        learn: Math.round(l), ent: Math.round(e), other: Math.round(o),
      });
    }

    const heat: number[] = [];
    for (let w = 9; w >= 0; w--) {
      for (let d = 0; d < 7; d++) {
        const day = new Date(periodAnchor);
        day.setHours(0, 0, 0, 0);
        day.setDate(day.getDate() - (w * 7 + (6 - d)));
        const next = new Date(day);
        next.setDate(day.getDate() + 1);
        const inDay = rows.filter((r) => {
          const t = new Date(r.watched_at).getTime();
          return t >= day.getTime() && t < next.getTime();
        });
        if (!inDay.length) { heat.push(0); continue; }
        const wd = inDay.filter((r) => (r.duration_seconds || 0) > 60);
        const ac = wd.length
          ? wd.reduce((s, r) => s + Math.min(1, (r.effective_seconds || 0) / (r.duration_seconds || 1)), 0) / wd.length
          : 0;
        const sk = inDay.reduce((s, r) => s + (r.seek_count || 0), 0) / inDay.length;
        heat.push(Math.round(Math.max(0, Math.min(1, ac * 0.7 + Math.max(0, 1 - sk / 10) * 0.3)) * 100));
      }
    }

    const hourMin = new Array(24).fill(0);
    const hourLearnMin = new Array(24).fill(0);
    for (const r of inMonth) {
      const h = new Date(r.watched_at).getHours();
      const m = (r.effective_seconds || 0) / 60;
      hourMin[h] += m;
      if (intentOf(r) === "learn") hourLearnMin[h] += m;
    }
    const peakIdx = hourMin.indexOf(Math.max(...hourMin));
    const focusWindow = (() => {
      let best = { start: 9, score: 0 };
      for (let i = 0; i <= 21; i++) {
        const tot = hourMin[i] + hourMin[i+1] + hourMin[i+2];
        if (tot < 1) continue;
        const lrn = hourLearnMin[i] + hourLearnMin[i+1] + hourLearnMin[i+2];
        const score = lrn / tot;
        if (score > best.score) best = { start: i, score };
      }
      return best;
    })();

    const videos = inMonth
      .filter((r) => (r.duration_seconds || 0) > 30)
      .map((r) => {
        const dur = r.duration_seconds || 1;
        const eff = r.effective_seconds || 0;
        const pct = Math.min(100, Math.round((eff / dur) * 100));
        return {
          title: r.title || "Untitled",
          pct,
          intent: intentOf(r) === "learn" ? "l" as const : "r" as const,
          dur: fmtDur(dur),
        };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 8);

    const drift: { w: string; learn: number; ent: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const start = new Date(periodAnchor); start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - (w * 7 + 6));
      const end = new Date(start); end.setDate(start.getDate() + 7);
      let l = 0, e = 0, t = 0;
      for (const r of rows) {
        const ti = new Date(r.watched_at).getTime();
        if (ti < start.getTime() || ti >= end.getTime()) continue;
        const sec = r.effective_seconds || 0;
        t += sec;
        const i = intentOf(r);
        if (i === "learn") l += sec;
        else if (i === "relax") e += sec;
      }
      drift.push({
        w: `W${8 - w}`,
        learn: t ? Math.round((l / t) * 100) : 0,
        ent: t ? Math.round((e / t) * 100) : 0,
      });
    }

    const chMap: Record<string, number> = {};
    for (const r of inMonth) {
      const k = r.channel || "Unknown";
      chMap[k] = (chMap[k] || 0) + (r.effective_seconds || 0);
    }
    const topChannels = Object.entries(chMap)
      .map(([name, sec]) => ({ name, min: Math.max(1, Math.round(sec / 60)) }))
      .sort((a, b) => b.min - a.min)
      .slice(0, 5);

    const anchorRows = rows.filter((r) => {
      const t = new Date(r.watched_at).getTime();
      return t >= periodAnchor.getTime() && t < periodAnchorEnd.getTime();
    });
    const bestDaySec = (() => {
      const byDay: Record<string, number> = {};
      for (const r of inMonth) {
        const key = new Date(r.watched_at).toDateString();
        byDay[key] = (byDay[key] || 0) + ((r.effective_seconds || 0));
      }
      return Math.max(0, ...Object.values(byDay));
    })();
    const activeDays = new Set(inMonth.map((r) => new Date(r.watched_at).toDateString())).size;
    const avgPerVideoSec = inMonth.length ? Math.round(monthEff / inMonth.length) : 0;

    const sessions = anchorRows.map((r) => {
      const start = new Date(r.watched_at);
      return {
        start: start.getHours() + start.getMinutes() / 60,
        dur: Math.max(1, Math.round(((r.effective_seconds || 0)) / 60)),
        m: intentOf(r) === "learn" ? "l" : "r",
      };
    });

    const radar = [
      { k: "Completion", you: Math.round(avgCompletion * 100), goal: 60 },
      { k: "Focus", you: focus, goal: 70 },
      { k: "Depth", you: Math.min(100, Math.round((monthEff / 60) / Math.max(1, monthVideos) * 5)), goal: 65 },
      { k: "Consistency", you: Math.min(100, streak * 14), goal: 70 },
      { k: "Intentionality", you: monthEff ? Math.round(((learn + find) / monthEff) * 100) : 0, goal: 60 },
      { k: "Brevity", you: Math.max(0, Math.round(100 - seeksPerVideo * 10)), goal: 60 },
    ];

    const learnPct = monthEff ? Math.round((learn / monthEff) * 100) : 0;
    const entPct = monthEff ? Math.round((ent / monthEff) * 100) : 0;
    const findPct = monthEff ? Math.round((find / monthEff) * 100) : 0;

    const learnNow = drift[drift.length - 1]?.learn ?? 0;
    const learn4w = drift[Math.max(0, drift.length - 5)]?.learn ?? 0;
    const learnDelta = learnNow - learn4w;

    const videosFinished = inMonth.filter(
      (r) => r.duration_seconds && (r.effective_seconds || 0) >= (r.duration_seconds || 0) * 0.85,
    ).length;
    const skippedSec = Math.max(0, monthRaw - monthEff);
    const skippedPct = monthRaw ? Math.round((skippedSec / monthRaw) * 100) : 0;

    return {
      totalAll, allLearn, allEnt, allFind,
      tdTotal, tdLearn, tdEnt, tdFind, tdVideos,
      monthEff, monthRaw, monthVideos, videoCount: monthVideos, videosFinished, skippedSec, skippedPct, totalEff: monthEff,
      learn, ent, find, learnPct, entPct, findPct,
      completionPct, finished, focus, focusLabel, streak, todayHasLearn,
      daysMonth, daysInMonth, heat, hourMin, hourLearnMin, peakIdx, focusWindow,
      videos, drift, topChannels, sessions, radar, learnDelta, seeksPerVideo, avgCompletion,
      bestDaySec, activeDays, avgPerVideoSec,
    };
  }, [rows, cur]);

  if (rows === null) {
    return (
      <div className="zen-container-wide py-10">
        <Skeleton className="h-28 w-full rounded-3xl" />
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-3xl" />)}
        </div>
        <Skeleton className="mt-4 h-72 w-full rounded-3xl" />
      </div>
    );
  }

  const monthLabel = `${MONTHS[cur.m]} ${cur.y}`;
  const goPrev = () => setCur((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { ...c, m: c.m - 1 }));
  const goNext = () => setCur((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { ...c, m: c.m + 1 }));

  if (!data || data.monthVideos === 0) {
    return (
      <div className="zen-container-wide pb-24 pt-6 lg:pb-12">
        <Hero monthLabel={monthLabel} prev={goPrev} next={goNext} headline="Nothing watched yet" sub="Your insights appear as soon as you watch something." />
        <div className="ins-panel mt-5 p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No watch data for <span className="font-medium text-foreground">{monthLabel}</span> yet.
          </p>
        </div>
      </div>
    );
  }

  const tips = buildTips(data);
  const split = [
    { label: "Learning", sec: data.learn, pct: data.learnPct, color: COLORS.learn },
    { label: "Entertainment", sec: data.ent, pct: data.entPct, color: COLORS.ent },
    { label: "Other", sec: Math.max(0, data.monthEff - data.learn - data.ent), pct: Math.max(0, 100 - data.learnPct - data.entPct), color: COLORS.other },
  ];

  return (
    <div className="zen-container-wide pb-24 pt-6 lg:pb-12">
      <Hero
        monthLabel={monthLabel}
        prev={goPrev}
        next={goNext}
        headline={fmtTime(data.monthEff)}
        sub={`focused watch time across ${data.monthVideos} video${data.monthVideos === 1 ? "" : "s"} in ${monthLabel}`}
      />

      {/* Balance + headline stats */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)]">
        <Panel
          title="Where your month went"
          info="How this month's real watch time splits between learning, entertainment and everything else."
        >
          <div className="flex items-center gap-6">
            <Donut segments={split} centerTop={`${data.learnPct}%`} centerSub="learning" />
            <div className="min-w-0 flex-1 space-y-3">
              {split.map((s) => (
                <div key={s.label} className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="inline-flex items-center gap-2 truncate text-[13px] font-medium text-foreground">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                      {s.label}
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">{fmtTime(s.sec)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${s.pct}%`, background: s.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Tile label="Today" value={fmtTime(data.tdTotal)} sub={`${data.tdVideos} video${data.tdVideos === 1 ? "" : "s"}`} accent={COLORS.mint} info="Real watch time today — skips and background tabs removed." />
          <Tile label="Learn streak" value={`${data.streak}d`} sub={data.todayHasLearn ? "active today" : "keep it alive"} accent={COLORS.amber} info="Consecutive days with at least one learning video." />
          <Tile label="Active days" value={`${data.activeDays}`} sub={`of ${data.daysInMonth} days`} accent={COLORS.learn} info="Days this month with at least one watched video." />
          <Tile label="Best day" value={fmtTime(data.bestDaySec)} sub="peak single day" accent={COLORS.ent} info="Your highest single-day watch time this month." />
          <Tile label="Avg / video" value={fmtTime(data.avgPerVideoSec)} sub="attention per video" accent={COLORS.other} info="Average real watch time per video opened this month." />
          <Tile label="All time" value={fmtMin(data.totalAll)} sub="since you joined" accent={COLORS.learn} info="Lifetime focused watch time across every category." />
        </div>
      </div>

      {/* Daily trend */}
      <Panel
        className="mt-4"
        title={`Daily rhythm — ${monthLabel}`}
        info="Minutes watched each day of the selected month, split by intent. Hover any day for exact numbers."
        right={<Legend items={[
          { color: COLORS.learn, label: "Learn", dot: true },
          { color: COLORS.ent, label: "Entertainment", dot: true },
          { color: COLORS.other, label: "Other", dot: true },
        ]} />}
      >
        <div className="min-w-0 w-full overflow-hidden" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.daysMonth} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="gLearn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.learn} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={COLORS.learn} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gEnt" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.ent} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={COLORS.ent} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gOther" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.other} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={COLORS.other} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
              <XAxis
                dataKey="dayNum"
                type="number"
                domain={[1, data.daysInMonth]}
                ticks={Array.from({ length: Math.ceil(data.daysInMonth / 5) }, (_, i) => 1 + i * 5).concat(data.daysInMonth)}
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${MONTHS[cur.m].slice(0, 3)} ${v}`}
              />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}m`} />
              <Tooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 14, fontSize: 12, boxShadow: "0 12px 30px -12px rgba(0,0,0,.35)", padding: "10px 12px" }}
                labelStyle={{ fontWeight: 600, marginBottom: 4 }}
                labelFormatter={(v) => `${MONTHS[cur.m]} ${v}, ${cur.y}`}
                formatter={(val: number, name: string) => [`${val} min`, name === "learn" ? "Learn" : name === "ent" ? "Entertainment" : "Other"]}
              />
              <Area type="monotone" dataKey="learn" stackId="1" stroke={COLORS.learn} strokeWidth={2} fill="url(#gLearn)" isAnimationActive={false} />
              <Area type="monotone" dataKey="ent" stackId="1" stroke={COLORS.ent} strokeWidth={2} fill="url(#gEnt)" isAnimationActive={false} />
              <Area type="monotone" dataKey="other" stackId="1" stroke={COLORS.other} strokeWidth={2} fill="url(#gOther)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Hours */}
        <Panel title="When you watch" info="Your watch time hour by hour. Green hours lean toward learning, pink toward entertainment.">
          <div className="flex min-w-0 w-full items-end gap-[3px] overflow-hidden" style={{ height: 168 }}>
            {data.hourMin.map((v, i) => {
              const max = Math.max(...data.hourMin, 1);
              const pct = Math.max(3, Math.round((v / max) * 100));
              const isL = data.hourMin[i] > 0 && data.hourLearnMin[i] / data.hourMin[i] > 0.4;
              return (
                <div
                  key={i}
                  className="group relative flex-1 self-end rounded-full transition-opacity hover:opacity-100"
                  style={{ height: `${pct}%`, background: isL ? COLORS.learn : COLORS.ent, opacity: v === 0 ? 0.12 : 0.85 }}
                  title={`${fmtHour(i)} · ${fmtTime(Math.round(v * 60))}`}
                />
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] tabular-nums text-muted-foreground">
            <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
          </div>
          <div className="mt-4 rounded-2xl border border-border/60 bg-surface px-4 py-3">
            <div className="text-[13px] font-medium text-foreground">
              Peak hour · {fmtHour(data.peakIdx)} ({data.peakIdx >= 18 || data.peakIdx < 6 ? "evening" : data.peakIdx < 12 ? "morning" : "afternoon"})
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {data.focusWindow.score > 0
                ? `Best focus window: ${fmtHour(data.focusWindow.start)}–${fmtHour(data.focusWindow.start + 3)}. Protect it.`
                : "Add a learning session to reveal your focus window."}
            </div>
          </div>
        </Panel>

        {/* Channels */}
        <Panel title="Top channels" info="Channels you spent the most real time on this month.">
          {data.topChannels.length === 0 ? (
            <div className="text-sm text-muted-foreground">No channels this month.</div>
          ) : (
            <div className="space-y-3.5">
              {data.topChannels.map((c, i) => {
                const max = data.topChannels[0].min || 1;
                return (
                  <div key={i} className="min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[13px] font-medium text-foreground">{c.name}</span>
                      <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{c.min} min</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(c.min / max) * 100}%`, background: i === 0 ? COLORS.learn : i === 1 ? COLORS.ent : COLORS.other }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Takeaways */}
      <div className="mt-4">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">What your data is saying</div>
        <div className="grid gap-4 md:grid-cols-3">
          {tips.map((t, i) => (
            <div
              key={i}
              className="ins-panel relative overflow-hidden p-5"
              style={{ background: t.bg }}
            >
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: t.color }} />
              <div className="text-[13px] font-semibold" style={{ color: t.titleColor }}>{t.title}</div>
              <div className="mt-1.5 text-xs leading-relaxed" style={{ color: t.bodyColor }}>{t.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Hero({ monthLabel, prev, next, headline, sub }: { monthLabel: string; prev: () => void; next: () => void; headline: string; sub: string }) {
  const navBtn =
    "inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";
  return (
    <div className="ins-hero relative overflow-hidden p-6 sm:p-8">
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Your insights</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{headline}</h1>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{sub}</p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border bg-background/70 p-1 backdrop-blur">
          <button className={navBtn} onClick={prev} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
          <div className="min-w-[120px] px-1 text-center text-[13px] font-medium text-foreground">{monthLabel}</div>
          <button className={navBtn} onClick={next} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title, info, children, className = "", right,
}: { title: string; info?: string; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <section className={"ins-panel p-5 sm:p-6 " + className}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold tracking-tight text-foreground">
          {title}
          {info && <InfoDot text={info} />}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function InfoDot({ text, side = "top" }: { text: string; side?: "top" | "left" }) {
  return (
    <UITooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="More info"
          className="rounded-full p-0.5 text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} align="center" className="max-w-[260px] leading-relaxed">
        {text}
      </TooltipContent>
    </UITooltip>
  );
}

function Tile({ label, value, sub, accent, info }: { label: string; value: string; sub: string; accent: string; info?: string }) {
  return (
    <div className="ins-panel ins-tile group relative min-w-0 p-4">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        {info && <InfoDot text={info} />}
      </div>
      <div className="mt-2 truncate text-[22px] font-semibold leading-tight tabular-nums" style={{ color: accent }}>{value}</div>
      <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function Donut({ segments, centerTop, centerSub }: { segments: { label: string; pct: number; color: string }[]; centerTop: string; centerSub: string }) {
  const r = 46, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative h-[132px] w-[132px] shrink-0">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--muted)" strokeWidth="12" />
        {segments.map((s) => {
          const len = (Math.max(0, s.pct) / 100) * c;
          const el = (
            <circle
              key={s.label}
              cx="60" cy="60" r={r} fill="none"
              stroke={s.color} strokeWidth="12" strokeLinecap="butt"
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-semibold tabular-nums text-foreground">{centerTop}</span>
        <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{centerSub}</span>
      </div>
    </div>
  );
}

function Legend({ items, className = "" }: { items: { color: string; label: string; dashed?: boolean; dot?: boolean }[]; className?: string }) {
  return (
    <div className={"flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground " + className}>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}


function fmtHour(h: number) {
  const i = ((h % 24) + 24) % 24;
  if (i === 0) return "12am";
  if (i === 12) return "12pm";
  return i < 12 ? `${i}am` : `${i - 12}pm`;
}
function fmtDur(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m < 60) return `${m}:${String(s).padStart(2, "0")}`;
  const h = Math.floor(m / 60);
  return `${h}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function lastSevenDayLabels() {
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toLocaleDateString(undefined, { weekday: "short" }));
  }
  return out.reverse(); // streak counts back from today
}

type TipShape = {
  videoCount: number;
  videosFinished: number;
  avgCompletion: number;
  seeksPerVideo: number;
  entPct: number;
  learnPct: number;
  learn: number;
  totalEff: number;
  skippedSec: number;
  skippedPct: number;
  daysMonth: { day: string; dayNum: number; learn: number; ent: number; other: number }[];
};

type Tip = {
  color: string;
  title: string;
  body: string;
  bg?: string;
  titleColor?: string;
  bodyColor?: string;
};

function buildTips(d: TipShape): [Tip, Tip, Tip] {
  // Card 1 — Watching pattern
  let card1: Tip;
  if (d.videoCount > 0 && d.avgCompletion < 0.25) {
    card1 = {
      color: COLORS.warn,
      title: "You browse, not watch",
      body: `${d.videoCount} videos opened, ${d.videosFinished} finished. Tomorrow: open one, commit fully, then stop.`,
    };
  } else if (d.avgCompletion < 0.6) {
    card1 = {
      color: COLORS.amber,
      title: "You're warming up",
      body: `Finishing ${Math.round(d.avgCompletion * 100)}% of what you start. Getting better — aim for 60% this week.`,
    };
  } else {
    card1 = {
      color: COLORS.learn,
      title: "Strong focus this period",
      body: `You finish ${Math.round(d.avgCompletion * 100)}% of videos you start. That's genuinely rare. Keep it.`,
    };
  }

  // Card 2 — Time habit
  let card2: Tip;
  if (d.seeksPerVideo > 3) {
    card2 = {
      color: COLORS.amber,
      title: "High skip rate",
      body: `You seek ${d.seeksPerVideo.toFixed(1)} times per video on average. Try watching one video start to finish without seeking today.`,
    };
  } else if (d.entPct > 70) {
    card2 = {
      color: COLORS.amber,
      title: "Entertainment-heavy week",
      body: `${d.entPct}% of your time was entertainment. Try a 60/40 split — one learning video before relaxing.`,
    };
  } else {
    card2 = {
      color: COLORS.learn,
      title: "Balanced watching",
      body: `Good mix this period. ${d.learnPct}% learning, ${d.entPct}% entertainment. Maintain it.`,
    };
  }

  // Card 3 — Positive signal (always teal)
  let card3: Tip;
  if (d.learn > 0) {
    card3 = {
      color: COLORS.learn,
      title: "Learning is happening",
      body: `${Math.round(d.learn / 60)} min of intentional learning this period. Small but real — every session builds the habit.`,
    };
  } else if (d.totalEff > 0 && d.skippedPct > 60) {
    card3 = {
      color: COLORS.learn,
      title: "Lots of time reclaimed",
      body: `You skipped ${Math.round(d.skippedSec / 60)} min of video you didn't need. That's time back in your day.`,
    };
  } else {
    card3 = {
      color: COLORS.learn,
      title: "You showed up",
      body: `${d.videoCount} videos watched this period. Consistent presence is the first step to intentional watching.`,
    };
  }
  // Apply consistent accent-tinted backgrounds that adapt to the active
  // theme (light or dark) via color-mix on the page background.
  const tint = (c: Tip) => {
    c.bg = `color-mix(in oklab, ${c.color} 16%, var(--background))`;
    c.titleColor = `color-mix(in oklab, ${c.color} 92%, var(--foreground))`;
    c.bodyColor = `color-mix(in oklab, ${c.color} 55%, var(--foreground))`;
  };
  tint(card1); tint(card2); tint(card3);

  return [card1, card2, card3];
}
