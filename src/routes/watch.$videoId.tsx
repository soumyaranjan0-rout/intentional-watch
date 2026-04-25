import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSessionState } from "@/contexts/SessionStateContext";
import { formatDuration } from "@/lib/intent";
import { Player } from "@/components/Player";
import { NotesPanel } from "@/components/NotesPanel";
import { SessionPrompt } from "@/components/SessionPrompt";
import { toast } from "sonner";
import { ArrowLeft, BookmarkPlus, BookmarkCheck } from "lucide-react";

export const Route = createFileRoute("/watch/$videoId")({
  validateSearch: (s) => ({
    title: typeof s.title === "string" ? s.title : "",
    channel: typeof s.channel === "string" ? s.channel : "",
    duration: typeof s.duration === "number" ? (s.duration as number) : 0,
    thumbnail: typeof s.thumbnail === "string" ? s.thumbnail : "",
  }),
  beforeLoad: () => {
    // public; record happens after sign-in
  },
  head: () => ({ meta: [{ title: "Watching — ZenTube" }] }),
  component: WatchPage,
});

function WatchPage() {
  const { videoId } = Route.useParams();
  const search = Route.useSearch();
  const { user } = useAuth();
  const { mode, bumpWatched, videosWatchedThisSession } = useSessionState();
  const navigate = useNavigate();

  const [ended, setEnded] = useState(false);
  const [showSessionPrompt, setShowSessionPrompt] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showControlsTip, setShowControlsTip] = useState(false);
  const watchSecondsRef = useRef(0);
  const recordedRef = useRef(false);

  // Check if saved
  useEffect(() => {
    if (!user) return;
    supabase
      .from("saved_videos")
      .select("id")
      .eq("user_id", user.id)
      .eq("video_id", videoId)
      .maybeSingle()
      .then(({ data }) => setSaved(!!data));
  }, [user, videoId]);

  const handleProgress = (s: number) => {
    if (s > watchSecondsRef.current) watchSecondsRef.current = s;
  };

  const handleEnded = async () => {
    setEnded(true);
    bumpWatched();
    if (user && !recordedRef.current) {
      recordedRef.current = true;
      await supabase.from("watch_history").insert({
        user_id: user.id,
        video_id: videoId,
        title: search.title,
        channel: search.channel,
        thumbnail: search.thumbnail,
        mode: mode ?? "find",
        watch_seconds: Math.round(watchSecondsRef.current),
      });
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

  return (
    <div className="zen-container-wide py-6 sm:py-10">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/results" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to results
        </Link>
        <button
          onClick={toggleSave}
          className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:bg-accent"
        >
          {saved ? <BookmarkCheck className="h-4 w-4 text-primary" /> : <BookmarkPlus className="h-4 w-4" />}
          {saved ? "Saved" : "Save"}
        </button>
      </div>

      <div className={"grid gap-6 " + (mode === "learn" ? "lg:grid-cols-[1fr_360px]" : "")}>
        <div>
          <Player
            videoId={videoId}
            onProgress={handleProgress}
            onEnded={handleEnded}
            onTipShown={() => setShowControlsTip(true)}
          />
          <h1 className="mt-4 text-xl font-semibold leading-snug text-foreground sm:text-2xl">{search.title || "Untitled"}</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            {search.channel}{search.duration ? ` · ${formatDuration(search.duration)}` : ""}
          </div>
          {showControlsTip && (
            <p className="mt-3 text-xs text-muted-foreground">Tip: tap to toggle controls · spacebar to play/pause</p>
          )}

          {ended && <EndScreen />}
        </div>

        {mode === "learn" && (
          <NotesPanel videoId={videoId} videoTitle={search.title} getCurrentSeconds={() => watchSecondsRef.current} />
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
