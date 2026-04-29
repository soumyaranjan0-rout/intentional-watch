import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { memo, useEffect, useMemo, useState } from "react";
import { searchVideos, getPlaylistItems, type ResultPlaylist } from "@/server/youtube.functions";
import { useSessionState } from "@/contexts/SessionStateContext";
import { formatDuration, MODES, detectMismatch, type Mode, type ResultVideo } from "@/lib/intent";
import { ResumeBanner } from "@/components/ResumeBanner";
import { ArrowLeft, Loader2, Sliders, Search as SearchIcon, AlertCircle, ListVideo, ChevronDown, Play, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/results")({
  head: () => ({ meta: [{ title: "Results — ZenTube" }] }),
  component: ResultsPage,
});

function ResultsPage() {
  const { mode, refinement, query, setMode } = useSessionState();
  const navigate = useNavigate();
  const [refineText, setRefineText] = useState("");
  // Forward-only "Show more": we track the chain of tokens we've used so we
  // can advance one page at a time but always render only the latest page.
  const [tokenChain, setTokenChain] = useState<(string | undefined)[]>([undefined]);
  const currentToken = tokenChain[tokenChain.length - 1];

  // Reset paging when the underlying search changes
  useEffect(() => {
    setTokenChain([undefined]);
  }, [mode, query, refinement?.chips, refinement?.freeform]);

  useEffect(() => {
    if (!mode || !query) navigate({ to: "/" });
  }, [mode, query, navigate]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["search", mode, query, refinement?.chips, refinement?.freeform, currentToken ?? "first"],
    enabled: !!mode && !!query,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: () =>
      searchVideos({
        data: {
          query,
          mode: mode!,
          chips: refinement?.chips ?? [],
          freeform: [refinement?.freeform ?? "", refineText].filter(Boolean).join(" "),
          pageToken: currentToken,
        },
      }),
  });

  const view = useMemo(() => ({
    results: (data?.results ?? []) as ResultVideo[],
    playlists: (data?.playlists ?? []) as ResultPlaylist[],
    hint: data?.hint ?? null,
    effectiveQuery: data?.effectiveQuery ?? "",
    firstError: data?.error ?? null,
    nextPageToken: data?.nextPageToken ?? null,
  }), [data]);

  const showMore = () => {
    if (!view.nextPageToken) return;
    setTokenChain((c) => [...c, view.nextPageToken!]);
    // Scroll to top so the user clearly sees the swap
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!mode || !query) return null;
  const cfg = MODES[mode];
  const mismatch = detectMismatch(mode, query);
  const pageNumber = tokenChain.length;

  return (
    <div className="zen-container py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <ResumeBanner />
        <div className="mt-4 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> New search
          </Link>
          {view.nextPageToken && view.results.length > 0 && (
            <button
              onClick={showMore}
              disabled={isFetching}
              className="zen-show-more inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary transition-all hover:bg-primary/20 hover:shadow-[0_0_0_3px_color-mix(in_oklab,var(--primary)_15%,transparent)] disabled:opacity-50"
              title="Show different relevant videos"
            >
              {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Show more
            </button>
          )}
        </div>

        <div className="mt-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-2.5 py-0.5 text-xs text-muted-foreground">
            <span aria-hidden>{cfg.emoji}</span>
            {cfg.label}
            {pageNumber > 1 && <span className="text-muted-foreground/70">· page {pageNumber}</span>}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">"{query}"</h1>
          {refinement?.chips && refinement.chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {refinement.chips.map((c) => (
                <span key={c} className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted-foreground">{c}</span>
              ))}
            </div>
          )}

          {(view.effectiveQuery || view.hint) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {view.hint && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary">
                  <SearchIcon className="h-3 w-3" /> {view.hint}
                </span>
              )}
              {view.effectiveQuery && view.effectiveQuery !== query && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/60 px-2.5 py-1 text-muted-foreground">
                  Searching: <span className="text-foreground">{view.effectiveQuery}</span>
                </span>
              )}
            </div>
          )}

          {mismatch.mismatched && mismatch.suggested && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div className="flex-1">
                <span className="text-foreground">{mismatch.reason}</span>
                <button
                  onClick={() => setMode(mismatch.suggested!)}
                  className="ml-2 underline text-primary hover:opacity-80"
                >
                  Switch to {MODES[mismatch.suggested].label}
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-2 focus-within:border-primary/50">
            <Sliders className="h-4 w-4 text-muted-foreground" />
            <input
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") refetch(); }}
              placeholder="Refine — add more context (e.g. 'in Hindi', 'beginner')"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {refineText && (
              <button
                onClick={() => refetch()}
                className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
              >
                Apply
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <ResultsSkeleton />
        ) : error ? (
          <div className="mt-12 zen-card p-6 text-sm text-muted-foreground">
            Something went wrong fetching results.{" "}
            <button onClick={() => refetch()} className="text-primary hover:underline">Try again</button>
          </div>
        ) : view.firstError ? (
          <div className="mt-12 zen-card p-6 text-sm text-muted-foreground">{view.firstError}</div>
        ) : !view.results.length && !view.playlists.length ? (
          <div className="mt-12 zen-card p-6 text-sm text-muted-foreground">
            No good matches. Try different phrasing.
          </div>
        ) : (
          <div className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
            <ResultsList results={view.results} playlists={view.playlists} mode={mode} />
          </div>
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

function ResultsList({
  results, playlists, mode,
}: { results: ResultVideo[]; playlists: ResultPlaylist[]; mode: Mode }) {
  const primary = results.find((r) => r.primary) ?? results[0];
  const rest = results.filter((r) => primary && r.videoId !== primary.videoId);
  return (
    <div className="mt-6 space-y-4">
      {primary && <ResultCard v={primary} highlighted={mode === "find"} />}

      {playlists.length > 0 && (
        <>
          <div className="pt-2 text-xs uppercase tracking-wider text-muted-foreground">
            Curated playlists
          </div>
          {playlists.map((p) => <PlaylistCard key={p.playlistId} p={p} />)}
        </>
      )}

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
        Showing {results.length} curated picks. Use "Show more" for different ones.
      </p>
    </div>
  );
}

const ResultCard = memo(function ResultCard({
  v, highlighted,
}: { v: ResultVideo; highlighted?: boolean }) {
  return (
    <Link
      to="/watch/$videoId"
      params={{ videoId: v.videoId }}
      search={{ title: v.title, channel: v.channel, duration: v.durationSeconds, thumbnail: v.thumbnail, t: 0, intent: "" }}
      className={
        "zen-card zen-card-hover block overflow-hidden " +
        (highlighted ? "border-primary/40 ring-1 ring-primary/15" : "")
      }
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
        <div className="relative shrink-0 overflow-hidden rounded-md bg-muted sm:w-64">
          <div className="aspect-video w-full">
            {v.thumbnail ? (
              <img src={v.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />
            ) : null}
          </div>
          <div className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 text-xs text-foreground">
            {formatDuration(v.durationSeconds)}
          </div>
        </div>
        <div className="flex-1">
          {highlighted && (
            <div className="mb-1 inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-primary">
              Best match
            </div>
          )}
          <h3 className="text-base font-medium leading-snug text-foreground sm:text-lg">{v.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span>{v.channel}</span>
            {v.publishedAt && (
              <>
                <span aria-hidden>·</span>
                <span className="text-xs">{new Date(v.publishedAt).toLocaleDateString()}</span>
              </>
            )}
          </div>
          <p className="mt-3 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">{v.reason}</p>
        </div>
      </div>
    </Link>
  );
});

function PlaylistCard({ p }: { p: ResultPlaylist }) {
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useQuery({
    queryKey: ["playlist-items", p.playlistId],
    queryFn: () => getPlaylistItems({ data: { playlistId: p.playlistId } }),
    enabled: open,
    staleTime: 10 * 60 * 1000,
  });

  return (
    <div className="zen-card overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
        <Link
          to="/playlist/$playlistId"
          params={{ playlistId: p.playlistId }}
          search={{ index: 0 }}
          className="relative shrink-0 overflow-hidden rounded-md bg-muted sm:w-64 group"
        >
          <div className="aspect-video w-full">
            {p.thumbnail && (
              <img src={p.thumbnail} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" loading="lazy" />
            )}
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 transition-colors group-hover:bg-black/55">
            <ListVideo className="h-8 w-8 text-white" />
          </div>
          <div className="absolute bottom-2 right-2 rounded bg-background/85 px-1.5 py-0.5 text-xs text-foreground">
            {p.itemCount} videos
          </div>
        </Link>

        <div className="flex-1">
          <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-primary">
            <ListVideo className="h-3 w-3" /> Playlist
          </div>
          <Link
            to="/playlist/$playlistId"
            params={{ playlistId: p.playlistId }}
            search={{ index: 0 }}
            className="block"
          >
            <h3 className="text-base font-medium leading-snug text-foreground hover:text-primary sm:text-lg">{p.title}</h3>
          </Link>
          <div className="mt-1 text-sm text-muted-foreground">{p.channel}</div>
          <p className="mt-2 text-sm text-muted-foreground">{p.reason}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              to="/playlist/$playlistId"
              params={{ playlistId: p.playlistId }}
              search={{ index: 0 }}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <Play className="h-3 w-3" /> Open playlist
            </Link>
            <button
              onClick={() => setOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (open ? "rotate-180" : "")} />
              {open ? "Hide preview" : "Preview videos"}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-surface/40">
          {isFetching ? (
            <div className="p-4 text-sm text-muted-foreground">Loading playlist…</div>
          ) : !data?.items.length ? (
            <div className="p-4 text-sm text-muted-foreground">No videos available.</div>
          ) : (
            <ol className="divide-y divide-border max-h-72 overflow-y-auto">
              {data.items.slice(0, 8).map((it, i) => (
                <li key={it.videoId}>
                  <Link
                    to="/playlist/$playlistId"
                    params={{ playlistId: p.playlistId }}
                    search={{ index: i }}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent/30"
                  >
                    <span className="w-6 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
                      {it.position + 1}
                    </span>
                    <Play className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="line-clamp-1 flex-1 text-foreground">{it.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDuration(it.durationSeconds)}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
