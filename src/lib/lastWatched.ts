// Tracks the last video the user was watching so we can show a
// "Resume watching" banner on home/results.

const KEY = "zentube.lastWatched.v1";

export type LastWatched = {
  videoId: string;
  title: string;
  channel: string;
  thumbnail: string;
  t: number;
  duration: number;
  updatedAt: number;
};

export function setLastWatched(v: LastWatched) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
    window.dispatchEvent(new CustomEvent("zentube:lastWatched"));
  } catch {}
}

export function getLastWatched(): LastWatched | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as LastWatched;
    if (!v || !v.videoId) return null;
    // Forget anything older than 7 days
    if (Date.now() - v.updatedAt > 7 * 24 * 60 * 60 * 1000) return null;
    return v;
  } catch {
    return null;
  }
}

export function clearLastWatched() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("zentube:lastWatched"));
  } catch {}
}
