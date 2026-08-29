import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { getLastWatched, type LastWatched } from "@/lib/lastWatched";

/** Small "back to the video you were watching" pill.
 *  Appears in the header whenever a recent watch session exists and the
 *  user has navigated away from the watch page. */
export function NowPlayingChip() {
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

  const onWatch = location.pathname.startsWith("/watch") || location.pathname.startsWith("/login");
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
      className="inline-flex max-w-[180px] shrink-0 items-center gap-1.5 rounded-full border border-border bg-surface/70 px-2.5 py-1.5 text-xs text-muted-foreground no-underline transition-colors hover:border-primary/40 hover:text-foreground hover:no-underline"
    >
      <Play className="h-3.5 w-3.5 shrink-0 fill-current text-primary" aria-hidden />
      <span className="hidden truncate sm:inline">{lw.title || "Back to video"}</span>
      <span className="sm:hidden">Resume</span>
    </Link>
  );
}
