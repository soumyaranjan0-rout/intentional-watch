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
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Compass,
  Play,
  Target,
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

  const timelineDays = useMemo(() => {
    const sessionById = new Map(sessions.map((session) => [session.id, session]));
    const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
    const ordered = [...interactions].sort(
      (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
    );
    const firstDriftBySession = new Map<string, string>();
    for (const interaction of ordered) {
      if (interaction.relevance_score < 61 && !firstDriftBySession.has(interaction.session_id)) {
        firstDriftBySession.set(interaction.session_id, interaction.id);
      }
    }

    const map = new Map<string, TimelineEntry[]>();
    for (const interaction of ordered) {
      const session = sessionById.get(interaction.session_id);
      const segment = segmentById.get(interaction.segment_id);
      const key = new Date(interaction.started_at).toDateString();
      const list = map.get(key) ?? [];
      list.push({
        interaction,
        intent: segment?.raw_intent || session?.primary_intent || "No intention recorded",
        category: (segment?.category || session?.primary_category || "other") as IntentCategory,
        firstDrift: firstDriftBySession.get(interaction.session_id) === interaction.id,
      });
      map.set(key, list);
    }
    return [...map.entries()].reverse();
  }, [sessions, segments, interactions]);

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
        ) : timelineDays.length === 0 ? (
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
            {timelineDays.map(([day, list]) => (
              <section key={day}>
                <h2 className="sticky top-12 z-10 -mx-1 bg-background/90 px-1 py-2 text-sm font-semibold tracking-tight">
                  {dayFmt.format(new Date(day))}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {list.length} video{list.length === 1 ? "" : "s"}
                  </span>
                </h2>
                <ol className="zen-stagger relative mt-2 space-y-3 before:absolute before:bottom-6 before:left-[1.18rem] before:top-6 before:w-px before:bg-border sm:before:left-[2.2rem]">
                  {list.map((entry) => (
                    <TimelineVideo key={entry.interaction.id} entry={entry} />
                  ))}
                </ol>
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

type TimelineEntry = {
  interaction: InteractionRow;
  intent: string;
  category: IntentCategory;
  firstDrift: boolean;
};

function driftExplanation(row: InteractionRow, factors: Array<{ label: string; points: number }>) {
  if (row.skipped) return "You moved on before this became a meaningful watch.";
  const weakSignal = factors.find((factor) => factor.points === 0)?.label;
  if (weakSignal) return weakSignal.replace(/^No /, "The ").replace(/^The search/, "Your search");
  if (row.relevance_score < 41) return "The title, description, and topic had little overlap with your intention.";
  return "Some details matched, but the video’s main subject moved away from your intention.";
}

function TimelineVideo({ entry }: { entry: TimelineEntry }) {
  const { interaction: row, intent, category, firstDrift } = entry;
  const factors = Array.isArray(row.relevance_factors)
    ? (row.relevance_factors as Array<{ label: string; points: number }>)
    : [];
  const drifted = row.relevance_score < 61;
  const meta = categoryMeta(category);

  return (
    <li className="relative pl-10 sm:pl-20">
      <time className="absolute left-0 top-4 z-[1] hidden w-14 bg-background py-1 text-xs tabular-nums text-muted-foreground sm:block">
        {timeFmt.format(new Date(row.started_at))}
      </time>
      <span
        className={
          "absolute left-[0.82rem] top-5 z-[2] h-3 w-3 rounded-full border-2 border-background sm:left-[1.85rem] " +
          (drifted ? "bg-amber-400" : "bg-emerald-400")
        }
        aria-hidden
      />
      <article className={"ins-panel overflow-hidden rounded-2xl border " + (firstDrift ? "border-amber-400/45" : "border-border/60")}>
        {firstDrift && (
          <div className="flex items-center gap-2 border-b border-amber-400/25 bg-amber-400/10 px-4 py-2 text-xs font-semibold text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" /> Drift began here
          </div>
        )}
        <div className="grid gap-4 p-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <Link
            to="/watch/$videoId"
            params={{ videoId: row.video_id }}
            search={{
              title: row.title || "",
              channel: row.channel || "",
              duration: 0,
              thumbnail: `https://i.ytimg.com/vi/${row.video_id}/mqdefault.jpg`,
              t: 0,
              intent: "",
            }}
            className="group relative block overflow-hidden rounded-xl bg-muted sm:self-start"
          >
            <img
              src={`https://i.ytimg.com/vi/${row.video_id}/mqdefault.jpg`}
              alt=""
              loading="lazy"
              className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
            <span className="absolute bottom-1.5 right-1.5 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
              {formatSeconds(row.effective_seconds)} watched
            </span>
          </Link>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <time className="tabular-nums sm:hidden">{timeFmt.format(new Date(row.started_at))}</time>
              <span className="inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5">
                <span aria-hidden>{meta.emoji}</span> {categoryShortLabel(category)}
              </span>
              <span>{row.channel || "Unknown channel"}</span>
            </div>
            <Link
              to="/watch/$videoId"
              params={{ videoId: row.video_id }}
              search={{
                title: row.title || "",
                channel: row.channel || "",
                duration: 0,
                thumbnail: `https://i.ytimg.com/vi/${row.video_id}/mqdefault.jpg`,
                t: 0,
                intent: "",
              }}
              className="mt-1.5 block text-sm font-semibold leading-snug hover:text-primary"
            >
              {row.title || row.video_id}
            </Link>

            <div className="mt-3 rounded-xl border border-border/50 bg-background/35 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Your intention</p>
              <p className="mt-1 text-sm leading-snug">{intent}</p>
              <div className="mt-2.5 flex items-start gap-2">
                {drifted ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                )}
                <div className="min-w-0">
                  <p className={"text-xs font-semibold " + (drifted ? "text-amber-400" : "text-emerald-400")}>
                    {drifted ? "Drifted from this intention" : "Stayed with this intention"}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {drifted
                      ? driftExplanation(row, factors)
                      : `The video strongly matched what you came for (${row.relevance_score}/100).`}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>{formatSeconds(row.effective_seconds)} actually watched</span>
              {row.completion_percent > 0 && <span>{row.completion_percent}% completed</span>}
              <span className={"rounded-full border px-2 py-0.5 font-semibold tabular-nums " + relTone(row.relevance_class)}>
                Match {row.relevance_score}/100
              </span>
            </div>
          </div>
        </div>
      </article>
    </li>
  );
}
