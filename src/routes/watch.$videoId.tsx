import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSessionState } from "@/contexts/SessionStateContext";
import { formatDuration, formatCount, inferIntentFromVideo, resolveFinalIntent, MODES, type Mode } from "@/lib/intent";
import { Player, type PlayerHandle } from "@/components/Player";
import { NotesPanel } from "@/components/NotesPanel";
import { SessionPrompt } from "@/components/SessionPrompt";
import { getVideoMeta } from "@/server/youtube.functions";
import { toast } from "sonner";
import {
  ArrowLeft, BookmarkPlus, BookmarkCheck, Share2, ThumbsUp, ThumbsDown,
  Clock, Sparkles, Brain, Coffee, Search as SearchIcon,
} from "lucide-react";

export const Route = createFileRoute("/watch/$videoId")({
  validateSearch: (s: Record<string, unknown>) => ({
    title: typeof s.title === "string" ? s.title : "",
    channel: typeof s.channel === "string" ? s.channel : "",
    duration: typeof s.duration === "number" ? (s.duration as number) : 0,
    thumbnail: typeof s.thumbnail === "string" ? s.thumbnail : "",
    t: typeof s.t === "number" ? (s.t as number) : 0,
    intent: typeof s.intent === "string" ? (s.intent as string) : "",
  }),
  head: () => ({ meta: [{ title: "Watching — ZenTube" }] }),
  component: WatchPage,
});

function WatchPage() {
  const { videoId } = Route.useParams();
  const search = Route.useSearch();
  const { user } = useAuth();
  const { mode: sessionMode, bumpWatched, videosWatchedThisSession, sessionStartedAt } = useSessionState();
  const navigate = useNavigate();

  const [ended, setEnded] = useState(false);
  const [showSessionPrompt, setShowSessionPrompt] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState<"helpful" | "not_useful" | null>(null);
  const [sessionMinutes, setSessionMinutes] = useState(0);

  // Intent: explicit override (from URL or user-set), inferred (from meta), session fallback.
  const [override, setOverride] = useState<Mode | null>(
    (search.intent as Mode) || null,
  );

  const playerRef = useRef<PlayerHandle | null>(null);
  const initialSeekRef = useRef(false);
  const watchSecondsRef = useRef(0);
  const effectiveSecondsRef = useRef(0);
  const seekCountRef = useRef(0);
  const segmentsRef = useRef<Array<[number, number]>>([]);

  const lastSyncedRef = useRef(0);
  const recordedFinalRef = useRef(false);
  const historyIdRef = useRef<string | null>(null);

  const { data: metaData } = useQuery({
    queryKey: ["video-meta", videoId],
    queryFn: () => getVideoMeta({ data: { videoId } }),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const meta = metaData?.meta;

  // Inferred + final intent (content-tied)
  const inferred = inferIntentFromVideo({
    title: meta?.title || search.title,
    channel: meta?.channel || search.channel,
    durationSeconds: meta?.durationSeconds || search.duration,
    category: meta?.categoryId,
  });
  const finalIntent: Mode = resolveFinalIntent(override, inferred, sessionMode);

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

  // Existing feedback
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("video_feedback")
      .select("feedback")
      .eq("user_id", user.id)
      .eq("video_id", videoId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data) setFeedback(data.feedback as "helpful" | "not_useful");
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

  const syncHistory = useCallback(async () => {
    if (!user) return;
    const sec = Math.round(watchSecondsRef.current);
    const eff = effectiveSecondsRef.current;
    if (sec - lastSyncedRef.current < 15 && historyIdRef.current) return;
    lastSyncedRef.current = sec;

    if (!historyIdRef.current) {
      // Upsert on (user_id, video_id) so re-watches update the same row instead of creating duplicates
      const { data, error } = await supabase
        .from("watch_history")
        .upsert(
          {
            user_id: user.id,
            video_id: videoId,
            title: meta?.title || search.title || null,
            channel: meta?.channel || search.channel || null,
            thumbnail: search.thumbnail || null,
            mode: sessionMode ?? finalIntent,
            final_intent: finalIntent,
            inferred_intent: inferred,
            watch_seconds: sec,
            effective_seconds: eff,
            seek_count: seekCountRef.current,
            duration_seconds: meta?.durationSeconds || search.duration || null,
            watched_at: new Date().toISOString(),
          },
          { onConflict: "user_id,video_id" },
        )
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
          final_intent: finalIntent,
          watched_at: new Date().toISOString(),
        })
        .eq("id", historyIdRef.current);
    }
  }, [user, videoId, sessionMode, finalIntent, inferred, search.title, search.channel, search.thumbnail, search.duration, meta]);

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

  const sendFeedback = async (kind: "helpful" | "not_useful") => {
    if (!user) {
      toast.message("Sign in to give feedback");
      return;
    }
    const next = feedback === kind ? null : kind;
    setFeedback(next);
    if (next === null) {
      await supabase.from("video_feedback").delete().eq("user_id", user.id).eq("video_id", videoId);
    } else {
      await supabase.from("video_feedback").upsert(
        { user_id: user.id, video_id: videoId, feedback: next },
        { onConflict: "user_id,video_id" },
      );
    }
  };

  const setIntentOverride = async (m: Mode) => {
    setOverride(m);
    if (user && historyIdRef.current) {
      await supabase
        .from("watch_history")
        .update({ final_intent: m })
        .eq("id", historyIdRef.current);
    }
    toast.success(`Marked as ${MODES[m].label}`);
  };

  const title = meta?.title || search.title || "Untitled";
  const channelName = meta?.channel || search.channel || "";
  const isLearning = finalIntent === "learn";
  const isRelax = finalIntent === "relax";
  const isFind = finalIntent === "find";
  const isExplore = finalIntent === "explore";

  return (
    <div className="zen-container-wide py-6 sm:py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link
          to="/results"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to results
        </Link>

        {isRelax && sessionMinutes >= 5 && (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            You've been watching for {sessionMinutes} min
          </div>
        )}
      </div>

      <div className={"grid gap-6 " + (isLearning ? "lg:grid-cols-[1fr_360px]" : "")}>
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

          {/* Channel + minimal meta line */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
            <span className="text-foreground/90">{channelName}</span>
            {meta?.publishedAt && <span>· {new Date(meta.publishedAt).toLocaleDateString()}</span>}
            {meta?.viewCount ? <span>· {formatCount(meta.viewCount)} views</span> : null}
            {(meta?.durationSeconds || search.duration) ? (
              <span>· {formatDuration(meta?.durationSeconds || search.duration)}</span>
            ) : null}
          </div>

          {/* Intent badge + override */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-2.5 py-1 text-xs text-muted-foreground">
              {isLearning ? <Brain className="h-3 w-3 text-primary" /> :
                isRelax ? <Coffee className="h-3 w-3 text-primary" /> :
                isFind ? <SearchIcon className="h-3 w-3 text-primary" /> :
                <Sparkles className="h-3 w-3 text-primary" />}
              This looks like: <span className="text-foreground">{MODES[finalIntent].label}</span>
            </span>
            <details className="group relative">
              <summary className="cursor-pointer list-none rounded-full border border-border bg-surface/60 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
                Change
              </summary>
              <div className="absolute left-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg">
                {(Object.keys(MODES) as Mode[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setIntentOverride(m)}
                    className={"flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent " +
                      (m === finalIntent ? "text-primary" : "text-foreground")}
                  >
                    <span aria-hidden>{MODES[m].emoji}</span> {MODES[m].label}
                  </button>
                ))}
              </div>
            </details>
            {isFind && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-primary">Best match</span>}
            {isExplore && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-muted-foreground">Part of curated set</span>}
          </div>

          {/* MINIMAL ACTION BAR — Save · Share · Helpful · Not useful */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ActionButton
              onClick={toggleSave}
              active={saved}
              icon={saved ? <BookmarkCheck className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
              label={saved ? "Saved" : "Save"}
            />
            <ActionButton
              onClick={share}
              icon={<Share2 className="h-4 w-4" />}
              label="Share"
            />
            <div className="mx-1 h-5 w-px bg-border" aria-hidden />
            <ActionButton
              onClick={() => sendFeedback("helpful")}
              active={feedback === "helpful"}
              icon={<ThumbsUp className={"h-4 w-4 " + (feedback === "helpful" ? "fill-primary" : "")} />}
              label="Helpful"
              tone="primary"
            />
            <ActionButton
              onClick={() => sendFeedback("not_useful")}
              active={feedback === "not_useful"}
              icon={<ThumbsDown className={"h-4 w-4 " + (feedback === "not_useful" ? "fill-muted-foreground" : "")} />}
              label="Not useful"
              tone="muted"
            />
          </div>

          {/* Description — only when something to show, very subtle */}
          {meta?.description && (
            <p className="mt-4 line-clamp-3 whitespace-pre-wrap rounded-md bg-surface/40 p-3 text-xs text-muted-foreground">
              {meta.description}
            </p>
          )}

          {ended && <EndScreen />}
        </div>

        {isLearning && (
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

function ActionButton({
  onClick, icon, label, active, tone,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  tone?: "primary" | "muted";
}) {
  const activeCls =
    active && tone === "primary" ? "border-primary/50 bg-primary/10 text-primary" :
    active && tone === "muted" ? "border-border bg-accent text-foreground" :
    active ? "border-primary/50 bg-primary/10 text-primary" :
    "border-border bg-surface text-foreground hover:bg-accent";
  return (
    <button
      onClick={onClick}
      className={"inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors " + activeCls}
    >
      {icon}
      <span>{label}</span>
    </button>
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
