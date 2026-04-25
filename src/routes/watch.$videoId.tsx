import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSessionState } from "@/contexts/SessionStateContext";
import { formatDuration } from "@/lib/intent";
import { Player } from "@/components/Player";
import { NotesPanel } from "@/components/NotesPanel";
import { SessionPrompt } from "@/components/SessionPrompt";
import { toast } from "sonner";
import { ArrowLeft, BookmarkPlus, BookmarkCheck, Share2, ThumbsUp, ThumbsDown, Clock } from "lucide-react";

export const Route = createFileRoute("/watch/$videoId")({
  validateSearch: (s) => ({
    title: typeof s.title === "string" ? s.title : "",
    channel: typeof s.channel === "string" ? s.channel : "",
    duration: typeof s.duration === "number" ? (s.duration as number) : 0,
    thumbnail: typeof s.thumbnail === "string" ? s.thumbnail : "",
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
  const [showControlsTip, setShowControlsTip] = useState(false);
  const [reaction, setReaction] = useState<"up" | "down" | null>(null);
  const [sessionMinutes, setSessionMinutes] = useState(0);

  const watchSecondsRef = useRef(0);
  const lastSyncedRef = useRef(0);
  const recordedFinalRef = useRef(false);
  const historyIdRef = useRef<string | null>(null);

  // Check if saved
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

  // Session timer (for entertainment mode awareness)
  useEffect(() => {
    const id = window.setInterval(() => {
      setSessionMinutes(Math.floor((Date.now() - sessionStartedAt) / 60000));
    }, 30_000);
    setSessionMinutes(Math.floor((Date.now() - sessionStartedAt) / 60000));
    return () => window.clearInterval(id);
  }, [sessionStartedAt]);

  // Periodic sync of watch_history every 15s of watch time —
  // ensures partial views are tracked even if user leaves early.
  const syncHistory = useCallback(async () => {
    if (!user) return;
    const sec = Math.round(watchSecondsRef.current);
    if (sec - lastSyncedRef.current < 15) return;
    lastSyncedRef.current = sec;

    if (!historyIdRef.current) {
      const { data, error } = await supabase
        .from("watch_history")
        .insert({
          user_id: user.id,
          video_id: videoId,
          title: search.title || null,
          channel: search.channel || null,
          thumbnail: search.thumbnail || null,
          mode: mode ?? "find",
          watch_seconds: sec,
        })
        .select("id")
        .single();
      if (!error && data) historyIdRef.current = data.id;
    } else {
      await supabase
        .from("watch_history")
        .update({ watch_seconds: sec })
        .eq("id", historyIdRef.current);
    }
  }, [user, videoId, mode, search.title, search.channel, search.thumbnail]);

  const handleProgress = useCallback(
    (s: number) => {
      if (s > watchSecondsRef.current) watchSecondsRef.current = s;
      // Throttle DB writes via syncHistory (it has its own 15s gate)
      void syncHistory();
    },
    [syncHistory],
  );

  // Final sync on unmount
  useEffect(() => {
    return () => {
      // best-effort final write
      if (user && historyIdRef.current) {
        const sec = Math.round(watchSecondsRef.current);
        supabase
          .from("watch_history")
          .update({ watch_seconds: sec })
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
    if (videosWatchedThisSession + 1 >= 2) {
      setShowSessionPrompt(true);
    }
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
        title: search.title,
        channel: search.channel,
        thumbnail: search.thumbnail,
        duration_seconds: search.duration,
      });
      setSaved(true);
      toast.success("Saved to library");
    }
  };

  const share = async () => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: search.title || "ZenTube", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {}
  };

  return (
    <div className="zen-container-wide py-6 sm:py-10">
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
            videoId={videoId}
            onProgress={handleProgress}
            onEnded={handleEnded}
            onTipShown={() => setShowControlsTip(true)}
          />
          <h1 className="mt-4 text-xl font-semibold leading-snug text-foreground sm:text-2xl">
            {search.title || "Untitled"}
          </h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {search.channel}
            {search.duration ? ` · ${formatDuration(search.duration)}` : ""}
          </div>
          {showControlsTip && (
            <p className="mt-3 text-xs text-muted-foreground">
              Tip: tap the player to toggle controls · spacebar to play/pause
            </p>
          )}

          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={toggleSave}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-accent"
            >
              {saved ? (
                <BookmarkCheck className="h-4 w-4 text-primary" />
              ) : (
                <BookmarkPlus className="h-4 w-4" />
              )}
              {saved ? "Saved" : "Save"}
            </button>
            <button
              onClick={share}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-accent"
            >
              <Share2 className="h-4 w-4" /> Share
            </button>
            <button
              onClick={() => setReaction((r) => (r === "up" ? null : "up"))}
              aria-pressed={reaction === "up"}
              className={
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent " +
                (reaction === "up"
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border bg-surface")
              }
            >
              <ThumbsUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => setReaction((r) => (r === "down" ? null : "down"))}
              aria-pressed={reaction === "down"}
              className={
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent " +
                (reaction === "down"
                  ? "border-destructive/50 bg-destructive/10 text-foreground"
                  : "border-border bg-surface")
              }
            >
              <ThumbsDown className="h-4 w-4" />
            </button>
          </div>

          {ended && <EndScreen />}
        </div>

        {mode === "learn" && (
          <NotesPanel
            videoId={videoId}
            videoTitle={search.title}
            getCurrentSeconds={() => watchSecondsRef.current}
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
