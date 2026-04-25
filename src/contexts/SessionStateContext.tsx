import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
  bumpWatched: () => void;
  resetSession: () => void;
};

const Ctx = createContext<SessionState | undefined>(undefined);

const STORAGE_KEY = "zentube.session.v1";

export function SessionStateProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [refinement, setRefinement] = useState<Refinement | null>(null);
  const [query, setQuery] = useState("");
  const [videosWatchedThisSession, setWatched] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data.mode) setMode(data.mode);
      if (data.refinement) setRefinement(data.refinement);
      if (data.query) setQuery(data.query);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ mode, refinement, query }),
      );
    } catch {}
  }, [mode, refinement, query]);

  const value = useMemo<SessionState>(
    () => ({
      mode,
      setMode,
      refinement,
      setRefinement,
      query,
      setQuery,
      videosWatchedThisSession,
      bumpWatched: () => setWatched((n) => n + 1),
      resetSession: () => {
        setMode(null);
        setRefinement(null);
        setQuery("");
        setWatched(0);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {}
      },
    }),
    [mode, refinement, query, videosWatchedThisSession],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSessionState() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSessionState must be used within SessionStateProvider");
  return ctx;
}
