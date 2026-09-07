import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { IntentCategory } from "@/lib/relevance";
import {
  createSession, endSession, isIdle, readStoredSession, resumeSession,
  switchIntent, touchSession, writeStoredSession, type ActiveSession,
} from "@/lib/intentSession";

type Ctx = {
  session: ActiveSession | null;
  ready: boolean;
  /** Seconds of active (visible) time in the current session. */
  elapsedSeconds: number;
  declare: (category: IntentCategory, intent: string) => Promise<void>;
  changeIntent: (category: IntentCategory, intent: string) => Promise<void>;
  finish: () => Promise<void>;
  /** Called by pages on real interaction so idle detection stays accurate. */
  markActivity: () => void;
  idleWarning: boolean;
};

const IntentSessionCtx = createContext<Ctx | undefined>(undefined);

const TICK_MS = 15_000;

export function IntentSessionProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [ready, setReady] = useState(false);
  const [elapsedSeconds, setElapsed] = useState(0);
  const [idleWarning, setIdleWarning] = useState(false);
  const sessionRef = useRef<ActiveSession | null>(null);

  const apply = useCallback((s: ActiveSession | null) => {
    sessionRef.current = s;
    setSession(s);
    setElapsed(s ? Math.round(s.activeSeconds) : 0);
  }, []);

  // Restore on mount / when auth settles.
  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    (async () => {
      try {
        if (user) {
          const resumed = await resumeSession(user.id);
          if (!cancelled) apply(resumed);
        } else {
          const stored = readStoredSession();
          if (!cancelled) apply(stored && !isIdle(stored) ? stored : null);
          if (stored && isIdle(stored)) writeStoredSession(null);
        }
      } catch {
        if (!cancelled) apply(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user, loading, apply]);

  const markActivity = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    s.lastActivityAt = Date.now();
    setIdleWarning(false);
  }, []);

  // Heartbeat: count visible time, persist periodically, expire when idle.
  useEffect(() => {
    if (!session) return;
    const id = window.setInterval(() => {
      const s = sessionRef.current;
      if (!s) return;
      const visible = typeof document === "undefined" || document.visibilityState === "visible";
      if (visible) {
        s.activeSeconds += TICK_MS / 1000;
        setElapsed(Math.round(s.activeSeconds));
      }
      if (isIdle(s)) {
        void endSession(s, "idle").catch(() => {});
        apply(null);
        setIdleWarning(true);
        return;
      }
      writeStoredSession(s);
      void touchSession(s).catch(() => {});
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [session, apply]);

  // Any genuine interaction refreshes the idle clock.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => markActivity();
    const events: string[] = ["pointerdown", "keydown", "visibilitychange"];
    for (const e of events) window.addEventListener(e, handler, { passive: true });
    return () => { for (const e of events) window.removeEventListener(e, handler); };
  }, [markActivity]);

  const declare = useCallback(async (category: IntentCategory, intent: string) => {
    const s = await createSession(user?.id ?? null, category, intent);
    setIdleWarning(false);
    apply(s);
  }, [user, apply]);

  const changeIntent = useCallback(async (category: IntentCategory, intent: string) => {
    const current = sessionRef.current;
    if (!current) return declare(category, intent);
    const next = await switchIntent(current, category, intent);
    apply(next);
  }, [apply, declare]);

  const finish = useCallback(async () => {
    const current = sessionRef.current;
    apply(null);
    if (current) await endSession(current, "manual").catch(() => {});
  }, [apply]);

  const value = useMemo<Ctx>(() => ({
    session, ready, elapsedSeconds, declare, changeIntent, finish, markActivity, idleWarning,
  }), [session, ready, elapsedSeconds, declare, changeIntent, finish, markActivity, idleWarning]);

  return <IntentSessionCtx.Provider value={value}>{children}</IntentSessionCtx.Provider>;
}

export function useIntentSession() {
  const ctx = useContext(IntentSessionCtx);
  if (!ctx) throw new Error("useIntentSession must be used within IntentSessionProvider");
  return ctx;
}
