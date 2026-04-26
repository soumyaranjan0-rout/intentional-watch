import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import {
  Play, Pause, Volume2, VolumeX, Volume1, Maximize2, Minimize2,
  Settings as SettingsIcon, RotateCcw, RotateCw, Subtitles, AlertTriangle, ExternalLink,
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
  loadModule?: (m: string) => void;
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
  /** Called once the YouTube player has loaded and is ready. */
  onReady?: () => void;
};

type CaptionTrack = { languageCode: string; languageName?: string; displayName?: string };

export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { videoId, onProgress, onEnded, onSegmentPlayed, onSeek, onReady },
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
  const [settingsTab, setSettingsTab] = useState<"speed" | "quality" | "captions">("speed");
  const [qualities, setQualities] = useState<string[]>([]);
  const [quality, setQuality] = useState<string>("auto");
  const [captionTracks, setCaptionTracks] = useState<CaptionTrack[]>([]);
  const [activeCaption, setActiveCaption] = useState<string>(""); // languageCode or "" = off
  const [unavailable, setUnavailable] = useState(false);

  // Imperative handle for parent (notes click to seek)
  useImperativeHandle(ref, () => ({
    seekTo: (sec: number) => {
      if (!playerRef.current) return;
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

  // Discover caption tracks once player is ready
  const refreshCaptionTracks = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.loadModule?.("captions");
      const tracks = (p.getOption("captions", "tracklist") as CaptionTrack[] | undefined) ?? [];
      if (Array.isArray(tracks)) setCaptionTracks(tracks);
    } catch {
      setCaptionTracks([]);
    }
  }, []);

  // Init player
  useEffect(() => {
    let destroyed = false;
    setReady(false);
    setPlaying(false);
    setCurrent(0);
    setDuration(0);
    setUnavailable(false);
    setCaptionTracks([]);
    setActiveCaption("");
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
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
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
            // Caption tracks may not be available immediately; retry
            setTimeout(refreshCaptionTracks, 800);
            setTimeout(refreshCaptionTracks, 2000);
            onReady?.();
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
              // Refresh captions list once playback begins (often populated then)
              refreshCaptionTracks();
            } else if (st === window.YT?.PlayerState.PAUSED) {
              setPlaying(false);
              flushSegment();
            } else if (st === window.YT?.PlayerState.ENDED) {
              setPlaying(false);
              flushSegment();
              onEnded?.();
            } else if (st === window.YT?.PlayerState.BUFFERING) {
              // Don't change playing state during buffering — keep it in sync with intent
            }
          },
          // YouTube error codes: 2 invalid, 5 HTML5, 100 not found, 101/150 embed disabled
          onError: (e) => {
            const code = e.data;
            if (code === 101 || code === 150 || code === 100 || code === 5 || code === 2) {
              setUnavailable(true);
              setReady(true); // hide loader
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

  // Time tracker
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const t = p.getCurrentTime();
        // Sync playing state defensively from real player state
        const st = p.getPlayerState?.();
        if (window.YT) {
          if (st === window.YT.PlayerState.PLAYING && !playing) setPlaying(true);
          else if (st === window.YT.PlayerState.PAUSED && playing) setPlaying(false);
        }
        setCurrent(t);
        const delta = t - lastTimeRef.current;
        if (Math.abs(delta) > 1.6) {
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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, ready, volume, muted, fullscreen]);

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p || unavailable) return;
    // Read true state from player rather than React state to avoid drift
    const st = p.getPlayerState?.();
    const isPlaying = window.YT && st === window.YT.PlayerState.PLAYING;
    if (isPlaying) p.pauseVideo();
    else p.playVideo();
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

  const setCaption = (langCode: string) => {
    const p = playerRef.current;
    if (!p) return;
    try {
      if (!langCode) {
        // Off
        p.setOption("captions", "track", {});
        setActiveCaption("");
      } else {
        const track = captionTracks.find((t) => t.languageCode === langCode);
        if (track) {
          p.setOption("captions", "track", track);
          setActiveCaption(langCode);
        }
      }
    } catch {}
  };

  const toggleCC = () => {
    if (captionTracks.length === 0) {
      // Try to refresh once more then open settings
      refreshCaptionTracks();
      setSettingsTab("captions");
      setSettingsOpen(true);
      return;
    }
    if (activeCaption) setCaption("");
    else setCaption(captionTracks[0].languageCode);
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
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
  const ccAvailable = captionTracks.length > 0;

  return (
    <div
      ref={containerRef}
      className="zen-player relative aspect-video w-full overflow-hidden rounded-xl bg-black shadow-[0_8px_40px_-12px_rgba(0,0,0,0.6)]"
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
      {!unavailable && (
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
          className="absolute inset-x-0 top-0 bottom-16 z-10 cursor-pointer bg-transparent"
        />
      )}

      {/* Loading shimmer */}
      {!ready && !unavailable && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        </div>
      )}

      {/* Embed disabled / unavailable overlay */}
      {unavailable && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/95 px-6 text-center text-white">
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

      {/* Big center play button when paused */}
      {ready && !playing && !unavailable && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="rounded-full bg-white/90 p-5 text-black shadow-2xl">
            <Play className="h-8 w-8 fill-black" />
          </span>
        </div>
      )}

      {/* Bottom controls */}
      {!unavailable && (
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
              <CtrlBtn label={playing ? "Pause (space)" : "Play (space)"} onClick={togglePlay}>
                {playing ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white" />}
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
              <CtrlBtn
                label={ccAvailable ? (activeCaption ? "Captions on" : "Captions off") : "No captions available"}
                onClick={toggleCC}
                disabled={!ccAvailable}
              >
                <Subtitles className={"h-5 w-5 " + (activeCaption ? "text-[oklch(0.78_0.12_158)]" : "")} />
              </CtrlBtn>
              <CtrlBtn label="Settings" onClick={() => setSettingsOpen((v) => !v)}>
                <SettingsIcon className="h-5 w-5" />
              </CtrlBtn>
              <CtrlBtn label={fullscreen ? "Exit fullscreen (f)" : "Fullscreen (f)"} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
              </CtrlBtn>

              {settingsOpen && (
                <div className="absolute bottom-12 right-0 w-60 overflow-hidden rounded-lg border border-white/10 bg-black/95 text-sm text-white shadow-2xl backdrop-blur">
                  <div className="flex border-b border-white/10">
                    <SettingsTab active={settingsTab === "speed"} onClick={() => setSettingsTab("speed")}>Speed</SettingsTab>
                    <SettingsTab active={settingsTab === "quality"} onClick={() => setSettingsTab("quality")}>Quality</SettingsTab>
                    <SettingsTab active={settingsTab === "captions"} onClick={() => setSettingsTab("captions")}>CC</SettingsTab>
                  </div>
                  <div className="max-h-64 overflow-y-auto py-1">
                    {settingsTab === "speed" &&
                      SPEEDS.map((s) => (
                        <SettingsRow key={s} active={s === speed} onClick={() => { changeSpeed(s); setSettingsOpen(false); }}>
                          {s === 1 ? "Normal" : `${s}×`}
                        </SettingsRow>
                      ))}
                    {settingsTab === "quality" && (
                      <>
                        <SettingsRow active={quality === "default" || quality === "auto"} onClick={() => { changeQuality("default"); setSettingsOpen(false); }}>
                          Auto
                        </SettingsRow>
                        {qualities.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-white/50">Quality options will appear once playback starts.</div>
                        ) : (
                          qualities.map((q) => (
                            <SettingsRow key={q} active={q === quality} onClick={() => { changeQuality(q); setSettingsOpen(false); }}>
                              {QUALITY_LABEL[q] || q}
                            </SettingsRow>
                          ))
                        )}
                      </>
                    )}
                    {settingsTab === "captions" && (
                      <>
                        <SettingsRow active={!activeCaption} onClick={() => { setCaption(""); setSettingsOpen(false); }}>Off</SettingsRow>
                        {captionTracks.length === 0 ? (
                          <div className="px-3 py-2 text-xs text-white/50">No captions available for this video.</div>
                        ) : (
                          captionTracks.map((t) => (
                            <SettingsRow key={t.languageCode} active={activeCaption === t.languageCode} onClick={() => { setCaption(t.languageCode); setSettingsOpen(false); }}>
                              {t.displayName || t.languageName || t.languageCode}
                            </SettingsRow>
                          ))
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
  children, onClick, label, disabled,
}: { children: React.ReactNode; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }}
      className={
        "rounded p-2 transition-colors " +
        (disabled
          ? "text-white/30 cursor-not-allowed"
          : "text-white/90 hover:bg-white/15 hover:text-white")
      }
    >
      {children}
    </button>
  );
}

function SettingsTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={"flex-1 py-2 text-xs " + (active ? "bg-white/10 text-white" : "text-white/60 hover:text-white")}
    >
      {children}
    </button>
  );
}

function SettingsRow({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={"flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-white/10 " + (active ? "text-[oklch(0.82_0.12_158)]" : "")}
    >
      <span>{children}</span>
      {active && <span>✓</span>}
    </button>
  );
}
