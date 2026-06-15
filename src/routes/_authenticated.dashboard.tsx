import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line,
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
    const monthRaw = inMonth.reduce((s, r) => s + (r.watch_seconds || 0), 0);
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
        const sec = (r.effective_seconds || 0) || (r.watch_seconds || 0);
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
        byDay[key] = (byDay[key] || 0) + ((r.effective_seconds || 0) || (r.watch_seconds || 0));
      }
      return Math.max(0, ...Object.values(byDay));
    })();
    const activeDays = new Set(inMonth.map((r) => new Date(r.watched_at).toDateString())).size;
    const avgPerVideoSec = inMonth.length ? Math.round(monthEff / inMonth.length) : 0;

    const sessions = anchorRows.map((r) => {
      const start = new Date(r.watched_at);
      return {
        start: start.getHours() + start.getMinutes() / 60,
        dur: Math.max(1, Math.round(((r.effective_seconds || 0) || (r.watch_seconds || 0)) / 60)),
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
        <Skeleton className="h-10 w-64" />
        <div className="mt-8 grid gap-3 sm:grid-cols-5"><Skeleton className="h-24 sm:col-span-5" /></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  const monthLabel = `${MONTHS[cur.m]} ${cur.y}`;
  const goPrev = () => setCur((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { ...c, m: c.m - 1 }));
  const goNext = () => setCur((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { ...c, m: c.m + 1 }));
  const navBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-foreground hover:bg-accent transition-colors";

  if (!data || data.monthVideos === 0) {
    return (
      <div className="zen-container-wide pb-24 pt-6 lg:pb-12">
        <Header monthLabel={monthLabel} prev={goPrev} next={goNext} navBtn={navBtn} />
        <div className="zen-card mt-6 p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No watch data for <span className="text-foreground">{monthLabel}</span> yet.
            Watch a video to start your insights.
          </p>
        </div>
      </div>
    );
  }


  // Three takeaways
  const tips = buildTips(data);

  return (
    <div className="zen-container-wide pb-24 pt-6 lg:pb-12">
      {/* Overview — sticks to top on large screens for context while scrolling charts.
          On mobile it scrolls naturally with the page so every card is reachable. */}
      <div className="lg:sticky lg:top-14 lg:z-10 lg:-mx-4 lg:bg-background/95 lg:px-4 lg:pb-4 lg:pt-2 lg:backdrop-blur lg:supports-[backdrop-filter]:bg-background/80">
        <Header monthLabel={monthLabel} prev={goPrev} next={goNext} navBtn={navBtn} />

        {/* All-time strip — totals since the user joined, with this-month context as sub */}
        <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-[var(--shadow-soft)] sm:grid-cols-5">
          <StripItem label="All-time watched" value={fmtMin(data.totalAll)} sub="since you joined" />
          <StripItem label="Learning · all-time" value={fmtMin(data.allLearn)} sub={`This month: ${fmtMin(data.learn)} · ${data.learnPct}%`} valueColor={COLORS.learn} subColor="#0F6E56" labelColor="#085041" />
          <StripItem label="Entertainment · all-time" value={fmtMin(data.allEnt)} sub={`This month: ${fmtMin(data.ent)} · ${data.entPct}%`} valueColor={COLORS.ent} subColor="#993556" labelColor="#72243E" />
          <StripItem label="Quick lookup · all-time" value={fmtMin(data.allFind)} sub={`This month: ${fmtMin(data.find)} · ${data.findPct}%`} valueColor={COLORS.amber} subColor="#854F0B" labelColor="#633806" />
          <StripItem label="This month" value={fmtMin(data.monthEff)} sub={`${data.monthVideos} videos`} className="col-span-2 sm:col-span-1" />
        </div>

        {/* Today strip — same shape, but scoped to today only */}
        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-[var(--shadow-soft)] sm:grid-cols-5">
          <StripItem label="Today · total" value={fmtMin(data.tdTotal)} sub={`${data.tdVideos} video${data.tdVideos === 1 ? "" : "s"}`} />
          <StripItem label="Today · learning" value={fmtMin(data.tdLearn)} sub={data.tdTotal ? `${Math.round((data.tdLearn / data.tdTotal) * 100)}% of today` : "no time yet"} valueColor={COLORS.learn} subColor="#0F6E56" labelColor="#085041" />
          <StripItem label="Today · entertainment" value={fmtMin(data.tdEnt)} sub={data.tdTotal ? `${Math.round((data.tdEnt / data.tdTotal) * 100)}% of today` : "no time yet"} valueColor={COLORS.ent} subColor="#993556" labelColor="#72243E" />
          <StripItem label="Today · quick lookup" value={fmtMin(data.tdFind)} sub={data.tdTotal ? `${Math.round((data.tdFind / data.tdTotal) * 100)}% of today` : "no time yet"} valueColor={COLORS.amber} subColor="#854F0B" labelColor="#633806" />
          <StripItem label="Today · other" value={fmtMin(Math.max(0, data.tdTotal - data.tdLearn - data.tdEnt - data.tdFind))} sub="uncategorised time" className="col-span-2 sm:col-span-1" />
        </div>

        {/* KPI tiles — simple, useful at-a-glance numbers */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi border={COLORS.learn} label="Best day" value={fmtTime(data.bestDaySec)} sub="Most watched day this month" valueColor={COLORS.learn} />
          <Kpi border={COLORS.mint} label="Active days" value={`${data.activeDays}`} sub="Days you watched anything" valueColor={COLORS.mint} />
          <Kpi border={COLORS.amber} label="Avg / video" value={fmtTime(data.avgPerVideoSec)} sub="Real time per video" valueColor={COLORS.amber} />
          <Kpi border={COLORS.ent} label="Learn streak" value={`${data.streak} day${data.streak === 1 ? "" : "s"}`} sub="Consecutive learning days" valueColor={COLORS.ent} />
        </div>
      </div>

      {/* Analytics area — scrolls with the page */}
      <div className="mt-4">



      {/* Card grid — two manual flex columns for true masonry without trailing gap */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="flex flex-col gap-3 min-w-0">
        {/* Stacked area */}
        <Card>
          <CardLabel info="Daily minutes by intent. Each band shows how your watch time split between Learn, Entertainment and other over the last 14 days of the selected month.">Stacked intent — daily minutes</CardLabel>
          <div className="min-w-0 w-full overflow-hidden" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.days14} margin={{ top: 4, right: 4, left: -24, bottom: -4 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={32} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="learn" stackId="1" stroke={COLORS.learn} fill={COLORS.learn} fillOpacity={0.18} isAnimationActive={false} />
                <Area type="monotone" dataKey="ent" stackId="1" stroke={COLORS.ent} fill={COLORS.ent} fillOpacity={0.14} isAnimationActive={false} />
                <Area type="monotone" dataKey="other" stackId="1" stroke={COLORS.other} fill={COLORS.other} fillOpacity={0.12} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[
            { color: COLORS.learn, label: "Learn" },
            { color: COLORS.ent, label: "Entertainment" },
            { color: COLORS.other, label: "Other" },
          ]}/>
        </Card>

        <Card>
          <CardLabel info="Focus per day for the last 10 weeks. Greener cells mean you completed videos with fewer skips. Empty cells are days with no watch history.">Attention heatmap — 10 weeks</CardLabel>
          <div className="min-w-0 w-full overflow-hidden">
          <div className="grid grid-cols-[24px_1fr] gap-0" style={{ height: 220 }}>
            <div className="flex flex-col gap-[3px] pt-[17px] text-[9px] text-muted-foreground">
              {["M","T","W","T","F","S","S"].map((d, i) => <div key={i} className="flex-1 leading-3">{d}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 3, width: "100%", height: "100%" }}>
              {Array.from({ length: 10 }).map((_, w) => (
                <div key={w} className="grid" style={{ gridTemplateRows: "13px repeat(7, 1fr)", gap: 3, minHeight: 0 }}>
                  <div className="h-[13px] text-center text-[9px] leading-[13px] text-muted-foreground">W{w + 1}</div>
                  {Array.from({ length: 7 }).map((_, d) => {
                    const v = data.heat[w * 7 + d] ?? 0;
                    return <div key={d} style={{ width: "100%", height: "100%", borderRadius: 3, background: heatColor(v) }} title={`Focus: ${v}`} />;
                  })}
                </div>
              ))}
            </div>
          </div>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[9px] text-muted-foreground">
            <span>none</span>
            <div className="flex gap-0.5">
              {HMAP.map((c, i) => <div key={i} className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />)}
            </div>
            <span>focused</span>
          </div>
        </Card>

      {/* Hour bars */}
        <Card>
          <CardLabel info="When you actually watch, hour by hour. Green hours skew toward learning; pink hours skew toward entertainment.">Watch time by hour</CardLabel>
          <div className="flex min-w-0 w-full items-end gap-[2px] overflow-hidden" style={{ height: 180 }}>
            {data.hourMin.map((v, i) => {
              const max = Math.max(...data.hourMin, 1);
              const pct = Math.max(2, Math.round((v / max) * 100));
              const isL = data.hourMin[i] > 0 && data.hourLearnMin[i] / data.hourMin[i] > 0.4;
              return (
                <div key={i} className="flex-1 self-end rounded-t-sm"
                  style={{ height: `${pct}%`, background: isL ? COLORS.learn : COLORS.ent, opacity: v === 0 ? 0.1 : 0.82 }}
                  title={`${i}:00 · ${Math.round(v)} min`} />
              );
            })}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
            <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
          </div>
          <div className="mt-2 rounded-lg bg-surface px-3 py-2">
            <div className="text-xs font-medium text-foreground">
              Peak: {fmtHour(data.peakIdx)} · {data.peakIdx >= 18 || data.peakIdx < 6 ? "evening" : data.peakIdx < 12 ? "morning" : "afternoon"}
            </div>
            <div className="text-xs text-muted-foreground">
              {data.focusWindow.score > 0
                ? `Best focus window: ${fmtHour(data.focusWindow.start)}–${fmtHour(data.focusWindow.start + 3)}. Protect it.`
                : "Add a learning session to find your focus window."}
            </div>
          </div>
        </Card>

        <Card>
          <CardLabel info="Six habits scored 0–100. Solid shape is you, dashed shape is a healthy target. Bigger is better.">Behaviour radar</CardLabel>
          <div className="min-w-0 w-full overflow-hidden" style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data.radar} margin={{ top: 4, right: 18, bottom: 4, left: 18 }}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="k" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                <Radar dataKey="goal" stroke={COLORS.goal} fill={COLORS.goal} fillOpacity={0.05} strokeDasharray="4 4" isAnimationActive={false} />
                <Radar dataKey="you" stroke={COLORS.learn} fill={COLORS.learn} fillOpacity={0.18} isAnimationActive={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ color: COLORS.learn, label: "You" }, { color: COLORS.goal, label: "Goal", dashed: true }]} />
        </Card>
        </div>

        <div className="flex flex-col gap-3 min-w-0">
      {/* Watch map */}
      <Card>
        <div className="mb-1">
          <CardLabel info="Top videos this month. Filled bar = portion you actually watched; empty area = skipped or never reached.">Video watch map — how much of each video you watched</CardLabel>
        </div>
        <div className="mb-3 text-xs text-muted-foreground">
          Each row = one video · colored fill = portion watched · gray = skipped · sorted by watch %
        </div>
        <div className="flex flex-col gap-1.5">
          {data.videos.length === 0 ? (
            <div className="text-sm text-muted-foreground">No videos this month yet.</div>
          ) : data.videos.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: v.intent === "l" ? COLORS.learn : COLORS.ent }} />
              <span className="w-32 shrink-0 truncate text-xs text-muted-foreground" title={v.title}>{v.title}</span>
              <div className="relative h-2.5 flex-1 overflow-hidden rounded-sm border border-border bg-muted">
                <div className="absolute left-0 top-0 h-full rounded-sm" style={{ width: `${v.pct}%`, background: v.intent === "l" ? COLORS.learn : COLORS.ent }} />
              </div>
              <span className="w-8 shrink-0 text-right text-[10px] text-muted-foreground">{v.pct}%</span>
              <span className="w-12 shrink-0 text-right text-[10px] text-muted-foreground">{v.dur}</span>
            </div>
          ))}
        </div>
        <Legend className="mt-3" items={[
          { color: COLORS.learn, label: "Watched" },
          { color: "var(--muted)", label: "Skipped" },
          { color: COLORS.ent, label: "Entertainment", dot: true },
          { color: COLORS.learn, label: "Learning", dot: true },
        ]} />
      </Card>

      {/* Drift + Streak */}
        <Card>
          <CardLabel info="Share of your weekly watch time spent on learning vs. entertainment over the last 8 weeks.">Intent drift — 8 weeks</CardLabel>
          <div className="min-w-0 w-full overflow-hidden" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.drift} margin={{ top: 4, right: 4, left: -28, bottom: -4 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="w" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={40} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="learn" stroke={COLORS.learn} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="ent" stroke={COLORS.ent} strokeDasharray="5 4" strokeWidth={1.5} dot={{ r: 2 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[
            { color: COLORS.learn, label: "Learn %" },
            { color: COLORS.ent, label: "Entertainment %", dashed: true },
          ]} />
          <div className={"mt-2 rounded-lg px-3 py-2 text-xs font-medium " + (data.learnDelta >= 0 ? "bg-[#e1f5ee] text-[#085041]" : "bg-[#fcebeb] text-[#7a1f1f]")}>
            {data.learnDelta >= 0
              ? `Learning up ${data.learnDelta}% vs 4 weeks ago`
              : `Learning down ${Math.abs(data.learnDelta)}% vs 4 weeks ago`}
          </div>
        </Card>

        <Card>
          <CardLabel info="Consecutive days you watched at least one learning video, ending on the selected month's latest day.">Deep work streak</CardLabel>
          <div className="text-4xl font-medium" style={{ color: COLORS.learn }}>
            {data.streak} <span className="text-sm font-normal text-muted-foreground">day{data.streak === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">A learning video each day keeps the streak alive.</div>
          <div className="mt-3 flex gap-1">
            {lastSevenDayLabels().map((d, i) => {
              const isActive = i < data.streak;
              return (
                <div key={i} className={"flex-1 rounded-md py-1.5 text-center text-[9px] " + (isActive ? "text-[#e1f5ee]" : "text-muted-foreground")}
                  style={{ background: isActive ? COLORS.learn : "var(--muted)" }}>{d}</div>
              );
            })}
          </div>
          <div className="mt-3 rounded-lg bg-[#e1f5ee] px-3 py-2 text-xs text-[#0F6E56]">
            <div className="font-medium text-[#085041]">
              {data.todayHasLearn
                ? `${data.streak}-day streak today — keep it tomorrow`
                : "Watch one learning video today to keep it alive"}
            </div>
          </div>
        </Card>

      {/* Top channels + Session timeline */}
        <Card>
          <CardLabel info="Channels you spent the most real time on this month (skipped time excluded).">Top channels</CardLabel>
          {data.topChannels.length === 0 ? (
            <div className="text-sm text-muted-foreground">No channels this month.</div>
          ) : (
            <div>
              {data.topChannels.map((c, i) => {
                const max = data.topChannels[0].min || 1;
                return (
                  <div key={i} className="flex items-center gap-2 border-b border-border/60 py-1.5 last:border-0">
                    <div className="min-w-[110px] truncate text-xs font-medium text-foreground">{c.name}</div>
                    <div className="h-1 min-w-[30px] flex-1 overflow-hidden rounded bg-muted">
                      <div className="h-1 rounded" style={{ width: `${(c.min / max) * 100}%`, background: i === 0 ? COLORS.learn : COLORS.ent }} />
                    </div>
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">{c.min} min</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardLabel info="Each bar is one watch session on your most recent active day in the selected month, plotted by start time and length.">Session timeline — latest active day</CardLabel>
          <div className="relative min-w-0 w-full overflow-hidden border-b border-border" style={{ height: 180 }}>
            {data.sessions.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">No sessions on this day</div>
            ) : (
              data.sessions.map((s, i) => {
                const tlS = 6, tlE = 24, tlR = tlE - tlS;
                const pct = ((s.start - tlS) / tlR) * 100;
                const wPct = Math.max(1, (s.dur / 60 / tlR) * 100);
                const max = Math.max(...data.sessions.map((x) => x.dur), 1);
                const h = `${Math.max(10, Math.round((s.dur / max) * 88))}%`;
                return (
                  <div key={i} className="absolute bottom-0 rounded-t-sm"
                    style={{ left: `${Math.max(0, pct).toFixed(1)}%`, width: `${wPct.toFixed(1)}%`, height: h,
                      background: s.m === "l" ? COLORS.learn : COLORS.ent, opacity: 0.85 }}
                    title={`${s.dur} min`} />
                );
              })
            )}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
            <span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
          </div>
          <Legend className="mt-3" items={[
            { color: COLORS.learn, label: "Learning" },
            { color: COLORS.ent, label: "Entertainment" },
          ]} />
        </Card>
        </div>
      </div>

      {/* Three things */}
      <Card className="mt-3">
        <div className="mb-3 text-sm font-medium text-foreground">Three things your data is saying</div>
        <div className="grid gap-3 md:grid-cols-3">
          {tips.map((t, i) => (
            <div
              key={i}
              style={{
                borderRadius: 10,
                padding: 14,
                background: t.bg || "var(--muted)",
                borderLeft: `3px solid ${t.color}`,
                minHeight: 100,
              }}
            >
              <div className="text-xs font-medium" style={{ color: t.titleColor || "var(--foreground)" }}>{t.title}</div>
              <div className="mt-1 text-[11px] leading-relaxed" style={{ color: t.bodyColor || "var(--muted-foreground)" }}>{t.body}</div>
            </div>
          ))}
        </div>
      </Card>
      </div>
    </div>

  );
}

function Header({ monthLabel, prev, next, navBtn }: { monthLabel: string; prev: () => void; next: () => void; navBtn: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Your insights</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Watching in <span style={{ color: COLORS.learn }}>{monthLabel}</span>
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Only time you truly watched counts — skips and background tabs removed.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button className={navBtn} onClick={prev} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
        <div className="min-w-[100px] text-center text-sm font-medium text-foreground">{monthLabel}</div>
        <button className={navBtn} onClick={next} aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={"zen-card overflow-hidden shadow-[var(--shadow-soft)] " + className} style={{ padding: 22, minWidth: 0 }}>{children}</div>;
}
function CardLabel({ children, info }: { children: React.ReactNode; info?: string }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div
        className="uppercase text-muted-foreground"
        style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", lineHeight: 1.3, whiteSpace: "normal", overflowWrap: "break-word" }}
      >
        {children}
      </div>
      {info && (
        <UITooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label="More info"
              className="shrink-0 rounded-full p-1 text-muted-foreground/70 transition-colors hover:text-foreground focus:text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" align="start" className="max-w-[260px]">
            {info}
          </TooltipContent>
        </UITooltip>
      )}
    </div>
  );
}
function StripItem({ label, value, sub, valueColor, subColor, labelColor, className = "" }: { label: string; value: string; sub: string; valueColor?: string; subColor?: string; labelColor?: string; className?: string }) {
  return (
    <div
      className={"flex flex-col gap-1 border-r border-border/60 last:border-r-0 min-w-0 " + className}
      style={{ padding: "16px 18px" }}
    >
      <div className="uppercase truncate" style={{ color: labelColor || "var(--muted-foreground)", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em" }}>{label}</div>
      <div className="truncate" style={{ color: valueColor || "var(--foreground)", fontSize: 26, fontWeight: 650, letterSpacing: "-0.01em", lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div className="truncate" style={{ color: subColor || "var(--muted-foreground)", fontSize: 12.5 }}>{sub}</div>
    </div>
  );
}
function Kpi({ border, label, value, sub, valueColor }: { border: string; label: string; value: string; sub: string; valueColor: string }) {
  return (
    <div
      className="rounded-2xl bg-background text-center overflow-hidden min-w-0"
      style={{ padding: "18px 16px", borderTop: `3px solid ${border}`, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", borderLeft: "1px solid var(--border)" }}
    >
      <div className="uppercase text-muted-foreground truncate" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em" }}>{label}</div>
      <div className="mt-1 truncate" style={{ color: valueColor, fontSize: 30, fontWeight: 650, letterSpacing: "-0.01em", lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div className="mt-1 text-muted-foreground truncate" style={{ fontSize: 12.5 }}>{sub}</div>
    </div>
  );
}
function Legend({ items, className = "" }: { items: { color: string; label: string; dashed?: boolean; dot?: boolean }[]; className?: string }) {
  return (
    <div className={"flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground " + className}>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {it.dot ? (
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: it.color }} />
          ) : (
            <span className="inline-block h-[10px] w-[10px] rounded-sm"
              style={{ background: it.dashed ? "transparent" : it.color, border: it.dashed ? `2px dashed ${it.color}` : "none" }} />
          )}
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
  days14: { day: string; learn: number; ent: number; other: number }[];
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
