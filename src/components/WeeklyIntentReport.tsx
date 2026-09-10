import { CheckCircle2, Flame, Info, Sparkles, TriangleAlert } from "lucide-react";
import { formatSeconds } from "@/lib/relevance";
import type { WeeklyReport } from "@/lib/weeklyIntentReport";

function AlignmentRing({ value }: { value: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          strokeWidth="11"
          className="stroke-muted"
          strokeLinecap="round"
        />
        <circle
          cx="64"
          cy="64"
          r={r}
          fill="none"
          strokeWidth="11"
          strokeLinecap="round"
          stroke="url(#ring-grad)"
          strokeDasharray={`${dash} ${c - dash}`}
          style={{ transition: "stroke-dasharray 700ms cubic-bezier(.2,.8,.2,1)" }}
        />
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--primary)" />
            <stop offset="100%" stopColor="color-mix(in oklab, var(--primary) 40%, #ffd9a0)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-3xl font-semibold tabular-nums">{value}%</div>
          <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            on intention
          </div>
        </div>
      </div>
    </div>
  );
}

function DayBars({ report }: { report: WeeklyReport }) {
  const peak = Math.max(1, ...report.days.map((d) => d.watched));
  return (
    <div className="flex items-end justify-between gap-2 sm:gap-3">
      {report.days.map((d) => {
        const h = Math.round((d.watched / peak) * 100);
        const on = d.watched > 0 ? Math.round((d.onIntent / d.watched) * 100) : 0;
        return (
          <div key={d.date} className="group flex min-w-0 flex-1 flex-col items-center gap-2">
            <span className="text-[10px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
              {Math.round(d.watched / 60)}m
            </span>
            <div
              className="relative flex w-full max-w-[46px] items-end overflow-hidden rounded-lg bg-muted/60"
              style={{ height: 132 }}
              title={`${d.label}: ${formatSeconds(d.watched)} watched, ${on}% on intention`}
            >
              <div
                className="w-full rounded-lg bg-primary/25 transition-[height] duration-700"
                style={{ height: `${Math.max(4, h)}%` }}
              >
                <div
                  className="absolute bottom-0 w-full rounded-lg bg-primary transition-[height] duration-700"
                  style={{ height: `${Math.max(2, (h * on) / 100)}%` }}
                />
              </div>
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

const toneStyles = {
  good: { icon: CheckCircle2, cls: "text-emerald-400 border-emerald-400/25 bg-emerald-400/8" },
  watch: { icon: TriangleAlert, cls: "text-amber-400 border-amber-400/25 bg-amber-400/8" },
  info: { icon: Info, cls: "text-primary border-primary/25 bg-primary/8" },
} as const;

export function WeeklyIntentReport({ report }: { report: WeeklyReport }) {
  const delta =
    report.previousAlignment !== null ? report.alignment - report.previousAlignment : null;

  return (
    <div className="zen-stagger space-y-4">
      {/* Headline card */}
      <section className="ins-hero relative overflow-hidden rounded-3xl border border-border/60 p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute left-[-5rem] bottom-[-7rem] h-64 w-64 rounded-full"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--primary) 20%, transparent), transparent 70%)",
          }}
        />
        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <AlignmentRing value={report.alignment} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                <Sparkles className="h-3.5 w-3.5" /> Weekly intent report
              </span>
              <span className="rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                {report.rangeLabel}
              </span>
              {report.demo && (
                <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                  Sample data
                </span>
              )}
            </div>
            <p className="mt-2 text-lg font-medium leading-snug">{report.verdict}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span>
                <strong className="text-foreground tabular-nums">
                  {formatSeconds(report.totals.watched)}
                </strong>{" "}
                watched
              </span>
              <span>
                <strong className="text-foreground tabular-nums">
                  {formatSeconds(report.totals.onIntent)}
                </strong>{" "}
                on intention
              </span>
              <span>
                <strong className="text-foreground tabular-nums">
                  {formatSeconds(report.totals.drifted)}
                </strong>{" "}
                drifted
              </span>
              {delta !== null && (
                <span className={delta >= 0 ? "text-emerald-400" : "text-amber-400"}>
                  {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pts vs last week
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Numbers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          {
            label: "Sessions",
            value: String(report.totals.sessions),
            hint: "Intentions declared",
          },
          {
            label: "Videos",
            value: String(report.totals.videos),
            hint: "Opened this week",
          },
          {
            label: "Avg. session",
            value: formatSeconds(report.totals.avgSession),
            hint: "Watch time per visit",
          },
          {
            label: "Days with intent",
            value: `${report.totals.intentionDays}/7`,
            hint: "Habit consistency",
          },
        ].map((k) => (
          <div key={k.label} className="ins-tile rounded-2xl border border-border/60 p-4">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {k.label}
            </div>
            <div className="mt-1.5 text-2xl font-semibold tabular-nums">{k.value}</div>
            <p className="mt-1 text-[11px] text-muted-foreground">{k.hint}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* Rhythm */}
        <section className="ins-panel rounded-2xl border border-border/60 p-5 lg:col-span-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Your week, day by day</h3>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> on intention
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-primary/25" /> drifted
              </span>
            </div>
          </div>
          <div className="mt-5">
            <DayBars report={report} />
          </div>
        </section>

        {/* Categories */}
        <section className="ins-panel rounded-2xl border border-border/60 p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold">Where the time went</h3>
          {report.categories.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No categories recorded yet.</p>
          ) : (
            <ul className="mt-4 space-y-3.5">
              {report.categories.map((c) => {
                const share = Math.round((c.seconds / Math.max(1, report.totals.watched)) * 100);
                return (
                  <li key={c.id}>
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">
                        <span aria-hidden className="mr-1.5">
                          {c.emoji}
                        </span>
                        {c.label}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatSeconds(c.seconds)} · {c.alignment}% on intent
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/80 transition-[width] duration-700"
                        style={{ width: `${Math.max(3, share)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Best vs drift */}
      <div className="grid gap-4 sm:grid-cols-2">
        {report.best && (
          <section className="ins-panel rounded-2xl border border-emerald-400/25 p-5">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
              <Flame className="h-3.5 w-3.5" /> Sharpest session
            </div>
            <p className="mt-2 text-sm font-medium leading-snug">“{report.best.intent}”</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {formatSeconds(report.best.seconds)} watched · {report.best.alignment}% stayed on
              purpose
            </p>
          </section>
        )}
        {report.drift && (
          <section className="ins-panel rounded-2xl border border-amber-400/25 p-5">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5" /> Biggest detour
            </div>
            <p className="mt-2 truncate text-sm font-medium">{report.drift.title}</p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {report.drift.channel} · {formatSeconds(report.drift.seconds)} · scored{" "}
              {report.drift.score}/100 against your intention
            </p>
          </section>
        )}
      </div>

      {/* Highlights */}
      <section className="ins-panel rounded-2xl border border-border/60 p-5">
        <h3 className="text-sm font-semibold">What the week is telling you</h3>
        <ul className="mt-4 space-y-2.5">
          {report.highlights.map((h, i) => {
            const { icon: Icon, cls } = toneStyles[h.tone];
            return (
              <li
                key={i}
                className={"flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm " + cls}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="text-foreground/90">{h.text}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
