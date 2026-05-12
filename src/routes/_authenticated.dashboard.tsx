import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line,
} from "recharts";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [rows, setRows] = useState<Row[] | null>(null);
  const now = new Date();
  const [cur, setCur] = useState({ y: now.getFullYear(), m: now.getMonth() });

  useEffect(() => {
    if (!user) return;
    supabase
      .from("watch_history")
      .select("mode, final_intent, watch_seconds, effective_seconds, seek_count, duration_seconds, watched_at, title, channel, category")
      .eq("user_id", user.id)
      .order("watched_at", { ascending: false })
      .limit(1000)
      .then(({ data }) => setRows((data || []) as Row[]));
  }, [user]);

  const data = useMemo(() => {
    if (!rows) return null;
    const inMonth = rows.filter((r) => {
      const d = new Date(r.watched_at);
      return d.getFullYear() === cur.y && d.getMonth() === cur.m;
    });

    // All-time
    const totalAll = rows.reduce((s, r) => s + (r.effective_seconds || 0), 0);

    // Month totals & intent split (uses effective_seconds)
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

    // Completion
    const withDur = inMonth.filter((r) => (r.duration_seconds || 0) > 60);
    const finished = withDur.filter((r) => (r.effective_seconds || 0) / (r.duration_seconds || 1) >= 0.85).length;
    const completionPct = withDur.length ? Math.round((finished / withDur.length) * 100) : 0;
    const avgCompletion = withDur.length
      ? withDur.reduce((s, r) => s + Math.min(1, (r.effective_seconds || 0) / (r.duration_seconds || 1)), 0) / withDur.length
      : 0;

    // Focus 0-100
    const seeksPerVideo = inMonth.length ? totalSeeks / inMonth.length : 0;
    const focus = Math.round(
      Math.max(0, Math.min(1, avgCompletion * 0.7 + Math.max(0, 1 - seeksPerVideo / 10) * 0.3)) * 100,
    );
    const focusLabel = focus > 70 ? "focused" : focus > 40 ? "drifting" : "scattered";

    // Streak — consecutive days ending today with any "learn" video
    let streak = 0;
    for (let i = 0; i < 60; i++) {
      const d = new Date();
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
      const d = new Date(); d.setHours(0, 0, 0, 0);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      return rows.some((r) => {
        if (intentOf(r) !== "learn") return false;
        const t = new Date(r.watched_at).getTime();
        return t >= d.getTime() && t < next.getTime();
      });
    })();

    // Last 14 days stacked
    const days14: { day: string; learn: number; ent: number; other: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      let l = 0, e = 0, o = 0;
      for (const r of rows) {
        const t = new Date(r.watched_at).getTime();
        if (t < d.getTime() || t >= next.getTime()) continue;
        const min = (r.effective_seconds || 0) / 60;
        const i2 = intentOf(r);
        if (i2 === "learn") l += min;
        else if (i2 === "relax") e += min;
        else o += min;
      }
      days14.push({
        day: d.toLocaleDateString(undefined, { weekday: "narrow" }),
        learn: Math.round(l), ent: Math.round(e), other: Math.round(o),
      });
    }

    // 10-week heatmap (focus per day, 0-100)
    const heat: number[] = [];
    for (let w = 9; w >= 0; w--) {
      for (let d = 0; d < 7; d++) {
        const day = new Date();
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

    // Hour-of-day distribution (entire month)
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
      // best 3-hour window by learn ratio (with at least some watch time)
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

    // Watch map — top 8 videos by raw opened time, sorted by watch %
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

    // 8-week intent drift (percent learn vs ent)
    const drift: { w: string; learn: number; ent: number }[] = [];
    for (let w = 7; w >= 0; w--) {
      const start = new Date(); start.setHours(0, 0, 0, 0);
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

    // Top channels (this month)
    const chMap: Record<string, number> = {};
    for (const r of inMonth) {
      const k = r.channel || "Unknown";
      chMap[k] = (chMap[k] || 0) + (r.effective_seconds || 0);
    }
    const topChannels = Object.entries(chMap)
      .map(([name, sec]) => ({ name, min: Math.max(1, Math.round(sec / 60)) }))
      .sort((a, b) => b.min - a.min)
      .slice(0, 5);

    // Today's session timeline
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayStart.getDate() + 1);
    const sessions = rows
      .filter((r) => {
        const t = new Date(r.watched_at).getTime();
        return t >= todayStart.getTime() && t < todayEnd.getTime();
      })
      .map((r) => {
        const start = new Date(r.watched_at);
        return {
          start: start.getHours() + start.getMinutes() / 60,
          dur: Math.max(1, Math.round((r.effective_seconds || 0) / 60)),
          m: intentOf(r) === "learn" ? "l" : "r",
        };
      });

    // Behavior radar
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

    // Drift change (learn % now vs 4 weeks ago)
    const learnNow = drift[drift.length - 1]?.learn ?? 0;
    const learn4w = drift[Math.max(0, drift.length - 5)]?.learn ?? 0;
    const learnDelta = learnNow - learn4w;

    const videosFinished = rows.filter(
      (r) => r.duration_seconds && (r.effective_seconds || 0) >= (r.duration_seconds || 0) * 0.85,
    ).length;
    const skippedSec = Math.max(0, monthRaw - monthEff);
    const skippedPct = monthRaw ? Math.round((skippedSec / monthRaw) * 100) : 0;

    return {
      totalAll, monthEff, monthRaw, monthVideos, videoCount: monthVideos, videosFinished, skippedSec, skippedPct, totalEff: monthEff,
      learn, ent, find, learnPct, entPct, findPct,
      completionPct, finished, focus, focusLabel, streak, todayHasLearn,
      days14, heat, hourMin, hourLearnMin, peakIdx, focusWindow,
      videos, drift, topChannels, sessions, radar, learnDelta, seeksPerVideo, avgCompletion,
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
      <div className="zen-container-wide py-10">
        <Header monthLabel={monthLabel} prev={goPrev} next={goNext} navBtn={navBtn} />
        <div className="zen-card mt-8 p-10 text-center">
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
    <div className="zen-container-wide py-10">
      <Header monthLabel={monthLabel} prev={goPrev} next={goNext} navBtn={navBtn} />

      {/* Intent strip */}
      <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-background sm:grid-cols-5">
        <StripItem label="All-time watched" value={fmtMin(data.totalAll)} sub="since you joined" />
        <StripItem label="Learning" value={fmtMin(data.learn)} sub={`${data.learnPct}% of watch time`} valueColor={COLORS.learn} subColor="#0F6E56" labelColor="#085041" />
        <StripItem label="Entertainment" value={fmtMin(data.ent)} sub={`${data.entPct}% of watch time`} valueColor={COLORS.ent} subColor="#993556" labelColor="#72243E" />
        <StripItem label="Quick lookup" value={fmtMin(data.find)} sub={`${data.findPct}% of watch time`} valueColor={COLORS.amber} subColor="#854F0B" labelColor="#633806" />
        <StripItem label="This month" value={fmtMin(data.monthEff)} sub={`${data.monthVideos} videos`} className="col-span-2 sm:col-span-1" />
      </div>

      {/* KPI tiles */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi border={COLORS.learn} label="watched" value={fmtMin(data.monthEff)} sub={`of ${fmtMin(data.monthRaw)} opened`} valueColor={COLORS.learn} />
        <Kpi border={COLORS.warn} label="completion" value={`${data.completionPct}%`} sub={`${data.finished} of ${data.monthVideos} finished`} valueColor={COLORS.warn} />
        <Kpi border={COLORS.amber} label="focus score" value={String(data.focus)} sub={`/ 100 · ${data.focusLabel}`} valueColor={COLORS.amber} />
        <Kpi border={COLORS.mint} label="streak" value={`${data.streak} day${data.streak === 1 ? "" : "s"}`} sub="learn-something cadence" valueColor={COLORS.mint} />
      </div>

      {/* Stacked area + Heatmap */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardLabel>Stacked intent — daily minutes</CardLabel>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.days14} margin={{ top: 6, right: 6, left: -24, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={32} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="learn" stackId="1" stroke={COLORS.learn} fill={COLORS.learn} fillOpacity={0.18} />
                <Area type="monotone" dataKey="ent" stackId="1" stroke={COLORS.ent} fill={COLORS.ent} fillOpacity={0.14} />
                <Area type="monotone" dataKey="other" stackId="1" stroke={COLORS.other} fill={COLORS.other} fillOpacity={0.12} />
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
          <CardLabel>Attention heatmap — 10 weeks</CardLabel>
          <div className="grid grid-cols-[24px_1fr] gap-0">
            <div className="flex flex-col gap-[3px] pt-[17px] text-[9px] text-muted-foreground">
              {["M","T","W","T","F","S","S"].map((d, i) => <div key={i} className="h-3 leading-3">{d}</div>)}
            </div>
            <div className="grid grid-cols-10 gap-[3px]">
              {Array.from({ length: 10 }).map((_, w) => (
                <div key={w} className="flex flex-col gap-[3px]">
                  <div className="h-[13px] text-center text-[9px] leading-[13px] text-muted-foreground">W{w + 1}</div>
                  {Array.from({ length: 7 }).map((_, d) => {
                    const v = data.heat[w * 7 + d] ?? 0;
                    return <div key={d} className="aspect-square w-full rounded-sm" style={{ background: heatColor(v) }} title={`Focus: ${v}`} />;
                  })}
                </div>
              ))}
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
      </div>

      {/* Hour bars + Radar */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardLabel>Watch time by hour</CardLabel>
          <div className="flex h-20 items-end gap-[2px]">
            {data.hourMin.map((v, i) => {
              const max = Math.max(...data.hourMin, 1);
              const h = Math.max(2, Math.round((v / max) * 76));
              const isL = data.hourMin[i] > 0 && data.hourLearnMin[i] / data.hourMin[i] > 0.4;
              return (
                <div key={i} className="flex-1 self-end rounded-t-sm"
                  style={{ height: h, background: isL ? COLORS.learn : COLORS.ent, opacity: v === 0 ? 0.1 : 0.82 }}
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
          <CardLabel>Behaviour radar</CardLabel>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data.radar}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="k" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 100]} />
                <Radar dataKey="goal" stroke={COLORS.goal} fill={COLORS.goal} fillOpacity={0.05} strokeDasharray="4 4" />
                <Radar dataKey="you" stroke={COLORS.learn} fill={COLORS.learn} fillOpacity={0.18} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={[{ color: COLORS.learn, label: "You" }, { color: COLORS.goal, label: "Goal", dashed: true }]} />
        </Card>
      </div>

      {/* Watch map */}
      <Card className="mt-3">
        <div className="mb-1">
          <CardLabel>Video watch map — how much of each video you watched</CardLabel>
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
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardLabel>Intent drift — 8 weeks</CardLabel>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.drift} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="w" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={40} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Line type="monotone" dataKey="learn" stroke={COLORS.learn} strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="ent" stroke={COLORS.ent} strokeDasharray="5 4" strokeWidth={1.5} dot={{ r: 2 }} />
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
          <CardLabel>Deep work streak</CardLabel>
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
      </div>

      {/* Top channels + Session timeline */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <Card>
          <CardLabel>Top channels</CardLabel>
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
          <CardLabel>Session timeline — today</CardLabel>
          <div className="relative h-[52px] border-b border-border">
            {data.sessions.map((s, i) => {
              const tlS = 6, tlE = 24, tlR = tlE - tlS;
              const pct = ((s.start - tlS) / tlR) * 100;
              const wPct = Math.max(1, (s.dur / 60 / tlR) * 100);
              const max = Math.max(...data.sessions.map((x) => x.dur), 1);
              const h = Math.max(10, Math.round((s.dur / max) * 46));
              return (
                <div key={i} className="absolute bottom-0 rounded-t-sm"
                  style={{ left: `${Math.max(0, pct).toFixed(1)}%`, width: `${wPct.toFixed(1)}%`, height: h,
                    background: s.m === "l" ? COLORS.learn : COLORS.ent, opacity: 0.85 }}
                  title={`${s.dur} min`} />
              );
            })}
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

      {/* Three things */}
      <Card className="mt-3">
        <div className="mb-3 text-sm font-medium text-foreground">Three things your data is saying</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {tips.map((t, i) => (
            <div key={i} className="rounded-xl bg-surface p-3 border-l-[3px]" style={{ borderLeftColor: t.color }}>
              <div className="text-xs font-medium text-foreground">{t.title}</div>
              <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t.body}</div>
            </div>
          ))}
        </div>
      </Card>
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
  return <div className={"rounded-2xl border border-border bg-background p-4 sm:p-5 " + className}>{children}</div>;
}
function CardLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{children}</div>;
}
function StripItem({ label, value, sub, valueColor, subColor, labelColor, className = "" }: { label: string; value: string; sub: string; valueColor?: string; subColor?: string; labelColor?: string; className?: string }) {
  return (
    <div className={"flex flex-col gap-1 border-r border-border p-3 last:border-r-0 " + className}>
      <div className="text-[10px] font-medium uppercase tracking-wider" style={{ color: labelColor || "var(--muted-foreground)" }}>{label}</div>
      <div className="text-xl font-medium" style={{ color: valueColor || "var(--foreground)" }}>{value}</div>
      <div className="text-[11px]" style={{ color: subColor || "var(--muted-foreground)" }}>{sub}</div>
    </div>
  );
}
function Kpi({ border, label, value, sub, valueColor }: { border: string; label: string; value: string; sub: string; valueColor: string }) {
  return (
    <div className="rounded-2xl bg-background p-4 text-center" style={{ borderTop: `3px solid ${border}`, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", borderLeft: "1px solid var(--border)" }}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-medium" style={{ color: valueColor }}>{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
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
  completionPct: number; monthVideos: number; finished: number;
  peakIdx: number; learnDelta: number; seeksPerVideo: number;
};

function buildTips(d: TipShape) {
  const tips: { color: string; title: string; body: string }[] = [];
  if (d.completionPct < 30 && d.monthVideos >= 3) {
    tips.push({
      color: COLORS.warn,
      title: "You browse, not watch",
      body: `${d.monthVideos} videos opened, ${d.finished} finished. Tomorrow: pick one, commit fully, then stop.`,
    });
  }
  if (d.peakIdx >= 21 || d.peakIdx < 6) {
    tips.push({
      color: COLORS.amber,
      title: `${fmtHour(d.peakIdx)} is your weak point`,
      body: "Entertainment peaks late night when focus is lowest. A 9pm cutoff reclaims time for sleep.",
    });
  }
  if (d.learnDelta > 0) {
    tips.push({
      color: COLORS.learn,
      title: "Learning is quietly growing",
      body: `Up ${d.learnDelta}% over 4 weeks. Keep the streak alive and cross 50 focus by month end.`,
    });
  }
  if (d.seeksPerVideo > 6) {
    tips.push({
      color: COLORS.warn,
      title: "Lots of skipping",
      body: `You skip around ${d.seeksPerVideo.toFixed(1)} times per video. Try one full watch — even short — to reset attention.`,
    });
  }
  if (tips.length === 0) {
    tips.push({
      color: COLORS.learn,
      title: "Quiet, balanced month",
      body: "Nothing is screaming for change. Keep noticing what you watch and why.",
    });
  }
  return tips.slice(0, 3);
}
