import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  categoryMeta,
  categoryShortLabel,
  formatSeconds,
  type IntentCategory,
} from "@/lib/relevance";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { WeeklyIntentReport } from "@/components/WeeklyIntentReport";
import { buildWeeklyReport, demoWeeklyReport } from "@/lib/weeklyIntentReport";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  Clock,
  Compass,
  Play,
  Target,
  TrendingUp,
  ListTree,
  ChartNoAxesCombined,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/intent")({
  head: () => ({
    meta: [
      { title: "My Intent & Usage — ZenTube" },
      {
        name: "description",
        content:
          "See when you opened ZenTube, what you said you came for, and whether what you actually watched matched that intention.",
      },
      { property: "og:title", content: "My Intent & Usage — ZenTube" },
      {
        property: "og:description",
        content: "A day-by-day record of your intentions and whether your watching matched them.",
      },
    ],
  }),
  component: IntentUsagePage,
});

type RangeKey = "today" | "7" | "30";

type SessionRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  active_seconds: number;
  primary_category: string;
  primary_intent: string;
  alignment_score: number | null;
  status: string;
};

type SegmentRow = {
  id: string;
  session_id: string;
  category: string;
  raw_intent: string;
  started_at: string;
  ended_at: string | null;
};

type InteractionRow = {
  id: string;
  session_id: string;
  segment_id: string;
  video_id: string;
  title: string | null;
  channel: string | null;
  started_at: string;
  effective_seconds: number;
  watch_seconds: number;
  completion_percent: number;
  relevance_score: number;
  relevance_class: string;
  relevance_factors: unknown;
  search_query: string | null;
  skipped: boolean;
};

function rangeStart(range: RangeKey): Date {
  const d = new Date();
  if (range === "today") {
    d.setHours(0, 0, 0, 0);
    return d;
  }
  d.setDate(d.getDate() - (range === "7" ? 6 : 29));
  d.setHours(0, 0, 0, 0);
  return d;
}

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "short",
});

function relTone(cls: string) {
  if (cls === "aligned" || cls === "relevant")
    return "text-emerald-400 border-emerald-400/30 bg-emerald-400/10";
  if (cls === "partial" || cls === "partially_related")
    return "text-amber-400 border-amber-400/30 bg-amber-400/10";
  return "text-rose-400 border-rose-400/30 bg-rose-400/10";
}

function IntentUsagePage() {
  const { user } = useAuth();
  const [range, setRange] = useState<RangeKey>("7");
  const [view, setView] = useState<"report" | "timeline">("report");

  const since = useMemo(() => rangeStart(range).toISOString(), [range]);

  const { data, isLoading } = useQuery({
    queryKey: ["intent-usage", user?.id, range],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const [s, g, v] = await Promise.all([
        supabase
          .from("intent_sessions")
          .select("*")
          .gte("started_at", since)
          .order("started_at", { ascending: false }),
        supabase
          .from("intent_segments")
          .select("*")
          .gte("started_at", since)
          .order("started_at", { ascending: true }),
        supabase
          .from("video_interactions")
          .select("*")
          .gte("started_at", since)
          .order("started_at", { ascending: true }),
      ]);
      return {
        sessions: (s.data ?? []) as SessionRow[],
        segments: (g.data ?? []) as SegmentRow[],
        interactions: (v.data ?? []) as InteractionRow[],
      };
    },
  });

  const sessions = data?.sessions ?? [];
  const segments = data?.segments ?? [];
  const interactions = data?.interactions ?? [];
  const weeklyReport = useMemo(() => {
    const real = buildWeeklyReport(sessions, interactions);
    return real.totals.watched >= 300 ? real : demoWeeklyReport();
  }, [sessions, interactions]);

  const totals = useMemo(() => {
    const watched = interactions.reduce((n, i) => n + (i.effective_seconds || 0), 0);
    const aligned = interactions
      .filter((i) => i.relevance_score >= 61)
      .reduce((n, i) => n + (i.effective_seconds || 0), 0);
    const drifted = Math.max(0, watched - aligned);
    const active = sessions.reduce((n, s) => n + (s.active_seconds || 0), 0);
    const alignment = watched > 0 ? Math.round((aligned / watched) * 100) : 0;
    return {
      watched,
      aligned,
      drifted,
      active,
      alignment,
      videos: interactions.length,
      sessions: sessions.length,
    };
  }, [interactions, sessions]);

  const days = useMemo(() => {
    const map = new Map<string, SessionRow[]>();
    for (const s of sessions) {
      const key = new Date(s.started_at).toDateString();
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [sessions]);

  return (
    <div className="zen-container px-4 py-6 sm:py-10">
      <header className="zen-fade-in mb-5 flex flex-col gap-5 border-b border-border/60 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-primary">
            <Compass className="h-4 w-4" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">Intent compass</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Did your time serve your purpose?</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A practical record of what held your attention, where it drifted, and which intentions worked best.
          </p>
        </div>
        <div className="inline-flex self-start rounded-lg border border-border/70 bg-muted/30 p-1" aria-label="Intent view">
          <Button size="sm" variant={view === "report" ? "default" : "ghost"} onClick={() => { setView("report"); setRange("7"); }}>
            <ChartNoAxesCombined /> Weekly report
          </Button>
          <Button size="sm" variant={view === "timeline" ? "default" : "ghost"} onClick={() => setView("timeline")}>
            <ListTree /> Session history
          </Button>
        </div>
      </header>

      {view === "report" ? (
        isLoading ? <Skeleton className="h-[34rem] w-full rounded-2xl" /> : <WeeklyIntentReport report={weeklyReport} />
      ) : <>
      <div className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border/70 bg-muted/30 p-1 sm:w-fit">
        {([['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days']] as const).map(([key, label]) => (
          <Button key={key} size="sm" variant={range === key ? "secondary" : "ghost"} onClick={() => setRange(key)} className="shrink-0">
            {label}
          </Button>
        ))}
      </div>

      {/* KPIs */}
      <div className="zen-stagger mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          icon={CalendarDays}
          label="Sessions opened"
          value={String(totals.sessions)}
          hint="Times you declared an intention"
          loading={isLoading}
        />
        <Kpi
          icon={Clock}
          label="Time on ZenTube"
          value={formatSeconds(totals.active)}
          hint="Active, visible time"
          loading={isLoading}
        />
        <Kpi
          icon={Play}
          label="Watched"
          value={formatSeconds(totals.watched)}
          hint={`${totals.videos} video${totals.videos === 1 ? "" : "s"}, skipped time excluded`}
          loading={isLoading}
        />
        <Kpi
          icon={Target}
          label="On intention"
          value={`${totals.alignment}%`}
          hint={`${formatSeconds(totals.aligned)} aligned · ${formatSeconds(totals.drifted)} drifted`}
          loading={isLoading}
          accent
        />
      </div>

      {/* Timeline */}
      <div className="mt-8">
        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-2xl" />
            ))}
          </div>
        ) : days.length === 0 ? (
          <div className="ins-panel zen-fade-in rounded-2xl border border-border/60 p-10 text-center">
            <Activity className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Nothing recorded in this range yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Set an intention and watch something — it will show up here within seconds.
            </p>
            <Link
              to="/"
              className="zen-press mt-5 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Start a session
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {days.map(([day, list]) => (
              <section key={day}>
                <h2 className="sticky top-12 z-10 -mx-1 bg-background/90 px-1 py-2 text-sm font-semibold tracking-tight">
                  {dayFmt.format(new Date(day))}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {list.length} session{list.length === 1 ? "" : "s"}
                  </span>
                </h2>
                <div className="zen-stagger mt-2 space-y-3">
                  {list.map((s) => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      segments={segments.filter((g) => g.session_id === s.id)}
                      interactions={interactions.filter((i) => i.session_id === s.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      </>}
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  loading,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
  loading?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "ins-tile rounded-2xl border p-4 transition-transform duration-200 hover:-translate-y-0.5 " +
        (accent ? "border-primary/35 bg-primary/5" : "border-border/60")
      }
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <div
          className={"mt-1.5 text-2xl font-semibold tabular-nums " + (accent ? "text-primary" : "")}
        >
          {value}
        </div>
      )}
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{hint}</p>
    </div>
  );
}

function SessionCard({
  session,
  segments,
  interactions,
}: {
  session: SessionRow;
  segments: SegmentRow[];
  interactions: InteractionRow[];
}) {
  const [open, setOpen] = useState(false);
  const meta = categoryMeta(session.primary_category as IntentCategory);
  const watched = interactions.reduce((n, i) => n + (i.effective_seconds || 0), 0);
  const aligned = interactions
    .filter((i) => i.relevance_score >= 61)
    .reduce((n, i) => n + (i.effective_seconds || 0), 0);
  const pct = watched > 0 ? Math.round((aligned / watched) * 100) : (session.alignment_score ?? 0);

  return (
    <article className="ins-panel overflow-hidden rounded-2xl border border-border/60 transition-shadow duration-200 hover:shadow-lg">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left"
        aria-expanded={open}
      >
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/12 text-lg"
          aria-hidden
        >
          {meta.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">{timeFmt.format(new Date(session.started_at))}</span>
            <span aria-hidden>·</span>
            <span className="rounded-full border border-border/70 px-2 py-0.5">
              {categoryShortLabel(session.primary_category as IntentCategory)}
            </span>
            <span aria-hidden>·</span>
            <span>{formatSeconds(session.active_seconds || 0)} on app</span>
            {session.status === "active" && (
              <span className="rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-primary">
                live
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm font-medium">{session.primary_intent}</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-primary">
              {pct}% on intention
            </span>
          </div>
        </div>
        <ChevronDown
          className={
            "mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 " +
            (open ? "rotate-180" : "")
          }
        />
      </button>

      {open && (
        <div className="zen-fade-in border-t border-border/60 px-4 py-4">
          {segments.length > 1 && (
            <div className="mb-4 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Intentions during this session
              </p>
              {segments.map((g) => (
                <div key={g.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="tabular-nums">{timeFmt.format(new Date(g.started_at))}</span>
                  <span className="rounded-full border border-border/70 px-2 py-0.5">
                    {categoryShortLabel(g.category as IntentCategory)}
                  </span>
                  <span className="truncate text-foreground">{g.raw_intent}</span>
                </div>
              ))}
            </div>
          )}

          {interactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No videos watched in this session.</p>
          ) : (
            <ul className="space-y-2">
              {interactions.map((i) => (
                <VideoRow key={i.id} row={i} />
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <span>Watched {formatSeconds(watched)}</span>
            <span>On intention {formatSeconds(aligned)}</span>
            <span>Drifted {formatSeconds(Math.max(0, watched - aligned))}</span>
          </div>
        </div>
      )}
    </article>
  );
}

function VideoRow({ row }: { row: InteractionRow }) {
  const [open, setOpen] = useState(false);
  const factors = Array.isArray(row.relevance_factors)
    ? (row.relevance_factors as Array<{ label: string; points: number }>)
    : [];

  return (
    <li className="rounded-xl border border-border/50 bg-background/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left"
        aria-expanded={open}
      >
        <img
          src={`https://i.ytimg.com/vi/${row.video_id}/mqdefault.jpg`}
          alt=""
          loading="lazy"
          className="h-11 w-20 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{row.title || row.video_id}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {row.channel || "Unknown channel"} · {timeFmt.format(new Date(row.started_at))} ·{" "}
            {formatSeconds(row.effective_seconds)} watched
            {row.completion_percent > 0 ? ` · ${row.completion_percent}% complete` : ""}
          </p>
        </div>
        <span
          className={
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums " +
            relTone(row.relevance_class)
          }
        >
          {row.relevance_score}
        </span>
        <ChevronDown
          className={
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 " +
            (open ? "rotate-180" : "")
          }
        />
      </button>

      {open && (
        <div className="zen-fade-in border-t border-border/50 px-3 py-3">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Why it scored {row.relevance_score}/100
          </div>
          {row.search_query && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Reached from your search “{row.search_query}”.
            </p>
          )}
          <ul className="mt-2 space-y-1">
            {factors.length === 0 ? (
              <li className="text-xs text-muted-foreground">
                No breakdown was recorded for this video.
              </li>
            ) : (
              factors.map((f, idx) => (
                <li key={idx} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{f.label}</span>
                  <span
                    className={
                      "shrink-0 tabular-nums font-medium " +
                      (f.points > 0 ? "text-emerald-400" : "text-muted-foreground")
                    }
                  >
                    {f.points > 0 ? `+${f.points}` : "0"}
                  </span>
                </li>
              ))
            )}
          </ul>
          {row.skipped && (
            <p className="mt-2 text-xs text-amber-400">
              Mostly skipped — barely watched before moving on.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
