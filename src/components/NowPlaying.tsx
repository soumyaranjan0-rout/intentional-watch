import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { getLastWatched, type LastWatched } from "@/lib/lastWatched";

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
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener("zentube:lastWatched", read);
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
        ? "inline-flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-full border border-primary/35 bg-popover px-4 py-2.5 text-sm text-foreground shadow-lg"
        : "hidden max-w-[180px] shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface/70 px-2.5 py-1.5 text-xs text-muted-foreground lg:inline-flex") +
        " no-underline transition-[transform,border-color] hover:-translate-y-0.5 hover:border-primary/50 hover:no-underline"}
    >
      <Play className="h-3.5 w-3.5 shrink-0 fill-current text-primary" aria-hidden />
      <span className="truncate">{mobile ? "Resume current video" : (lw.title || "Back to video")}</span>
    </Link>
  );
}
