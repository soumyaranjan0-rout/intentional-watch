import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import {
  Play, Pause, Volume2, VolumeX, Volume1, Maximize2, Minimize2,
  Settings as SettingsIcon, Subtitles, AlertTriangle, ExternalLink,
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
  hd2160: "2160p", hd1440: "1440p", hd1080: "1080p", hd720: "720p",
  large: "480p", medium: "360p", small: "240p", tiny: "144p",
  auto: "Auto", default: "Auto",
};

export type PlayerHandle = {
  seekTo: (sec: number) => void;
  getCurrentTime: () => number;
};

type Props = {
  videoId: string;
  /** Short label shown bottom-left of player (e.g. video title chapter). */
  chapterLabel?: string;
  onProgress?: (seconds: number) => void;
  onEnded?: () => void;
  onSegmentPlayed?: (start: number, end: number) => void;
  onSeek?: () => void;
  onReady?: () => void;
};

type CaptionTrack = { languageCode: string; languageName?: string; displayName?: string };

export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { videoId, chapterLabel, onProgress, onEnded, onSegmentPlayed, onSeek, onReady },
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
  const [activeCaption, setActiveCaption] = useState<string>("");
  const [unavailable, setUnavailable] = useState(false);
  const [showCenterIcon, setShowCenterIcon] = useState(false);

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
          autoplay: 0, controls: 0, modestbranding: 1, rel: 0, disablekb: 1,
          iv_load_policy: 3, fs: 0, playsinline: 1, cc_load_policy: 0,
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
              if (segmentStartRef.current == null) segmentStartRef.current = p.getCurrentTime();
              refreshCaptionTracks();
            } else if (st === window.YT?.PlayerState.PAUSED) {
              setPlaying(false);
              flushSegment();
            } else if (st === window.YT?.PlayerState.ENDED) {
              setPlaying(false);
              flushSegment();
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

  useEffect(() => {
    const id = window.setInterval(() => {
      const p = playerRef.current;
      if (!p) return;
      try {
        const t = p.getCurrentTime();
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

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => {
      if (!settingsOpen) setShowControls(false);
    }, 2500);
  }, [settingsOpen]);

  useEffect(() => {
    if (showControls && playing && !settingsOpen) scheduleHide();
    return () => { if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current); };
  }, [showControls, playing, settingsOpen, scheduleHide]);

  // Auto-hide briefly-shown center play/pause icon
  useEffect(() => {
    if (!showCenterIcon) return;
    const id = window.setTimeout(() => setShowCenterIcon(false), 600);
    return () => window.clearTimeout(id);
  }, [showCenterIcon]);

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
    const st = p.getPlayerState?.();
    const isPlaying = window.YT && st === window.YT.PlayerState.PLAYING;
    if (isPlaying) p.pauseVideo();
    else p.playVideo();
    setShowControls(true);
    setShowCenterIcon(true);
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

  const changeSpeed = (s: number) => { setSpeed(s); playerRef.current?.setPlaybackRate(s); };

  const changeVolume = (v: number) => {
    setVolume(v);
    if (!playerRef.current) return;
    if (v === 0) {
      playerRef.current.mute();
      setMuted(true);
    } else {
      if (muted) { playerRef.current.unMute(); setMuted(false); }
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
    try { playerRef.current?.setPlaybackQuality?.(q); } catch {}
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
  const controlsVisible = showControls || !playing || settingsOpen;

  return (
    <div
      ref={containerRef}
      className="zen-player relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-[0_12px_50px_-15px_rgba(0,0,0,0.7)]"
      onMouseMove={() => { setShowControls(true); scheduleHide(); }}
      onMouseLeave={() => { if (playing && !settingsOpen) setShowControls(false); }}
    >
      <div ref={mountRef} className="zen-yt-mount absolute inset-0 h-full w-full" />

      {/* Click-to-toggle overlay (full surface, except controls bar at bottom and top-right icons) */}
      {!unavailable && (
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
          className="absolute inset-0 z-10 cursor-pointer bg-transparent"
        />
      )}

      {/* Mask the YouTube branding + share/watch-later buttons that appear in
          the iframe corners. These overlays are non-interactive (they sit
          ABOVE the iframe but BELOW our controls), so clicking the corners
          just toggles play instead of opening youtube.com. */}
      {!unavailable && (
        <>
          <div
            aria-hidden
            className="pointer-events-auto absolute bottom-0 right-0 z-20 h-16 w-44"
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          />
          <div
            aria-hidden
            className="pointer-events-auto absolute top-0 left-0 z-20 h-14 w-full"
            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          />
        </>
      )}

      {/* Loading shimmer */}
      {!ready && !unavailable && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        </div>
      )}

      {/* Embed disabled / unavailable overlay */}
      {unavailable && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/95 px-6 text-center text-white">
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

      {/* Center play/pause icon — only momentarily on toggle (DataCamp style) */}
      {ready && !unavailable && showCenterIcon && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <span className="rounded-full bg-black/55 p-5 text-white backdrop-blur-sm zen-pulse">
            {playing ? <Pause className="h-8 w-8 fill-white" /> : <Play className="h-8 w-8 fill-white" />}
          </span>
        </div>
      )}
      {/* Persistent center play when paused & not ended */}
      {ready && !playing && !unavailable && !showCenterIcon && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <span className="rounded-full bg-black/55 p-5 text-white backdrop-blur-sm">
            <Play className="h-8 w-8 fill-white" />
          </span>
        </div>
      )}

      {/* TOP-RIGHT control cluster: Volume, CC, Settings */}
      {!unavailable && (
        <div
          className={
            "absolute top-3 right-3 z-30 flex items-center gap-1 transition-opacity duration-200 " +
            (controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none")
          }
        >
          <div className="group flex items-center rounded-full bg-black/55 px-1 backdrop-blur">
            <CtrlBtn label={muted ? "Unmute (m)" : "Mute (m)"} onClick={toggleMute}>
              <VolumeIcon className="h-5 w-5" />
            </CtrlBtn>
            <input
              type="range"
              min={0} max={100} step={1}
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(parseInt(e.target.value, 10))}
              className="zen-vol w-0 transition-[width,margin] duration-200 group-hover:w-20 group-hover:mr-2"
              aria-label="Volume"
            />
          </div>
          <div className="rounded-full bg-black/55 backdrop-blur">
            <CtrlBtn
              label={ccAvailable ? (activeCaption ? "Captions on" : "Captions off") : "No captions"}
              onClick={toggleCC}
              disabled={!ccAvailable}
            >
              <Subtitles className={"h-5 w-5 " + (activeCaption ? "text-[var(--primary)]" : "")} />
            </CtrlBtn>
          </div>
          <div className="relative rounded-full bg-black/55 backdrop-blur">
            <CtrlBtn label="Settings" onClick={() => setSettingsOpen((v) => !v)}>
              <SettingsIcon className={"h-5 w-5 " + (settingsOpen ? "rotate-45 transition-transform" : "transition-transform")} />
            </CtrlBtn>

            {settingsOpen && (
              <div className="absolute right-0 top-full mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-black/95 text-sm text-white shadow-2xl backdrop-blur zen-fade-in">
                <div className="flex border-b border-white/10">
                  <SettingsTab active={settingsTab === "speed"} onClick={() => setSettingsTab("speed")}>Speed</SettingsTab>
                  <SettingsTab active={settingsTab === "quality"} onClick={() => setSettingsTab("quality")}>Quality</SettingsTab>
                  <SettingsTab active={settingsTab === "captions"} onClick={() => setSettingsTab("captions")}>CC</SettingsTab>
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {settingsTab === "speed" && SPEEDS.map((s) => (
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
      )}

      {/* BOTTOM strip — DataCamp-style: time + chapter on left, fullscreen on right, thin progress below */}
      {!unavailable && (
        <div
          className={
            "absolute inset-x-0 bottom-0 z-30 transition-opacity duration-200 " +
            (controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none")
          }
        >
          <div className="bg-gradient-to-t from-black/85 via-black/40 to-transparent px-5 pt-12 pb-3 text-white">
            <div className="flex items-end justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3 text-sm">
                <span className="select-none tabular-nums text-white/95">
                  {fmt(current)} / {fmt(duration)}
                </span>
                {chapterLabel && (
                  <span className="hidden truncate text-white/80 sm:inline-block">
                    {chapterLabel}
                  </span>
                )}
              </div>
              <CtrlBtn label={fullscreen ? "Exit fullscreen (f)" : "Fullscreen (f)"} onClick={toggleFullscreen}>
                {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
              </CtrlBtn>
            </div>
          </div>

          {/* Thin progress bar pinned to the very bottom */}
          <div
            className="group relative h-1.5 cursor-pointer bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              seek(pct * duration);
            }}
          >
            <div
              className="absolute left-0 top-0 h-full transition-[width] duration-150 ease-linear"
              style={{
                width: `${progressPct}%`,
                background: "linear-gradient(90deg, var(--primary), var(--primary-soft))",
              }}
            />
            <div
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 shadow-[0_0_0_4px_color-mix(in_oklab,var(--primary)_40%,transparent)] transition-opacity group-hover:opacity-100"
              style={{ left: `${progressPct}%` }}
            />
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
          background: white; cursor: pointer;
        }
        .zen-vol::-moz-range-thumb {
          width: 12px; height: 12px; border-radius: 50%; border: 0;
          background: white; cursor: pointer;
        }
        @keyframes zen-pulse-anim {
          0% { transform: scale(0.9); opacity: 0.9; }
          100% { transform: scale(1.15); opacity: 0; }
        }
        .zen-pulse { animation: zen-pulse-anim 600ms ease-out forwards; }
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
        "rounded-full p-2 transition-colors " +
        (disabled
          ? "text-white/30 cursor-not-allowed"
          : "text-white/95 hover:bg-white/15 hover:text-white")
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
      className={"flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-white/10 " + (active ? "text-[var(--primary)]" : "")}
    >
      <span>{children}</span>
      {active && <span>✓</span>}
    </button>
  );
}
