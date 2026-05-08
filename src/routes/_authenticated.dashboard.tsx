import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell,
  CartesianGrid, AreaChart, Area, Legend, RadialBarChart, RadialBar,
} from "recharts";
import { MODES, type Mode, guessCategory, inferIntentFromVideo } from "@/lib/intent";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Clock, Brain, Coffee, TrendingUp, Eye, Target, Sparkles } from "lucide-react";

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

// Theme-aware chart colors using CSS variables (works in light + dark)
const CHART_COLORS = {
  primary: "var(--chart-1)",
  accent: "var(--chart-2)",
  warm: "var(--chart-3)",
  cool: "var(--chart-4)",
  muted: "var(--chart-5)",
};

const PIE_COLORS = [CHART_COLORS.primary, CHART_COLORS.accent, CHART_COLORS.warm, CHART_COLORS.cool];

function Dashboard() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("watch_history")
      .select("mode, final_intent, watch_seconds, effective_seconds, seek_count, duration_seconds, watched_at, title, channel, category")
      .eq("user_id", user.id)
      .order("watched_at", { ascending: false })
      .limit(500)
      .then(({ data }) => setRows((data || []) as Row[]));
  }, [user]);

  const stats = useMemo(() => {
    if (!rows) return null;
    // Use effective_seconds as primary truth (only seconds actually watched)
    const totalEff = rows.reduce((s, r) => s + (r.effective_seconds || 0), 0);
    const totalRaw = rows.reduce((s, r) => s + (r.watch_seconds || 0), 0);
    const skippedSec = Math.max(0, totalRaw - totalEff);
    const totalSeeks = rows.reduce((s, r) => s + (r.seek_count || 0), 0);

    // Use final_intent (content-tied) instead of session mode for accuracy
    const intentOf = (r: Row) => (r.final_intent || r.mode) as string;
    const byMode: Record<string, number> = {};
    for (const r of rows) byMode[intentOf(r)] = (byMode[intentOf(r)] || 0) + (r.effective_seconds || 0);
    const learn = byMode["learn"] || 0;
    const ent = byMode["relax"] || 0;
    const find = byMode["find"] || 0;
    const explore = byMode["explore"] || 0;

    const learnPct = totalEff ? Math.round((learn / totalEff) * 100) : 0;
    const entPct = totalEff ? Math.round((ent / totalEff) * 100) : 0;

    // Last 14 days area chart with learn vs entertainment split
    const days: { day: string; learn: number; relax: number; other: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      let l = 0, r2 = 0, o = 0;
      for (const r of rows) {
        const t = new Date(r.watched_at).getTime();
        if (t >= d.getTime() && t < next.getTime()) {
          const m = Math.round((r.effective_seconds || 0) / 60);
          const i = intentOf(r);
          if (i === "learn") l += m;
          else if (i === "relax") r2 += m;
          else o += m;
        }
      }
      days.push({
        day: d.toLocaleDateString(undefined, { weekday: "short" }),
        learn: l, relax: r2, other: o,
      });
    }

    // Modes pie (effective minutes)
    const modeData = (Object.keys(MODES) as Mode[]).map((m) => ({
      name: MODES[m].label,
      value: Math.round(((byMode[m] || 0) / 60) * 10) / 10,
    })).filter((d) => d.value > 0);

    // Top categories — derive a useful label even when DB column is empty.
    // Priority: explicit category → guessed from title/channel → intent label.
    const labelForRow = (r: Row): string => {
      if (r.category && r.category.toLowerCase() !== "uncategorized") return r.category;
      const inferred = inferIntentFromVideo({ title: r.title || "", channel: r.channel || "" });
      if (inferred === "learn") return "Learning";
      if (inferred === "relax") return "Entertainment";
      const g = guessCategory(`${r.title || ""} ${r.channel || ""}`);
      if (g === "learn") return "Learning";
      if (g === "relax") return "Entertainment";
      const intent = (r.final_intent || r.mode || "").toLowerCase();
      if (intent === "learn") return "Learning";
      if (intent === "relax") return "Entertainment";
      if (intent === "find") return "Quick lookup";
      if (intent === "explore") return "Exploration";
      return "Other";
    };
    const catCount: Record<string, number> = {};
    for (const r of rows) {
      const k = labelForRow(r);
      catCount[k] = (catCount[k] || 0) + (r.effective_seconds || 0);
    }
    const topCategories = Object.entries(catCount)
      .map(([name, sec]) => ({ name, min: Math.max(1, Math.round(sec / 60)) }))
      .sort((a, b) => b.min - a.min)
      .slice(0, 5);

    // Channels
    const chanCount: Record<string, { videos: number; min: number }> = {};
    for (const r of rows) {
      const k = r.channel || "Unknown";
      const e = chanCount[k] || { videos: 0, min: 0 };
      e.videos += 1;
      e.min += Math.round((r.effective_seconds || 0) / 60);
      chanCount[k] = e;
    }
    const topChannels = Object.entries(chanCount)
      .sort((a, b) => b[1].min - a[1].min)
      .slice(0, 5);

    // Focus / attention metric
    // High seeks per video AND low effective/duration ratio means low focus
    const videosWithDuration = rows.filter((r) => (r.duration_seconds || 0) > 60);
    const completionRatios = videosWithDuration.map((r) =>
      Math.min(1, (r.effective_seconds || 0) / (r.duration_seconds || 1)),
    );
    const avgCompletion = completionRatios.length
      ? completionRatios.reduce((a, b) => a + b, 0) / completionRatios.length
      : 0;
    const seeksPerVideo = rows.length ? totalSeeks / rows.length : 0;
    // 0 = poor focus, 1 = great focus
    const focusScore = Math.max(
      0,
      Math.min(1, avgCompletion * 0.7 + Math.max(0, 1 - seeksPerVideo / 10) * 0.3),
    );

    return {
      totalEff, totalRaw, skippedSec, totalSeeks,
      learn, ent, find, explore, learnPct, entPct,
      days, modeData, topCategories, topChannels,
      focusScore, avgCompletion, seeksPerVideo, videoCount: rows.length,
    };
  }, [rows]);

  if (rows === null) {
    return (
      <div className="zen-container-wide py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Insights</h1>
        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (!stats || stats.videoCount === 0) {
    return (
      <div className="zen-container-wide py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Insights</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A quiet look at how you've been spending your time.
        </p>
        <div className="zen-card mt-8 p-8 text-center">
          <Eye className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Watch your first video to start seeing insights here.
          </p>
        </div>
      </div>
    );
  }

  const focusLabel =
    stats.focusScore > 0.7 ? "Focused" :
    stats.focusScore > 0.4 ? "Distracted" : "Scattered";
  const focusTone =
    stats.focusScore > 0.7 ? "text-primary" :
    stats.focusScore > 0.4 ? "text-muted-foreground" : "text-destructive";

  const skippedPct = stats.totalRaw ? Math.round((stats.skippedSec / stats.totalRaw) * 100) : 0;

  return (
    <div className="zen-container-wide py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Insights</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Time shown is what you <span className="text-foreground">actually watched</span> — skipped sections don't count.
      </p>

      {/* Top stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<Clock className="h-4 w-4" />} label="Watched" value={`${Math.round(stats.totalEff / 60)} min`} sub={`${stats.videoCount} videos`} />
        <Stat icon={<Brain className="h-4 w-4" />} label="Learning" value={`${Math.round(stats.learn / 60)} min`} sub={`${stats.learnPct}% of time`} tone="primary" />
        <Stat icon={<Coffee className="h-4 w-4" />} label="Entertainment" value={`${Math.round(stats.ent / 60)} min`} sub={`${stats.entPct}% of time`} tone="accent" />
        <Stat icon={<Target className={`h-4 w-4 ${focusTone}`} />} label="Focus" value={focusLabel} sub={`${Math.round(stats.focusScore * 100)} / 100`} tone="focus" />
      </div>

      {/* Attention awareness card */}
      {(stats.focusScore < 0.5 || stats.seeksPerVideo > 5) && (
        <div className="mt-4 zen-card border-destructive/40 bg-destructive/5 p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="flex-1 text-sm">
              <div className="font-medium text-foreground">Your attention has been scattered.</div>
              <p className="mt-1 text-muted-foreground">
                You're skipping around {stats.seeksPerVideo.toFixed(1)} times per video on average,
                and only finishing {Math.round(stats.avgCompletion * 100)}% of what you start.
                Try picking one video and watching it without jumping — even a short focused session helps.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Charts row 1 — Last 14 days area chart */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="zen-card p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">Last 14 days · minutes watched</div>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.days} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="grad-learn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.primary} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-relax" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity={0.45} />
                    <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }} />
                <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
                <Area type="monotone" name="Learning" dataKey="learn" stackId="1" stroke={CHART_COLORS.primary} fill="url(#grad-learn)" />
                <Area type="monotone" name="Entertainment" dataKey="relax" stackId="1" stroke={CHART_COLORS.accent} fill="url(#grad-relax)" />
                <Area type="monotone" name="Other" dataKey="other" stackId="1" stroke={CHART_COLORS.muted} fill={CHART_COLORS.muted} fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="zen-card p-5">
          <div className="mb-3 text-sm font-medium">By intent</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stats.modeData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} stroke="var(--background)" strokeWidth={2}>
                  {stats.modeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }} formatter={(v: number) => `${v} min`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1 text-xs">
            {stats.modeData.map((d, i) => (
              <li key={d.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  {d.name}
                </span>
                <span className="text-foreground">{d.value} min</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Charts row 2 — Categories bar + Skip ratio */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="zen-card p-5 lg:col-span-2">
          <div className="mb-3 text-sm font-medium">Top categories (minutes watched)</div>
          {stats.topCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not enough data yet.</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.topCategories} layout="vertical" margin={{ top: 5, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={90} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)" }} formatter={(v: number) => `${v} min`} />
                  <Bar dataKey="min" radius={[0, 6, 6, 0]}>
                    {stats.topCategories.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="zen-card p-5">
          <div className="mb-1 text-sm font-medium">Skipping habit</div>
          <p className="text-xs text-muted-foreground">
            Of all the video time you opened, you actually watched:
          </p>
          <div className="mt-3 flex items-baseline gap-2">
            <div className="text-3xl font-semibold text-foreground">{100 - skippedPct}%</div>
            <div className="text-sm text-muted-foreground">{Math.round(stats.skippedSec / 60)} min skipped</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${100 - skippedPct}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Average seeks per video: <span className="text-foreground">{stats.seeksPerVideo.toFixed(1)}</span>
          </p>
        </div>
      </div>

      {/* Top channels */}
      <div className="mt-6 zen-card p-5">
        <div className="mb-3 text-sm font-medium">Most watched channels</div>
        {stats.topChannels.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {stats.topChannels.map(([name, info]) => (
              <li key={name} className="flex items-center justify-between py-2.5 text-sm">
                <span className="truncate pr-3 text-foreground">{name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {info.min} min · {info.videos} {info.videos === 1 ? "video" : "videos"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({
  label, value, sub, icon, tone,
}: {
  label: string; value: string; sub?: string;
  icon?: React.ReactNode; tone?: "primary" | "accent" | "focus";
}) {
  const ring =
    tone === "primary" ? "ring-primary/20" :
    tone === "accent" ? "ring-primary/15" :
    tone === "focus" ? "ring-destructive/20" : "ring-border/50";
  return (
    <div className={`zen-card p-5 ring-1 ${ring}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
