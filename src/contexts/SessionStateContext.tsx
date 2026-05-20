import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Mode, Refinement } from "@/lib/intent";

type SessionState = {
  mode: Mode | null;
  setMode: (m: Mode | null) => void;
  refinement: Refinement | null;
  setRefinement: (r: Refinement | null) => void;
  query: string;
  setQuery: (q: string) => void;
  videosWatchedThisSession: number;
  sessionStartedAt: number;
  bumpWatched: () => void;
  resetSession: () => void;
  /** True once we've hydrated from localStorage on the client. Use this to
   *  gate "redirect when no session" effects, otherwise the first client
   *  render (which always starts empty for hydration safety) will bounce
   *  the user back to home before their stored search is loaded. */
  hydrated: boolean;
};

const Ctx = createContext<SessionState | undefined>(undefined);

const STORAGE_KEY = "zentube.session.v2";
type StoredSession = { mode: Mode | null; refinement: Refinement | null; query: string };

function readStoredSession(): StoredSession {
  if (typeof window === "undefined") return { mode: null, refinement: null, query: "" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: null, refinement: null, query: "" };
    const data = JSON.parse(raw) as Partial<StoredSession>;
    return {
      mode: data.mode ?? null,
      refinement: data.refinement ?? null,
      query: typeof data.query === "string" ? data.query : "",
    };
  } catch {
    return { mode: null, refinement: null, query: "" };
  }
}

function writeStoredSession(data: StoredSession) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

export function SessionStateProvider({ children }: { children: ReactNode }) {
  // Always start empty so SSR and first client render match (no hydration mismatch).
  const [modeState, setModeState] = useState<Mode | null>(null);
  const [refinementState, setRefinementState] = useState<Refinement | null>(null);
  const [queryState, setQueryState] = useState("");
  const [videosWatchedThisSession, setWatched] = useState(0);
  const [sessionStartedAt] = useState(() => Date.now());
  const [hydrated, setHydrated] = useState(false);
  const storedRef = useRef<StoredSession>({ mode: null, refinement: null, query: "" });

  // Hydrate from storage after mount.
  useEffect(() => {
    const s = readStoredSession();
    storedRef.current = s;
    setModeState(s.mode);
    setRefinementState(s.refinement);
    setQueryState(s.query);
    setHydrated(true);
  }, []);

  const commit = useCallback((patch: Partial<StoredSession>) => {
    const next = { ...storedRef.current, ...patch };
    storedRef.current = next;
    writeStoredSession(next);
  }, []);

  const setMode = useCallback((m: Mode | null) => { setModeState(m); commit({ mode: m }); }, [commit]);
  const setRefinement = useCallback((r: Refinement | null) => { setRefinementState(r); commit({ refinement: r }); }, [commit]);
  const setQuery = useCallback((q: string) => { setQueryState(q); commit({ query: q }); }, [commit]);

  const value = useMemo<SessionState>(
    () => ({
      mode: modeState, setMode,
      refinement: refinementState, setRefinement,
      query: queryState, setQuery,
      videosWatchedThisSession, sessionStartedAt,
      bumpWatched: () => setWatched((n) => n + 1),
      resetSession: () => {
        setModeState(null); setRefinementState(null); setQueryState("");
        storedRef.current = { mode: null, refinement: null, query: "" };
        setWatched(0);
        try { localStorage.removeItem(STORAGE_KEY); } catch {}
      },
      hydrated,
    }),
    [modeState, setMode, refinementState, setRefinement, queryState, setQuery, videosWatchedThisSession, sessionStartedAt, hydrated],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSessionState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSessionState must be used within SessionStateProvider");
  return ctx;
}
