import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Play, RotateCcw } from "lucide-react";
import { getLastWatched, type LastWatched } from "@/lib/lastWatched";
import { formatDuration } from "@/lib/intent";

/** Small "back to the video you were watching" pill.
 *  Appears in the header whenever a recent watch session exists and the
 *  user has navigated away from the watch page. */
export function NowPlayingChip({ mobile = false }: { mobile?: boolean }) {
  const [lw, setLw] = useState<LastWatched | null>(null);
  const { location } = useRouterState();

  useEffect(() => {
    const read = () => {
      const v = getLastWatched();
      // Only offer "back to video" for a session from the last 3 hours.
      setLw(v && Date.now() - v.updatedAt < 3 * 60 * 60 * 1000 ? v : null);
    };
    read();
    window.addEventListener("zentube:lastWatched", read);
    window.addEventListener("storage", read);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener("zentube:lastWatched", read);
      window.removeEventListener("storage", read);
      window.removeEventListener("focus", read);
    };
  }, [location.pathname]);

  const onWatch = location.pathname.startsWith("/watch") || location.pathname.startsWith("/playlist") || location.pathname.startsWith("/login");
  if (!lw || onWatch) return null;

  return (
    <Link
      to="/watch/$videoId"
      params={{ videoId: lw.videoId }}
      search={{
        title: lw.title,
        channel: lw.channel,
        duration: lw.duration,
        thumbnail: lw.thumbnail,
        t: lw.t,
        intent: "",
      }}
      title={`Back to: ${lw.title}`}
      aria-label={`Resume ${lw.title} at ${Math.floor(lw.t / 60)} minutes ${Math.round(lw.t % 60)} seconds`}
      className={(mobile
        ? "inline-flex max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border border-primary/40 bg-popover px-4 py-2.5 text-sm text-foreground shadow-lg"
        : "hidden max-w-[240px] shrink-0 items-center gap-2 rounded-full border border-primary/30 bg-surface/80 px-3 py-1.5 text-xs text-foreground lg:inline-flex") +
        " resume-chip no-underline hover:border-primary/60 hover:no-underline"}
    >
      <span className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
        <Play className="h-3 w-3 fill-current" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{mobile ? "Resume current video" : (lw.title || "Back to video")}</span>
        <span className="block text-[10px] text-muted-foreground">Continue at {formatDuration(lw.t)}</span>
      </span>
      <RotateCcw className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
    </Link>
  );
}
