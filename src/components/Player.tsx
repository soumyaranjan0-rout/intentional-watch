import { useEffect, useRef, useState } from "react";

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
      PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
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
  setPlaybackRate: (r: number) => void;
  destroy: () => void;
  getPlayerState: () => number;
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

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

type Props = {
  videoId: string;
  onProgress?: (seconds: number) => void;
  onEnded?: () => void;
  onTipShown?: () => void;
};

export function Player({ videoId, onProgress, onEnded, onTipShown }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [speed, setSpeed] = useState(1);

  // Init player
  useEffect(() => {
    let destroyed = false;
    loadYTApi().then(() => {
      if (destroyed || !containerRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          disablekb: 0,
          iv_load_policy: 3,
          fs: 0,
          playsinline: 1,
        },
        events: {
          onReady: (e) => {
            setReady(true);
            setDuration(e.target?.getDuration() || 0);
            onTipShown?.();
          },
          onStateChange: (e) => {
            const st = e.data;
            if (st === window.YT?.PlayerState.PLAYING) setPlaying(true);
            else if (st === window.YT?.PlayerState.PAUSED) setPlaying(false);
            else if (st === window.YT?.PlayerState.ENDED) {
              setPlaying(false);
              onEnded?.();
            }
          },
        },
      });
    });
    return () => {
      destroyed = true;
      try {
        playerRef.current?.destroy();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Time tracker
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const t = p.getCurrentTime();
        setCurrent(t);
        onProgress?.(t);
        if (!duration) setDuration(p.getDuration() || 0);
      } catch {}
    }, 500);
    return () => window.clearInterval(id);
  }, [duration, onProgress]);

  // Auto-hide controls
  const scheduleHide = () => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      setShowControls(false);
    }, 2500);
  };
  useEffect(() => {
    if (showControls && playing) scheduleHide();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [showControls, playing]);

  // Spacebar play/pause
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, ready]);

  const toggle = () => {
    if (!playerRef.current) return;
    if (playing) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
    setShowControls(true);
  };

  const seek = (sec: number) => {
    playerRef.current?.seekTo(sec, true);
    setCurrent(sec);
  };

  const changeSpeed = (s: number) => {
    setSpeed(s);
    playerRef.current?.setPlaybackRate(s);
  };

  const fmt = (s: number) => {
    if (!Number.isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div
      ref={wrapRef}
      className="relative aspect-video w-full overflow-hidden rounded-lg bg-black"
      onMouseMove={() => { setShowControls(true); scheduleHide(); }}
      onClick={() => { setShowControls((v) => !v); }}
    >
      <div ref={containerRef} className="absolute inset-0" />

      {/* Center play affordance only when paused */}
      {ready && !playing && (
        <button
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          aria-label="Play"
          className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
        >
          <span className="rounded-full bg-background/90 p-4 text-foreground">
            <PlayIcon />
          </span>
        </button>
      )}

      {/* Controls bar */}
      <div
        className={
          "pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 transition-opacity duration-300 " +
          (showControls ? "opacity-100" : "opacity-0")
        }
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-auto">
          <input
            type="range"
            min={0}
            max={Math.max(duration, 1)}
            step={1}
            value={current}
            onChange={(e) => seek(parseInt(e.target.value, 10))}
            className="zen-progress w-full"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-white/90">
            <div className="flex items-center gap-3">
              <button onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
                {playing ? <PauseIcon /> : <PlayIcon small />}
              </button>
              <span>{fmt(current)} / {fmt(duration)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="opacity-75">Speed</span>
              <select
                value={speed}
                onChange={(e) => changeSpeed(parseFloat(e.target.value))}
                className="rounded bg-black/50 px-1.5 py-0.5 text-xs text-white border border-white/20"
              >
                {SPEEDS.map((s) => (
                  <option key={s} value={s}>{s}x</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .zen-progress {
          appearance: none;
          height: 4px;
          background: rgba(255,255,255,0.25);
          border-radius: 999px;
          outline: none;
        }
        .zen-progress::-webkit-slider-thumb {
          appearance: none;
          width: 12px; height: 12px; border-radius: 50%;
          background: oklch(0.85 0.10 155);
          cursor: pointer;
        }
        .zen-progress::-moz-range-thumb {
          width: 12px; height: 12px; border-radius: 50%; border: 0;
          background: oklch(0.85 0.10 155);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

function PlayIcon({ small }: { small?: boolean } = {}) {
  const s = small ? 16 : 28;
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
  );
}
function PauseIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
  );
}
