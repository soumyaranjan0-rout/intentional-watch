import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSessionState } from "@/contexts/SessionStateContext";
import { formatCount, formatDuration } from "@/lib/intent";
import { Player, type PlayerHandle } from "@/components/Player";
import { NotesPanel } from "@/components/NotesPanel";
import { SessionPrompt } from "@/components/SessionPrompt";
import { getVideoMeta } from "@/server/youtube.functions";
import { toast } from "sonner";
import {
  ArrowLeft, BookmarkPlus, BookmarkCheck, Share2, ThumbsUp, ThumbsDown,
  Clock, Bell, BellOff,
} from "lucide-react";

export const Route = createFileRoute("/watch/$videoId")({
  validateSearch: (s: Record<string, unknown>) => ({
    title: typeof s.title === "string" ? s.title : "",
    channel: typeof s.channel === "string" ? s.channel : "",
    duration: typeof s.duration === "number" ? (s.duration as number) : 0,
    thumbnail: typeof s.thumbnail === "string" ? s.thumbnail : "",
    t: typeof s.t === "number" ? (s.t as number) : 0,
  }),
  head: () => ({ meta: [{ title: "Watching — ZenTube" }] }),
  component: WatchPage,
});

function WatchPage() {
  const { videoId } = Route.useParams();
  const search = Route.useSearch();
  const { user } = useAuth();
  const { mode, bumpWatched, videosWatchedThisSession, sessionStartedAt } = useSessionState();
  const navigate = useNavigate();

  const [ended, setEnded] = useState(false);
  const [showSessionPrompt, setShowSessionPrompt] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reaction, setReaction] = useState<"up" | "down" | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState(0);

  const playerRef = useRef<PlayerHandle | null>(null);
  const initialSeekRef = useRef(false);
  const watchSecondsRef = useRef(0); // current playback position
  const effectiveSecondsRef = useRef(0); // sum of actual played segments
  const seekCountRef = useRef(0);
  const segmentsRef = useRef<Array<[number, number]>>([]); // merged ranges

  const lastSyncedRef = useRef(0);
  const recordedFinalRef = useRef(false);
  const historyIdRef = useRef<string | null>(null);

  // Fetch full video metadata (channel subs, likes, view count)
  const { data: metaData } = useQuery({
    queryKey: ["video-meta", videoId],
    queryFn: () => getVideoMeta({ data: { videoId } }),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const meta = metaData?.meta;

  // Saved state
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("saved_videos")
      .select("id")
      .eq("user_id", user.id)
      .eq("video_id", videoId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setSaved(!!data);
      });
    return () => { cancelled = true; };
  }, [user, videoId]);

  // Session timer
  useEffect(() => {
    const id = window.setInterval(() => {
      setSessionMinutes(Math.floor((Date.now() - sessionStartedAt) / 60000));
    }, 30_000);
    setSessionMinutes(Math.floor((Date.now() - sessionStartedAt) / 60000));
    return () => window.clearInterval(id);
  }, [sessionStartedAt]);

  // Merge a played [start, end] segment into ranges, return new total effective seconds
  const mergeSegment = (start: number, end: number) => {
    if (end <= start) return;
    const segs = segmentsRef.current.slice();
    segs.push([start, end]);
    segs.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const [s, e] of segs) {
      if (merged.length && s <= merged[merged.length - 1][1]) {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
      } else {
        merged.push([s, e]);
      }
    }
    segmentsRef.current = merged;
    effectiveSecondsRef.current = Math.round(
      merged.reduce((acc, [s, e]) => acc + (e - s), 0),
    );
  };

  // Periodic sync to DB
  const syncHistory = useCallback(async () => {
    if (!user) return;
    const sec = Math.round(watchSecondsRef.current);
    const eff = effectiveSecondsRef.current;
    if (sec - lastSyncedRef.current < 15 && historyIdRef.current) return;
    lastSyncedRef.current = sec;

    if (!historyIdRef.current) {
      const { data, error } = await supabase
        .from("watch_history")
        .insert({
          user_id: user.id,
          video_id: videoId,
          title: meta?.title || search.title || null,
          channel: meta?.channel || search.channel || null,
          thumbnail: search.thumbnail || null,
          mode: mode ?? "find",
          watch_seconds: sec,
          effective_seconds: eff,
          seek_count: seekCountRef.current,
          duration_seconds: meta?.durationSeconds || search.duration || null,
        })
        .select("id")
        .single();
      if (!error && data) historyIdRef.current = data.id;
    } else {
      await supabase
        .from("watch_history")
        .update({
          watch_seconds: sec,
          effective_seconds: eff,
          seek_count: seekCountRef.current,
        })
        .eq("id", historyIdRef.current);
    }
  }, [user, videoId, mode, search.title, search.channel, search.thumbnail, search.duration, meta]);

  const handleProgress = useCallback(
    (s: number) => {
      if (s > watchSecondsRef.current) watchSecondsRef.current = s;
      void syncHistory();
    },
    [syncHistory],
  );

  const handleSegment = useCallback((start: number, end: number) => {
    mergeSegment(start, end);
  }, []);

  const handleSeek = useCallback(() => {
    seekCountRef.current += 1;
  }, []);

  // Final sync on unmount
  useEffect(() => {
    return () => {
      if (user && historyIdRef.current) {
        supabase
          .from("watch_history")
          .update({
            watch_seconds: Math.round(watchSecondsRef.current),
            effective_seconds: effectiveSecondsRef.current,
            seek_count: seekCountRef.current,
          })
          .eq("id", historyIdRef.current)
          .then(() => {});
      }
    };
  }, [user]);

  const handleEnded = async () => {
    setEnded(true);
    bumpWatched();
    if (!recordedFinalRef.current) {
      recordedFinalRef.current = true;
      await syncHistory();
    }
    if (videosWatchedThisSession + 1 >= 2) setShowSessionPrompt(true);
  };

  const toggleSave = async () => {
    if (!user) {
      toast.message("Sign in to save videos");
      navigate({ to: "/login", search: { redirect: window.location.pathname } });
      return;
    }
    if (saved) {
      await supabase.from("saved_videos").delete().eq("user_id", user.id).eq("video_id", videoId);
      setSaved(false);
      toast.success("Removed from library");
    } else {
      await supabase.from("saved_videos").insert({
        user_id: user.id,
        video_id: videoId,
        title: meta?.title || search.title,
        channel: meta?.channel || search.channel,
        thumbnail: search.thumbnail,
        duration_seconds: meta?.durationSeconds || search.duration,
      });
      setSaved(true);
      toast.success("Saved to library");
    }
  };

  const share = async () => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: meta?.title || search.title || "ZenTube", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {}
  };

  const title = meta?.title || search.title || "Untitled";
  const channelName = meta?.channel || search.channel || "";
  const subText = meta ? `${formatCount(meta.subscriberCount)} subscribers` : "";

  return (
    <div className="zen-container-wide py-6 sm:py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          to="/results"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to results
        </Link>

        {mode === "relax" && sessionMinutes >= 5 && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            You've been watching for {sessionMinutes} min
          </div>
        )}
      </div>

      <div className={"grid gap-6 " + (mode === "learn" ? "lg:grid-cols-[1fr_360px]" : "")}>
        <div className="min-w-0">
          <Player
            ref={playerRef}
            videoId={videoId}
            onProgress={handleProgress}
            onEnded={handleEnded}
            onSegmentPlayed={handleSegment}
            onSeek={handleSeek}
            onReady={() => {
              if (!initialSeekRef.current && search.t && search.t > 0) {
                initialSeekRef.current = true;
                playerRef.current?.seekTo(search.t);
              }
            }}
          />

          {/* Title */}
          <h1 className="mt-4 text-xl font-semibold leading-snug text-foreground sm:text-2xl">
            {title}
          </h1>

          {/* YouTube-style channel + actions row */}
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              {meta?.channelThumbnail ? (
                <img
                  src={meta.channelThumbnail}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-full bg-surface-2" />
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{channelName}</div>
                <div className="truncate text-xs text-muted-foreground">{subText}</div>
              </div>
              <button
                onClick={() => setSubscribed((s) => !s)}
                className={
                  "ml-3 shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors " +
                  (subscribed
                    ? "border border-border bg-surface text-muted-foreground"
                    : "bg-foreground text-background hover:opacity-90")
                }
              >
                {subscribed ? (
                  <span className="inline-flex items-center gap-1"><BellOff className="h-3 w-3" /> Subscribed</span>
                ) : (
                  <span className="inline-flex items-center gap-1"><Bell className="h-3 w-3" /> Subscribe</span>
                )}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Like / Dislike pill */}
              <div className="inline-flex overflow-hidden rounded-full border border-border bg-surface">
                <button
                  onClick={() => setReaction((r) => (r === "up" ? null : "up"))}
                  aria-pressed={reaction === "up"}
                  className={
                    "inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm transition-colors " +
                    (reaction === "up" ? "text-primary" : "text-foreground hover:bg-accent")
                  }
                >
                  <ThumbsUp className={"h-4 w-4 " + (reaction === "up" ? "fill-primary" : "")} />
                  {meta ? formatCount(meta.likeCount + (reaction === "up" ? 1 : 0)) : ""}
                </button>
                <div className="w-px self-stretch bg-border" />
                <button
                  onClick={() => setReaction((r) => (r === "down" ? null : "down"))}
                  aria-pressed={reaction === "down"}
                  className={
                    "inline-flex items-center px-3 py-1.5 text-sm transition-colors " +
                    (reaction === "down" ? "text-destructive" : "text-foreground hover:bg-accent")
                  }
                >
                  <ThumbsDown className={"h-4 w-4 " + (reaction === "down" ? "fill-destructive" : "")} />
                </button>
              </div>

              <button
                onClick={share}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm hover:bg-accent"
              >
                <Share2 className="h-4 w-4" /> Share
              </button>
              <button
                onClick={toggleSave}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3.5 py-1.5 text-sm hover:bg-accent"
              >
                {saved ? (
                  <BookmarkCheck className="h-4 w-4 text-primary" />
                ) : (
                  <BookmarkPlus className="h-4 w-4" />
                )}
                {saved ? "Saved" : "Save"}
              </button>
            </div>
          </div>

          {/* Stats line */}
          <div className="mt-3 rounded-lg border border-border bg-surface/60 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
              {meta && <span className="font-medium text-foreground">{formatCount(meta.viewCount)} views</span>}
              {meta?.publishedAt && <span>· {new Date(meta.publishedAt).toLocaleDateString()}</span>}
              {meta?.durationSeconds ? <span>· {formatDuration(meta.durationSeconds)}</span> : null}
            </div>
            {meta?.description && (
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                {meta.description}
              </p>
            )}
          </div>

          {ended && <EndScreen />}
        </div>

        {mode === "learn" && (
          <NotesPanel
            videoId={videoId}
            videoTitle={title}
            getCurrentSeconds={() => watchSecondsRef.current}
            onJumpTo={(s) => playerRef.current?.seekTo(s)}
          />
        )}
      </div>

      {showSessionPrompt && (
        <SessionPrompt
          onContinue={() => setShowSessionPrompt(false)}
          onExit={() => navigate({ to: "/" })}
        />
      )}
    </div>
  );
}

function EndScreen() {
  const navigate = useNavigate();
  return (
    <div className="zen-card mt-6 p-6 sm:p-8 text-center">
      <h2 className="text-xl font-semibold tracking-tight">You're done.</h2>
      <p className="mt-1 text-sm text-muted-foreground">No autoplay. What's next?</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => navigate({ to: "/results" })}
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Watch another
        </button>
        <button
          onClick={() => navigate({ to: "/" })}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Exit calmly
        </button>
      </div>
    </div>
  );
}
