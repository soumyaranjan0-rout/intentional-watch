import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Play, X } from "lucide-react";
import { clearLastWatched, getLastWatched, type LastWatched } from "@/lib/lastWatched";
import { formatDuration } from "@/lib/intent";

export function ResumeBanner() {
  const [lw, setLw] = useState<LastWatched | null>(null);

  useEffect(() => {
    setLw(getLastWatched());
    const onUpdate = () => setLw(getLastWatched());
    window.addEventListener("zentube:lastWatched", onUpdate);
    window.addEventListener("focus", onUpdate);
    return () => {
      window.removeEventListener("zentube:lastWatched", onUpdate);
      window.removeEventListener("focus", onUpdate);
    };
  }, []);

  if (!lw) return null;
  const pct = lw.duration > 0 ? Math.min(100, Math.round((lw.t / lw.duration) * 100)) : 0;
  const remaining = Math.max(0, (lw.duration || 0) - (lw.t || 0));

  return (
    <div className="zen-fade-in mx-auto mt-6 w-full max-w-3xl">
      <div className="zen-card group relative overflow-hidden p-3 sm:p-4">
        <div className="flex items-center gap-3 sm:gap-4">
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
            className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-muted sm:w-40"
          >
            {lw.thumbnail && (
              <img src={lw.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
              <Play className="h-6 w-6 text-white" />
            </div>
            {pct > 0 && (
              <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </div>
            )}
          </Link>

          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-medium uppercase tracking-wider text-primary">
              Resume watching
            </div>
            <div className="mt-0.5 line-clamp-1 text-sm font-medium text-foreground sm:text-base">
              {lw.title}
            </div>
            <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {lw.channel}
              {remaining > 0 && <> · {formatDuration(remaining)} left</>}
            </div>
          </div>

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
            className="hidden shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 sm:inline-flex"
          >
            <Play className="h-3.5 w-3.5" /> Resume
          </Link>

          <button
            onClick={clearLastWatched}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
