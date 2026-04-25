import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import {
  Play, Pause, Volume2, VolumeX, Volume1, Maximize2, Minimize2,
  Settings as SettingsIcon, RotateCcw, RotateCw, Subtitles, PictureInPicture2,
} from "lucide-react";

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
  setPlaybackRate: (r: number) => void;
  destroy: () => void;
  getPlayerState: () => number;
  setVolume: (v: number) => void;
  getVolume: () => number;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  getIframe: () => HTMLIFrameElement;
  setOption: (module: string, option: string, value: unknown) => void;
  getOption: (module: string, option: string) => unknown;
  getOptions: (module?: string) => string[] | unknown;
  getAvailableQualityLevels?: () => string[];
  getPlaybackQuality?: () => string;
  setPlaybackQuality?: (q: string) => void;
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

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const QUALITY_LABEL: Record<string, string> = {
  hd2160: "2160p",
  hd1440: "1440p",
  hd1080: "1080p",
  hd720: "720p",
  large: "480p",
  medium: "360p",
  small: "240p",
  tiny: "144p",
  auto: "Auto",
  default: "Auto",
};

export type PlayerHandle = {
  seekTo: (sec: number) => void;
  getCurrentTime: () => number;
};

type Props = {
  videoId: string;
  onProgress?: (seconds: number) => void;
  onEnded?: () => void;
  /** Called when user actively played a segment of the video (start, end seconds). */
  onSegmentPlayed?: (start: number, end: number) => void;
  /** Called when user seeks (skip forward/back/scrub). */
  onSeek?: () => void;
};

export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { videoId, onProgress, onEnded, onSegmentPlayed, onSeek },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const segmentStartRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"speed" | "quality">("speed");
  const [qualities, setQualities] = useState<string[]>([]);
  const [quality, setQuality] = useState<string>("auto");
  const [ccOn, setCcOn] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);

  // Imperative handle for parent (notes click to seek)
  useImperativeHandle(ref, () => ({
    seekTo: (sec: number) => {
      if (!playerRef.current) return;
      // close current segment before jump
      flushSegment();
      playerRef.current.seekTo(sec, true);
      setCurrent(sec);
      lastTimeRef.current = sec;
      onSeek?.();
      playerRef.current.playVideo();
    },
    getCurrentTime: () => playerRef.current?.getCurrentTime() ?? 0,
  }));

  const flushSegment = useCallback(() => {
    if (segmentStartRef.current != null && playerRef.current) {
      const end = playerRef.current.getCurrentTime();
      const start = segmentStartRef.current;
      if (end > start + 0.5) onSegmentPlayed?.(start, end);
      segmentStartRef.current = null;
    }
  }, [onSegmentPlayed]);

  // Init player
  useEffect(() => {
    let destroyed = false;
    setReady(false);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    segmentStartRef.current = null;

    loadYTApi().then(() => {
      if (destroyed || !mountRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(mountRef.current, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          disablekb: 1,
          iv_load_policy: 3,
          fs: 0,
          playsinline: 1,
          cc_load_policy: 0,
        },
        events: {
          onReady: (e) => {
            setReady(true);
            const p = e.target as YTPlayer;
            setDuration(p.getDuration() || 0);
            try {
              p.setVolume(80);
              const qs = p.getAvailableQualityLevels?.() || [];
              setQualities(qs);
            } catch {}
          },
          onStateChange: (e) => {
            const st = e.data;
            const p = playerRef.current;
            if (!p) return;
            if (st === window.YT?.PlayerState.PLAYING) {
              setPlaying(true);
              if (segmentStartRef.current == null) {
                segmentStartRef.current = p.getCurrentTime();
              }
            } else if (st === window.YT?.PlayerState.PAUSED) {
              setPlaying(false);
              flushSegment();
            } else if (st === window.YT?.PlayerState.ENDED) {
              setPlaying(false);
              flushSegment();
              onEnded?.();
            }
          },
        },
      });
    });
    return () => {
      destroyed = true;
      flushSegment();
      try {
        playerRef.current?.destroy();
      } catch {}
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // PIP support detection
  useEffect(() => {
    setPipSupported("pictureInPictureEnabled" in document && (document as { pictureInPictureEnabled?: boolean }).pictureInPictureEnabled === true);
  }, []);

  // Time tracker
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const t = p.getCurrentTime();
        setCurrent(t);
        // Detect non-play time jumps (e.g. seek without state change)
        const delta = t - lastTimeRef.current;
        if (Math.abs(delta) > 1.6) {
          // user scrubbed — close prior segment, start fresh
          flushSegment();
          if (playing) segmentStartRef.current = t;
        }
        lastTimeRef.current = t;
        onProgress?.(t);
        if (!duration) setDuration(p.getDuration() || 0);
      } catch {}
    }, 1000);
    return () => window.clearInterval(id);
  }, [duration, onProgress, playing, flushSegment]);

  // Fullscreen state listener
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Auto-hide controls
  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (!settingsOpen) setShowControls(false);
    }, 2500);
  }, [settingsOpen]);

  useEffect(() => {
    if (showControls && playing && !settingsOpen) scheduleHide();
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    };
  }, [showControls, playing, settingsOpen, scheduleHide]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); skip(-10); }
      else if (e.code === "ArrowRight") { e.preventDefault(); skip(10); }
      else if (e.code === "ArrowUp") { e.preventDefault(); changeVolume(Math.min(100, volume + 5)); }
      else if (e.code === "ArrowDown") { e.preventDefault(); changeVolume(Math.max(0, volume - 5)); }
      else if (e.key === "f" || e.key === "F") toggleFullscreen();
      else if (e.key === "m" || e.key === "M") toggleMute();
      else if (e.key === "c" || e.key === "C") toggleCC();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, ready, volume, muted, ccOn, fullscreen]);

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (playing) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
    setShowControls(true);
  };

  const skip = (delta: number) => {
    if (!playerRef.current) return;
    flushSegment();
    const t = Math.max(0, Math.min(duration, playerRef.current.getCurrentTime() + delta));
    playerRef.current.seekTo(t, true);
    setCurrent(t);
    lastTimeRef.current = t;
    onSeek?.();
    if (playing) segmentStartRef.current = t;
    setShowControls(true);
  };

  const seek = (sec: number) => {
    if (!playerRef.current) return;
    flushSegment();
    playerRef.current.seekTo(sec, true);
    setCurrent(sec);
    lastTimeRef.current = sec;
    onSeek?.();
    if (playing) segmentStartRef.current = sec;
  };

  const changeSpeed = (s: number) => {
    setSpeed(s);
    playerRef.current?.setPlaybackRate(s);
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    if (!playerRef.current) return;
    if (v === 0) {
      playerRef.current.mute();
      setMuted(true);
    } else {
      if (muted) {
        playerRef.current.unMute();
        setMuted(false);
      }
      playerRef.current.setVolume(v);
    }
  };

  const toggleMute = () => {
    if (!playerRef.current) return;
    if (muted) {
      playerRef.current.unMute();
      playerRef.current.setVolume(volume || 50);
      setMuted(false);
    } else {
      playerRef.current.mute();
      setMuted(true);
    }
  };

  const toggleCC = () => {
    if (!playerRef.current) return;
    try {
      if (ccOn) {
        playerRef.current.setOption("captions", "track", {});
      } else {
        playerRef.current.setOption("captions", "reload", true);
        const tracks = playerRef.current.getOption("captions", "tracklist") as Array<{ languageCode: string }> | undefined;
        if (tracks && tracks.length > 0) {
          playerRef.current.setOption("captions", "track", tracks[0]);
        }
      }
      setCcOn(!ccOn);
    } catch {
      setCcOn(!ccOn);
    }
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const togglePip = async () => {
    const iframe = playerRef.current?.getIframe();
    if (!iframe) return;
    // YouTube iframe doesn't directly support PIP; we can only attempt to toggle the video element inside if same-origin (it isn't).
    // So this is a no-op fallback — keep button hidden if not supported.
    try {
      const doc = document as Document & { exitPictureInPicture?: () => Promise<void>; pictureInPictureElement?: Element | null };
      if (doc.pictureInPictureElement) await doc.exitPictureInPicture?.();
    } catch {}
  };

  const changeQuality = (q: string) => {
    setQuality(q);
    try {
      playerRef.current?.setPlaybackQuality?.(q);
    } catch {}
  };

  const fmt = (s: number) => {
    if (!Number.isFinite(s)) return "0:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 40 ? Volume1 : Volume2;
  const progressPct = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="zen-player relative aspect-video w-full overflow-hidden rounded-xl bg-black"
      onMouseMove={() => {
        setShowControls(true);
        scheduleHide();
      }}
      onMouseLeave={() => { if (playing && !settingsOpen) setShowControls(false); }}
    >
      <div
        ref={mountRef}
        className="zen-yt-mount absolute inset-0 h-full w-full"
      />

      {/* Click-to-toggle overlay (excludes the controls area) */}
      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        className="absolute inset-x-0 top-0 bottom-16 z-10 cursor-pointer bg-transparent"
      />

      {/* Loading shimmer */}
      {!ready && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        </div>
      )}

      {/* Big center play button when paused */}
      {ready && !playing && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="rounded-full bg-white/90 p-5 text-black shadow-2xl">
            <Play className="h-8 w-8 fill-black" />
          </span>
        </div>
      )}

      {/* Top bar: progress (DataCamp-style — thin at rest, grows on hover) */}
      <div
        className={
          "absolute inset-x-0 bottom-0 z-30 px-3 pt-12 pb-2 bg-gradient-to-t from-black/95 via-black/60 to-transparent transition-opacity duration-200 " +
          (showControls || !playing ? "opacity-100" : "opacity-0 pointer-events-none")
        }
      >
        {/* Progress bar */}
        <div className="group relative mb-2 h-4 cursor-pointer" onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const pct = (e.clientX - rect.left) / rect.width;
          seek(pct * duration);
        }}>
          <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-white/25 transition-all group-hover:h-1.5">
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-[oklch(0.78_0.12_158)]"
              style={{ width: `${progressPct}%` }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
              style={{ left: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between gap-2 text-white">
          <div className="flex items-center gap-1">
            <CtrlBtn label={playing ? "Pause (k)" : "Play (k)"} onClick={togglePlay}>
              {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-white" />}
            </CtrlBtn>
            <CtrlBtn label="Back 10s (←)" onClick={() => skip(-10)}>
              <RotateCcw className="h-5 w-5" />
            </CtrlBtn>
            <CtrlBtn label="Forward 10s (→)" onClick={() => skip(10)}>
              <RotateCw className="h-5 w-5" />
            </CtrlBtn>

            {/* Volume */}
            <div className="group flex items-center">
              <CtrlBtn label={muted ? "Unmute (m)" : "Mute (m)"} onClick={toggleMute}>
                <VolumeIcon className="h-5 w-5" />
              </CtrlBtn>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={muted ? 0 : volume}
                onChange={(e) => changeVolume(parseInt(e.target.value, 10))}
                className="zen-vol w-0 transition-[width] duration-200 group-hover:w-20 group-hover:ml-1"
                aria-label="Volume"
              />
            </div>

            <span className="ml-2 select-none tabular-nums text-xs text-white/90">
              {fmt(current)} / {fmt(duration)}
            </span>
          </div>

          <div className="relative flex items-center gap-1">
            <CtrlBtn label={ccOn ? "Captions on (c)" : "Captions off (c)"} onClick={toggleCC}>
              <Subtitles className={"h-5 w-5 " + (ccOn ? "text-[oklch(0.78_0.12_158)]" : "")} />
            </CtrlBtn>
            <CtrlBtn label="Settings" onClick={() => setSettingsOpen((v) => !v)}>
              <SettingsIcon className="h-5 w-5" />
            </CtrlBtn>
            {pipSupported && (
              <CtrlBtn label="Mini-player" onClick={togglePip}>
                <PictureInPicture2 className="h-5 w-5" />
              </CtrlBtn>
            )}
            <CtrlBtn label={fullscreen ? "Exit fullscreen (f)" : "Fullscreen (f)"} onClick={toggleFullscreen}>
              {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </CtrlBtn>

            {settingsOpen && (
              <div className="absolute bottom-12 right-0 w-56 overflow-hidden rounded-lg border border-white/10 bg-black/95 text-sm text-white shadow-2xl backdrop-blur">
                <div className="flex border-b border-white/10">
                  <button
                    onClick={() => setSettingsTab("speed")}
                    className={"flex-1 py-2 text-xs " + (settingsTab === "speed" ? "bg-white/10 text-white" : "text-white/60 hover:text-white")}
                  >
                    Speed
                  </button>
                  <button
                    onClick={() => setSettingsTab("quality")}
                    className={"flex-1 py-2 text-xs " + (settingsTab === "quality" ? "bg-white/10 text-white" : "text-white/60 hover:text-white")}
                  >
                    Quality
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {settingsTab === "speed" &&
                    SPEEDS.map((s) => (
                      <button
                        key={s}
                        onClick={() => { changeSpeed(s); setSettingsOpen(false); }}
                        className={"flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-white/10 " + (s === speed ? "text-[oklch(0.82_0.12_158)]" : "")}
                      >
                        <span>{s === 1 ? "Normal" : `${s}×`}</span>
                        {s === speed && <span>✓</span>}
                      </button>
                    ))}
                  {settingsTab === "quality" && (
                    <>
                      <button
                        onClick={() => { changeQuality("default"); setSettingsOpen(false); }}
                        className={"flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-white/10 " + (quality === "default" || quality === "auto" ? "text-[oklch(0.82_0.12_158)]" : "")}
                      >
                        <span>Auto</span>
                        {(quality === "default" || quality === "auto") && <span>✓</span>}
                      </button>
                      {qualities.map((q) => (
                        <button
                          key={q}
                          onClick={() => { changeQuality(q); setSettingsOpen(false); }}
                          className={"flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-white/10 " + (q === quality ? "text-[oklch(0.82_0.12_158)]" : "")}
                        >
                          <span>{QUALITY_LABEL[q] || q}</span>
                          {q === quality && <span>✓</span>}
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .zen-vol {
          appearance: none;
          height: 4px;
          background: rgba(255,255,255,0.3);
          border-radius: 999px;
          outline: none;
        }
        .zen-vol::-webkit-slider-thumb {
          appearance: none;
          width: 12px; height: 12px; border-radius: 50%;
          background: white;
          cursor: pointer;
        }
        .zen-vol::-moz-range-thumb {
          width: 12px; height: 12px; border-radius: 50%; border: 0;
          background: white;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
});

function CtrlBtn({
  children, onClick, label,
}: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="rounded p-2 text-white/90 transition-colors hover:bg-white/15 hover:text-white"
    >
      {children}
    </button>
  );
}
