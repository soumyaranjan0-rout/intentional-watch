const KEY = "zen.youtubeApiKey";

export function getStoredYouTubeApiKey() {
  if (typeof window === "undefined") return "";
  try { return localStorage.getItem(KEY) || ""; } catch { return ""; }
}

export function setStoredYouTubeApiKey(value: string) {
  if (typeof window === "undefined") return;
  try {
    const clean = value.trim();
    if (clean) localStorage.setItem(KEY, clean);
    else localStorage.removeItem(KEY);
  } catch {}
}
