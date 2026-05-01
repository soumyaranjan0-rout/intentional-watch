import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { getPlaylistItems, getVideoMeta } from "@/server/youtube.functions";
import { Player, type PlayerHandle } from "@/components/Player";
import { NotesPanel } from "@/components/NotesPanel";
import { SaveToLibraryModal } from "@/components/SaveToLibraryModal";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDuration, formatCount, inferIntentFromVideo, MODES, type Mode } from "@/lib/intent";
import { setLastWatched } from "@/lib/lastWatched";
import { toast } from "sonner";
import {
  ArrowLeft, ListVideo, Play, Loader2, BookmarkPlus, BookmarkCheck,
  Share2, ThumbsUp, ThumbsDown, Brain, Coffee, Search as SearchIcon, Sparkles,
  Heart, Clock, ListPlus,
} from "lucide-react";
import { addToSystemPlaylist, isInSystemPlaylist, removeFromSystemPlaylist } from "@/lib/systemPlaylists";

const PlaylistSearch = z.object({
  index: z.coerce.number().int().min(0).default(0),
});

export const Route = createFileRoute("/playlist/$playlistId")({
  head: () => ({ meta: [{ title: "Playlist — ZenTube" }] }),
  validateSearch: (s) => PlaylistSearch.parse(s),
  component: PlaylistPage,
  errorComponent: PlaylistErrorComponent,
});

function PlaylistErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="zen-container py-16 text-center">
      <h2 className="text-xl font-semibold">This playlist couldn't be opened</h2>
      <p className="mt-2 text-sm text-muted-foreground">{error.message || "Unexpected error"}</p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-accent"
        >
          Try again
        </button>
        <Link to="/" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          Back home
        </Link>
      </div>
    </div>
  );
}

function PlaylistPage() {
  const { playlistId } = Route.useParams();
  const { index } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [active, setActive] = useState(index);

  useEffect(() => setActive(index), [index]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["playlist-page", playlistId],
    queryFn: () => getPlaylistItems({ data: { playlistId } }),
    staleTime: 10 * 60 * 1000,
    retry: 1,
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
        <p className="text-muted-foreground">
          {error ? "Something went wrong loading this playlist." : "This playlist is empty or unavailable."}
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <button onClick={() => refetch()} className="rounded-full border border-border bg-surface px-4 py-2 text-sm hover:bg-accent">
            Try again
          </button>
          <Link to="/" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Back home
          </Link>
        </div>
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
    <PlaylistViewer
      key={current.videoId}
      videoId={current.videoId}
      fallbackTitle={current.title}
      fallbackChannel={current.channel}
      fallbackDuration={current.durationSeconds}
      fallbackThumbnail={current.thumbnail}
      items={items}
      active={active}
      playAt={playAt}
      user={user}
    />
  );
}

type Item = { videoId: string; title: string; channel: string; thumbnail: string; durationSeconds: number; position: number };

function PlaylistViewer({
  videoId, fallbackTitle, fallbackChannel, fallbackDuration, fallbackThumbnail,
  items, active, playAt, user,
}: {
  videoId: string;
  fallbackTitle: string;
  fallbackChannel: string;
  fallbackDuration: number;
  fallbackThumbnail: string;
  items: Item[];
  active: number;
  playAt: (i: number) => void;
  user: ReturnType<typeof useAuth>["user"];
}) {
  const playerRef = useRef<PlayerHandle | null>(null);
  const watchSecondsRef = useRef(0);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState<"helpful" | "not_useful" | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [liked, setLiked] = useState(false);
  const [watchLater, setWatchLater] = useState(false);
  const [intentOverride, setIntentOverride] = useState<Mode | null>(null);

  const { data: metaData } = useQuery({
    queryKey: ["video-meta", videoId],
    queryFn: () => getVideoMeta({ data: { videoId } }),
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const meta = metaData?.meta;

  const inferred = inferIntentFromVideo({
    title: meta?.title || fallbackTitle,
    channel: meta?.channel || fallbackChannel,
    durationSeconds: meta?.durationSeconds || fallbackDuration,
    category: meta?.categoryId,
  });
  const finalIntent: Mode = intentOverride ?? inferred ?? "explore";
  const isLearning = finalIntent === "learn";
  const isRelax = finalIntent === "relax";
  const isFind = finalIntent === "find";

  // Saved state
  useEffect(() => {
    if (!user) { setSaved(false); return; }
    let cancelled = false;
    supabase.from("saved_videos").select("id").eq("user_id", user.id).eq("video_id", videoId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setSaved(!!data); });
    return () => { cancelled = true; };
  }, [user, videoId]);

  // Like / Watch Later state
  useEffect(() => {
    if (!user) { setLiked(false); setWatchLater(false); return; }
    let cancelled = false;
    Promise.all([
      isInSystemPlaylist(user.id, "liked", videoId),
      isInSystemPlaylist(user.id, "watch_later", videoId),
    ]).then(([l, w]) => { if (!cancelled) { setLiked(l); setWatchLater(w); } }).catch(() => {});
    return () => { cancelled = true; };
  }, [user, videoId]);

  // Persist last-watched
  useEffect(() => {
    setLastWatched({
      videoId,
      title: meta?.title || fallbackTitle,
      channel: meta?.channel || fallbackChannel,
      thumbnail: fallbackThumbnail,
      t: 0,
      duration: meta?.durationSeconds || fallbackDuration,
      updatedAt: Date.now(),
    });
  }, [videoId, meta, fallbackTitle, fallbackChannel, fallbackThumbnail, fallbackDuration]);

  const handleProgress = useCallback((s: number) => {
    if (s > watchSecondsRef.current) watchSecondsRef.current = s;
  }, []);

  const toggleSave = async () => {
    if (!user) { toast.message("Sign in to save videos"); return; }
    if (saved) {
      await supabase.from("saved_videos").delete().eq("user_id", user.id).eq("video_id", videoId);
      setSaved(false);
      toast.success("Removed from library");
    } else {
      await supabase.from("saved_videos").insert({
        user_id: user.id, video_id: videoId,
        title: meta?.title || fallbackTitle, channel: meta?.channel || fallbackChannel,
        thumbnail: fallbackThumbnail, duration_seconds: meta?.durationSeconds || fallbackDuration,
      });
      setSaved(true);
      toast.success("Saved to library");
    }
  };

  const share = async () => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      if (navigator.share) await navigator.share({ title: meta?.title || fallbackTitle, url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
    } catch {}
  };

  const sendFeedback = async (kind: "helpful" | "not_useful") => {
    if (!user) { toast.message("Sign in to give feedback"); return; }
    const next = feedback === kind ? null : kind;
    setFeedback(next);
    if (!next) await supabase.from("video_feedback").delete().eq("user_id", user.id).eq("video_id", videoId);
    else await supabase.from("video_feedback").upsert({ user_id: user.id, video_id: videoId, feedback: next }, { onConflict: "user_id,video_id" });
  };

  const target = () => ({
    videoId,
    title: meta?.title || fallbackTitle || "Untitled",
    channel: meta?.channel || fallbackChannel || "",
    thumbnail: fallbackThumbnail,
    durationSeconds: meta?.durationSeconds || fallbackDuration || 0,
  });
  const toggleLike = async () => {
    if (!user) { toast.message("Sign in to like videos"); return; }
    if (liked) { await removeFromSystemPlaylist(user.id, "liked", videoId); setLiked(false); toast.success("Removed from Liked Videos"); }
    else { await addToSystemPlaylist(user.id, "liked", target()); setLiked(true); toast.success("Added to Liked Videos"); }
  };
  const toggleWatchLater = async () => {
    if (!user) { toast.message("Sign in to use Watch Later"); return; }
    if (watchLater) { await removeFromSystemPlaylist(user.id, "watch_later", videoId); setWatchLater(false); toast.success("Removed from Watch Later"); }
    else { await addToSystemPlaylist(user.id, "watch_later", target()); setWatchLater(true); toast.success("Added to Watch Later"); }
  };

  const title = meta?.title || fallbackTitle || "Untitled";
  const channelName = meta?.channel || fallbackChannel || "";

  return (
    <div className="zen-container-wide py-6 sm:py-8">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className={"mt-4 grid gap-6 " + (isLearning ? "lg:grid-cols-[1fr_360px]" : "")}>
        {/* LEFT: Player → metadata → playlist queue */}
        <div className="min-w-0">
          <Player
            ref={playerRef}
            videoId={videoId}
            onProgress={handleProgress}
            onEnded={() => active < items.length - 1 && playAt(active + 1)}
          />

          <h1 className="mt-4 text-xl font-semibold leading-snug text-foreground sm:text-2xl">{title}</h1>

          {/* Metadata row: views · date · duration (YouTube-style) */}
          {(meta?.viewCount || meta?.publishedAt || meta?.durationSeconds || fallbackDuration) ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              {meta?.viewCount ? <span>{formatCount(meta.viewCount)} views</span> : null}
              {meta?.publishedAt ? (<><span aria-hidden>·</span><span>{new Date(meta.publishedAt).toLocaleDateString()}</span></>) : null}
              {(meta?.durationSeconds || fallbackDuration) ? (<><span aria-hidden>·</span><span>{formatDuration(meta?.durationSeconds || fallbackDuration)}</span></>) : null}
            </div>
          ) : null}

          {/* Channel row */}
          <div className="mt-3 flex items-center gap-3">
            {meta?.channelThumbnail ? (
              <img src={meta.channelThumbnail} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" loading="lazy" />
            ) : <div className="h-10 w-10 shrink-0 rounded-full bg-muted" />}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground sm:text-base">{channelName}</div>
              {meta?.subscriberCount ? <div className="text-xs text-muted-foreground">{formatCount(meta.subscriberCount)} subscribers</div> : null}
            </div>
          </div>

          {/* Intent badge with change menu */}
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
                    onClick={() => { setIntentOverride(m); toast.success(`Marked as ${MODES[m].label}`); }}
                    className={"flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent " +
                      (m === finalIntent ? "text-primary" : "text-foreground")}
                  >
                    <span aria-hidden>{MODES[m].emoji}</span> {MODES[m].label}
                  </button>
                ))}
              </div>
            </details>
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
              <ListVideo className="h-3 w-3" /> Playlist · {active + 1}/{items.length}
            </span>
          </div>

          {/* Action bar — Like · Save (modal) · Share · Not useful */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ActionButton onClick={toggleLike} active={liked}
              icon={<ThumbsUp className={"h-4 w-4 " + (liked ? "fill-primary text-primary" : "")} />}
              label={liked ? "Liked" : "Like"} />
            <ActionButton
              onClick={() => {
                if (!user) { toast.message("Sign in to save videos"); return; }
                setSaveOpen(true);
              }}
              active={saved || watchLater}
              icon={(saved || watchLater) ? <BookmarkCheck className="h-4 w-4" /> : <BookmarkPlus className="h-4 w-4" />}
              label={(saved || watchLater) ? "Saved" : "Save"} />
            <ActionButton onClick={share} icon={<Share2 className="h-4 w-4" />} label="Share" />
            <div className="mx-1 h-5 w-px bg-border" aria-hidden />
            <ActionButton onClick={() => sendFeedback("not_useful")} active={feedback === "not_useful"}
              icon={<ThumbsDown className="h-4 w-4" />} label="Not useful" />
          </div>

          {/* Playlist queue BELOW metadata */}
          <div className="zen-card mt-6 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <ListVideo className="h-4 w-4 text-primary" />
              <div className="flex-1">
                <div className="text-sm font-medium">Up next in playlist</div>
                <div className="text-xs text-muted-foreground">{active + 1} / {items.length}</div>
              </div>
            </div>
            <ol className="max-h-[60vh] divide-y divide-border overflow-y-auto">
              {items.map((it, i) => {
                const isActive = i === active;
                return (
                  <li key={it.videoId}>
                    <button
                      onClick={() => playAt(i)}
                      className={"flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors " +
                        (isActive ? "bg-primary/10" : "hover:bg-accent/40")}
                    >
                      <div className="w-6 shrink-0 pt-1.5 text-center text-xs tabular-nums text-muted-foreground">
                        {isActive ? <Play className="mx-auto h-3.5 w-3.5 text-primary" /> : i + 1}
                      </div>
                      <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded bg-muted">
                        {it.thumbnail && <img src={it.thumbnail} alt="" className="h-full w-full object-cover" loading="lazy" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={"line-clamp-2 text-sm " + (isActive ? "text-foreground font-medium" : "text-foreground/90")}>
                          {it.title}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {it.channel}{it.durationSeconds ? ` · ${formatDuration(it.durationSeconds)}` : ""}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* RIGHT: Notes panel only for learn intent */}
        {isLearning && (
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <NotesPanel
              videoId={videoId}
              videoTitle={title}
              getCurrentSeconds={() => watchSecondsRef.current}
              onJumpTo={(s) => playerRef.current?.seekTo(s)}
            />
          </aside>
        )}
      </div>

      {saveOpen && (
        <SaveToLibraryModal
          target={{
            videoId, title, channel: channelName,
            thumbnail: fallbackThumbnail,
            durationSeconds: meta?.durationSeconds || fallbackDuration,
          }}
          onClose={() => setSaveOpen(false)}
        />
      )}
    </div>
  );
}

function ActionButton({
  onClick, icon, label, active,
}: { onClick: () => void; icon: React.ReactNode; label: string; active?: boolean }) {
  const cls = active
    ? "border-primary/50 bg-primary/10 text-primary"
    : "border-border bg-surface text-foreground hover:bg-accent";
  return (
    <button onClick={onClick}
      className={"inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors " + cls}>
      {icon}<span>{label}</span>
    </button>
  );
}
