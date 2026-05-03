import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { memo, useEffect, useMemo, useState } from "react";
import { searchVideos, getPlaylistItems, type ResultPlaylist, type ResultChannel } from "@/server/youtube.functions";
import { useSessionState } from "@/contexts/SessionStateContext";
import { useAuth } from "@/contexts/AuthContext";
import { addToSystemPlaylist } from "@/lib/systemPlaylists";
import { formatCount, formatDuration, MODES, detectMismatch, type Mode, type ResultVideo } from "@/lib/intent";
import { ResumeBanner } from "@/components/ResumeBanner";
import { ArrowLeft, Loader2, Search as SearchIcon, AlertCircle, ListVideo, Play, ChevronRight, Users, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/results")({
  head: () => ({ meta: [{ title: "Results — ZenTube" }] }),
  component: ResultsPage,
});

type Page = {
  results: ResultVideo[];
  playlists: ResultPlaylist[];
  channel: ResultChannel | null;
  hint: string | null;
  effectiveQuery: string;
  nextPageToken: string | null;
};

function ResultsPage() {
  const { mode, refinement, query, setMode } = useSessionState();
  const navigate = useNavigate();

  // Accumulated pages — append on "Show more" so user can scroll back.
  const [pages, setPages] = useState<Page[]>([]);
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [endReached, setEndReached] = useState(false);

  // Reset when underlying search changes
  useEffect(() => {
    setPages([]);
    setPageToken(undefined);
    setEndReached(false);
  }, [mode, query, refinement?.chips, refinement?.freeform]);

  useEffect(() => {
    if (!mode || !query) navigate({ to: "/" });
  }, [mode, query, navigate]);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["search", mode, query, refinement?.chips, refinement?.freeform, pageToken ?? "first"],
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
          freeform: refinement?.freeform ?? "",
          pageToken,
        },
      }),
  });

  // Append fresh pages, dedupe across pages
  useEffect(() => {
    if (!data) return;
    const newPage: Page = {
      results: data.results ?? [],
      playlists: data.playlists ?? [],
      channel: data.channel ?? null,
      hint: data.hint ?? null,
      effectiveQuery: data.effectiveQuery ?? "",
      nextPageToken: data.nextPageToken ?? null,
    };
    setPages((prev) => {
      // If this is the first page (token undefined), reset.
      if (!pageToken) return [newPage];
      // Avoid double-append if React re-runs this effect with the same data
      const last = prev[prev.length - 1];
      if (last && last.nextPageToken === newPage.nextPageToken && last.results[0]?.videoId === newPage.results[0]?.videoId) {
        return prev;
      }
      return [...prev, newPage];
    });
    if (!data.nextPageToken && (data.results?.length ?? 0) === 0 && pageToken) {
      setEndReached(true);
    }
    if (!data.nextPageToken) setEndReached((e) => e || pages.length > 0 || (data.results?.length ?? 0) === 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pageToken]);

  const allResults = useMemo(() => {
    const seen = new Set<string>();
    const out: ResultVideo[] = [];
    for (const p of pages) {
      for (const r of p.results) {
        if (seen.has(r.videoId)) continue;
        seen.add(r.videoId);
        out.push(r);
      }
    }
    return out;
  }, [pages]);

  const firstPage = pages[0];
  const lastPage = pages[pages.length - 1];
  const nextToken = lastPage?.nextPageToken ?? null;

  const showMore = () => {
    if (!nextToken || isFetching) return;
    setPageToken(nextToken);
  };

  if (!mode || !query) return null;
  const cfg = MODES[mode];
  const mismatch = detectMismatch(mode, query);

  const firstError = data && pages.length === 0 ? data.error : null;
  const noResultsAtAll = !isLoading && !error && !firstError && pages.length > 0 && allResults.length === 0 && !(firstPage?.channel) && !(firstPage?.playlists.length);

  return (
    <div className="zen-container py-8 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <ResumeBanner />
        <div className="mt-4 flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> New search
          </Link>
        </div>

        <div className="mt-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/60 px-2.5 py-0.5 text-xs text-muted-foreground">
            <span aria-hidden>{cfg.emoji}</span>
            {cfg.label}
            {pages.length > 1 && <span className="text-muted-foreground/70">· {pages.length} pages</span>}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">"{query}"</h1>
          {refinement?.chips && refinement.chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {refinement.chips.map((c) => (
                <span key={c} className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted-foreground">{c}</span>
              ))}
            </div>
          )}

          {(firstPage?.effectiveQuery || firstPage?.hint) && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {firstPage?.hint && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary">
                  <SearchIcon className="h-3 w-3" /> {firstPage.hint}
                </span>
              )}
              {firstPage?.effectiveQuery && firstPage.effectiveQuery !== query && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface/60 px-2.5 py-1 text-muted-foreground">
                  Searching: <span className="text-foreground">{firstPage.effectiveQuery}</span>
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
        </div>

        {isLoading ? (
          <ResultsSkeleton />
        ) : error ? (
          <div className="mt-12 zen-card p-6 text-sm text-muted-foreground">
            Something went wrong fetching results.{" "}
            <button onClick={() => refetch()} className="text-primary hover:underline">Try again</button>
          </div>
        ) : firstError ? (
          <div className="mt-12 zen-card p-6 text-sm text-muted-foreground">{firstError}</div>
        ) : noResultsAtAll ? (
          <div className="mt-12 zen-card p-6 text-sm text-muted-foreground">
            No results yet. Try a different keyword or simpler phrasing.
          </div>
        ) : (
          <>
            {firstPage?.channel && <ChannelCard channel={firstPage.channel} />}

            <ResultsList
              results={allResults}
              playlists={firstPage?.playlists ?? []}
              mode={mode}
            />

            {/* Pagination footer */}
            <div className="mt-8 flex flex-col items-center gap-2">
              {nextToken ? (
                <button
                  onClick={showMore}
                  disabled={isFetching}
                  className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-5 py-2 text-sm font-medium text-primary transition-all hover:bg-primary/20 disabled:opacity-50"
                >
                  {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
                  {isFetching ? "Loading…" : "Show more"}
                </button>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {endReached || pages.length > 1 ? "No more results available" : "End of results"}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Showing {allResults.length} {allResults.length === 1 ? "video" : "videos"}
              </p>
            </div>
          </>
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

function ChannelCard({ channel }: { channel: ResultChannel }) {
  return (
    <Link
      to="/channel/$channelId"
      params={{ channelId: channel.channelId }}
      className="zen-card zen-card-hover mt-6 flex items-center gap-4 p-4 sm:p-5"
    >
      <img src={channel.thumbnail} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-border sm:h-20 sm:w-20" />
      <div className="min-w-0 flex-1">
        <div className="mb-1 inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-primary">
          <Users className="h-3 w-3" /> Channel
        </div>
        <div className="truncate text-base font-semibold text-foreground sm:text-lg">{channel.title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {formatCount(channel.subscriberCount)} subscribers · {formatCount(channel.videoCount)} videos
        </div>
        {channel.description && (
          <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{channel.description}</p>
        )}
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
    </Link>
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
            More videos
          </div>
          {rest.map((r) => (
            <ResultCard key={r.videoId} v={r} />
          ))}
        </>
      )}
    </div>
  );
}

const ResultCard = memo(function ResultCard({
  v, highlighted,
}: { v: ResultVideo; highlighted?: boolean }) {
  return (
    <div className={"zen-card zen-card-hover overflow-hidden " + (highlighted ? "border-primary/40 ring-1 ring-primary/15" : "")}>
      <Link
        to="/watch/$videoId"
        params={{ videoId: v.videoId }}
        search={{ title: v.title, channel: v.channel, duration: v.durationSeconds, thumbnail: v.thumbnail, t: 0, intent: "" }}
        className="block"
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
              {v.viewCount > 0 && (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-xs">{formatCount(v.viewCount)} views</span>
                </>
              )}
            </div>
            <p className="mt-3 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">{v.reason}</p>
          </div>
        </div>
      </Link>
      {v.channelId && (
        <Link
          to="/channel/$channelId"
          params={{ channelId: v.channelId }}
          className="block border-t border-border/40 px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/30 hover:text-primary sm:px-5"
        >
          Visit channel: <span className="text-foreground">{v.channel}</span>
        </Link>
      )}
    </div>
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
