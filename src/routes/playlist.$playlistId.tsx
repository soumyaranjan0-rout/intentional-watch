import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { getPlaylistItems } from "@/server/youtube.functions";
import { Player } from "@/components/Player";
import { formatDuration } from "@/lib/intent";
import { ArrowLeft, ListVideo, Play, Loader2 } from "lucide-react";

const PlaylistSearch = z.object({
  index: z.coerce.number().int().min(0).default(0),
});

export const Route = createFileRoute("/playlist/$playlistId")({
  head: () => ({ meta: [{ title: "Playlist — ZenTube" }] }),
  validateSearch: (s) => PlaylistSearch.parse(s),
  component: PlaylistPage,
});

function PlaylistPage() {
  const { playlistId } = Route.useParams();
  const { index } = Route.useSearch();
  const navigate = useNavigate();
  const [active, setActive] = useState(index);

  useEffect(() => setActive(index), [index]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["playlist-page", playlistId],
    queryFn: () => getPlaylistItems({ data: { playlistId } }),
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading playlist…
      </div>
    );
  }

  if (error || !data?.items?.length) {
    return (
      <div className="zen-container py-16 text-center">
        <p className="text-muted-foreground">This playlist couldn't be loaded.</p>
        <Link to="/" className="mt-4 inline-flex text-sm text-primary hover:underline">
          ← Back home
        </Link>
      </div>
    );
  }

  const items = data.items;
  const current = items[Math.min(active, items.length - 1)];

  const playAt = (i: number) => {
    setActive(i);
    navigate({ to: "/playlist/$playlistId", params: { playlistId }, search: { index: i }, replace: true });
  };

  return (
    <div className="zen-container-wide py-6 sm:py-10">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Player + current title */}
        <div>
          <div className="zen-card overflow-hidden">
            <div className="aspect-video w-full bg-black">
              <Player videoId={current.videoId} startSeconds={0} />
            </div>
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight sm:text-2xl">{current.title}</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {current.channel}
            {current.durationSeconds ? ` · ${formatDuration(current.durationSeconds)}` : ""}
          </div>
        </div>

        {/* Queue */}
        <aside className="zen-card overflow-hidden lg:sticky lg:top-20 lg:self-start">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <ListVideo className="h-4 w-4 text-primary" />
            <div className="flex-1">
              <div className="text-sm font-medium">Playlist</div>
              <div className="text-xs text-muted-foreground">
                {active + 1} / {items.length}
              </div>
            </div>
          </div>
          <ol className="max-h-[70vh] divide-y divide-border overflow-y-auto">
            {items.map((it, i) => {
              const isActive = i === active;
              return (
                <li key={it.videoId}>
                  <button
                    onClick={() => playAt(i)}
                    className={
                      "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors " +
                      (isActive ? "bg-primary/10" : "hover:bg-accent/40")
                    }
                  >
                    <div className="w-6 shrink-0 pt-1.5 text-center text-xs tabular-nums text-muted-foreground">
                      {isActive ? <Play className="mx-auto h-3.5 w-3.5 text-primary" /> : i + 1}
                    </div>
                    <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded bg-muted">
                      {it.thumbnail && (
                        <img src={it.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className={"line-clamp-2 text-xs " + (isActive ? "text-foreground font-medium" : "text-foreground/90")}>
                        {it.title}
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {it.channel}
                        {it.durationSeconds ? ` · ${formatDuration(it.durationSeconds)}` : ""}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
