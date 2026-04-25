import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { memo, useEffect } from "react";
import { searchVideos } from "@/server/youtube.functions";
import { useSessionState } from "@/contexts/SessionStateContext";
import { formatDuration, MODES, type ResultVideo } from "@/lib/intent";
import { ArrowLeft, Sliders } from "lucide-react";

export const Route = createFileRoute("/results")({
  head: () => ({ meta: [{ title: "Results — ZenTube" }] }),
  component: ResultsPage,
});

function ResultsPage() {
  const { mode, refinement, query } = useSessionState();
  const navigate = useNavigate();

  useEffect(() => {
    if (!mode || !query) navigate({ to: "/" });
  }, [mode, query, navigate]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["search", mode, query, refinement?.chips, refinement?.freeform],
    enabled: !!mode && !!query,
    staleTime: 5 * 60 * 1000, // 5 min cache — same query won't refetch
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      searchVideos({
        data: {
          query,
          mode: mode!,
          chips: refinement?.chips ?? [],
          freeform: refinement?.freeform ?? "",
        },
      }),
  });

  if (!mode || !query) return null;
  const cfg = MODES[mode];

  return (
    <div className="zen-container py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> New search
        </Link>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-2.5 py-0.5 text-xs text-muted-foreground">
              <span aria-hidden>{cfg.emoji}</span>
              {cfg.label}
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">"{query}"</h1>
            {refinement?.chips && refinement.chips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {refinement.chips.map((c) => (
                  <span key={c} className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted-foreground">{c}</span>
                ))}
              </div>
            )}
          </div>
          {mode !== "find" && (
            <Link
              to="/refine/$mode"
              params={{ mode }}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <Sliders className="h-4 w-4" /> Refine
            </Link>
          )}
        </div>

        {isLoading || isFetching ? (
          <ResultsSkeleton />
        ) : error ? (
          <div className="mt-12 zen-card p-6 text-sm text-muted-foreground">
            Something went wrong fetching results.{" "}
            <button onClick={() => refetch()} className="text-primary hover:underline">
              Try again
            </button>
          </div>
        ) : data?.error ? (
          <div className="mt-12 zen-card p-6 text-sm text-muted-foreground">{data.error}</div>
        ) : !data?.results.length ? (
          <div className="mt-12 zen-card p-6 text-sm text-muted-foreground">
            No good matches. Try a different phrasing.
          </div>
        ) : (
          <ResultsList results={data.results} />
        )}
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <div className="mt-8 space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="zen-card flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
          <div className="zen-skeleton aspect-video w-full sm:w-64" />
          <div className="flex-1 space-y-3">
            <div className="zen-skeleton h-4 w-3/4" />
            <div className="zen-skeleton h-3 w-1/3" />
            <div className="zen-skeleton h-3 w-full" />
            <div className="zen-skeleton h-3 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultsList({ results }: { results: ResultVideo[] }) {
  const primary = results.find((r) => r.primary) ?? results[0];
  const rest = results.filter((r) => r.videoId !== primary.videoId);
  return (
    <div className="mt-8 space-y-4">
      <ResultCard v={primary} highlighted />
      {rest.length > 0 && (
        <>
          <div className="pt-2 text-xs uppercase tracking-wider text-muted-foreground">
            Alternatives
          </div>
          {rest.map((r) => (
            <ResultCard key={r.videoId} v={r} />
          ))}
        </>
      )}
      <p className="pt-6 text-center text-xs text-muted-foreground">
        Showing {results.length} curated picks. No more loaded — that's by design.
      </p>
    </div>
  );
}

const ResultCard = memo(function ResultCard({
  v,
  highlighted,
}: {
  v: ResultVideo;
  highlighted?: boolean;
}) {
  return (
    <Link
      to="/watch/$videoId"
      params={{ videoId: v.videoId }}
      search={{
        title: v.title,
        channel: v.channel,
        duration: v.durationSeconds,
        thumbnail: v.thumbnail,
      }}
      className={
        "zen-card zen-card-hover block overflow-hidden " +
        (highlighted ? "border-primary/40 ring-1 ring-primary/15" : "")
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
        <div className="relative shrink-0 overflow-hidden rounded-md bg-muted sm:w-64">
          <div className="aspect-video w-full">
            {v.thumbnail ? (
              <img
                src={v.thumbnail}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : null}
          </div>
          <div className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 text-xs text-foreground">
            {formatDuration(v.durationSeconds)}
          </div>
        </div>
        <div className="flex-1">
          {highlighted && (
            <div className="mb-1 inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-primary">
              Best pick
            </div>
          )}
          <h3 className="text-base font-medium leading-snug text-foreground sm:text-lg">
            {v.title}
          </h3>
          <div className="mt-1 text-sm text-muted-foreground">{v.channel}</div>
          <p className="mt-3 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">
            {v.reason}
          </p>
        </div>
      </div>
    </Link>
  );
});
