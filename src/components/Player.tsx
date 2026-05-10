import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string;
          playerVars?: Record<string, unknown>;
          events?: Record<string, (e: { data?: number; target?: YTPlayer }) => void>;
        },
      ) => YTPlayer;
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allow: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
  getPlayerState: () => number;
  getIframe: () => HTMLIFrameElement;
};

let ytApiPromise: Promise<void> | null = null;
function loadYTApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<void>((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => resolve();
  });
  return ytApiPromise;
}

export type PlayerHandle = {
  seekTo: (sec: number) => void;
  getCurrentTime: () => number;
};

type Props = {
  videoId: string;
  /** Unused (kept for API compat). Native UI shows the title itself. */
  chapterLabel?: string;
  onProgress?: (seconds: number) => void;
  onEnded?: () => void;
  onSegmentPlayed?: (start: number, end: number) => void;
  onSeek?: () => void;
  onReady?: () => void;
};

/**
 * Native YouTube player with original controls (settings, CC, quality, fullscreen, etc.).
 * Two thin overlays mask only:
 *   - the YouTube logo in the bottom-right corner
 *   - the "playlist / watch later" buttons at top-right that appear on hover
 * Everything else (play/pause bar, settings cog, CC, time, title) is the real
 * YouTube UI so behavior is identical to youtube.com.
 */
export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { videoId, onProgress, onEnded, onSegmentPlayed, onSeek, onReady },
  ref,
) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const segmentStartRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const playingRef = useRef(false);

  const [unavailable, setUnavailable] = useState(false);
  const [ready, setReady] = useState(false);
  const [ended, setEnded] = useState(false);

  useImperativeHandle(ref, () => ({
    seekTo: (sec: number) => {
      if (!playerRef.current) return;
      flushSegment();
      playerRef.current.seekTo(sec, true);
      lastTimeRef.current = sec;
      onSeek?.();
      try { playerRef.current.playVideo(); } catch {}
    },
    getCurrentTime: () => {
      try { return playerRef.current?.getCurrentTime() ?? 0; } catch { return 0; }
    },
  }));

  const flushSegment = useCallback(() => {
    if (segmentStartRef.current != null && playerRef.current) {
      try {
        const end = playerRef.current.getCurrentTime();
        const start = segmentStartRef.current;
        if (end > start + 0.5) onSegmentPlayed?.(start, end);
      } catch {}
      segmentStartRef.current = null;
    }
  }, [onSegmentPlayed]);

  useEffect(() => {
    let destroyed = false;
    setReady(false);
    setUnavailable(false);
    segmentStartRef.current = null;
    playingRef.current = false;

    loadYTApi().then(() => {
      if (destroyed || !mountRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(mountRef.current, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,        // ✅ native controls (settings, CC, fullscreen, etc.)
          modestbranding: 1,  // hides large logo on the control bar
          rel: 0,             // no related videos from other channels at end
          iv_load_policy: 3,  // hide annotations
          playsinline: 1,
          fs: 1,              // allow native fullscreen button
          cc_load_policy: 0,
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
        },
        events: {
          onReady: (e) => {
            setReady(true);
            try { (e.target as YTPlayer).getDuration(); } catch {}
            onReady?.();
          },
          onStateChange: (e) => {
            const st = e.data;
            const p = playerRef.current;
            if (!p || !window.YT) return;
            if (st === window.YT.PlayerState.PLAYING) {
              playingRef.current = true;
              setEnded(false);
              if (segmentStartRef.current == null) {
                try { segmentStartRef.current = p.getCurrentTime(); } catch {}
              }
            } else if (st === window.YT.PlayerState.PAUSED) {
              playingRef.current = false;
              flushSegment();
            } else if (st === window.YT.PlayerState.ENDED) {
              playingRef.current = false;
              flushSegment();
              setEnded(true);
              onEnded?.();
            }
          },
          onError: (e) => {
            const code = e.data;
            if (code === 101 || code === 150 || code === 100 || code === 5 || code === 2) {
              setUnavailable(true);
              setReady(true);
            }
          },
        },
      });
    });
    return () => {
      destroyed = true;
      flushSegment();
      try { playerRef.current?.destroy(); } catch {}
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Progress + seek detection
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const t = p.getCurrentTime();
        const delta = t - lastTimeRef.current;
        if (Math.abs(delta) > 1.6) {
          flushSegment();
          if (playingRef.current) segmentStartRef.current = t;
          onSeek?.();
        }
        lastTimeRef.current = t;
        onProgress?.(t);
      } catch {}
    }, 1000);
    return () => window.clearInterval(id);
  }, [onProgress, onSeek, flushSegment]);

  return (
    <div className="zen-player relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[0_12px_50px_-15px_rgba(0,0,0,0.7)]">
      <div ref={mountRef} className="absolute inset-0 h-full w-full [&>iframe]:h-full [&>iframe]:w-full" />

      {/* Loading shimmer */}
      {!ready && !unavailable && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        </div>
      )}

      {/* Distraction blockers — top-right native controls stay clickable.
          We only intercept redirect surfaces: top title/channel strip plus
          bottom share/watch-later/more-videos/YouTube branding surfaces. */}
      {ready && !unavailable && (
        <>
          {/* TOP title/channel strip only; keep volume, CC and settings open. */}
          <div
            className="pointer-events-auto absolute inset-x-0 top-0 z-10 bg-black/90"
            style={{ height: 56, right: 148 }}
            aria-hidden
          />
          {/* Cover the full bottom distraction shelf shown above the timeline. */}
          <div
            className="pointer-events-auto absolute z-10"
            style={{ left: 0, right: 0, bottom: 42, height: 58 }}
            aria-hidden
          />
          {/* Block YouTube logo / more-videos labels inside the control row, while
              leaving play, volume, time, CC, settings and fullscreen usable. */}
          <div
            className="pointer-events-auto absolute z-10"
            style={{ right: 54, bottom: 0, width: 178, height: 42 }}
            aria-hidden
          />
          {/* Block share/watch-later shortcuts at the bottom-left hover shelf,
              but start after the native play/volume cluster. */}
          <div
            className="pointer-events-auto absolute z-10"
            style={{ left: 44, bottom: 0, width: 92, height: 42 }}
            aria-hidden
          />
        </>
      )}
      {/* End-screen "More videos" cards & pause-overlay share/youtube logo —
          mask the full center area, leaving only the control bar exposed. */}
      {ready && !unavailable && ended && (
        <div
          className="pointer-events-auto absolute z-10"
          style={{ left: 0, right: 0, top: 56, bottom: 46 }}
          aria-hidden
        />
      )}

      {/* Embed disabled / unavailable overlay */}
      {unavailable && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/95 px-6 text-center text-white">
          <AlertTriangle className="h-8 w-8 text-white/70" />
          <div className="text-base font-medium">This video can't be played here</div>
          <p className="max-w-md text-sm text-white/60">
            The owner has disabled embedded playback. You can still watch it on YouTube.
          </p>
          <a
            href={`https://www.youtube.com/watch?v=${videoId}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:opacity-90"
          >
            <ExternalLink className="h-4 w-4" /> Watch on YouTube
          </a>
        </div>
      )}
    </div>
  );
});
