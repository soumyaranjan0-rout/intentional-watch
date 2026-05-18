import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Mode, Refinement } from "@/lib/intent";

type SessionState = {
  mode: Mode | null;
  setMode: (m: Mode | null) => void;
  refinement: Refinement | null;
  setRefinement: (r: Refinement | null) => void;
  query: string;
  setQuery: (q: string) => void;
  // Session counters
  videosWatchedThisSession: number;
  sessionStartedAt: number;
  bumpWatched: () => void;
  resetSession: () => void;
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
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function SessionStateProvider({ children }: { children: ReactNode }) {
  const storedRef = useRef<StoredSession | null>(null);
  if (storedRef.current === null) storedRef.current = readStoredSession();

  const [modeState, setModeState] = useState<Mode | null>(() => storedRef.current?.mode ?? null);
  const [refinementState, setRefinementState] = useState<Refinement | null>(() => storedRef.current?.refinement ?? null);
  const [queryState, setQueryState] = useState(() => storedRef.current?.query ?? "");
  const [videosWatchedThisSession, setWatched] = useState(0);
  const [sessionStartedAt] = useState(() => Date.now());

  const commit = useCallback((patch: Partial<StoredSession>) => {
    const next = { ...(storedRef.current ?? { mode: null, refinement: null, query: "" }), ...patch };
    storedRef.current = next;
    writeStoredSession(next);
  }, []);

  const setMode = useCallback((m: Mode | null) => {
    setModeState(m);
    commit({ mode: m });
  }, [commit]);

  const setRefinement = useCallback((r: Refinement | null) => {
    setRefinementState(r);
    commit({ refinement: r });
  }, [commit]);

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    commit({ query: q });
  }, [commit]);

  useEffect(() => {
    storedRef.current = { mode: modeState, refinement: refinementState, query: queryState };
  }, [modeState, refinementState, queryState]);

  const value = useMemo<SessionState>(
    () => ({
      mode,
      setMode,
      refinement,
      setRefinement,
      query,
      setQuery,
      videosWatchedThisSession,
      sessionStartedAt,
      bumpWatched: () => setWatched((n) => n + 1),
      resetSession: () => {
        setModeState(null);
        setRefinementState(null);
        setQueryState("");
        storedRef.current = { mode: null, refinement: null, query: "" };
        setWatched(0);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {}
      },
    }),
    [modeState, setMode, refinementState, setRefinement, queryState, setQuery, videosWatchedThisSession, sessionStartedAt],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSessionState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSessionState must be used within SessionStateProvider");
  return ctx;
}
