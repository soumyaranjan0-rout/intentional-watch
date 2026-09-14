import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  Captions,
  Check,
  ExternalLink,
  Gauge,
  Maximize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  SlidersHorizontal,
  Volume2,
  VolumeX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
  getPlayerState: () => number;
  getIframe: () => HTMLIFrameElement;
  getPlaybackRate: () => number;
  getAvailablePlaybackRates: () => number[];
  setPlaybackRate: (rate: number) => void;
  getPlaybackQuality: () => string;
  getAvailableQualityLevels: () => string[];
  setPlaybackQuality: (quality: string) => void;
  getVolume: () => number;
  setVolume: (volume: number) => void;
  isMuted: () => boolean;
  mute: () => void;
  unMute: () => void;
  getOptions: (module?: string) => string[];
  getOption: (module: string, option: string) => unknown;
  setOption: (module: string, option: string, value: unknown) => void;
};

let ytApiPromise: Promise<void> | null = null;
function loadYTApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
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
  chapterLabel?: string;
  onProgress?: (seconds: number) => void;
  onEnded?: () => void;
  onSegmentPlayed?: (start: number, end: number) => void;
  onSeek?: () => void;
  onReady?: () => void;
  onUnavailable?: (code: number) => void;
};

type SeekFeedback = { direction: "back" | "forward"; seconds: number; key: number } | null;

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  const minutes = Math.floor(value / 60) % 60;
  const hours = Math.floor(value / 3600);
  return hours > 0 ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

export const Player = forwardRef<PlayerHandle, Props>(function Player(
  { videoId, onProgress, onEnded, onSegmentPlayed, onSeek, onReady, onUnavailable },
  ref,
) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const segmentStartRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const lastTickAtRef = useRef(0);
  const playingRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);
  const tapTimerRef = useRef<number | null>(null);

  const [unavailable, setUnavailable] = useState(false);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [ended, setEnded] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(100);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [quality, setQuality] = useState("auto");
  const [rates, setRates] = useState<number[]>([0.5, 0.75, 1, 1.25, 1.5, 2]);
  const [qualities, setQualities] = useState<string[]>([]);
  const [captionsAvailable, setCaptionsAvailable] = useState(false);
  const [captionsOn, setCaptionsOn] = useState(false);
  const [seekFeedback, setSeekFeedback] = useState<SeekFeedback>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = null;
  }, []);

  const revealControls = useCallback((keepVisible = false) => {
    clearHideTimer();
    setControlsVisible(true);
    if (!keepVisible && playingRef.current) {
      hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), 2600);
    }
  }, [clearHideTimer]);

  const flushSegment = useCallback(() => {
    if (segmentStartRef.current == null || !playerRef.current) return;
    try {
      const end = playerRef.current.getCurrentTime();
      const start = segmentStartRef.current;
      if (end > start + 0.5) onSegmentPlayed?.(start, end);
    } catch {}
    segmentStartRef.current = null;
  }, [onSegmentPlayed]);

  const seekTo = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    const next = Math.max(0, Math.min(seconds, player.getDuration() || seconds));
    flushSegment();
    player.seekTo(next, true);
    lastTimeRef.current = next;
    setCurrentTime(next);
    onSeek?.();
  }, [flushSegment, onSeek]);

  useImperativeHandle(ref, () => ({
    seekTo: (sec) => {
      seekTo(sec);
      try { playerRef.current?.playVideo(); } catch {}
    },
    getCurrentTime: () => {
      try { return playerRef.current?.getCurrentTime() ?? 0; } catch { return 0; }
    },
  }), [seekTo]);

  const togglePlayback = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (playingRef.current) player.pauseVideo();
      else player.playVideo();
      revealControls();
    } catch {}
  }, [revealControls]);

  const seekBy = useCallback((amount: number) => {
    const player = playerRef.current;
    if (!player) return;
    let now = 0;
    try { now = player.getCurrentTime(); } catch {}
    seekTo(now + amount);
    setSeekFeedback({ direction: amount < 0 ? "back" : "forward", seconds: Math.abs(amount), key: Date.now() });
    window.setTimeout(() => setSeekFeedback(null), 650);
    revealControls();
  }, [revealControls, seekTo]);

  const handleTapZone = (side: "left" | "center" | "right") => {
    if (tapTimerRef.current != null) {
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;
      if (side !== "center") seekBy(side === "left" ? -10 : 10);
      return;
    }
    tapTimerRef.current = window.setTimeout(() => {
      tapTimerRef.current = null;
      setControlsVisible((visible) => {
        if (visible) clearHideTimer();
        else revealControls();
        return !visible;
      });
    }, 220);
  };

  const toggleMute = () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      if (player.isMuted() || player.getVolume() === 0) {
        player.unMute();
        if (player.getVolume() === 0) player.setVolume(60);
      } else player.mute();
      setMuted(player.isMuted());
      setVolumeState(player.getVolume());
    } catch {}
    revealControls(true);
  };

  const toggleFullscreen = async () => {
    const shell = shellRef.current;
    if (!shell) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shell.requestFullscreen();
    } catch {}
  };

  const toggleCaptions = () => {
    const player = playerRef.current;
    if (!player || !captionsAvailable) return;
    try {
      if (captionsOn) player.setOption("captions", "track", {});
      else {
        const tracks = player.getOption("captions", "tracklist");
        if (Array.isArray(tracks) && tracks[0]) player.setOption("captions", "track", tracks[0]);
      }
      setCaptionsOn((value) => !value);
    } catch {}
    revealControls(true);
  };

  const syncSettings = () => {
    const player = playerRef.current;
    if (!player) return;
    try { setPlaybackRate(player.getPlaybackRate()); } catch {}
    try { setRates(player.getAvailablePlaybackRates()); } catch {}
    try { setQuality(player.getPlaybackQuality() || "auto"); } catch {}
    try { setQualities(player.getAvailableQualityLevels()); } catch {}
    try {
      const options = player.getOptions();
      setCaptionsAvailable(options.includes("captions"));
    } catch {}
  };

  const openSettings = () => {
    syncSettings();
    clearHideTimer();
    setControlsVisible(true);
    setSettingsOpen(true);
  };

  useEffect(() => {
    let destroyed = false;
    setReady(false);
    setUnavailable(false);
    setPlaying(false);
    setEnded(false);
    setCurrentTime(0);
    setDuration(0);
    segmentStartRef.current = null;
    playingRef.current = false;

    loadYTApi().then(() => {
      if (destroyed || !mountRef.current || !window.YT) return;
      playerRef.current = new window.YT.Player(mountRef.current, {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          fs: 0,
          cc_load_policy: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            if (destroyed) return;
            setReady(true);
            try {
              const player = event.target as YTPlayer;
              setDuration(player.getDuration());
              setVolumeState(player.getVolume());
              setMuted(player.isMuted());
            } catch {}
            syncSettings();
            onReady?.();
          },
          onApiChange: () => syncSettings(),
          onStateChange: (event) => {
            const state = event.data;
            const player = playerRef.current;
            if (!player || !window.YT) return;
            if (state === window.YT.PlayerState.PLAYING) {
              playingRef.current = true;
              setPlaying(true);
              setBuffering(false);
              setEnded(false);
              try {
                lastTimeRef.current = player.getCurrentTime();
                setDuration(player.getDuration());
              } catch {}
              lastTickAtRef.current = performance.now();
              if (segmentStartRef.current == null) {
                try { segmentStartRef.current = player.getCurrentTime(); } catch {}
              }
              revealControls();
            } else if (state === window.YT.PlayerState.PAUSED) {
              playingRef.current = false;
              setPlaying(false);
              setBuffering(false);
              flushSegment();
              lastTickAtRef.current = 0;
              revealControls(true);
            } else if (state === window.YT.PlayerState.BUFFERING) {
              setBuffering(true);
            } else if (state === window.YT.PlayerState.ENDED) {
              playingRef.current = false;
              setPlaying(false);
              setBuffering(false);
              flushSegment();
              lastTickAtRef.current = 0;
              setEnded(true);
              revealControls(true);
              onEnded?.();
            }
          },
          onError: (event) => {
            const code = event.data ?? 0;
            if ([2, 5, 100, 101, 150].includes(code)) {
              setUnavailable(true);
              setReady(true);
              onUnavailable?.(code);
            }
          },
        },
      });
    });

    return () => {
      destroyed = true;
      clearHideTimer();
      if (tapTimerRef.current != null) window.clearTimeout(tapTimerRef.current);
      flushSegment();
      try { playerRef.current?.destroy(); } catch {}
      playerRef.current = null;
    };
  }, [clearHideTimer, flushSegment, onEnded, onReady, onUnavailable, revealControls, videoId]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const time = player.getCurrentTime();
        const previous = lastTimeRef.current;
        const delta = time - previous;
        const now = performance.now();
        const wallDelta = lastTickAtRef.current ? (now - lastTickAtRef.current) / 1000 : 0;
        lastTickAtRef.current = now;
        const realPlayback = playingRef.current && delta > 0 && wallDelta > 0 && delta <= Math.min(1.25, wallDelta + 0.3);
        if (playingRef.current && !realPlayback && Math.abs(delta) > 0.05) {
          segmentStartRef.current = time;
          onSeek?.();
        } else if (realPlayback) {
          onSegmentPlayed?.(previous, previous + Math.min(delta, wallDelta));
          segmentStartRef.current = time;
        }
        lastTimeRef.current = time;
        setCurrentTime(time);
        const nextDuration = player.getDuration();
        if (nextDuration) setDuration(nextDuration);
        onProgress?.(time);
      } catch {}
    }, 500);
    return () => window.clearInterval(id);
  }, [onProgress, onSeek, onSegmentPlayed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!shellRef.current || !shellRef.current.matches(":hover, :focus-within")) return;
      if (event.key === " " || event.key.toLowerCase() === "k") {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === "ArrowLeft" || event.key.toLowerCase() === "j") {
        event.preventDefault();
        seekBy(event.key === "ArrowLeft" ? -5 : -10);
      } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "l") {
        event.preventDefault();
        seekBy(event.key === "ArrowRight" ? 5 : 10);
      } else if (event.key.toLowerCase() === "m") toggleMute();
      else if (event.key.toLowerCase() === "f") void toggleFullscreen();
      else if (event.key.toLowerCase() === "c") toggleCaptions();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const overlayVisible = controlsVisible || !playing || buffering || ended;

  return (
    <div
      ref={shellRef}
      className="zen-player group relative aspect-video w-full overflow-hidden bg-black text-white sm:rounded-sm"
      onMouseMove={() => revealControls()}
      onMouseLeave={() => playingRef.current && setControlsVisible(false)}
      onFocusCapture={() => revealControls(true)}
      tabIndex={0}
      aria-label="Video player"
    >
      <div ref={mountRef} className="zen-yt-mount pointer-events-none absolute inset-0 h-full w-full" />

      {!ready && !unavailable && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-black">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
        </div>
      )}

      {ready && !unavailable && (
        <>
          <div className="absolute inset-0 z-10 grid grid-cols-3" aria-hidden="true">
            <div onPointerUp={() => handleTapZone("left")} />
            <div onPointerUp={() => handleTapZone("center")} />
            <div onPointerUp={() => handleTapZone("right")} />
          </div>

          <div
            className={`pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-black/60 via-transparent to-black/75 transition-opacity duration-200 ${overlayVisible ? "opacity-100" : "opacity-0"}`}
          />

          <div className={`absolute inset-x-0 top-0 z-30 flex justify-end gap-1 p-2 transition-opacity duration-200 ${overlayVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            {captionsAvailable && (
              <Button type="button" size="icon" variant="ghost" onClick={toggleCaptions} aria-label={captionsOn ? "Turn captions off" : "Turn captions on"} aria-pressed={captionsOn} className="h-10 w-10 rounded-full text-white hover:bg-white/20 hover:text-white">
                <Captions className="h-6 w-6" />
              </Button>
            )}
            <Button type="button" size="icon" variant="ghost" onClick={openSettings} aria-label="Playback settings" className="h-10 w-10 rounded-full text-white hover:bg-white/20 hover:text-white">
              <Settings className="h-6 w-6" />
            </Button>
          </div>

          <div className={`absolute inset-0 z-30 flex items-center justify-center transition-opacity duration-200 ${overlayVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <Button type="button" size="icon" variant="ghost" onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"} className="h-16 w-16 rounded-full bg-black/55 text-white hover:bg-black/70 hover:text-white">
              {playing ? <Pause className="h-9 w-9 fill-current" /> : <Play className="ml-1 h-9 w-9 fill-current" />}
            </Button>
          </div>

          {buffering && <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center"><div className="h-12 w-12 animate-spin rounded-full border-[3px] border-white/25 border-t-white" /></div>}

          {seekFeedback && (
            <div key={seekFeedback.key} className={`pointer-events-none absolute inset-y-0 z-40 flex w-[42%] animate-in fade-in zoom-in-90 items-center justify-center rounded-[50%] bg-black/45 duration-150 ${seekFeedback.direction === "back" ? "left-[-8%]" : "right-[-8%]"}`}>
              <div className="flex flex-col items-center gap-1 text-sm font-semibold">
                {seekFeedback.direction === "back" ? <RotateCcw className="h-8 w-8" /> : <RotateCw className="h-8 w-8" />}
                <span>{seekFeedback.seconds} seconds</span>
              </div>
            </div>
          )}

          <div className={`absolute inset-x-0 bottom-0 z-40 px-3 pb-1 transition-opacity duration-200 sm:px-4 sm:pb-2 ${overlayVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            <div className="relative flex h-5 items-center">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={Math.min(currentTime, duration || 0)}
                onChange={(event) => seekTo(Number(event.target.value))}
                onPointerDown={() => clearHideTimer()}
                onPointerUp={() => revealControls()}
                aria-label="Video progress"
                aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
                className="zen-player-progress h-5 w-full cursor-pointer"
                style={{ "--progress": `${progress}%` } as React.CSSProperties}
              />
            </div>
            <div className="flex h-10 items-center gap-1">
              <Button type="button" size="icon" variant="ghost" onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"} className="hidden h-9 w-9 rounded-full text-white hover:bg-white/20 hover:text-white sm:inline-flex">
                {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}
              </Button>
              <Button type="button" size="icon" variant="ghost" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className="h-9 w-9 rounded-full text-white hover:bg-white/20 hover:text-white">
                {muted || volume === 0 ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </Button>
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : volume}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  try { playerRef.current?.setVolume(next); if (next > 0) playerRef.current?.unMute(); } catch {}
                  setVolumeState(next);
                  setMuted(next === 0);
                }}
                aria-label="Volume"
                className="hidden w-20 accent-white sm:block"
              />
              <span className="ml-1 whitespace-nowrap text-xs font-medium tabular-nums sm:text-sm">{formatTime(currentTime)} / {formatTime(duration)}</span>
              <div className="flex-1" />
              <Button type="button" size="icon" variant="ghost" onClick={openSettings} aria-label="Playback settings" className="hidden h-9 w-9 rounded-full text-white hover:bg-white/20 hover:text-white sm:inline-flex">
                <Settings className="h-5 w-5" />
              </Button>
              <Button type="button" size="icon" variant="ghost" onClick={() => void toggleFullscreen()} aria-label="Full screen" className="h-9 w-9 rounded-full text-white hover:bg-white/20 hover:text-white">
                <Maximize className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </>
      )}

      {unavailable && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/95 px-6 text-center text-white">
          <AlertTriangle className="h-8 w-8 text-white/70" />
          <div className="text-base font-medium">This video can&apos;t be played here</div>
          <p className="max-w-md text-sm text-white/60">The owner has disabled embedded playback. You can still watch it on YouTube.</p>
          <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-medium text-black hover:opacity-90">
            <ExternalLink className="h-4 w-4" /> Watch on YouTube
          </a>
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={(open) => { setSettingsOpen(open); if (!open) revealControls(); }}>
        <DialogContent className="!bottom-0 !left-0 !right-0 !top-auto !w-full !max-w-none !translate-x-0 !translate-y-0 gap-0 rounded-t-2xl border-x-0 border-b-0 p-0 sm:!bottom-auto sm:!left-1/2 sm:!right-auto sm:!top-1/2 sm:!max-w-md sm:!-translate-x-1/2 sm:!-translate-y-1/2 sm:rounded-lg">
          <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden" aria-hidden />
          <DialogHeader className="border-b border-border/60 px-5 pb-4 pt-3 text-left">
            <DialogTitle className="flex items-center gap-2"><SlidersHorizontal className="h-5 w-5" /> Settings</DialogTitle>
            <DialogDescription>Playback options for this video</DialogDescription>
          </DialogHeader>
          <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4 text-primary" /> Playback speed</div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {rates.map((rate) => (
                <Button key={rate} size="sm" variant={playbackRate === rate ? "default" : "outline"} onClick={() => { try { playerRef.current?.setPlaybackRate(rate); setPlaybackRate(rate); } catch {} }} className="relative">
                  {rate === 1 ? "Normal" : `${rate}×`}{playbackRate === rate && <Check className="absolute right-1 top-1 h-3 w-3" />}
                </Button>
              ))}
            </div>
            <div className="mt-6 flex items-center gap-2 text-sm font-semibold"><Settings className="h-4 w-4 text-primary" /> Quality</div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {["auto", ...qualities].filter((level, index, all) => all.indexOf(level) === index).map((level) => (
                <Button key={level} size="sm" variant={quality === level ? "default" : "outline"} onClick={() => { try { playerRef.current?.setPlaybackQuality(level); setQuality(level); } catch {} }}>
                  {level === "auto" ? "Auto (recommended)" : level.replace("hd", "").replace("tiny", "144").replace("small", "240").replace("medium", "360").replace("large", "480") + "p"}
                </Button>
              ))}
            </div>
            <Button type="button" variant="ghost" onClick={toggleCaptions} disabled={!captionsAvailable} className="mt-5 w-full justify-between px-0 hover:bg-transparent">
              <span className="flex items-center gap-2"><Captions className="h-4 w-4 text-primary" /> Captions</span>
              <span className="text-muted-foreground">{captionsAvailable ? (captionsOn ? "On" : "Off") : "Unavailable"}</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});
